// A VRMXI vehicle (M3 W8, AB-T-0547; the `vehicle` section proposed for VRMXI §8.4 on the review): a dynamic chassis
// on raycast wheels (@vrmxg/physics createVehicle), driven by whoever sits in its driver's seat.
//
//   "type": "vehicle",
//   "vehicle": {
//     "body": "Chassis",                                   the node with the chassis' dynamic body
//     "wheels": [{ "node": "Wheel FL", "radius": 0.28, "steer": true, "drive": false, "brake": true }, …],
//     "suspension": { "rest": 0.2, "travel": 0.15, "stiffness": 30, "compression": 2.4, "relaxation": 3.2 },
//     "grip": { "friction": 2.5, "side": 1 },
//     "engine": { "force": 600, "reverse": 300, "brake": 25, "maxSpeed": 8, "maxSteer": 0.5, "steerSpeed": 2 },
//     "driver": 0                                          the seat point (§8.2) whose occupant drives
//   },
//   "seat": { "points": [{ "node": "Driver", "exit": "Driver exit" }, { "node": "Passenger", "exit": "Passenger exit" }] },
//   "verbs": [{ "verb": "sit", "prompt": "Get in", "reach": "Reach" }]
//
// A wheel node is the wheel's centre at rest, under the chassis' node; the engine moves it with its suspension and turns
// it with its steering and spin. The driver steers with move_x and drives with move_y when they are a player; a script
// or a brain drives with the item's `drive` action. Everything that decides the next step (the steering as it eases,
// the wheels' spin, a script's command) is the item's state; the controller is built again after a restore.
import { Quaternion, Vector3 } from 'three';

const _q = new Quaternion(), _s = new Quaternion();
const UP = new Vector3(0, 1, 0), AXLE = new Vector3(1, 0, 0);

export class Vehicle {
  /** @param {any} item the Item node (its parts and physics are built) */
  constructor(item) {
    const v = item.manifest.vehicle ?? {};
    this.item = item; this.def = v;
    const part = item.parts.get(v.body);
    if (!part || part.kinematic) throw new Error(`Item "${item.id}": the vehicle's body ${v.body} needs a dynamic body (VRMXI §8.4)`);
    this.chassis = part.proxy;
    const chassisObj = item.part(v.body);
    item.object3d.updateWorldMatrix(true, true);
    const inv = chassisObj.matrixWorld.clone().invert();
    const sus = v.suspension ?? {}, grip = v.grip ?? {};
    /** @type {Array<{ def: any, node: any, rest: Vector3, at: number[], radius: number }>} */
    this.wheels = (v.wheels ?? []).map((w) => {
      const node = item.part(w.node);
      if (!node) throw new Error(`Item "${item.id}": no wheel node ${w.node}`);
      const at = node.getWorldPosition(new Vector3()).applyMatrix4(inv).toArray();
      return { def: w, node, rest: node.position.clone(), at, radius: w.radius ?? 0.3 };
    });
    this.rest = sus.rest ?? 0.2;
    this.ctl = item.physics.world.createVehicle(this.chassis.body, {
      wheels: this.wheels.map((w) => ({ at: w.at, radius: w.radius, rest: this.rest, travel: sus.travel, stiffness: sus.stiffness, compression: sus.compression, relaxation: sus.relaxation, friction: grip.friction, side: grip.side })),
    });
    /** steer (rad, as it eases), spin (rad per wheel, for drawing), cmd (a script's { throttle, steer }) */
    this.state = { steer: 0, spin: this.wheels.map(() => 0), cmd: null };
    // seated characters ride with the chassis after physics has moved it, and the wheels are drawn then
    this.unwatch = item.physics.watch({ node: item, name: 'vehicle', getState: () => null, setState() {}, afterPhysics: () => this.afterPhysics() });
  }

  /** Forward speed (m/s, negative backwards). */
  speed() { return this.ctl.speed(); }

  /** The character driving: in the driver's seat point. */
  driver() {
    const point = this.def.driver ?? 0;
    return this.item.tree.all().find((n) => n.type === 'Character' && n.ctrl?.seat?.item === this.item.id && n.ctrl.seat.point === point) ?? null;
  }

  /** One step, before physics: what the driver asks → steering, engine and brakes on each wheel. */
  step(dt) {
    const e = { force: 600, reverse: 300, brake: 25, maxSpeed: 8, maxSteer: 0.5, steerSpeed: 2, ...(this.def.engine ?? {}) };
    const d = this.driver(), st = this.state;
    let throttle = 0, turn = 0;
    if (d && d.behaviours?.some((b) => b.name === 'player')) {
      const input = this.item.tree.services.get('input');
      throttle = input?.axis('move_y') ?? 0; turn = input?.axis('move_x') ?? 0;
    } else if (d && st.cmd) { throttle = st.cmd.throttle; turn = st.cmd.steer; }
    throttle = Math.max(-1, Math.min(1, throttle)); turn = Math.max(-1, Math.min(1, turn));
    // facing +z, a positive wheel angle turns towards +x: the left; move_x is +1 to the right
    const target = -turn * e.maxSteer, step = e.steerSpeed * dt;
    st.steer += Math.max(-step, Math.min(step, target - st.steer));
    const speed = this.speed();
    let engine = 0, brake = 0;
    if (!d) brake = e.brake; // parked
    else if (throttle > 0) { if (speed < -0.3) brake = e.brake * throttle; else if (speed < e.maxSpeed) engine = e.force * throttle; }
    else if (throttle < 0) { if (speed > 0.3) brake = -e.brake * throttle; else if (speed > -e.maxSpeed / 3) engine = e.reverse * throttle; }
    else brake = e.brake * 0.08; // rolling to a stop
    const driven = this.wheels.filter((w) => w.def.drive).length || 1;
    this.ctl.update(dt, this.wheels.map((w) => ({
      steer: w.def.steer ? st.steer : 0,
      engine: w.def.drive ? engine / driven : 0,
      brake: w.def.brake === false ? 0 : brake,
    })));
    for (let i = 0; i < this.wheels.length; i++) st.spin[i] = wrap(st.spin[i] + (speed * dt) / this.wheels[i].radius);
  }

  /** After physics: seated characters to their seats, the wheels drawn at their suspension, steering and spin. */
  afterPhysics() {
    for (const n of this.item.tree.all()) if (n.type === 'Character' && n.ctrl?.seat?.item === this.item.id) n.followSeat?.();
    const info = this.ctl.wheels();
    this.wheels.forEach((w, i) => {
      const drop = this.rest - (info[i]?.suspension ?? this.rest);
      w.node.position.copy(w.rest).addScaledVector(UP, drop);
      w.node.quaternion.copy(_q.setFromAxisAngle(UP, w.def.steer ? this.state.steer : 0)).multiply(_s.setFromAxisAngle(AXLE, this.state.spin[i]));
    });
    this.item.model.updateMatrixWorld(true);
  }

  /** A script's or brain's driving ({ throttle, steer }, each −1…1), used while a non-player sits in the driver's seat. */
  drive({ throttle = 0, steer = 0 } = {}) { this.state.cmd = { throttle, steer }; }

  getState() { return structuredClone(this.state); }
  setState(s) { this.state = structuredClone(s); }
  free() { this.unwatch?.(); this.ctl.free(); }
}

/** An angle into −π…π (the spin only draws the wheels; kept small so it stays exact in a snapshot). */
function wrap(a) { return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI)); }

