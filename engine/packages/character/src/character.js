// The Character node: a VRM on the node's Object3D (facing lives on the node, never on vrm.scene), driven
// once per step in this order:
//   1. intent: `input` ({ move: [x, z] in m/s, jump }) or an active goTo,
//   2. controller: gravity, jump, the physics kinematic controller (or flat ground without physics),
//      facing towards the movement,
//   3. animation graph on VRMXA slots → each action's time and weight → mixer.update(0),
//   4. travel root motion stripped from the hips,
//   5. vrm.update(dt): humanoid, look-at, expressions, node constraints, spring bones at the fixed step.
// Knocked down (M3 W7), the body is a ragdoll (ragdoll.js): steps 1 to 4 give way to the bones taking the ragdoll's
// pose; once it lies still the character gets up, the animation coming back over the lying pose.
// Its whole state (every node's local transform, springs, look-at, expressions, graph, controller) is
// getState() / setState(), through the vendored three-vrm's state API only.
import { AnimationMixer, Object3D, Quaternion, Vector3 } from 'three';
import { createVRMAnimationClip, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import { Node } from '@vrmxg/core';
import { maskClip, maskedEntries } from './masks.js';
import { twoBoneIK } from './ik.js';
import { LocomotionGraph } from './graph.js';
import { humanoidRagdoll, poseFromRagdoll, RAGDOLL_BONES } from './ragdoll.js';

const GRAVITY = -9.81;
const TURN_RATE = 10; // rad/s
const ARRIVE = 0.3;   // m, goTo arrival radius
/** Hip height above the feet when seated, for the generated `sit` clips: a seat point is where the hips go (VRMXI §8.2). */
const SEATED_HIPS = 0.5;
const _v = new Vector3(), _qa = new Quaternion(), _qb = new Quaternion();
/** Ragdoll timing (steps at 60 Hz): the trunk still this long counts as lying; down this long before getting up; never longer than this falling. */
const STILL_STEPS = 20, DOWN_STEPS = 40, MAX_FALL_STEPS = 360;

/** The body's objects in order, skipping presentation subtrees (held items' models): what the snapshot holds. */
function simTraverse(o, fn) { if (o.userData.presentation) return; fn(o); for (const c of o.children) simTraverse(c, fn); }

/**
 * three's mixer writes a bone only when the value it computes differs from its previous update's (PropertyMixer.apply).
 * That makes a bone's value depend on history the snapshot can't hold: a bone left at another value by loading, or put
 * back by restoring a snapshot, stays wrong while the clip holds still. Poisoning the previous values before each
 * update makes the mixer write every active binding: the pose is a function of this step's inputs alone.
 */
function writeEveryBinding(m) {
  const prev = m._accuIndex, cur = prev ^ 1; // the update about to run accumulates into `cur` and compares it with `prev`
  for (let i = 0; i < m._nActiveBindings; i++) {
    const b = m._bindings[i], n = b.valueSize, buf = b.buffer, orig = n * b._origIndex;
    buf.copyWithin(cur * n + n, orig, orig + n); // a binding no clip weights this step mixes from here: start from its original
    buf.fill(NaN, prev * n + n, prev * n + 2 * n);
  }
}

export class CharacterNode extends Node {
  static actions = ['say', 'goTo', 'emote', 'lookAt', 'reach', 'knockDown', 'getUp', 'face'];

  constructor(data, def) {
    super(data, def);
    /** What the character wants to do this step: move in m/s (world x, z) and jump. */
    this.input = { move: [0, 0], jump: false };
    /** @type {any} */ this.vrm = null;
    /** @type {any} */ this.graph = null;
    /** @type {Map<string, any>} clip sha256 → AnimationAction */ this.actions = new Map();
    this.ctrl = { vy: 0, grounded: true, yaw: 0, jumped: false, goTo: null, look: null, seat: null };
    /** What an animation track asks for this step ({ weight, clips }), set by @vrmxg/tracks before the nodes step; null: the graph alone. */
    this.trackAnimation = null;
    /** Tags of what is worn; animation slots follow them (VRMXA §8.3). (Node `tags` are the node's own.) */
    this.equipped = new Set();
    /** @type {any} */ this.physics = null;
    /** @type {any} */ this.kcc = null;
    this.body = undefined;
    this.collider = undefined;
    /** what the eyes aim at (detached: not in the scene, not in a snapshot) */ this._lookPoint = new Object3D();
    /**
     * Knocked down (M3 W7): { phase: 'falling' | 'down' | 'rising', since, getUp, still, bodies, joints, balls, pre } while a
     * ragdoll (pre: the pose before the fall); rising: { since, pre, from, blend } (from: the lying pose the animation
     * comes back over). Null on its feet.
     * @type {any}
     */
    this.ragdoll = null;
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
    /** clip name → sha256, for tracks that name clips (@vrmxg/tracks) */ this.clipByName = new Map();
    const info = new Map();
    for (const [sha, { anim, meta }] of prep.clips) {
      const clip = createVRMAnimationClip(anim, this.vrm);
      const action = this.mixer.clipAction(clip);
      action.play(); action.weight = 0; action.paused = true;
      this.actions.set(sha, action);
      info.set(sha, { duration: meta.duration ?? clip.duration, loops: meta.loops ?? true, speed: meta.speed ?? null, rootMotion: meta.rootMotion ?? 'inPlace' });
      if (meta.name) this.clipByName.set(meta.name, sha);
    }
    this.clipInfo = info;
    // masked variants (G10 layers) of the clips the animation sets name with a mask, made now in a fixed order so the
    // mixer accumulates the same way in every run (an action made later would change the order)
    /** "sha|mask" → action */ this.maskedActions = new Map();
    for (const key of maskedEntries(this.animations)) {
      const [sha, mask] = key.split('|'), full = this.actions.get(sha);
      if (!full) continue;
      const action = this.mixer.clipAction(maskClip(full.getClip(), this.vrm, mask));
      action.play(); action.weight = 0; action.paused = true;
      this.maskedActions.set(key, action);
    }
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
    if (this.ragdoll?.bodies) this.physics.removeRagdoll(this.ragdoll);
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
    if (this.ragdoll && this.ragdoll.phase !== 'rising') { this.ragdollStep(); this.lookAndUpdate(dt); return; }
    // 0. an emote's moment is over (state, not a timer: a snapshot taken mid-emote restores)
    if (c.emote && this.tree.clock.step >= c.emote.until) { this.vrm.expressionManager?.setValue(c.emote.name, 0); delete c.emote; }
    // 1. intent (none while an action plays or the character sits)
    let [mx, mz] = this.graph.busy || c.seat || this.ragdoll ? [0, 0] : this.input.move;
    if (this.graph.busy || c.seat || this.ragdoll) this.input.jump = false;
    if (c.goTo && !this.ragdoll) {
      // a node, or a point [x, y, z]; with a navmesh (@vrmxg/nav) the crowd's velocity steers (navMove), else a straight line
      const target = Array.isArray(c.goTo) ? null : this.tree.find(c.goTo);
      if (!target && !Array.isArray(c.goTo)) { c.goTo = null; delete c.navMove; delete c.navArrived; }
      else {
        const t = target ? target.object3d.getWorldPosition(_v) : _v.set(c.goTo[0], c.goTo[1], c.goTo[2]), p = this.object3d.position;
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < ARRIVE || c.navArrived) { const id = target ? target.id : null; c.goTo = null; delete c.navMove; delete c.navArrived; mx = 0; mz = 0; this.emit('arrived', { target: id }); }
        else if (c.navMove) { [mx, mz] = c.navMove; }
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
      this.followSeat();
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
    // turning in place to face someone (face(); M3 W12, AB-A-0313): standing still, eased, done within ~5°
    if (c.face && speed <= 0.1 && !c.seat && !this.graph.busy) {
      let d = c.face.yaw - c.yaw;
      d -= Math.floor((d + Math.PI) / (2 * Math.PI)) * 2 * Math.PI;
      if (Math.abs(d) < 0.08) { delete c.face; this.emit('faced', {}); }
      else {
        const max = c.face.rate * dt;
        c.yaw += Math.max(-max, Math.min(max, d));
        this.object3d.quaternion.set(0, Math.sin(c.yaw / 2), 0, Math.cos(c.yaw / 2));
      }
    }
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
    for (const a of this.maskedActions.values()) a.weight = 0;
    // An animation track (@vrmxg/tracks: an AnimationPlayer or a sequence, set before the nodes step) takes over by its
    // weight; the graph keeps stepping underneath, so control returns to it smoothly when the track lets go.
    const track = this.trackAnimation, tw = track ? Math.max(0, Math.min(1, track.weight)) : 0;
    const add = (clip, time, weight) => { const a = this.actions.get(clip); if (!a || weight <= 0) return; if (a.weight > 0) a.weight += weight; else { a.time = time; a.weight = weight; } };
    const out = tw < 1 ? this.graph.output() : [];
    let base = 0;
    for (const { clip, time, weight, mask } of out) if (!mask) { add(clip, time, weight * (1 - tw)); base += weight * (1 - tw); }
    if (tw > 0) for (const c of track.clips) { const r = this.resolveTrackClip(c); if (r) { add(r.clip, r.time, c.weight * tw); base += c.weight * tw; } }
    // layers: a masked clip takes share f of its bones. The mixer averages by weight, so against the full-body weight B
    // on those bones it gets B·f / (1 − f) (f held below 1: at 0.995 the base keeps half a percent)
    for (const { clip, time, weight, mask } of out) {
      if (!mask || weight <= 0) continue;
      const a = this.maskedActions.get(`${clip}|${mask}`);
      if (!a) continue;
      const f = Math.min(0.995, weight * (1 - tw)), w = (base || 1) * f / (1 - f);
      if (a.weight > 0) a.weight += w; else { a.time = time; a.weight = w; }
    }
    // getting up (M3 W7): bones no clip moves go back to where they were before the fall (the mixer writes the rest)
    if (this.ragdoll) this.setHumanPose(this.ragdoll.pre);
    writeEveryBinding(this.mixer);
    this.mixer.update(0);

    // 4. travel root motion: the clip's forward drift is the controller's job
    if (this.graph.state === 'move' && this.graph.moveRootMotion() === 'travel') {
      const hips = this.vrm.humanoid.getNormalizedBoneNode('hips');
      const rest = this.vrm.humanoid.normalizedRestPose?.hips?.position;
      if (hips && rest) { hips.position.x = rest[0]; hips.position.z = rest[2]; }
    }

    // 4a. getting up (M3 W7): the animated pose comes in over the lying one
    if (this.ragdoll) this.blendFromRagdoll();

    // 4b. IK (M2 W8): feet on uneven ground, a hand reaching for a grip
    this.solveIK(dt);

    this.lookAndUpdate(dt);
  }

  /**
   * 5. look-at target (a character's head, not its feet; plus the voice service's small glances), within limits:
   *    behind the character (more than ~100° from its facing) the eyes go back to the front. Then the VRM's own update.
   */
  lookAndUpdate(dt) {
    const c = this.ctrl;
    if (this.vrm.lookAt) {
      const t = c.look ? this.tree.find(c.look) : null;
      const at = t ? this.lookPointOf(t) : null;
      if (at && c.lookOffset) { at.x += c.lookOffset[0]; at.y += c.lookOffset[1]; at.z += c.lookOffset[2]; }
      if (at && c.lookAway) { // thinking (M3 W2): the gaze goes 0.4 m to one side of the target and 0.3 m up
        const me = this.object3d.getWorldPosition(_v), dx = at.x - me.x, dz = at.z - me.z, len = Math.sqrt(dx * dx + dz * dz) || 1;
        at.x += (-dz / len) * 0.4 * c.lookAway; at.z += (dx / len) * 0.4 * c.lookAway; at.y += 0.3;
      }
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

  /** A track's clip ({ slot } | { clip: name or sha256 }, time in seconds, loop) → { clip: sha256, time in the clip }. */
  resolveTrackClip(c) {
    const sha = c.slot ? (this.graph.picks[c.slot]?.clip ?? this.graph.slots[c.slot]?.clips?.[0]?.clip) : (this.actions.has(c.clip) ? c.clip : this.clipByName.get(c.clip));
    if (!sha || !this.actions.has(sha)) return null;
    const d = this.clipInfo.get(sha)?.duration || 1;
    const t = c.loop === false ? Math.min(Math.max(0, c.time), d) : c.time - Math.floor(c.time / d) * d;
    return { clip: sha, time: t };
  }
  /** True while an action plays, the character is seated, or knocked down and getting up. */
  get busy() { return this.graph.busy || !!this.ctrl.seat || !!this.ragdoll; }

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

  /** Seated: the hips at the seat point, facing its +Z (a vehicle calls this again after physics has moved it). */
  followSeat() {
    const c = this.ctrl;
    const pt = c.seat ? /** @type {any} */ (this.tree.find(c.seat.item))?.seatPoints?.()[c.seat.point]?.node : null;
    if (!pt) return;
    pt.updateWorldMatrix(true, false);
    const e = pt.matrixWorld.elements;
    this.placeAt(e[12], e[13] - SEATED_HIPS, e[14], Math.atan2(e[8], e[10]));
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
  /** Walk to a node (target) or a point ([x, y, z]); with neither, stop. @param {{ target?: string, point?: number[] }} [o] */
  goTo({ target, point } = {}) { this.ctrl.goTo = point ? [point[0], point[1] ?? 0, point[2]] : target ?? null; if (!this.ctrl.goTo) { delete this.ctrl.navMove; delete this.ctrl.navArrived; } }
  /**
   * Play an expression for a moment: up to 1, and back to 0 a second later. The moment is the character's state
   * (ctrl.emote), not a closure timer, so a snapshot taken during it restores (M2 W12: scrubbing the film).
   */
  emote({ name }) {
    const em = this.vrm.expressionManager;
    if (!em?.getExpression(name)) return;
    if (this.ctrl.emote && this.ctrl.emote.name !== name) em.setValue(this.ctrl.emote.name, 0);
    em.setValue(name, 1);
    this.ctrl.emote = { name, until: this.tree.clock.step + 60 };
  }
  /**
   * Reach a hand to a point, a node, or an item's part (a knob), for `seconds`, fading in and out over `blend`:
   * two-bone IK on the arm. @param {{ hand?: 'left' | 'right', point?: number[], target?: string, part?: string, seconds?: number, blend?: number }} [o]
   */
  reach({ hand = 'right', point, target, part, seconds = 1, blend = 0.25 } = {}) {
    this.ctrl.reach = { hand, point: point ? [...point] : null, target: target ?? null, part: part ?? null, from: this.tree.clock.step, until: this.tree.clock.step + Math.round(seconds * 60), blend };
  }

  /** Where a reach points now (a moving knob is followed), or null. */
  reachPoint(r) {
    if (r.point) return _v.set(r.point[0], r.point[1], r.point[2]);
    const n = /** @type {any} */ (this.tree.find(r.target));
    const o = r.part ? n?.part?.(r.part) : n?.object3d;
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    return _v.setFromMatrixPosition(o.matrixWorld);
  }

  /**
   * Feet and hands (two-bone IK on the normalized bones, after the mixer, before vrm.update):
   *   feet   on the ground under each: rays down from above each ankle and the root; a foot over lower ground drops
   *          the pelvis by the difference, each leg then reaches its own ground (smoothed over a few steps). Flat
   *          ground changes nothing (the IK isn't run)
   *   hands  a reach (reach(), or an item's grip on interact) bends the arm to the point, weighted in and out
   */
  solveIK(dt) {
    const c = this.ctrl, h = this.vrm.humanoid, physics = this.physics;
    if (!h) return;
    const k = Math.min(1, dt * 12);
    // feet
    let want = [0, 0];
    if (this.props.footIK !== false && physics && c.grounded && !c.seat && !this.graph.busy && !this.ragdoll) {
      const p = this.object3d.position, ground = (x, z) => physics.world.raycast([x, p.y + 0.6, z], [0, -1, 0], 1.2, { excludeBody: this.body })?.point[1] ?? null;
      const g0 = ground(p.x, p.z);
      if (g0 !== null) want = ['left', 'right'].map((s) => {
        const f = h.getNormalizedBoneNode(`${s}Foot`);
        if (!f) return 0;
        f.updateWorldMatrix(true, false);
        const e = f.matrixWorld.elements, g = ground(e[12], e[14]);
        const d = g === null ? 0 : Math.max(-0.4, Math.min(0.4, g - g0));
        return Math.abs(d) < 0.005 ? 0 : d;
      });
    }
    const feet = c.feet ?? [0, 0];
    c.feet = [feet[0] + (want[0] - feet[0]) * k, feet[1] + (want[1] - feet[1]) * k].map((v) => (Math.abs(v) < 1e-4 ? 0 : v));
    if (c.feet[0] || c.feet[1]) {
      const drop = Math.min(0, c.feet[0], c.feet[1]), hips = h.getNormalizedBoneNode('hips');
      const targets = ['left', 'right'].map((s, i) => { const f = h.getNormalizedBoneNode(`${s}Foot`); f.updateWorldMatrix(true, false); return new Vector3().setFromMatrixPosition(f.matrixWorld).add(new Vector3(0, c.feet[i], 0)); });
      if (hips && drop) { hips.position.y += drop / (hips.parent?.getWorldScale(new Vector3()).y || 1); hips.updateWorldMatrix(false, true); }
      ['left', 'right'].forEach((s, i) => {
        const up = h.getNormalizedBoneNode(`${s}UpperLeg`), lo = h.getNormalizedBoneNode(`${s}LowerLeg`), ft = h.getNormalizedBoneNode(`${s}Foot`);
        if (up && lo && ft) twoBoneIK(up, lo, ft, targets[i], { pole: this.object3d.localToWorld(new Vector3(0, 0.5, 2)) });
      });
    }
    // a hand
    const r = c.reach, step = this.tree.clock.step;
    if (r) {
      if (step >= r.until) delete c.reach;
      else {
        const t = this.reachPoint(r), bs = Math.max(1, r.blend * 60);
        const w = Math.max(0, Math.min(1, (step - r.from) / bs, (r.until - step) / bs));
        const up = h.getNormalizedBoneNode(`${r.hand}UpperArm`), lo = h.getNormalizedBoneNode(`${r.hand}LowerArm`), hd = h.getNormalizedBoneNode(`${r.hand}Hand`);
        if (t && up && lo && hd) twoBoneIK(up, lo, hd, t.clone(), { weight: w, pole: this.object3d.localToWorld(new Vector3(r.hand === 'right' ? -1 : 1, -0.5, -1)) });
      }
    }
  }

  /**
   * Turn the body to face a node or a point, in place, easing at `rate` rad/s (M3 W12, AB-A-0313: look-at alone stops
   * about 100° from the facing). Done within ~5° (the `faced` signal); walking or sitting waits. Its target is state.
   * @param {{ target?: string, point?: number[], rate?: number }} [args]
   */
  face({ target, point, rate = 4 } = {}) {
    let at = point;
    if (!at && target) { const n = this.tree.find(target); if (n) { const w = n.object3d.getWorldPosition(new Vector3()); at = [w.x, w.y, w.z]; } }
    if (!at) { delete this.ctrl.face; return; }
    const p = this.object3d.getWorldPosition(new Vector3()), dx = at[0] - p.x, dz = at[2] - p.z;
    if (dx * dx + dz * dz < 1e-6) { delete this.ctrl.face; return; }
    this.ctrl.face = { yaw: Math.atan2(dx, dz), rate };
  }

  /** Look at a node; omit target to stop. @param {{ target?: string }} [args] */
  lookAt({ target } = {}) { this.ctrl.look = target ?? null; if (!target) delete this.ctrl.lookOffset; }
  /** Look away from the target, up and to one side (M3 W2: thinking); side 1 left, −1 right, 0 back. @param {{ side?: number }} [args] */
  lookAway({ side = 1 } = {}) { if (side) this.ctrl.lookAway = side; else delete this.ctrl.lookAway; }

  // ---------------------------------------------------------------- knocked down (M3 W7): the ragdoll

  /**
   * Fall as a ragdoll: the humanoid's parts from the pose the character is in, moving as the character was, with a
   * shove (N·s, world space) on one part. The capsule is off until the character is up again. Once the ragdoll has lain
   * still for half a second (or after six seconds), the character gets up, unless `getUp` is false (then getUp() does).
   * @param {{ impulse?: number[], part?: string, getUp?: boolean }} [o] part: the humanoid bone whose part takes the shove
   */
  knockDown({ impulse = [0, 0, 0], part = 'spine', getUp = true } = {}) {
    if (!this.physics) throw new Error(`Character "${this.id}": a ragdoll needs the physics service`);
    const at = Math.max(0, RAGDOLL_BONES.indexOf(part));
    if (this.ragdoll?.bodies) { this.physics.world.applyImpulse(this.ragdoll.bodies[at], impulse); this.ragdoll.still = 0; return; } // down already: shoved again
    if (this.ctrl.seat) this.standUp();
    this.object3d.updateWorldMatrix(true, true);
    const pre = this.humanPose(); // what getting up comes back to for bones no clip moves
    const parts = humanoidRagdoll(this.vrm, { mass: this.props.mass ?? 60 });
    // the parts move as the character did: its speed along its facing, and its fall
    const s = this.graph.speed ?? 0, yaw = this.ctrl.yaw;
    const rd = this.physics.buildRagdoll(parts, { layer: this.props.layer, iterations: 4, velocity: [Math.sin(yaw) * s, this.ctrl.vy, Math.cos(yaw) * s] });
    this.physics.world.applyImpulse(rd.bodies[at], impulse);
    if (this.collider !== undefined) this.physics.world.setColliderEnabled(this.collider, false);
    const c = this.ctrl;
    c.goTo = null; delete c.navMove; delete c.navArrived; delete c.reach;
    c.vy = 0;
    this.input.move = [0, 0]; this.input.jump = false;
    this.ragdoll = { phase: 'falling', since: this.tree.clock.step, getUp, still: 0, bodies: rd.bodies, joints: rd.joints, balls: rd.balls, pre };
    this.emit('knockedDown', {});
  }

  /** A ragdoll's step: the bones take the bodies' poses (from the last physics step); settled, it lies, then gets up. */
  ragdollStep() {
    const rd = this.ragdoll, w = this.physics.world, step = this.tree.clock.step;
    poseFromRagdoll(this.vrm, rd.bodies.map((b) => w.bodyPose(b)));
    if (rd.phase === 'falling') {
      // lying still is the hips and the torso (the first two parts) staying put: their speed, not their spin (a trunk
      // lying at a joint limit shakes in place, 0.5–1.5 rad/s, until settleRagdoll opens the limits and damps the parts)
      const m = this.physics.ragdollMotion(rd, 2);
      rd.still = m.lin < 0.15 ? rd.still + 1 : 0;
      if (rd.still >= STILL_STEPS || step - rd.since >= MAX_FALL_STEPS) { rd.phase = 'down'; rd.since = step; this.physics.settleRagdoll(rd); }
    } else if (rd.phase === 'down' && rd.getUp && step - rd.since >= DOWN_STEPS) this.getUp();
  }

  /**
   * Get up from a ragdoll lying down: the bodies go, the character stands where the hips lie, facing its feet when on its
   * back (its head when on its front), with the capsule back on. Its animation (a `getUp` slot when it has one, else
   * idle) then comes in over the lying pose for `getUpSeconds` (1.2).
   */
  getUp() {
    const rd = this.ragdoll;
    if (!rd?.bodies) return;
    const w = this.physics.world, h = this.vrm.humanoid, step = this.tree.clock.step;
    const hips = w.bodyPose(rd.bodies[0]);
    this.physics.removeRagdoll(rd);
    // which way it lies: the hips' up (along the spine) and forward (a VRM 0.x rig faces −z in its own frame)
    _qa.fromArray(hips.q);
    const fz = h.getNormalizedBoneNode('leftUpperLeg').position.x < 0 ? -1 : 1;
    const up = new Vector3(0, 1, 0).applyQuaternion(_qa), fwd = new Vector3(0, 0, fz).applyQuaternion(_qa);
    let dx = fwd.y > 0 ? -up.x : up.x, dz = fwd.y > 0 ? -up.z : up.z;
    if (dx * dx + dz * dz < 0.04) { dx = fwd.x; dz = fwd.z; } // sitting up: face where the chest faces
    const yaw = Math.atan2(dx, dz);
    const ground = w.raycast([hips.p[0], hips.p[1] + 0.5, hips.p[2]], [0, -1, 0], 3, { excludeBody: this.body });
    // stand the node under the hips; every bone stays where it lies (only the hips' pose is relative to the node)
    const hb = h.getNormalizedBoneNode('hips');
    const hp = hb.getWorldPosition(new Vector3()), hq = hb.getWorldQuaternion(new Quaternion());
    this.placeAt(hips.p[0], ground ? ground.point[1] : hips.p[1] - 0.1, hips.p[2], yaw);
    hb.position.copy(hb.parent.worldToLocal(hp));
    hb.quaternion.copy(hb.parent.getWorldQuaternion(_qb).invert().multiply(hq));
    const from = this.humanPose();
    if (this.collider !== undefined) w.setColliderEnabled(this.collider, true);
    this.ctrl.vy = 0; this.ctrl.grounded = true;
    if (this.graph.has('getUp')) this.graph.act('getUp');
    this.ragdoll = { phase: 'rising', since: step, pre: rd.pre, from, blend: Math.max(1, Math.round((this.props.getUpSeconds ?? 1.2) * 60)) };
    this.emit('gettingUp', {});
  }

  /** Getting up: each bone eases from where it lay to where the animation has it (smoothstep), the hips too. */
  blendFromRagdoll() {
    const rd = this.ragdoll, t = (this.tree.clock.step - rd.since) / rd.blend;
    if (t >= 1) { this.ragdoll = null; this.emit('gotUp', {}); return; }
    const k = t * t * (3 - 2 * t), f = rd.from;
    this.forEachHumanBone((n, i) => {
      _qb.copy(n.quaternion);
      n.quaternion.slerpQuaternions(_qa.set(f[i], f[i + 1], f[i + 2], f[i + 3]), _qb, k);
    });
    const p = this.vrm.humanoid.getNormalizedBoneNode('hips').position, o = f.length - 3;
    p.set(f[o] + (p.x - f[o]) * k, f[o + 1] + (p.y - f[o + 1]) * k, f[o + 2] + (p.z - f[o + 2]) * k);
  }

  /** f(node, offset) for each normalized humanoid bone the VRM has, in a fixed order; offset: its quaternion's in a humanPose. */
  forEachHumanBone(f) {
    const h = this.vrm.humanoid;
    let i = 0;
    for (const name of Object.keys(h.humanBones)) { const n = h.getNormalizedBoneNode(name); if (n) { f(n, i); i += 4; } }
  }
  /** The normalized humanoid's local rotations (forEachHumanBone's order), then the hips' position. */
  humanPose() {
    const out = [];
    this.forEachHumanBone((n) => out.push(n.quaternion.x, n.quaternion.y, n.quaternion.z, n.quaternion.w));
    const p = this.vrm.humanoid.getNormalizedBoneNode('hips').position;
    out.push(p.x, p.y, p.z);
    return Float64Array.from(out);
  }
  /** Put the normalized humanoid in a humanPose. */
  setHumanPose(a) {
    this.forEachHumanBone((n, i) => n.quaternion.set(a[i], a[i + 1], a[i + 2], a[i + 3]));
    const o = a.length - 3;
    this.vrm.humanoid.getNormalizedBoneNode('hips').position.set(a[o], a[o + 1], a[o + 2]);
  }

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
      ...(this.ragdoll ? { ragdoll: structuredClone(this.ragdoll) } : {}), // only while knocked down: a standing character's state is as it was
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
    this.ragdoll = s.ragdoll ? structuredClone(s.ragdoll) : null; // its bodies come back with the physics snapshot
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
