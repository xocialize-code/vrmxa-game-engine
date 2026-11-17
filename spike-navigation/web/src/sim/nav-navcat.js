// Backend: navcat 0.4.1 (pure JavaScript Recast/Detour re-implementation by the author of
// recast-navigation-js). Tiled navmesh with a per-tile rebuild for the door, navcat/blocks crowd.
import * as N from 'navcat';
import { crowd as C, generateSoloNavMesh, chunkyTriMesh } from 'navcat/blocks';
import { AGENT, BAKE, voxels, DOOR_BLOCK } from './geometry.js';
import { cloneDeep } from './util.js';

const opts = (borderSize) => ({
  cellSize: BAKE.cs, cellHeight: BAKE.ch,
  walkableRadiusWorld: AGENT.radius, walkableRadiusVoxels: voxels.radius,
  walkableClimbWorld: AGENT.climb, walkableClimbVoxels: voxels.climb,
  walkableHeightWorld: AGENT.height, walkableHeightVoxels: voxels.height,
  walkableSlopeAngleDegrees: AGENT.slope,
  borderSize,
  minRegionArea: BAKE.minRegionArea, mergeRegionArea: BAKE.mergeRegionArea,
  maxSimplificationError: BAKE.maxSimplificationError, maxEdgeLength: BAKE.maxEdgeLen,
  maxVerticesPerPoly: BAKE.maxVertsPerPoly,
  detailSampleDistance: BAKE.cs * BAKE.detailSampleDist, detailSampleMaxError: BAKE.ch * BAKE.detailSampleMaxError,
});

/**
 * One tile, following navcat/blocks' buildNavMeshTile, plus a hook: `blockers` (world AABBs) are
 * marked NULL_AREA in the compact heightfield after erosion, the same thing Detour's tile cache
 * does with box obstacles. A rebuild re-rasterises the tile's triangles (no cached layers).
 */
function buildTileData(ctx, positions, ctm, tileBounds, o, tileSizeVoxels, blockers) {
  const b = o.borderSize * o.cellSize;
  const ex = [tileBounds[0] - b, tileBounds[1], tileBounds[2] - b, tileBounds[3] + b, tileBounds[4], tileBounds[5] + b];
  const chunks = chunkyTriMesh.getChunksOverlappingRect(ctm, [ex[0], ex[2]], [ex[3], ex[5]]);
  const size = tileSizeVoxels + o.borderSize * 2;
  const hf = N.createHeightfield(size, size, ex, o.cellSize, o.cellHeight);
  const areas = new Uint8Array(ctm.maxTrisPerChunk);
  for (const ci of chunks) {
    const node = ctm.nodes[ci];
    const tris = ctm.triangles.slice(node.index * 3, node.index * 3 + node.count * 3);
    areas.fill(0);
    N.markWalkableTriangles(positions, tris, areas.subarray(0, node.count), o.walkableSlopeAngleDegrees);
    N.rasterizeTriangles(ctx, hf, positions, tris, areas.subarray(0, node.count), o.walkableClimbVoxels);
  }
  N.filterLowHangingWalkableObstacles(hf, o.walkableClimbVoxels);
  N.filterLedgeSpans(hf, o.walkableHeightVoxels, o.walkableClimbVoxels);
  N.filterWalkableLowHeightSpans(hf, o.walkableHeightVoxels);
  const chf = N.buildCompactHeightfield(ctx, o.walkableHeightVoxels, o.walkableClimbVoxels, hf);
  N.erodeWalkableArea(o.walkableRadiusVoxels, chf);
  for (const bb of blockers) N.markBoxArea(bb, N.NULL_AREA, chf);
  N.buildDistanceField(chf);
  N.buildRegions(ctx, chf, o.borderSize, o.minRegionArea, o.mergeRegionArea);
  const cset = N.buildContours(ctx, chf, o.maxSimplificationError, o.maxEdgeLength, N.ContourBuildFlags.CONTOUR_TESS_WALL_EDGES);
  const pmesh = N.buildPolyMesh(ctx, cset, o.maxVerticesPerPoly);
  for (let i = 0; i < pmesh.nPolys; i++) {
    if (pmesh.areas[i] === N.WALKABLE_AREA) pmesh.areas[i] = 0;
    if (pmesh.areas[i] === 0) pmesh.flags[i] = 1;
  }
  const dmesh = N.buildPolyMeshDetail(ctx, pmesh, chf, o.detailSampleDistance, o.detailSampleMaxError);
  return { pmesh, dmesh };
}

const v3 = (p) => [p[0], p[1], p[2]];

export function createNavcatBackend() {
  let nav = null, crowd = null, tiled = null, doorBlocked = false;
  const agents = [];
  const HALF = [2, 4, 2];
  const filter = N.DEFAULT_QUERY_FILTER;
  const nearest = N.createFindNearestPolyResult();

  function addBuiltTile(tx, ty, blockers) {
    const { positions, ctm, bounds, o } = tiled;
    const tw = BAKE.tileVoxels * BAKE.cs;
    const tb = [bounds[0] + tx * tw, bounds[1], bounds[2] + ty * tw, bounds[0] + (tx + 1) * tw, bounds[4], bounds[2] + (ty + 1) * tw];
    const { pmesh, dmesh } = buildTileData(tiled.ctx, positions, ctm, tb, o, BAKE.tileVoxels, blockers);
    if (pmesh.vertices.length === 0) return 0;
    const tp = N.polyMeshToTilePolys(pmesh);
    const td = N.polyMeshDetailToTileDetailMesh(tp.polys, dmesh);
    N.addTile(nav, N.buildTile({
      bounds: pmesh.bounds, vertices: tp.vertices, polys: tp.polys,
      detailMeshes: td.detailMeshes, detailVertices: td.detailVertices, detailTriangles: td.detailTriangles,
      tileX: tx, tileY: ty, tileLayer: 0, cellSize: BAKE.cs, cellHeight: BAKE.ch,
      walkableHeight: AGENT.height, walkableRadius: AGENT.radius, walkableClimb: AGENT.climb,
    }));
    return tp.polys.length;
  }

  const doorAabb = () => [
    DOOR_BLOCK.center.x - DOOR_BLOCK.half.x, DOOR_BLOCK.center.y - DOOR_BLOCK.half.y, DOOR_BLOCK.center.z - DOOR_BLOCK.half.z,
    DOOR_BLOCK.center.x + DOOR_BLOCK.half.x, DOOR_BLOCK.center.y + DOOR_BLOCK.half.y, DOOR_BLOCK.center.z + DOOR_BLOCK.half.z,
  ];

  const be = {
    name: 'navcat',
    version: '0.4.1',
    async init() { return 0; }, // nothing to load

    bakeSolo(input) {
      const t0 = performance.now();
      const r = generateSoloNavMesh(input, opts(0));
      const ms = performance.now() - t0;
      let polys = 0, tiles = 0;
      for (const id in r.navMesh.tiles) { tiles++; polys += r.navMesh.tiles[id].polys.length; }
      return { ms, polys, tiles };
    },

    /** Tiled bake (4.8 m tiles, border = radius + 3 voxels), the navmesh everything else runs on. */
    bake(input, { links = [] } = {}) {
      const t0 = performance.now();
      const o = opts(voxels.radius + 3);
      const bounds = N.calculateMeshBounds([0, 0, 0, 0, 0, 0], input.positions, input.indices);
      const grid = N.calculateGridSize([0, 0], bounds, BAKE.cs);
      nav = N.createNavMesh();
      nav.tileWidth = nav.tileHeight = BAKE.tileVoxels * BAKE.cs;
      nav.origin = [bounds[0], bounds[1], bounds[2]];
      tiled = { positions: input.positions, ctm: chunkyTriMesh.create(input.positions, input.indices), bounds, o, ctx: N.BuildContext.create() };
      const nx = Math.floor((grid[0] + BAKE.tileVoxels - 1) / BAKE.tileVoxels);
      const ny = Math.floor((grid[1] + BAKE.tileVoxels - 1) / BAKE.tileVoxels);
      let polys = 0, tiles = 0;
      for (let tx = 0; tx < nx; tx++) for (let ty = 0; ty < ny; ty++) {
        const n = addBuiltTile(tx, ty, []);
        if (n) { polys += n; tiles++; }
      }
      doorBlocked = false;
      for (const l of links) be.addLink(l);
      return { ms: performance.now() - t0, polys, tiles };
    },

    closestPoint(p) {
      N.findNearestPoly(nearest, nav, p, HALF, filter);
      return nearest.success ? v3(nearest.position) : null;
    },

    pathLength(a, b) {
      const r = N.findPath(nav, a, b, HALF, filter);
      if (!r.success || !(r.flags & N.FindPathResultFlags.COMPLETE_PATH) || r.path.length < 2) return null;
      let len = 0;
      for (let i = 1; i < r.path.length; i++) {
        const p = r.path[i].position, q = r.path[i - 1].position;
        const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
        len += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      return len;
    },

    crowdCreate() {
      crowd = C.create(AGENT.radius);
      agents.length = 0;
    },

    addAgent(p) {
      const id = C.addAgent(crowd, nav, v3(p), {
        radius: AGENT.radius, height: AGENT.height,
        maxAcceleration: AGENT.maxAccel, maxSpeed: AGENT.maxSpeed,
        collisionQueryRange: AGENT.radius * 12, pathOptimizationRange: AGENT.radius * 30,
        separationWeight: 2,
        updateFlags: C.CrowdUpdateFlags.ANTICIPATE_TURNS | C.CrowdUpdateFlags.OBSTACLE_AVOIDANCE | C.CrowdUpdateFlags.SEPARATION
          | C.CrowdUpdateFlags.OPTIMIZE_VIS | C.CrowdUpdateFlags.OPTIMIZE_TOPO,
        queryFilter: filter,
      });
      agents.push(id);
      return agents.length - 1;
    },

    setTarget(i, p) {
      N.findNearestPoly(nearest, nav, p, HALF, filter);
      if (!nearest.success) return false;
      return C.requestMoveTarget(crowd, agents[i], nearest.nodeRef, v3(nearest.position));
    },
    step(dt) { C.update(crowd, nav, dt); },
    getPosition(i, out) { const p = crowd.agents[agents[i]].position; out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; },
    getVelocity(i, out) { const p = crowd.agents[agents[i]].velocity; out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; },
    /** Same contract as the recast backend: the agent integrates from here; the corridor follows. */
    syncPosition(i, p) { const a = crowd.agents[agents[i]].position; a[0] = p[0]; a[1] = p[1]; a[2] = p[2]; },
    teleport(i, p) {
      const a = crowd.agents[agents[i]];
      N.findNearestPoly(nearest, nav, p, HALF, filter);
      if (!nearest.success) return;
      a.position[0] = nearest.position[0]; a.position[1] = nearest.position[1]; a.position[2] = nearest.position[2];
      // corridor reset: the same thing dtCrowd::teleport does
      a.corridor.position = v3(nearest.position);
      a.corridor.path = [nearest.nodeRef];
      a.corridor.target = v3(nearest.position);
      a.targetState = C.AgentTargetState.NONE;
    },

    /** Door: rebuild the tile(s) the door box touches with (or without) the blocker. */
    setDoor(blocked) {
      const t0 = performance.now();
      if (blocked === doorBlocked) return { ms: 0, updates: 0 };
      doorBlocked = blocked;
      const bb = doorAabb();
      const tw = BAKE.tileVoxels * BAKE.cs;
      // Tiles whose bounds, grown by the border, overlap the door box.
      const pad = tiled.o.borderSize * BAKE.cs;
      const x0 = Math.floor((bb[0] - pad - tiled.bounds[0]) / tw), x1 = Math.floor((bb[3] + pad - tiled.bounds[0]) / tw);
      const y0 = Math.floor((bb[2] - pad - tiled.bounds[2]) / tw), y1 = Math.floor((bb[5] + pad - tiled.bounds[2]) / tw);
      let updates = 0;
      for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
        N.removeTile(nav, tx, ty, 0);
        addBuiltTile(tx, ty, blocked ? [bb] : []);
        updates++;
      }
      return { ms: performance.now() - t0, updates };
    },

    /** Navmesh triangles for the debug draw, from navcat's own debug helper. */
    debugTriangles() {
      const pos = [], idx = [];
      for (const prim of N.createNavMeshHelper(nav)) {
        if (prim.type !== N.DebugPrimitiveType.Triangles) continue;
        const base = pos.length / 3;
        pos.push(...prim.positions);
        for (const k of prim.indices) idx.push(base + k);
      }
      return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
    },

    /** Run-time off-mesh link: global to the navmesh, survives tile rebuilds, removable. */
    addLink(l) {
      return N.addOffMeshConnection(nav, {
        start: v3(l.start), end: v3(l.end), radius: l.radius,
        direction: l.bidirectional ? N.OffMeshConnectionDirection.BIDIRECTIONAL : N.OffMeshConnectionDirection.START_TO_END,
        flags: 1, area: 0,
      });
    },
    removeLink(id) { N.removeOffMeshConnection(nav, id); },

    /** Snapshot of the navmesh (door tiles included) and the whole crowd: plain JS, deep-copied. */
    snapshot() { return cloneDeep({ nav, crowd, agents: [...agents], doorBlocked }); },
    restore(snap) {
      const s = cloneDeep(snap);
      nav = s.nav; crowd = s.crowd; doorBlocked = s.doorBlocked;
      agents.length = 0; agents.push(...s.agents);
    },

    raw() { return { navMesh: nav, crowd }; },
    destroy() { nav = null; crowd = null; agents.length = 0; },
  };
  return be;
}
