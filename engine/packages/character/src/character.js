// The Character node: a VRM on the node's Object3D (facing lives on the node, never on vrm.scene), driven
// once per step in this order:
//   1. intent: `input` ({ move: [x, z] in m/s, jump }) or an active goTo,
//   2. controller: gravity, jump, the physics kinematic controller (or flat ground without physics),
//      facing towards the movement,
//   3. animation graph on VRMXA slots → each action's time and weight → mixer.update(0),
//   4. travel root motion stripped from the hips,
//   5. vrm.update(dt): humanoid, look-at, expressions, node constraints, spring bones at the fixed step.
// Its whole state (every node's local transform, springs, look-at, expressions, graph, controller) is
// getState() / setState(), through the vendored three-vrm's state API only.
import { AnimationMixer, Object3D, Vector3 } from 'three';
import { createVRMAnimationClip, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import { Node } from '@vrmxg/core';
import { LocomotionGraph } from './graph.js';

const GRAVITY = -9.81;
const TURN_RATE = 10; // rad/s
const ARRIVE = 0.3;   // m, goTo arrival radius
/** Hip height above the feet when seated, for the generated `sit` clips: a seat point is where the hips go (VRMXI §8.2). */
const SEATED_HIPS = 0.5;
const _v = new Vector3();

/** The body's objects in order, skipping presentation subtrees (held items' models): what the snapshot holds. */
function simTraverse(o, fn) { if (o.userData.presentation) return; fn(o); for (const c of o.children) simTraverse(c, fn); }

export class CharacterNode extends Node {
  static actions = ['say', 'goTo', 'emote', 'lookAt'];

  constructor(data, def) {
    super(data, def);
    /** What the character wants to do this step: move in m/s (world x, z) and jump. */
    this.input = { move: [0, 0], jump: false };
    /** @type {any} */ this.vrm = null;
    /** @type {any} */ this.graph = null;
    /** @type {Map<string, any>} clip sha256 → AnimationAction */ this.actions = new Map();
    this.ctrl = { vy: 0, grounded: true, yaw: 0, jumped: false, goTo: null, look: null, seat: null };
    /** Tags of what is worn; animation slots follow them (VRMXA §8.3). (Node `tags` are the node's own.) */
    this.equipped = new Set();
    /** @type {any} */ this.physics = null;
    /** @type {any} */ this.kcc = null;
    this.body = undefined;
    this.collider = undefined;
    /** what the eyes aim at (detached: not in the scene, not in a snapshot) */ this._lookPoint = new Object3D();
  }

  get bodyType() { return 'kinematic'; }

  enterTree() {
    const lib = this.tree.services.get('characters');
    if (!lib) throw new Error(`Character "${this.id}" needs the characters service (installCharacters)`);
    const prep = lib.take(this.id);
    this.lib = lib;
    this.animations = prep.animations;
    this.equipped = new Set(prep.tags);
    // Facing starts from the node's own rotation about Y.
    const q = this.object3d.quaternion;
    this.ctrl.yaw = 2 * Math.atan2(q.y, q.w);
    this.useVRM(prep);
    this.graph = new LocomotionGraph(lib.resolveSlots(this.animations, this.equipped), this.clipInfo, () => this.rng.float());

    const physics = this.tree.services.get('physics');
    if (physics) {
      this.physics = physics;
      const h = this.capsuleHeight();
      const r = Math.min(0.3, h / 4);
      this.body = physics.addBody(this, { type: 'kinematic' });
      this.collider = physics.addCollider(this, this, this.body, { shape: 'capsule', height: h, radius: r, p: [0, h / 2, 0], layer: this.props.layer });
      this.kcc = physics.world.createCharacterController({});
    }
    this.vrm.update(0); // rest pose, springs settled at rest
  }

  /** Put a parsed VRM on this node: its look-at proxy, a mixer with the prepared clips bound to it. */
  useVRM(prep) {
    this.vrm = prep.vrm;
    this.clips = prep.clips; // kept for a later swapVRM
    this.object3d.add(this.vrm.scene);
    if (this.vrm.lookAt) {
      const proxy = new VRMLookAtQuaternionProxy(this.vrm.lookAt);
      proxy.name = 'VRMLookAtQuaternionProxy';
      this.vrm.scene.add(proxy);
    }
    this.mixer = new AnimationMixer(this.vrm.scene);
    this.actions = new Map();
    const info = new Map();
    for (const [sha, { anim, meta }] of prep.clips) {
      const clip = createVRMAnimationClip(anim, this.vrm);
      const action = this.mixer.clipAction(clip);
      action.play(); action.weight = 0; action.paused = true;
      this.actions.set(sha, action);
      info.set(sha, { duration: meta.duration ?? clip.duration, loops: meta.loops ?? true, speed: meta.speed ?? null, rootMotion: meta.rootMotion ?? 'inPlace' });
    }
    this.clipInfo = info;
  }

  /**
   * Swap in another body (a closet redraw: VRMXA's avatar.vrm drawn with what is now worn), keeping everything
   * that isn't the body: the controller, the locomotion graph, facing, look target, what is worn. The new body's
   * pose comes from the graph on this step and its springs start at rest, so the swap is the same in every run.
   * Presentation objects hung on the old body (held items' models) are moved to the same bones of the new one.
   * @param {{ vrm: any, clips: Map<string, any> }} prep
   */
  swapVRM(prep) {
    const hung = [];
    this.vrm.scene.traverse((o) => { for (const c of o.children) if (c.userData.presentation && c.userData.bone) hung.push(c); });
    this.mixer?.stopAllAction();
    this.object3d.remove(this.vrm.scene);
    this.useVRM(prep);
    for (const c of hung) this.vrm.humanoid?.getRawBoneNode(c.userData.bone)?.add(c);
    this.vrm.update(0);
    this.object3d.updateWorldMatrix(true, true);
  }

  exitTree() {
    if (this.physics) { this.kcc.free(); this.physics.removeBody(this, this.body); }
    this.mixer?.stopAllAction();
    this.object3d.remove(this.vrm.scene);
  }

  /** Capsule height: the prop, or the head's height above the feet plus a margin. */
  capsuleHeight() {
    if (this.props.capsuleHeight) return this.props.capsuleHeight;
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (!head) return 1.7;
    this.vrm.scene.updateMatrixWorld(true);
    this.object3d.updateWorldMatrix(true, false);
    head.getWorldPosition(_v);
    return Math.max(0.6, _v.y - this.object3d.getWorldPosition(new Vector3()).y + 0.15);
  }

  /** What is worn changed: re-resolve the animation slots. */
  setEquippedTags(tags) {
    this.equipped = new Set(tags);
    this.graph.setSlots(this.lib.resolveSlots(this.animations, this.equipped));
  }

  physicsProcess(dt) {
    const c = this.ctrl;
    // 1. intent (none while an action plays or the character sits)
    let [mx, mz] = this.graph.busy || c.seat ? [0, 0] : this.input.move;
    if (this.graph.busy || c.seat) this.input.jump = false;
    if (c.goTo) {
      const target = this.tree.find(c.goTo);
      if (!target) c.goTo = null;
      else {
        const t = target.object3d.getWorldPosition(_v), p = this.object3d.position;
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < ARRIVE) { c.goTo = null; mx = 0; mz = 0; this.emit('arrived', { target: target.id }); }
        else { const s = this.props.walkSpeed ?? 1.4; mx = (dx / d) * s; mz = (dz / d) * s; }
      }
    }
    let speed = Math.sqrt(mx * mx + mz * mz);
    if (speed > 0.1 && this.graph.moveRootMotion(speed) === 'travel') { const s = this.graph.moveSpeed(speed), k = s / speed; mx *= k; mz *= k; speed = s; }

    // 2. controller
    c.jumped = false;
    if (this.input.jump && c.grounded) { c.vy = this.props.jumpSpeed ?? 4.5; c.grounded = false; c.jumped = true; }
    this.input.jump = false;
    c.vy += GRAVITY * dt;
    const desired = [mx * dt, c.vy * dt, mz * dt];
    const p = this.object3d.position;
    if (c.seat) { // held on the seat (no controller, no gravity), following it if it moves (VRMXI §8.2)
      c.vy = 0; c.grounded = true;
      const pt = /** @type {any} */ (this.tree.find(c.seat.item))?.seatPoints?.()[c.seat.point]?.node;
      if (pt) { pt.updateWorldMatrix(true, false); const e = pt.matrixWorld.elements; this.placeAt(e[12], e[13] - SEATED_HIPS, e[14], Math.atan2(e[8], e[10])); }
    }
    else if (this.kcc) {
      const { movement, grounded } = this.kcc.move(this.collider, desired);
      p.set(p.x + movement[0], p.y + movement[1], p.z + movement[2]);
      c.grounded = grounded;
    } else {
      p.set(p.x + desired[0], Math.max(0, p.y + desired[1]), p.z + desired[2]);
      c.grounded = p.y <= 0;
    }
    if (c.grounded && c.vy < 0) c.vy = 0;
    if (speed > 0.1) {
      const target = Math.atan2(mx, mz);
      let d = target - c.yaw;
      d -= Math.floor((d + Math.PI) / (2 * Math.PI)) * 2 * Math.PI; // wrap to [-π, π)
      const max = TURN_RATE * dt;
      c.yaw += Math.max(-max, Math.min(max, d));
      this.object3d.quaternion.set(0, Math.sin(c.yaw / 2), 0, Math.cos(c.yaw / 2));
    }

    // 3. animation graph → pose
    this.graph.step(dt, { speed, grounded: c.grounded, verticalSpeed: c.vy, jumped: c.jumped });
    for (const a of this.actions.values()) a.weight = 0;
    for (const { clip, time, weight } of this.graph.output()) {
      const a = this.actions.get(clip);
      if (!a) continue;
      a.time = time; a.weight = weight;
    }
    this.mixer.update(0);

    // 4. travel root motion: the clip's forward drift is the controller's job
    if (this.graph.state === 'move' && this.graph.moveRootMotion() === 'travel') {
      const hips = this.vrm.humanoid.getNormalizedBoneNode('hips');
      const rest = this.vrm.humanoid.normalizedRestPose?.hips?.position;
      if (hips && rest) { hips.position.x = rest[0]; hips.position.z = rest[2]; }
    }

    // 5. look-at target (a character's head, not its feet; plus the voice service's small glances), within limits:
    //    behind the character (more than ~100° from its facing) the eyes go back to the front. Then the VRM's own update.
    if (this.vrm.lookAt) {
      const t = c.look ? this.tree.find(c.look) : null;
      const at = t ? this.lookPointOf(t) : null;
      if (at && c.lookOffset) { at.x += c.lookOffset[0]; at.y += c.lookOffset[1]; at.z += c.lookOffset[2]; }
      let ok = !!at;
      if (at) {
        const me = this.object3d.getWorldPosition(_v);
        const dx = at.x - me.x, dz = at.z - me.z, len = Math.sqrt(dx * dx + dz * dz);
        // facing is +Z rotated by yaw: (sin yaw, cos yaw); the node's quaternion gives it without trigonometry
        const q = this.object3d.quaternion, fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
        ok = len < 1e-6 || (dx * fx + dz * fz) / len > -0.17;
      }
      if (ok) { this._lookPoint.position.copy(at); this._lookPoint.updateMatrixWorld(); }
      this.vrm.lookAt.target = ok ? this._lookPoint : null;
      this.vrm.lookAt.autoUpdate = ok;
      if (!ok && (this.vrm.lookAt.yaw || this.vrm.lookAt.pitch)) { this.vrm.lookAt.yaw = 0; this.vrm.lookAt.pitch = 0; }
    }
    this.vrm.update(dt);
  }

  // ---------------------------------------------------------------- items (VRMXI §8): actions, seats

  /** Play an action slot (use, take, talk, stand; sit through sitOn). Movement waits until it ends. */
  startAction(slot) { this.graph.act(slot); }
  /** True while an action plays or the character is seated. */
  get busy() { return this.graph.busy || !!this.ctrl.seat; }

  /**
   * Sit in one of an item's seat points: the hips go to the point's node, facing its +Z (VRMXI §8.2); the collider is
   * off while seated, and the item's tags count toward what the character has on (VRMXI §8.1).
   * @param {any} item an Item node @param {number} index seat point
   */
  sitOn(item, index = 0) {
    const point = item.seatPoints()[index];
    if (!point?.node) throw new Error(`${item.id} has no seat point ${index}`);
    point.node.updateWorldMatrix(true, false);
    const e = point.node.matrixWorld.elements, yaw = Math.atan2(e[8], e[10]);
    const p = this.object3d.position;
    const tags = item.itemTags().filter((t) => !this.equipped.has(t));
    this.ctrl.seat = { item: item.id, point: index, tags, from: [p.x, p.y, p.z, this.ctrl.yaw], exit: point.exit ? true : null };
    this.placeAt(e[12], e[13] - SEATED_HIPS, e[14], yaw);
    if (this.collider !== undefined) this.physics.world.setColliderEnabled(this.collider, false);
    if (tags.length) this.setEquippedTags([...this.equipped, ...tags]);
    this.graph.act('sit');
  }

  /** Stand up from a seat: to its exit point (or where the character came from), control back. */
  standUp() {
    const seat = this.ctrl.seat;
    if (!seat) return;
    // to the seat's exit point where it is now (the seat may have moved), else back where the character came from
    const exitNode = seat.exit ? /** @type {any} */ (this.tree.find(seat.item))?.seatPoints?.()[seat.point]?.exit : null;
    let x, y, z, yaw;
    if (exitNode) { exitNode.updateWorldMatrix(true, false); const e = exitNode.matrixWorld.elements; [x, y, z, yaw] = [e[12], e[13], e[14], Math.atan2(e[8], e[10])]; }
    else [x, y, z, yaw] = seat.from;
    this.ctrl.seat = null;
    this.placeAt(x, y, z, yaw);
    if (this.collider !== undefined) this.physics.world.setColliderEnabled(this.collider, true);
    if (seat.tags.length) this.setEquippedTags([...this.equipped].filter((t) => !seat.tags.includes(t)));
    this.graph.act('stand');
  }

  /** Put the character's feet at a point, facing a yaw (radians, 0 along +Z). */
  placeAt(x, y, z, yaw) {
    this.object3d.position.set(x, y, z);
    this.ctrl.yaw = yaw;
    this.object3d.quaternion.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
    this.object3d.updateWorldMatrix(true, true);
  }

  // ---------------------------------------------------------------- actions (the shared vocabulary)
  /**
   * Speak a line: through the voice service (a clip, lip sync, a caption) when there is one; the signal fires now.
   * @param {{ text?: string, clip?: string }} [args]
   */
  say({ text, clip } = {}) {
    const voice = this.tree.services.get('voice');
    if (voice) voice.say(this, { text, clip }); else this.emit('spoke', { text });
  }
  /** True while a line is being said. */
  get speaking() { return !!this.tree?.services.get('voice')?.speaking(this.id); }

  /** Where to look at a node: a character's head, anything else's origin (world space, a new vector). */
  lookPointOf(node) {
    const head = node.vrm?.humanoid?.getRawBoneNode('head');
    const o = head ?? node.object3d;
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(new Vector3());
  }
  /** Walk to a node (straight line until navigation lands in M2); `arrived` when within 0.3 m. */
  goTo({ target }) { this.ctrl.goTo = target ?? null; }
  /** Play an expression for a moment: up to 1 and back over a second. */
  emote({ name }) {
    const em = this.vrm.expressionManager;
    if (!em?.getExpression(name)) return;
    em.setValue(name, 1);
    this.after(1, () => em.setValue(name, 0));
  }
  /** Look at a node; omit target to stop. @param {{ target?: string }} [args] */
  lookAt({ target } = {}) { this.ctrl.look = target ?? null; if (!target) delete this.ctrl.lookOffset; }

  /** Set an expression weight directly (0..1). */
  setExpression(name, weight) { this.vrm.expressionManager?.setValue(name, weight); }

  // ---------------------------------------------------------------- state

  /** Everything that makes this character's next step what it is, as plain data. */
  getState() {
    const nodes = [];
    simTraverse(this.vrm.scene, (o) => { nodes.push(o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z); });
    const em = this.vrm.expressionManager;
    const p = this.object3d.position, q = this.object3d.quaternion;
    return {
      node: [p.x, p.y, p.z, q.x, q.y, q.z, q.w],
      pose: Float64Array.from(nodes),
      springs: this.vrm.springBoneManager?.getState() ?? new Float64Array(0),
      lookAt: this.vrm.lookAt ? [this.vrm.lookAt.yaw, this.vrm.lookAt.pitch] : null,
      expressions: em ? Object.fromEntries(em.expressions.map((e) => [e.expressionName, em.getValue(e.expressionName)])) : {},
      graph: this.graph.getState(),
      ctrl: { ...this.ctrl, move: [...this.input.move] },
      equipped: [...this.equipped],
    };
  }

  setState(s) {
    this.object3d.position.set(s.node[0], s.node[1], s.node[2]);
    this.object3d.quaternion.set(s.node[3], s.node[4], s.node[5], s.node[6]);
    let i = 0;
    simTraverse(this.vrm.scene, (o) => {
      const a = s.pose;
      o.position.set(a[i], a[i + 1], a[i + 2]); o.quaternion.set(a[i + 3], a[i + 4], a[i + 5], a[i + 6]); o.scale.set(a[i + 7], a[i + 8], a[i + 9]);
      if (!o.matrixAutoUpdate) o.updateMatrix(); // spring bones keep manual matrices
      i += 10;
    });
    this.vrm.springBoneManager?.setState(s.springs);
    if (this.vrm.lookAt && s.lookAt) { this.vrm.lookAt.yaw = s.lookAt[0]; this.vrm.lookAt.pitch = s.lookAt[1]; }
    for (const [k, v] of Object.entries(s.expressions)) this.vrm.expressionManager?.setValue(k, v);
    if (s.equipped.join('|') !== [...this.equipped].join('|')) {
      // slots for what the snapshot had on, without picking clips (that would draw from the random stream);
      // the graph's own state brings the picks back
      this.equipped = new Set(s.equipped);
      this.graph.slots = this.lib.resolveSlots(this.animations, this.equipped);
    }
    this.graph.setState(s.graph);
    const { move, ...ctrl } = s.ctrl;
    this.ctrl = { ...ctrl };
    this.input.move = [...move];
    this.object3d.updateWorldMatrix(true, true); // the node, its parents and the whole VRM, as a played run has them
  }
}

/**
 * A node riding on one of its Character's humanoid bones (VRMXW §8 attach points: held, stowed).
 * Its Object3D is re-parented under the raw bone, so it and its children follow the animated skeleton.
 */
export class BoneAttachmentNode extends Node {
  enterTree() {
    /** @type {any} */ let ch = this.parent;
    while (ch && !(ch instanceof CharacterNode)) ch = ch.parent;
    if (!ch) throw new Error(`BoneAttachment "${this.id}" must be inside a Character`);
    const bone = ch.vrm.humanoid.getRawBoneNode(this.props.bone ?? 'rightHand');
    if (!bone) throw new Error(`BoneAttachment "${this.id}": the character has no ${this.props.bone} bone`);
    this.character = ch;
    bone.add(this.object3d);
  }
  exitTree() { this.parent?.object3d.add(this.object3d); } // back under its node parent before the tree detaches it
}
