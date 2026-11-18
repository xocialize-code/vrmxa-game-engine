// Debug draw (PRD §5.18): wireframes of every physics collider where the simulation has it, coloured by
// what it is, plus the rays the simulation cast. Toggle each kind:
//   colliders  fixed (grey-green), dynamic (orange), kinematic (violet) solid colliders
//   sensors    trigger volumes (Area nodes; yellow)
//   capsules   character controller capsules (cyan)
//   rays       raycasts through the physics world since the last step (green to a hit, red when they miss):
//              the camera's spring arm, picks, game queries
// Shapes are built once per collider from Rapier's own shape and placed each frame from its pose, at the
// last simulated step (not interpolated: this is what physics sees). Debug objects live under the host's
// scene, marked presentation.
import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Quaternion, Vector3 } from 'three';

const _p = new Vector3(), _q = new Quaternion(), _one = new Vector3(1, 1, 1);

export const DEBUG_COLORS = { fixed: 0x8fb39a, dynamic: 0xff9a3c, kinematic: 0xb48cff, sensor: 0xffd23f, capsule: 0x37d6e8, rayHit: 0x48e06e, rayMiss: 0xff4f5e };

const circle = (out, r, axis, y = 0, n = 32, from = 0, to = 2 * Math.PI) => {
  for (let i = 0; i < n; i++) {
    const a0 = from + ((to - from) * i) / n, a1 = from + ((to - from) * (i + 1)) / n;
    const p = (a) => (axis === 'y' ? [Math.cos(a) * r, y, Math.sin(a) * r] : axis === 'z' ? [Math.cos(a) * r, Math.sin(a) * r + y, 0] : [0, Math.sin(a) * r + y, Math.cos(a) * r]);
    out.push(...p(a0), ...p(a1));
  }
};

/** Line-segment vertices (local space) for a Rapier shape, or null for shapes it can't draw. */
export function shapeLines(R, shape) {
  const T = R.ShapeType, out = [];
  switch (shape.type) {
    case T.Cuboid: case T.RoundCuboid: {
      const h = shape.halfExtents, b = shape.borderRadius ?? 0, x = h.x + b, y = h.y + b, z = h.z + b;
      const c = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) out.push(...c[i], ...c[j]);
      return out;
    }
    case T.Ball: { const r = shape.radius; circle(out, r, 'y'); circle(out, r, 'z'); circle(out, r, 'x'); return out; }
    case T.Capsule: case T.RoundCylinder: case T.Cylinder: {
      const r = shape.radius, hh = shape.halfHeight;
      circle(out, r, 'y', hh); circle(out, r, 'y', -hh);
      for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) out.push(x, -hh, z, x, hh, z);
      if (shape.type === T.Capsule) {
        circle(out, r, 'z', hh, 16, 0, Math.PI); circle(out, r, 'z', -hh, 16, Math.PI, 2 * Math.PI);
        circle(out, r, 'x', hh, 16, 0, Math.PI); circle(out, r, 'x', -hh, 16, Math.PI, 2 * Math.PI);
      }
      return out;
    }
    case T.TriMesh: case T.ConvexPolyhedron: {
      const v = shape.vertices, idx = shape.indices;
      if (!v) return null;
      if (!idx) { for (let i = 0; i + 5 < v.length; i += 3) out.push(v[i], v[i + 1], v[i + 2], v[i + 3], v[i + 4], v[i + 5]); return out; }
      const seen = new Set();
      const edge = (a, b) => { const k = a < b ? `${a},${b}` : `${b},${a}`; if (seen.has(k)) return; seen.add(k); out.push(v[a * 3], v[a * 3 + 1], v[a * 3 + 2], v[b * 3], v[b * 3 + 1], v[b * 3 + 2]); };
      for (let i = 0; i + 2 < idx.length; i += 3) { edge(idx[i], idx[i + 1]); edge(idx[i + 1], idx[i + 2]); edge(idx[i + 2], idx[i]); }
      return out;
    }
    default: return null;
  }
}

export class DebugDraw {
  /** @param {import('./host.js').RenderHost} host */
  constructor(host) {
    this.host = host;
    this.show = { colliders: false, sensors: false, capsules: false, rays: false };
    this.group = new Group(); this.group.name = 'debug'; this.group.userData.presentation = true;
    host.scene.add(this.group);
    /** @type {Map<number, { line: LineSegments, kind: string }>} */ this.wires = new Map();
    this.materials = Object.fromEntries(Object.entries(DEBUG_COLORS).map(([k, c]) => [k, new LineBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.9 })]));
    this.rays = []; this.pending = [];
    this.rayLines = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.rayLines.renderOrder = 1001; this.rayLines.frustumCulled = false;
    this.group.add(this.rayLines);
    this.world = null;
    this.tree = null;
  }

  get enabled() { return this.show.colliders || this.show.sensors || this.show.capsules || this.show.rays; }

  /** Turn kinds on or off: set({ colliders: true, sensors: true }) or set(true) for all. */
  set(kinds) {
    if (typeof kinds === 'boolean') kinds = { colliders: kinds, sensors: kinds, capsules: kinds, rays: kinds };
    Object.assign(this.show, kinds);
  }

  // The ray tap on the physics world: records only.
  tap(physics) {
    if (this.world === physics.world) return;
    if (this.world) this.world.onRay = null;
    this.world = physics.world;
    this.world.onRay = (o, d, max, dist) => { if (this.show.rays) this.pending.push([o, d, dist ?? max, dist !== null]); };
    this.pending = [];
  }

  /** Drop every wire (attaching another tree: collider handles start again from 0). */
  reset() {
    for (const w of this.wires.values()) { w.line.removeFromParent(); w.line.geometry.dispose(); }
    this.wires.clear(); this.rays = []; this.pending = [];
    if (this.world) this.world.onRay = null;
    this.world = null;
  }

  /** After the frame's steps. */
  update(tree, stepped) {
    if (tree !== this.tree) { this.reset(); this.tree = tree; }
    const physics = tree.services.get('physics');
    this.group.visible = this.enabled;
    if (!physics) return;
    this.tap(physics);
    if (stepped) { this.rays = this.pending; this.pending = []; }
    if (!this.enabled) return;
    const R = physics.R ?? physics.world.R, rw = physics.world.world;
    const live = new Set();
    for (const [h, info] of physics.colliders) {
      const c = rw.getCollider(h);
      if (!c) continue;
      live.add(h);
      let w = this.wires.get(h);
      if (!w) {
        const pts = shapeLines(R, c.shape);
        if (!pts) continue;
        const kind = c.isSensor() ? 'sensor' : info.owner?.type === 'Character' ? 'capsule' : bodyKind(R, c);
        const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
        const line = new LineSegments(geo, this.materials[kind]);
        line.name = `debug:${info.node?.id ?? h}`; line.matrixAutoUpdate = false; line.renderOrder = 1000; line.frustumCulled = false;
        line.userData.node = info.node?.id; line.userData.kind = kind;
        this.group.add(line);
        w = { line, kind };
        this.wires.set(h, w);
      }
      const t = c.translation(), r = c.rotation();
      w.line.matrix.compose(_p.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _one);
      w.line.visible = w.kind === 'sensor' ? this.show.sensors : w.kind === 'capsule' ? this.show.capsules : this.show.colliders;
    }
    for (const [h, w] of this.wires) if (!live.has(h)) { w.line.removeFromParent(); w.line.geometry.dispose(); this.wires.delete(h); }
    // rays
    const pos = [], col = [], hit = [0.28, 0.88, 0.43], miss = [1, 0.31, 0.37];
    if (this.show.rays) for (const [o, d, len, didHit] of this.rays) { pos.push(o[0], o[1], o[2], o[0] + d[0] * len, o[1] + d[1] * len, o[2] + d[2] * len); const c = didHit ? hit : miss; col.push(...c, ...c); }
    const g = this.rayLines.geometry;
    g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('color', new Float32BufferAttribute(col, 3));
  }

  /** How many wires of each kind are drawn (visible or not). */
  counts() { const c = { colliders: 0, sensors: 0, capsules: 0, rays: this.rays.length }; for (const w of this.wires.values()) c[w.kind === 'sensor' ? 'sensors' : w.kind === 'capsule' ? 'capsules' : 'colliders']++; return c; }

  dispose() {
    if (this.world) this.world.onRay = null;
    for (const w of this.wires.values()) w.line.geometry.dispose();
    this.wires.clear(); this.group.removeFromParent();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

function bodyKind(R, c) {
  const b = c.parent();
  if (!b) return 'fixed';
  if (b.isDynamic()) return 'dynamic';
  if (b.isKinematic()) return 'kinematic';
  return 'fixed';
}
