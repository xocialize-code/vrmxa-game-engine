// The "nav" service (M2 W6): navcat 0.4.1 behind the engine's adapter (spike-navigation, AB-R-0925).
//
// The navmesh is baked on the first step from the physics world's fixed colliders (soup.js), tiled, so a door can
// change two tiles instead of the whole mesh. Every Character gets a crowd agent. Each step, before the nodes:
//   1. obstacles   Items in their `locked` state block their box (the tiles under it are rebuilt); unlocked, freed
//   2. sync        each agent takes its character's foot position (physics is authoritative for where a body is;
//                  the crowd plans from there, Unity's updatePosition = false pattern)
//   3. targets     a character's goTo (a node, or a point) becomes its agent's move target; reaching it, or no goTo,
//                  clears it
//   4. crowd       navcat's crowd: corridors, steering, agent-agent avoidance
//   5. drive       the agent's velocity becomes the character's `navMove`, which its controller follows instead of a
//                  straight line; an agent more than 0.5 m from its body is put back on it and replans
// Off-mesh links (a jump, a ladder) are added and removed at run time. The crowd and, once a door or link changed it,
// the navmesh are plain JS, deep-copied into the snapshot (snapshot / restore); the per-step hash reads a compact state
// vector. The crowd's obstacle avoidance is vendored with portable trig (vendor/navcat-blocks.js).
import * as N from 'navcat';
import { DT } from '@vrmxg/core';
import { crowd as C, chunkyTriMesh } from './vendor/navcat-blocks.js';
import { collidersToSoup } from './soup.js';

const nav = /** @type {any} */ (N), crowd = /** @type {any} */ (C), ctm = /** @type {any} */ (chunkyTriMesh);

/** Agent and bake settings (metres): one size of character in M2. */
export const AGENT = { radius: 0.3, height: 1.7, climb: 0.3, slope: 45, maxAccel: 8 };
export const BAKE = { cs: 0.1, ch: 0.05, tileVoxels: 48, minRegionArea: 8, mergeRegionArea: 20, maxSimplificationError: 1.3, maxEdgeLen: 12, maxVertsPerPoly: 6, detailSampleDist: 6, detailSampleMaxError: 1 };
const DRIFT = 0.5, RETARGET = 0.25, ARRIVE = 0.25, HALF = [1.5, 2, 1.5];

/**
 * A deep copy that keeps shared references shared. `swap` replaces objects on the way (the snapshot turns navcat's query
 * filter, an object of functions, into a marker structuredClone can carry, and restore turns it back).
 */
export function cloneDeep(v, swap = null, seen = new Map()) {
  if (v === null || typeof v !== 'object') return v;
  if (swap) { const r = swap(v); if (r !== undefined) return r; }
  if (seen.has(v)) return seen.get(v);
  if (ArrayBuffer.isView(v)) { const c = /** @type {any} */ (v).slice(); seen.set(v, c); return c; }
  if (Array.isArray(v)) { const c = new Array(v.length); seen.set(v, c); for (let i = 0; i < v.length; i++) c[i] = cloneDeep(v[i], swap, seen); return c; }
  if (v instanceof Map) { const c = new Map(); seen.set(v, c); for (const [k, x] of v) c.set(k, cloneDeep(x, swap, seen)); return c; }
  if (v instanceof Set) { const c = new Set(); seen.set(v, c); for (const x of v) c.add(cloneDeep(x, swap, seen)); return c; }
  const c = Object.create(Object.getPrototypeOf(v)); seen.set(v, c);
  for (const k of Object.keys(v)) c[k] = cloneDeep(v[k], swap, seen);
  return c;
}
const FILTER = { __navFilter: 'default' };
const encode = (v) => (v === nav.DEFAULT_QUERY_FILTER ? FILTER : undefined);
const decode = (v) => (v.__navFilter === 'default' ? nav.DEFAULT_QUERY_FILTER : undefined);

const voxels = { radius: Math.ceil(AGENT.radius / BAKE.cs), climb: Math.floor(AGENT.climb / BAKE.ch), height: Math.ceil(AGENT.height / BAKE.ch) };
const OPTS = (borderSize) => ({
  cellSize: BAKE.cs, cellHeight: BAKE.ch,
  walkableRadiusWorld: AGENT.radius, walkableRadiusVoxels: voxels.radius,
  walkableClimbWorld: AGENT.climb, walkableClimbVoxels: voxels.climb,
  walkableHeightWorld: AGENT.height, walkableHeightVoxels: voxels.height,
  walkableSlopeAngleDegrees: AGENT.slope, borderSize,
  minRegionArea: BAKE.minRegionArea, mergeRegionArea: BAKE.mergeRegionArea,
  maxSimplificationError: BAKE.maxSimplificationError, maxEdgeLength: BAKE.maxEdgeLen, maxVerticesPerPoly: BAKE.maxVertsPerPoly,
  detailSampleDistance: BAKE.cs * BAKE.detailSampleDist, detailSampleMaxError: BAKE.ch * BAKE.detailSampleMaxError,
});

/** One tile (navcat/blocks' buildNavMeshTile, plus blockers marked unwalkable after erosion, as a tile cache would). */
function buildTile(ctx, positions, chunky, tileBounds, o, blockers) {
  const b = o.borderSize * o.cellSize;
  const ex = [tileBounds[0] - b, tileBounds[1], tileBounds[2] - b, tileBounds[3] + b, tileBounds[4], tileBounds[5] + b];
  const chunks = ctm.getChunksOverlappingRect(chunky, [ex[0], ex[2]], [ex[3], ex[5]]);
  const size = BAKE.tileVoxels + o.borderSize * 2;
  const hf = nav.createHeightfield(size, size, ex, o.cellSize, o.cellHeight);
  const areas = new Uint8Array(chunky.maxTrisPerChunk);
  for (const ci of chunks) {
    const node = chunky.nodes[ci];
    const tris = chunky.triangles.slice(node.index * 3, node.index * 3 + node.count * 3);
    areas.fill(0);
    nav.markWalkableTriangles(positions, tris, areas.subarray(0, node.count), o.walkableSlopeAngleDegrees);
    nav.rasterizeTriangles(ctx, hf, positions, tris, areas.subarray(0, node.count), o.walkableClimbVoxels);
  }
  nav.filterLowHangingWalkableObstacles(hf, o.walkableClimbVoxels);
  nav.filterLedgeSpans(hf, o.walkableHeightVoxels, o.walkableClimbVoxels);
  nav.filterWalkableLowHeightSpans(hf, o.walkableHeightVoxels);
  const chf = nav.buildCompactHeightfield(ctx, o.walkableHeightVoxels, o.walkableClimbVoxels, hf);
  nav.erodeWalkableArea(o.walkableRadiusVoxels, chf);
  for (const bb of blockers) nav.markBoxArea(bb, nav.NULL_AREA, chf);
  nav.buildDistanceField(chf);
  nav.buildRegions(ctx, chf, o.borderSize, o.minRegionArea, o.mergeRegionArea);
  const cset = nav.buildContours(ctx, chf, o.maxSimplificationError, o.maxEdgeLength, nav.ContourBuildFlags.CONTOUR_TESS_WALL_EDGES);
  const pmesh = nav.buildPolyMesh(ctx, cset, o.maxVerticesPerPoly);
  for (let i = 0; i < pmesh.nPolys; i++) { if (pmesh.areas[i] === nav.WALKABLE_AREA) pmesh.areas[i] = 0; if (pmesh.areas[i] === 0) pmesh.flags[i] = 1; }
  const dmesh = nav.buildPolyMeshDetail(ctx, pmesh, chf, o.detailSampleDistance, o.detailSampleMaxError);
  return { pmesh, dmesh };
}

const v3 = (p) => [p[0], p[1], p[2]];

export class NavService {
  /** @param {any} tree @param {{ maxTop?: number }} [o] */
  constructor(tree, { maxTop = 2.2 } = {}) {
    this.tree = tree;
    this.maxTop = maxTop;
    /** navcat's navmesh and crowd (null until the first step bakes). */
    this.mesh = null; this.crowd = null;
    /** Simulation state beside them: agent ids by node id, what each agent was sent to, blocked boxes, links, and a version that counts navmesh changes since the bake (0: as baked). */
    this.st = { agents: {}, targets: {}, blocked: {}, links: {}, version: 0, linkCounter: 0, stalled: {} };
    /** Derived (rebuilt by bake): the triangle soup and the tile grid. */
    this.build = null;
    this.stats = { bakeMs: 0, polys: 0, tiles: 0, colliders: 0, rebuilds: 0, teleports: 0 };
    this.timer = null; // a clock the caller may give (bake timing): nothing in the simulation reads one
    this.nearest = nav.createFindNearestPolyResult();
  }

  // ---------------------------------------------------------------- the navmesh

  /** Bake the navmesh from the physics world's fixed colliders (tiled, no blockers yet). */
  bake() {
    const physics = this.tree.services.get('physics');
    if (!physics) throw new Error('nav needs the physics service: the navmesh is baked from its colliders');
    const t0 = this.timer?.() ?? 0;
    this.tree.root.object3d.updateMatrixWorld(true);
    const soup = collidersToSoup(physics.R, physics.world.world, { maxTop: this.maxTop });
    if (!soup.indices.length) throw new Error('nav: the physics world has no fixed colliders to bake');
    const o = OPTS(voxels.radius + 3);
    const bounds = nav.calculateMeshBounds([0, 0, 0, 0, 0, 0], soup.positions, soup.indices);
    const grid = nav.calculateGridSize([0, 0], bounds, BAKE.cs);
    const mesh = nav.createNavMesh();
    mesh.tileWidth = mesh.tileHeight = BAKE.tileVoxels * BAKE.cs;
    mesh.origin = [bounds[0], bounds[1], bounds[2]];
    this.build = { positions: soup.positions, chunky: ctm.create(soup.positions, soup.indices), bounds, o, ctx: nav.BuildContext.create(), nx: Math.ceil(grid[0] / BAKE.tileVoxels), ny: Math.ceil(grid[1] / BAKE.tileVoxels) };
    this.mesh = mesh;
    let polys = 0, tiles = 0;
    for (let tx = 0; tx < this.build.nx; tx++) for (let ty = 0; ty < this.build.ny; ty++) { const n = this.addTile(tx, ty, []); if (n) { polys += n; tiles++; } }
    this.crowd = crowd.create(AGENT.radius);
    this.st = { agents: {}, targets: {}, blocked: {}, links: {}, version: 0, linkCounter: 0, stalled: {} };
    Object.assign(this.stats, { bakeMs: (this.timer?.() ?? 0) - t0, polys, tiles, colliders: soup.colliders });
    return this.stats;
  }

  tileBounds(tx, ty) {
    const { bounds } = this.build, tw = BAKE.tileVoxels * BAKE.cs;
    return [bounds[0] + tx * tw, bounds[1], bounds[2] + ty * tw, bounds[0] + (tx + 1) * tw, bounds[4], bounds[2] + (ty + 1) * tw];
  }

  addTile(tx, ty, blockers) {
    const { pmesh, dmesh } = buildTile(this.build.ctx, this.build.positions, this.build.chunky, this.tileBounds(tx, ty), this.build.o, blockers);
    if (pmesh.vertices.length === 0) return 0;
    const tp = nav.polyMeshToTilePolys(pmesh);
    const td = nav.polyMeshDetailToTileDetailMesh(tp.polys, dmesh);
    nav.addTile(this.mesh, nav.buildTile({
      bounds: pmesh.bounds, vertices: tp.vertices, polys: tp.polys, detailMeshes: td.detailMeshes, detailVertices: td.detailVertices, detailTriangles: td.detailTriangles,
      tileX: tx, tileY: ty, tileLayer: 0, cellSize: BAKE.cs, cellHeight: BAKE.ch, walkableHeight: AGENT.height, walkableRadius: AGENT.radius, walkableClimb: AGENT.climb,
    }));
    return tp.polys.length;
  }

  /** Rebuild the tiles a box touches, with every blocked box over them. */
  rebuildAround(bb) {
    const tw = BAKE.tileVoxels * BAKE.cs, pad = this.build.o.borderSize * BAKE.cs, b0 = this.build.bounds;
    const x0 = Math.max(0, Math.floor((bb[0] - pad - b0[0]) / tw)), x1 = Math.min(this.build.nx - 1, Math.floor((bb[3] + pad - b0[0]) / tw));
    const y0 = Math.max(0, Math.floor((bb[2] - pad - b0[2]) / tw)), y1 = Math.min(this.build.ny - 1, Math.floor((bb[5] + pad - b0[2]) / tw));
    const all = Object.values(this.st.blocked);
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) { nav.removeTile(this.mesh, tx, ty, 0); this.addTile(tx, ty, all); }
    this.st.version++; this.stats.rebuilds++;
  }

  /** Block a box ([minX, minY, minZ, maxX, maxY, maxZ]) under a key, or with null free it. */
  setBlocked(key, box) {
    const had = this.st.blocked[key];
    if (!box && !had) return;
    if (box && had && box.every((v, i) => v === had[i])) return;
    if (box) this.st.blocked[key] = box.slice(); else delete this.st.blocked[key];
    this.rebuildAround(box ?? had);
    if (box && had) this.rebuildAround(had);
  }

  /** An off-mesh link (a jump, a ladder) at run time: { start, end, radius?, bidirectional? } → its key. */
  addLink({ start, end, radius = 0.4, bidirectional = true }) {
    if (!this.mesh) this.bake();
    const id = nav.addOffMeshConnection(this.mesh, { start: v3(start), end: v3(end), radius, direction: bidirectional ? nav.OffMeshConnectionDirection.BIDIRECTIONAL : nav.OffMeshConnectionDirection.START_TO_END, flags: 1, area: 0 });
    const key = `link-${this.st.linkCounter++}`;
    this.st.links[key] = id; this.st.version++;
    return key;
  }
  removeLink(key) { const id = this.st.links[key]; if (id === undefined) return; nav.removeOffMeshConnection(this.mesh, id); delete this.st.links[key]; this.st.version++; }

  /** The nearest navmesh point to p (within 1.5 m across, 2 m up or down), or null. */
  closest(p) {
    if (!this.mesh) this.bake();
    nav.findNearestPoly(this.nearest, this.mesh, v3(p), HALF, nav.DEFAULT_QUERY_FILTER);
    return this.nearest.success ? v3(this.nearest.position) : null;
  }

  /** A path from a to b: { points, length, complete }, or null when there is none. */
  findPath(a, b) {
    if (!this.mesh) this.bake();
    const r = nav.findPath(this.mesh, v3(a), v3(b), HALF, nav.DEFAULT_QUERY_FILTER);
    if (!r.success || r.path.length < 1) return null;
    const points = r.path.map((p) => v3(p.position));
    let length = 0;
    for (let i = 1; i < points.length; i++) { const p = points[i], q = points[i - 1]; length += Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2])); }
    return { points, length, complete: !!(r.flags & nav.FindPathResultFlags.COMPLETE_PATH) };
  }

  // ---------------------------------------------------------------- the step

  characters() {
    if (this._chars?.version !== this.tree.structureVersion) this._chars = { version: this.tree.structureVersion, list: this.tree.all().filter((n) => n.type === 'Character' && n.ctrl) };
    return this._chars.list;
  }

  /** Where a character's goTo points: a node's position, or [x, y, z]. */
  goalOf(c) {
    const g = c.ctrl.goTo;
    if (!g) return null;
    if (Array.isArray(g)) return g;
    const t = this.tree.find(g);
    if (!t) return null;
    t.object3d.updateWorldMatrix(true, false);
    const e = t.object3d.matrixWorld.elements;
    return [e[12], e[13], e[14]];
  }

  physicsProcess() {
    if (!this.mesh) this.bake();
    const st = this.st, cr = this.crowd;
    // 1. obstacles: locked Items block their box
    for (const n of this.tree.all()) {
      if (n.type !== 'Item') continue;
      const locked = /** @type {any} */ (n).current === 'locked';
      if (locked && !st.blocked[`item:${n.id}`]) this.setBlocked(`item:${n.id}`, boxOf(n));
      else if (!locked && st.blocked[`item:${n.id}`]) this.setBlocked(`item:${n.id}`, null);
    }
    // 2–3. agents: one per character, synced to its body, sent where its goTo points
    for (const c of this.characters()) {
      const p = c.object3d.position, pos = [p.x, p.y, p.z];
      let id = st.agents[c.id];
      if (id === undefined || !cr.agents[id]) {
        id = crowd.addAgent(cr, this.mesh, pos.slice(), {
          radius: AGENT.radius, height: AGENT.height, maxAcceleration: AGENT.maxAccel, maxSpeed: c.props.walkSpeed ?? 1.4,
          collisionQueryRange: AGENT.radius * 12, pathOptimizationRange: AGENT.radius * 30, separationWeight: 2,
          updateFlags: crowd.CrowdUpdateFlags.ANTICIPATE_TURNS | crowd.CrowdUpdateFlags.OBSTACLE_AVOIDANCE | crowd.CrowdUpdateFlags.SEPARATION | crowd.CrowdUpdateFlags.OPTIMIZE_VIS | crowd.CrowdUpdateFlags.OPTIMIZE_TOPO,
          queryFilter: nav.DEFAULT_QUERY_FILTER,
        });
        st.agents[c.id] = id;
      }
      const a = cr.agents[id];
      const dx = a.position[0] - p.x, dz = a.position[2] - p.z;
      if (dx * dx + dz * dz > DRIFT * DRIFT) { this.teleport(id, pos); st.targets[c.id] = null; this.stats.teleports++; }
      else { a.position[0] = p.x; a.position[1] = p.y; a.position[2] = p.z; }
      a.maxSpeed = c.props.walkSpeed ?? 1.4;
      const goal = c.ctrl.seat || c.graph?.busy ? null : this.goalOf(c), had = st.targets[c.id];
      if (goal) {
        if (!had || Math.abs(had[0] - goal[0]) + Math.abs(had[2] - goal[2]) > RETARGET) {
          nav.findNearestPoly(this.nearest, this.mesh, goal, HALF, nav.DEFAULT_QUERY_FILTER);
          if (this.nearest.success) { crowd.requestMoveTarget(cr, id, this.nearest.nodeRef, v3(this.nearest.position)); st.targets[c.id] = goal.slice(); }
          else st.targets[c.id] = null;
        }
      } else if (had) { crowd.resetMoveTarget(cr, id); st.targets[c.id] = null; }
    }
    for (const [cid, id] of Object.entries(st.agents)) if (!this.tree.find(cid)) { crowd.removeAgent(cr, id); delete st.agents[cid]; delete st.targets[cid]; }
    // 4. the crowd
    crowd.update(cr, this.mesh, DT);
    // 5. drive: a character with a goal and a planned agent follows the agent's velocity
    for (const c of this.characters()) {
      const a = cr.agents[st.agents[c.id]];
      if (st.targets[c.id] && a && a.targetState !== crowd.AgentTargetState.FAILED && a.state !== crowd.AgentState.INVALID) {
        // at the navmesh point nearest the goal (a goal off the mesh is reached where the mesh ends): arrived
        // or stood still for half a second short of it (the path ends there: tables, a partial path): as close as it gets
        const tx = a.targetPosition[0] - a.position[0], tz = a.targetPosition[2] - a.position[2];
        const still = a.velocity[0] * a.velocity[0] + a.velocity[2] * a.velocity[2] < 0.0025;
        st.stalled[c.id] = still && a.targetState === crowd.AgentTargetState.VALID ? (st.stalled[c.id] ?? 0) + 1 : 0;
        if (a.targetState === crowd.AgentTargetState.VALID && (tx * tx + tz * tz < ARRIVE * ARRIVE || st.stalled[c.id] >= 30)) { c.ctrl.navMove = [0, 0]; c.ctrl.navArrived = true; }
        else { c.ctrl.navMove = [a.velocity[0], a.velocity[2]]; delete c.ctrl.navArrived; }
      } else { delete c.ctrl.navMove; delete c.ctrl.navArrived; st.stalled[c.id] = 0; }
    }
  }

  teleport(id, p) {
    const a = this.crowd.agents[id];
    nav.findNearestPoly(this.nearest, this.mesh, p, HALF, nav.DEFAULT_QUERY_FILTER);
    if (!this.nearest.success) { a.position[0] = p[0]; a.position[1] = p[1]; a.position[2] = p[2]; return; }
    const q = v3(this.nearest.position);
    a.position[0] = q[0]; a.position[1] = q[1]; a.position[2] = q[2];
    a.corridor.position = q.slice(); a.corridor.path = [this.nearest.nodeRef]; a.corridor.target = q.slice();
    a.targetState = crowd.AgentTargetState.NONE;
  }

  // ---------------------------------------------------------------- snapshot and hash

  /** The crowd always; the navmesh only when a door or a link changed it since the bake (a fresh bake is the same). */
  snapshot() {
    return { baked: !!this.mesh, version: this.st.version, st: cloneDeep(this.st), crowd: this.crowd ? cloneDeep(this.crowd, encode) : null, mesh: this.st.version > 0 ? cloneDeep(this.mesh, encode) : null };
  }
  restore(s) {
    if (!s.baked) { this.mesh = null; this.crowd = null; return; }
    if (!this.build || this.st.version !== 0 || !this.mesh) this.bake(); // back to the mesh as baked
    if (s.mesh) this.mesh = cloneDeep(s.mesh, decode);
    this.crowd = cloneDeep(s.crowd, decode);
    this.st = cloneDeep(s.st);
  }
  /** What the per-step hash reads: every agent's position, velocity, corridor and target, and the navmesh version. */
  stateVector() {
    if (!this.crowd) return [0];
    const out = [this.st.version, ...Object.values(this.st.blocked).flat()];
    for (const id of Object.keys(this.crowd.agents).sort()) {
      const a = this.crowd.agents[id];
      out.push(Number(id), ...a.position, ...a.velocity, ...a.desiredVelocity, a.targetState, a.state, ...a.targetPosition, ...a.corridor.path.map(Number), a.corridor.path.length);
    }
    return out;
  }

  /** Navmesh triangles for the debug draw. */
  debugTriangles() {
    if (!this.mesh) return null;
    const pos = [], idx = [];
    for (const prim of nav.createNavMeshHelper(this.mesh)) {
      if (prim.type !== nav.DebugPrimitiveType.Triangles) continue;
      const base = pos.length / 3;
      for (const v of prim.positions) pos.push(v);
      for (const k of prim.indices) idx.push(base + k);
    }
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
  }
}

/** An Item's box in world space, from its own collider-ish bounds: its object's extent (meshes), as a door's panel. */
function boxOf(n) {
  const o = n.object3d;
  o.updateWorldMatrix(true, true);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  o.traverse((x) => {
    const g = x.geometry;
    if (!g) return;
    g.boundingBox ?? g.computeBoundingBox();
    const b = g.boundingBox, e = x.matrixWorld.elements;
    for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
      const w = [e[0] * cx + e[4] * cy + e[8] * cz + e[12], e[1] * cx + e[5] * cy + e[9] * cz + e[13], e[2] * cx + e[6] * cy + e[10] * cz + e[14]];
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
    }
  });
  if (!Number.isFinite(min[0])) { const p = o.getWorldPosition(o.position.clone()); min = [p.x - 0.5, p.y, p.z - 0.5]; max = [p.x + 0.5, p.y + 2, p.z + 0.5]; }
  const r = (v) => Math.round(v * 1000) / 1000;
  return [...min.map(r), ...max.map(r)];
}
