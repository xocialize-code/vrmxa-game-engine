// The Item node (VRMXI §5–§8 in the engine). Built from its file's model and manifest when it enters the tree:
//   bodies      the model's `motion` nodes: dynamic (moved by physics, written back into the model) or kinematic
//               (moved by the item's animations, their pose fed to physics each step); colliders and sensors on the
//               nearest body, the rest on one fixed body for the item's frame
//   joints      the manifest's hinge / slider / fixed joints, each holding a body to the frame or another body,
//               with limits and a position motor whose target each state sets
//   states      motor targets, shown meshes, morph weights, a `play` / `loop` animation stepped on the simulation
//               clock, the sensors that are on; the item starts in its scene's `state` or its first
//   verbs       offered by state; `perform` raises `verb`, then moves to `to` (raising `stateChanged`); `enterState`
//               moves to a state directly (scene connections, the game)
//   sensors     raise `entered` / `exited` with the sensor's name when a character enters or leaves (VRMXI §5.1)
// Item state (current state, animation times) is part of the world snapshot; bodies and joints are in Rapier's.
import { AnimationMixer, LoopRepeat } from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Node } from '@vrmxg/core';

const DEFAULT_SLOT = { open: 'use', take: 'take', use: 'use', sit: 'sit', talk: 'talk' };

export class ItemNode extends Node {
  static actions = ['enterState', 'perform'];

  enterTree() {
    const lib = this.tree.services.get('items');
    if (!lib) throw new Error(`Item "${this.id}" needs the items service (installItems)`);
    const it = lib.get(this.id);
    this.file = it;
    this.manifest = it.manifest;
    this.model = SkeletonUtils.clone(it.scene);
    this.model.name = `${this.id}:item`;
    this.object3d.add(this.model);
    this.object3d.updateWorldMatrix(true, true);
    const order = []; this.model.traverse((o) => order.push(o));
    const objects = it.nodeOrder.map((i) => (i >= 0 ? order[i] : null));
    this.byName = new Map((it.json.nodes ?? []).map((n, i) => [n.name, objects[i]]));
    this.states = this.manifest.states ?? [];
    this.verbs = this.manifest.verbs ?? [];
    this.mixer = new AnimationMixer(this.model);
    this.clips = new Map(it.animations.map((c) => [c.name, c]));
    this.anim = { play: null, loop: null };
    this.buildPhysics(it.plan);
    const start = this.props.state ?? this.states[0]?.name ?? null;
    if (start !== null && !this.states.some((s) => s.name === start)) throw new Error(`Item "${this.id}": no state "${start}" (${this.states.map((s) => s.name).join(', ')})`);
    this.current = start;
    if (start !== null) this.applyState(start, { instant: true });
  }

  /** The model's part for a glTF node name (VRMXI names nodes by name; found through the node's index). */
  part(name) { return this.byName.get(name) ?? null; }

  buildPhysics(plan) {
    const physics = this.tree.services.get('physics');
    this.physics = physics;
    this.parts = new Map(); // body node name → proxy the physics server writes back to / reads from
    this.sensorHandles = new Map(); // sensor name → collider handle
    this.jointHandles = new Map();
    if (!physics) return;
    const frameNeeded = plan.colliders.some((c) => c.body === null) || (this.manifest.joints ?? []).some((j) => j.to === null);
    if (frameNeeded) this.frameBody = physics.addBody(this, { type: 'fixed' });
    for (const b of plan.bodies) {
      const object3d = this.part(b.name);
      if (!object3d) throw new Error(`Item "${this.id}": body node ${b.name} isn't in the model`);
      const proxy = { id: `${this.id}#${b.name}`, object3d, bodyType: b.kinematic ? 'kinematic' : 'dynamic', body: undefined, item: this };
      proxy.body = physics.addBody(proxy, { type: proxy.bodyType });
      this.parts.set(b.name, { ...b, proxy });
    }
    const byNode = new Map(plan.bodies.map((b) => [b.node, b.name]));
    const solids = new Map();
    for (const c of plan.colliders) {
      const bodyName = c.body === null ? null : byNode.get(c.body);
      const handle = bodyName === null ? this.frameBody : this.parts.get(bodyName).proxy.body;
      let info = /** @type {any} */ (this);
      if (c.sensor) {
        const item = this;
        // A sensor with no collision filter senses characters (VRMXI §5.1); filters by layer name are read later.
        info = { id: `${this.id}#${c.name}`, isSensor: true, emit(signal, e) { if (item.tree.find(e.body)?.type === 'Character') item.emit(signal === 'bodyEntered' ? 'entered' : 'exited', { sensor: c.name, body: e.body }); } };
      }
      const h = physics.addCollider(info, this, handle, { ...c.shape, p: c.p, q: c.q, sensor: c.sensor });
      if (c.sensor) this.sensorHandles.set(c.name, h);
      else if (bodyName) (solids.get(bodyName) ?? solids.set(bodyName, []).get(bodyName)).push(h);
    }
    // a body's mass shared among its colliders by volume
    for (const [name, hs] of solids) {
      const mass = this.parts.get(name).mass;
      if (!mass) continue;
      const vols = hs.map((h) => physics.world.colliderVolume(h)), total = vols.reduce((a, b) => a + b, 0) || 1;
      hs.forEach((h, i) => physics.world.setColliderMass(h, (mass * vols[i]) / total));
    }
    for (const j of this.manifest.joints ?? []) this.buildJoint(j);
  }

  buildJoint(j) {
    const w = this.physics.world, part = this.parts.get(j.body);
    if (!part) throw new Error(`Item "${this.id}": joint ${j.name} holds ${j.body}, which has no dynamic body`);
    const other = j.to === null ? null : this.parts.get(j.to);
    const a = other ? other.proxy.body : this.frameBody, b = part.proxy.body;
    // anchors in each body's own frame at rest: the frame body is the item's frame; a body's rest pose is in the plan
    const toLocal = (rest, pt) => { if (!rest) return pt; const [px, py, pz] = rest.p, [x, y, z, ww] = rest.q; const d = [pt[0] - px, pt[1] - py, pt[2] - pz]; return rotate([-x, -y, -z, ww], d); };
    const anchorA = toLocal(other?.rest, j.anchor), anchorB = toLocal(part.rest, j.anchor);
    const limits = j.limits ? [j.limits.min, j.limits.max] : undefined;
    const motor = j.motor ? { target: j.motor.target ?? 0, stiffness: j.motor.stiffness ?? 40, damping: j.motor.damping ?? 8 } : undefined;
    let h;
    // the jointed bodies don't collide with each other: a leaf touches its frame, a lid its box
    if (j.type === 'hinge') h = w.createRevolute(a, b, { anchorA, anchorB, axis: j.axis, limits, motor, contacts: false });
    else if (j.type === 'slider') h = w.createPrismatic(a, b, { anchorA, anchorB, axis: j.axis, limits, motor, contacts: false });
    else h = w.createFixedJoint(a, b, { anchorA, anchorB, contacts: false });
    this.jointHandles.set(j.name, { handle: h, def: j });
  }

  exitTree() {
    const physics = this.physics;
    if (physics) {
      for (const { proxy } of this.parts.values()) physics.removeBody(proxy, proxy.body);
      if (this.frameBody !== undefined) physics.removeBody(this, this.frameBody);
    }
    this.mixer?.stopAllAction();
    if (this.model) this.object3d.remove(this.model);
  }

  // ---------------------------------------------------------------- states

  state(name) { return this.states.find((s) => s.name === name) ?? null; }

  /** Apply a state: joints, shown meshes, morphs, animations, sensors. `instant`: at rest, as at the end of its play. */
  applyState(name, { instant = false } = {}) {
    const s = this.state(name);
    for (const [jn, target] of Object.entries(s.joints ?? {})) {
      const j = this.jointHandles.get(jn);
      if (j?.def.motor) this.physics.world.setMotorTarget(j.handle, target, j.def.motor.stiffness ?? 40, j.def.motor.damping ?? 8);
    }
    for (const [sensor, h] of this.sensorHandles) this.physics.world.setColliderEnabled(h, !s.sensors || s.sensors.includes(sensor));
    const playClip = s.play ? this.clips.get(s.play) : null;
    this.anim = { play: playClip ? { name: s.play, t: instant ? playClip.duration : 0 } : null, loop: s.loop && this.clips.has(s.loop) ? { name: s.loop, t: 0 } : null };
    this.applyLook();
    this.pose();
  }

  /** Shown meshes and morph weights for the current state (VRMXW §8's rules). */
  applyLook() {
    const s = this.state(this.current) ?? {};
    const listed = new Set(this.states.flatMap((x) => x.show ?? []));
    for (const n of listed) { const o = this.part(n); if (o) o.visible = (s.show ?? []).includes(n); }
    const targets = new Set(this.states.flatMap((x) => Object.keys(x.morphs ?? {})));
    if (!targets.size) return;
    this.model.traverse((o) => {
      if (!o.morphTargetDictionary) return;
      for (const t of targets) { const i = o.morphTargetDictionary[t]; if (i !== undefined) o.morphTargetInfluences[i] = s.morphs?.[t] ?? 0; }
    });
  }

  /** The item's own animations at their current times (stepped on the simulation clock, never by wall time). */
  pose() {
    if (!this.anim.play && !this.anim.loop) return;
    this.mixer.stopAllAction();
    for (const which of ['play', 'loop']) {
      const a = this.anim[which];
      if (!a) continue;
      const action = this.mixer.clipAction(this.clips.get(a.name));
      action.setLoop(LoopRepeat, Infinity); action.clampWhenFinished = true;
      action.play(); action.paused = true; action.weight = 1; action.time = a.t;
    }
    this.mixer.update(0);
    this.model.updateMatrixWorld(true);
  }

  physicsProcess(dt) {
    const { play, loop } = this.anim;
    if (!play && !loop) return;
    if (play) play.t = Math.min(play.t + dt, this.clips.get(play.name).duration);
    if (loop) { const d = this.clips.get(loop.name).duration || 1; loop.t += dt; loop.t -= Math.floor(loop.t / d) * d; }
    this.pose(); // kinematic parts moved; the physics server reads their poses after the nodes
  }

  // ---------------------------------------------------------------- actions

  /** Move to a state (the item's action; VRMXI §7 "what changes a state"). @param {{ state?: string }} [a] */
  enterState({ state } = {}) {
    if (!this.state(state)) throw new Error(`Item "${this.id}" has no state "${state}" (${this.states.map((s) => s.name).join(', ')})`);
    const from = this.current;
    if (from === state) return;
    this.current = state;
    this.applyState(state);
    this.emit('stateChanged', { from, to: state });
  }

  /** The verbs offered in a state (default: the current one). */
  offered(state = this.current) { return this.verbs.filter((v) => !v.states || v.states.includes(state)); }

  /** The character's animation slot for a verb (VRMXI §8). */
  slotOf(v) { return v.slot === undefined ? DEFAULT_SLOT[v.verb] ?? null : v.slot; }

  /**
   * Do a verb the item offers now: raises `verb`, then moves to `to`. Returns what was done, or null.
   * @param {{ verb?: string, by?: string | null }} [a]
   */
  perform({ verb, by = null } = {}) {
    const v = this.offered().find((x) => x.verb === verb);
    if (!v) return null;
    this.emit('verb', { verb, by });
    if (v.to) this.enterState({ state: v.to });
    return { verb, to: v.to ?? null, slot: this.slotOf(v), prompt: v.prompt ?? null };
  }

  /** What the item means right now: its tags plus its state's (VRMXI §7). */
  itemTags() { return [...(this.manifest.tags ?? []), ...(this.state(this.current)?.tags ?? [])]; }

  /** Seat points as model nodes (VRMXI §8.2) and the spawn point (§8.3). */
  seatPoints() { return (this.manifest.seat?.points ?? []).map((p) => ({ node: this.part(p.node), exit: p.exit ? this.part(p.exit) : null })); }
  spawnPoint() { return this.manifest.spawn ? this.part(this.manifest.spawn.node) : null; }

  /** The embedded wearable of a takeable item (VRMXI §9), copied out byte for byte. */
  wearableBytes() { return this.file.wearable ? this.file.wearable.slice() : null; }

  inspect() {
    const joints = {};
    for (const [n, j] of this.jointHandles) {
      const part = this.parts.get(j.def.body), joint = this.physics.world.world.getImpulseJoint(j.handle);
      joints[n] = { type: j.def.type, body: part?.name };
      if (joint && part) { const b = this.physics.world.world.getRigidBody(part.proxy.body); joints[n].sleeping = b.isSleeping(); }
    }
    return { type: this.manifest.type, state: this.current, verbs: this.offered().map((v) => ({ verb: v.verb, prompt: v.prompt ?? null, to: v.to ?? null })), tags: this.itemTags(), takeable: this.manifest.takeable, joints };
  }

  // ---------------------------------------------------------------- snapshot

  getState() { return { state: this.current, play: this.anim.play && { ...this.anim.play }, loop: this.anim.loop && { ...this.anim.loop } }; }
  /** Restore item state. Motor targets and sensors are restored with Rapier's bytes, so they aren't touched here. */
  setState(s) { this.current = s.state; this.anim = { play: s.play && { ...s.play }, loop: s.loop && { ...s.loop } }; this.applyLook(); this.pose(); }
}

/** Rotate v by quaternion q ([x, y, z, w]). @param {number[]} q @param {number[]} v @returns {number[]} */
function rotate(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
