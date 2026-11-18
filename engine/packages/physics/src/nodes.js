// RigidBody, Collider and Area nodes. A RigidBody owns a Rapier body; Collider children (at any depth
// below it, through plain nodes) attach to it with their pose relative to it; a Collider with no
// RigidBody above gets a private fixed body (static scenery). An Area is a sensor Collider.
// Mass: a RigidBody's `mass` prop is shared among its colliders by volume once they're all in
// (ready runs children first); without it, colliders keep Rapier's density 1.
import { Node } from '@vrmxg/core';
import { worldPose, relativePose } from './server.js';

const serverOf = (node) => {
  const s = node.tree?.services.get('physics');
  if (!s) throw new Error(`${node.type} "${node.id}" needs the physics service (installPhysics)`);
  return s;
};

export class RigidBodyNode extends Node {
  constructor(data, def) {
    super(data, def);
    /** @type {number | undefined} Rapier body handle */ this.body = undefined;
    /** @type {number[]} collider handles on this body */ this.colliderHandles = [];
    /** @type {any} the physics service */ this.physics = null;
  }

  get bodyType() { return this.props.bodyType ?? 'dynamic'; }
  /** True when someone listens to `contact` (data connection or code), so events are only paid for when used. */
  get reportsContacts() { return !!this.tree?.links.get(this)?.get('contact')?.length; }

  enterTree() {
    this.physics = serverOf(this);
    this.body = this.physics.addBody(this, { type: this.bodyType, linearDamping: this.props.linearDamping ?? 0, angularDamping: this.props.angularDamping ?? 0.5 });
    this.colliderHandles = [];
  }

  ready() {
    if (this.props.mass === undefined || !this.colliderHandles.length) return;
    const vols = this.colliderHandles.map((c) => this.physics.world.colliderVolume(c));
    const total = vols.reduce((a, b) => a + b, 0);
    this.colliderHandles.forEach((c, i) => this.physics.world.setColliderMass(c, total > 0 ? (this.props.mass * vols[i]) / total : this.props.mass / vols.length));
  }

  exitTree() { if (this.body !== undefined) this.physics.removeBody(this, this.body); this.body = undefined; }

  /** A code listener on `contact` switches collision events on for this body's colliders. */
  on(signal, fn) {
    const off = super.on(signal, fn);
    if (signal === 'contact') for (const c of this.colliderHandles ?? []) this.physics.world.setColliderEvents(c, true);
    return off;
  }

  /** Action: an impulse in world space (N·s). */
  applyImpulse({ impulse }) { this.physics.world.applyImpulse(this.body, impulse); }
}

export class ColliderNode extends Node {
  constructor(data, def) {
    super(data, def);
    /** @type {number | undefined} */ this.collider = undefined;
    /** @type {number | undefined} a private fixed body when there is no RigidBody above */ this.ownBody = undefined;
    /** @type {any} the node whose body this collider is on */ this.owner = null;
    /** @type {{ vertices: Float32Array, indices?: Uint32Array } | undefined} set by a model loader for mesh shapes */ this.meshData = undefined;
    /** @type {any} the physics service */ this.physics = null;
  }

  get isSensor() { return false; }

  /** Nearest RigidBody ancestor, or null. @returns {any} */
  findBodyNode() { for (let n = this.parent; n && !n._isRoot; n = n.parent) if (n instanceof RigidBodyNode) return n; return null; }

  spec() {
    const p = this.props;
    return { shape: p.shape ?? 'box', size: p.size, radius: p.radius, height: p.height, friction: p.friction, restitution: p.restitution, layer: p.layer, sensor: this.isSensor, vertices: this.meshData?.vertices, indices: this.meshData?.indices };
  }

  enterTree() {
    this.physics = serverOf(this);
    const owner = this.findBodyNode();
    if (owner) {
      this.owner = owner;
      this.collider = this.physics.addCollider(this, owner, owner.body, { ...this.spec(), events: owner.reportsContacts, ...relativePose(owner, this) });
      owner.colliderHandles.push(this.collider);
    } else {
      this.owner = this;
      this.ownBody = this.physics.addBody(this, { type: 'fixed' });
      this.collider = this.physics.addCollider(this, this, this.ownBody, this.spec());
    }
  }

  exitTree() {
    if (this.ownBody !== undefined) this.physics.removeBody(this, this.ownBody);
    else if (this.collider !== undefined && this.owner?.body !== undefined) {
      this.physics.removeCollider(this.collider);
      this.owner.colliderHandles = this.owner.colliderHandles.filter((c) => c !== this.collider);
    }
    this.collider = undefined; this.ownBody = undefined;
  }

  /** Nodes whose colliders overlap this one now. */
  overlapping() {
    return this.physics.world.overlapping(this.collider).map((h) => this.physics.colliders.get(h)?.owner.id).filter(Boolean);
  }
}

export class AreaNode extends ColliderNode {
  get isSensor() { return true; }
}

export { worldPose };
