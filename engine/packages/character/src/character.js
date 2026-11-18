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
import { AnimationMixer, Vector3 } from 'three';
import { createVRMAnimationClip, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import { Node } from '@vrmxg/core';
import { LocomotionGraph } from './graph.js';

const GRAVITY = -9.81;
const TURN_RATE = 10; // rad/s
const ARRIVE = 0.3;   // m, goTo arrival radius
const _v = new Vector3();

export class CharacterNode extends Node {
  static actions = ['say', 'goTo', 'emote', 'lookAt'];

  constructor(data, def) {
    super(data, def);
    /** What the character wants to do this step: move in m/s (world x, z) and jump. */
    this.input = { move: [0, 0], jump: false };
    /** @type {any} */ this.vrm = null;
    /** @type {any} */ this.graph = null;
    /** @type {Map<string, any>} clip sha256 → AnimationAction */ this.actions = new Map();
    this.ctrl = { vy: 0, grounded: true, yaw: 0, jumped: false, goTo: null, look: null };
    /** Tags of what is worn; animation slots follow them (VRMXA §8.3). (Node `tags` are the node's own.) */
    this.equipped = new Set();
    /** @type {any} */ this.physics = null;
    /** @type {any} */ this.kcc = null;
    this.body = undefined;
    this.collider = undefined;
  }

  get bodyType() { return 'kinematic'; }

  enterTree() {
    const lib = this.tree.services.get('characters');
    if (!lib) throw new Error(`Character "${this.id}" needs the characters service (installCharacters)`);
    const prep = lib.take(this.id);
    this.lib = lib;
    this.vrm = prep.vrm;
    this.animations = prep.animations;
    this.equipped = new Set(prep.tags);
    this.object3d.add(this.vrm.scene);
    // Facing starts from the node's own rotation about Y.
    const q = this.object3d.quaternion;
    this.ctrl.yaw = 2 * Math.atan2(q.y, q.w);

    if (this.vrm.lookAt) {
      const proxy = new VRMLookAtQuaternionProxy(this.vrm.lookAt);
      proxy.name = 'VRMLookAtQuaternionProxy';
      this.vrm.scene.add(proxy);
    }
    this.mixer = new AnimationMixer(this.vrm.scene);
    const info = new Map();
    for (const [sha, { anim, meta }] of prep.clips) {
      const clip = createVRMAnimationClip(anim, this.vrm);
      const action = this.mixer.clipAction(clip);
      action.play(); action.weight = 0; action.paused = true;
      this.actions.set(sha, action);
      info.set(sha, { duration: meta.duration ?? clip.duration, loops: meta.loops ?? true, speed: meta.speed ?? null, rootMotion: meta.rootMotion ?? 'inPlace' });
    }
    this.clipInfo = info;
    this.graph = new LocomotionGraph(lib.resolveSlots(this.animations, this.equipped), info, () => this.rng.float());

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
    // 1. intent
    let [mx, mz] = this.input.move;
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
    if (speed > 0.1 && this.graph.moveRootMotion() === 'travel') { const k = this.graph.moveSpeed() / speed; mx *= k; mz *= k; speed = this.graph.moveSpeed(); }

    // 2. controller
    c.jumped = false;
    if (this.input.jump && c.grounded) { c.vy = this.props.jumpSpeed ?? 4.5; c.grounded = false; c.jumped = true; }
    this.input.jump = false;
    c.vy += GRAVITY * dt;
    const desired = [mx * dt, c.vy * dt, mz * dt];
    const p = this.object3d.position;
    if (this.kcc) {
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

    // 5. look-at target, then the VRM's own update at the fixed step
    if (this.vrm.lookAt) {
      const t = c.look ? this.tree.find(c.look) : null;
      this.vrm.lookAt.target = t ? t.object3d : null;
      this.vrm.lookAt.autoUpdate = !!t;
    }
    this.vrm.update(dt);
  }

  // ---------------------------------------------------------------- actions (the shared vocabulary)
  /** Speak a line (lip sync arrives with audio in M1; the signal fires now). */
  say({ text }) { this.emit('spoke', { text }); }
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
  lookAt({ target } = {}) { this.ctrl.look = target ?? null; }

  /** Set an expression weight directly (0..1). */
  setExpression(name, weight) { this.vrm.expressionManager?.setValue(name, weight); }

  // ---------------------------------------------------------------- state

  /** Everything that makes this character's next step what it is, as plain data. */
  getState() {
    const nodes = [];
    this.vrm.scene.traverse((o) => { nodes.push(o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z); });
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
    this.vrm.scene.traverse((o) => {
      const a = s.pose;
      o.position.set(a[i], a[i + 1], a[i + 2]); o.quaternion.set(a[i + 3], a[i + 4], a[i + 5], a[i + 6]); o.scale.set(a[i + 7], a[i + 8], a[i + 9]);
      if (!o.matrixAutoUpdate) o.updateMatrix(); // spring bones keep manual matrices
      i += 10;
    });
    this.vrm.springBoneManager?.setState(s.springs);
    if (this.vrm.lookAt && s.lookAt) { this.vrm.lookAt.yaw = s.lookAt[0]; this.vrm.lookAt.pitch = s.lookAt[1]; }
    for (const [k, v] of Object.entries(s.expressions)) this.vrm.expressionManager?.setValue(k, v);
    if (s.equipped.join('|') !== [...this.equipped].join('|')) this.setEquippedTags(s.equipped);
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
