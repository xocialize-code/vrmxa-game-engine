// The physics service: binds a PhysicsWorld to a SceneTree. It steps in the tree's afterNodes phase
// (after scripts set this step's inputs), then:
//   1. kinematic bodies take their pose from their node (scripts move kinematic nodes),
//   2. the world steps,
//   3. dynamic bodies write their pose back to their node (local to its parent),
//   4. sensor and contact events become node signals (Area.bodyEntered / bodyExited, RigidBody.contact),
//   5. physics behaviours (the hinge) read the result.
// Everything here is inside the determinism boundary: the order of each list is creation order.
import { Matrix4, Vector3, Quaternion } from 'three';
import { PhysicsWorld } from './world.js';
import { Layers } from './layers.js';
import { RAPIER_BUILD } from './rapier.js';

const _m = new Matrix4(), _p = new Vector3(), _q = new Quaternion(), _s = new Vector3();

/** World pose of a node's Object3D as arrays (scale ignored: physics shapes don't scale). */
export function worldPose(node) {
  node.object3d.updateWorldMatrix(true, false);
  node.object3d.matrixWorld.decompose(_p, _q, _s);
  return { p: _p.toArray(), q: _q.toArray() };
}

/** Pose of `child` relative to `ancestor`, both nodes. */
export function relativePose(ancestor, child) {
  ancestor.object3d.updateWorldMatrix(true, false);
  child.object3d.updateWorldMatrix(true, false);
  _m.copy(ancestor.object3d.matrixWorld).invert().multiply(child.object3d.matrixWorld);
  _m.decompose(_p, _q, _s);
  return { p: _p.toArray(), q: _q.toArray() };
}

export class PhysicsServer {
  /**
   * @param {import('@vrmxg/core').SceneTree} tree
   * @param {any} R initialised Rapier (loadRapier())
   * @param {{ gravity?: number[], layers?: { layers?: string[], collides?: Record<string, string[]> }, substeps?: number }} [config]
   *   vrmxg.json "physics"
   */
  constructor(tree, R, config = {}) {
    this.tree = tree;
    this.R = R;
    this.config = config;
    this.layers = new Layers(config.layers ?? {});
    this.world = new PhysicsWorld(R, { gravity: config.gravity, layers: this.layers, substeps: config.substeps ?? 1 });
    /** body handle → RigidBody node (or the Collider node that owns a private fixed body) */
    this.bodies = new Map();
    /** collider handle → { node, owner } (owner: the node whose body it is on) */
    this.colliders = new Map();
    /** Nodes with dynamic or kinematic bodies, in creation order. */
    this.moving = [];
    /** Nodes with kinematic bodies (they take their pose from the node each step). */
    this.kinematic = [];
    /** Physics behaviours that read the world after each step (hinges), in creation order. */
    this.watchers = [];
    /** @type {Map<any, Matrix4 | null>} */ this._parentInverse = new Map();
  }

  get build() { return { rapier: RAPIER_BUILD, version: this.R.version?.() ?? 'unknown' }; }

  // ---------------------------------------------------------------- registration (called by nodes)

  addBody(node, { type, linearDamping = 0, angularDamping = 0 }) {
    const pose = worldPose(node);
    const h = this.world.createBody({ type, ...pose, linearDamping, angularDamping });
    this.bodies.set(h, node);
    if (type !== 'fixed') this.moving.push(node);
    if (type === 'kinematic') this.kinematic.push(node);
    return h;
  }

  removeBody(node, handle) {
    for (const [c, info] of [...this.colliders]) if (info.owner === node) this.colliders.delete(c);
    this.world.removeBody(handle);
    this.bodies.delete(handle);
    this.moving = this.moving.filter((n) => n !== node);
    this.kinematic = this.kinematic.filter((n) => n !== node);
  }

  addCollider(node, owner, bodyHandle, spec) {
    const c = this.world.createCollider(bodyHandle, spec);
    this.colliders.set(c, { node, owner });
    return c;
  }

  removeCollider(handle) { this.colliders.delete(handle); this.world.removeCollider(handle); }

  watch(behaviour) { this.watchers.push(behaviour); return () => { this.watchers = this.watchers.filter((w) => w !== behaviour); }; }

  // ---------------------------------------------------------------- stepping

  afterNodes() {
    for (const n of this.kinematic) if (n.body !== undefined) {
      const { p, q } = worldPose(n);
      this.world.setKinematicPose(n.body, p, q);
    }
    const events = this.world.step();
    // Only awake bodies moved: Rapier iterates its active set, so a settled scene costs almost
    // nothing. Write-back order doesn't affect the simulation (it only copies poses into nodes).
    // Parent inverses are computed once per step and shared by siblings.
    this._parentInverse.clear();
    this.world.forEachAwakeBody((h) => {
      const n = this.bodies.get(h);
      if (n && n.body === h && n.bodyType === 'dynamic') this.writeBack(n);
    });
    for (const e of events) this.dispatch(e);
    for (const w of this.watchers) w.afterPhysics?.();
  }

  /** Copy a body's world pose into its node, as a transform local to the node's parent. */
  writeBack(node) {
    const o = node.object3d;
    const inv = this.parentInverse(o.parent);
    if (inv === null) { this.world.readPose(node.body, o.position, o.quaternion); return; } // parent at the origin
    this.world.readPose(node.body, _p, _q);
    _m.compose(_p, _q, _s.set(1, 1, 1)).premultiply(inv);
    _m.decompose(_p, _q, _s);
    o.position.copy(_p);
    o.quaternion.copy(_q);
  }

  /** Inverse world matrix of a parent Object3D, or null when it is the identity (cached per step). */
  parentInverse(parent) {
    let inv = this._parentInverse.get(parent);
    if (inv !== undefined) return inv;
    parent.updateWorldMatrix(true, false);
    const e = parent.matrixWorld.elements;
    const identity = e[0] === 1 && e[5] === 1 && e[10] === 1 && e[15] === 1 && e[1] === 0 && e[2] === 0 && e[3] === 0 && e[4] === 0 && e[6] === 0 && e[7] === 0 && e[8] === 0 && e[9] === 0 && e[11] === 0 && e[12] === 0 && e[13] === 0 && e[14] === 0;
    inv = identity ? null : new Matrix4().copy(parent.matrixWorld).invert();
    this._parentInverse.set(parent, inv);
    return inv;
  }

  dispatch({ a, b, started }) {
    const A = this.colliders.get(a), B = this.colliders.get(b);
    if (!A || !B) return;
    for (const [me, other] of [[A, B], [B, A]]) {
      if (me.node.isSensor) me.node.emit(started ? 'bodyEntered' : 'bodyExited', { body: other.owner.id, collider: other.node.id });
      else if (started && me.owner.reportsContacts) me.owner.emit('contact', { other: other.owner.id });
    }
  }

  // ---------------------------------------------------------------- queries (node ids out)

  raycast(origin, dir, maxDistance, opts) {
    const hit = this.world.raycast(origin, dir, maxDistance, opts);
    if (!hit) return null;
    const info = this.colliders.get(hit.collider);
    return { ...hit, node: info?.owner.id, colliderNode: info?.node.id };
  }

  shapecast(shape, p, q, velocity, maxToi, opts) {
    const hit = this.world.shapecast(shape, p, q, velocity, maxToi, opts);
    if (!hit) return null;
    const info = this.colliders.get(hit.collider);
    return { ...hit, node: info?.owner.id, colliderNode: info?.node.id };
  }

  // ---------------------------------------------------------------- snapshot

  /** The physics part of a world snapshot: Rapier's bytes plus physics behaviours' state. */
  snapshot() {
    return {
      build: this.build,
      bytes: this.world.snapshot(),
      watchers: this.watchers.map((w) => [w.node.id, w.name, w.getState()]),
    };
  }

  /** Restore into this server's world; nodes keep their handles, dynamic nodes take the restored poses. */
  restore(snap) {
    if (snap.build.version !== this.build.version || snap.build.rapier !== this.build.rapier) throw new Error(`snapshot from ${snap.build.rapier} ${snap.build.version} can't restore into ${this.build.rapier} ${this.build.version}`);
    this.world.restore(snap.bytes);
    this._parentInverse.clear();
    // Dynamic nodes take the restored poses. Kinematic ones keep theirs: the node is the authority, and
    // Rapier holds only the f32 copy it was given.
    for (const n of this.moving) if (n.body !== undefined && n.bodyType === 'dynamic') this.writeBack(n);
    const byKey = new Map(this.watchers.map((w) => [`${w.node.id}|${w.name}`, w]));
    for (const [id, name, state] of snap.watchers) byKey.get(`${id}|${name}`)?.setState(state);
  }

  /** Every body's pose as one Float64Array, in creation order: what determinism checks hash. */
  stateVector() {
    const out = [];
    for (const [h] of this.bodies) { const { p, q } = this.world.bodyPose(h); out.push(...p, ...q); }
    return new Float64Array(out);
  }

  debugLines() { return this.world.debugLines(); }
}
