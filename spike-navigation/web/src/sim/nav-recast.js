// Backend: recast-navigation-js 0.44 (Recast + Detour compiled to WASM, single-threaded, WASM
// inlined in the -compat build). Tile cache for the door, dtCrowd for the agents.
import * as RN from '@recast-navigation/core';
import { generateSoloNavMesh, generateTileCache } from '@recast-navigation/generators';
import { AGENT, BAKE, voxels, DOOR_BLOCK } from './geometry.js';

let initMs = null;

const recastCfg = (extra = {}) => ({
  cs: BAKE.cs, ch: BAKE.ch,
  walkableSlopeAngle: AGENT.slope,
  walkableHeight: voxels.height, walkableClimb: voxels.climb, walkableRadius: voxels.radius,
  maxEdgeLen: BAKE.maxEdgeLen, maxSimplificationError: BAKE.maxSimplificationError,
  minRegionArea: BAKE.minRegionArea, mergeRegionArea: BAKE.mergeRegionArea, maxVertsPerPoly: BAKE.maxVertsPerPoly,
  detailSampleDist: BAKE.detailSampleDist, detailSampleMaxError: BAKE.detailSampleMaxError,
  ...extra,
});

const v = (p) => ({ x: p[0], y: p[1], z: p[2] });

export function createRecastBackend() {
  let navMesh = null, tileCache = null, query = null, crowd = null, door = null;
  const agents = [];
  const HALF = { x: 2, y: 4, z: 2 };

  const be = {
    name: 'recast-navigation',
    version: '0.44.0',

    async init() {
      if (initMs === null) {
        const t0 = performance.now();
        await RN.init();
        initMs = performance.now() - t0;
      }
      RN.setRandomSeed(1); // Detour's random-point queries use this; we pick targets ourselves anyway
      return initMs;
    },

    /** Solo bake (one tile, static). Returns ms; the result is thrown away. */
    bakeSolo(input) {
      const t0 = performance.now();
      const r = generateSoloNavMesh(input.positions, input.indices, recastCfg());
      const ms = performance.now() - t0;
      if (!r.success) throw new Error(`recast solo bake failed: ${r.error}`);
      const polys = countPolys(r.navMesh);
      r.navMesh.destroy();
      return { ms, polys, tiles: 1 };
    },

    /**
     * Tile-cache bake: the navmesh everything else runs on (doors are tile-cache obstacles).
     * Off-mesh links can't be added to a built tile-cache navmesh; they go in through the mesh
     * process, which runs for every tile (re)build, so they are fixed at bake time.
     */
    bake(input, { links = [] } = {}) {
      be.destroy();
      const t0 = performance.now();
      const tileCacheMeshProcess = new RN.TileCacheMeshProcess((params, areas, flags) => {
        for (let i = 0; i < params.polyCount(); ++i) { areas.set(i, 0); flags.set(i, 1); }
        if (links.length) params.setOffMeshConnections(links.map((l) => ({ startPosition: v(l.start), endPosition: v(l.end), radius: l.radius, bidirectional: l.bidirectional, area: 0, flags: 1 })));
      });
      const r = generateTileCache(input.positions, input.indices, recastCfg({ tileSize: BAKE.tileVoxels, expectedLayersPerTile: 4, maxObstacles: 64, tileCacheMeshProcess }));
      const ms = performance.now() - t0;
      if (!r.success) throw new Error(`recast tile cache bake failed: ${r.error}`);
      navMesh = r.navMesh; tileCache = r.tileCache;
      query = new RN.NavMeshQuery(navMesh);
      return { ms, polys: countPolys(navMesh), tiles: countTiles(navMesh) };
    },

    closestPoint(p) {
      const r = query.findClosestPoint(v(p), { halfExtents: HALF });
      if (!r.success || !r.polyRef) return null;
      return [r.point.x, r.point.y, r.point.z];
    },

    /** Straight-path length a→b, or null when there is no complete path. */
    pathLength(a, b) {
      const r = query.computePath(v(a), v(b), { halfExtents: HALF, maxPathPolys: 1024 });
      if (!r.success || r.path.length < 2) return null;
      const end = r.path[r.path.length - 1];
      if (Math.abs(end.x - b[0]) > 0.3 || Math.abs(end.z - b[2]) > 0.3) return null; // partial path
      let len = 0;
      for (let i = 1; i < r.path.length; i++) {
        const dx = r.path[i].x - r.path[i - 1].x, dy = r.path[i].y - r.path[i - 1].y, dz = r.path[i].z - r.path[i - 1].z;
        len += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      return len;
    },

    crowdCreate(maxAgents) {
      crowd?.destroy();
      agents.length = 0;
      crowd = new RN.Crowd(navMesh, { maxAgents, maxAgentRadius: AGENT.radius });
    },

    addAgent(p) {
      const a = crowd.addAgent(v(p), {
        radius: AGENT.radius, height: AGENT.height,
        maxAcceleration: AGENT.maxAccel, maxSpeed: AGENT.maxSpeed,
        collisionQueryRange: AGENT.radius * 12, pathOptimizationRange: AGENT.radius * 30,
        separationWeight: 2,
        updateFlags: 1 | 2 | 4 | 8 | 16, // anticipate turns, obstacle avoidance, separation, optimise vis + topo
        obstacleAvoidanceType: 0,
      });
      agents.push(a);
      return agents.length - 1;
    },

    setTarget(i, p) { return agents[i].requestMoveTarget(v(p)); },
    step(dt) { crowd.update(dt); },

    getPosition(i, out) { const q = agents[i].position(); out[0] = q.x; out[1] = q.y; out[2] = q.z; return out; },
    getVelocity(i, out) { const q = agents[i].velocity(); out[0] = q.x; out[1] = q.y; out[2] = q.z; return out; },

    /**
     * Writes the physics body's position into the agent (dtCrowdAgent::npos) without resetting its
     * path corridor. dtCrowd::update integrates from npos and then moves the corridor along the
     * navmesh surface to it, so the agent follows the body like Unity's updatePosition = false.
     */
    syncPosition(i, p) {
      const raw = agents[i].raw;
      raw.set_npos(0, p[0]); raw.set_npos(1, p[1]); raw.set_npos(2, p[2]);
    },

    /** Hard reset, for drift beyond the threshold: teleport, then the caller re-requests the target. */
    teleport(i, p) { agents[i].teleport(v(p)); },

    /** Door: add/remove a tile-cache box obstacle, then update until the cache is up to date. */
    setDoor(blocked) {
      const t0 = performance.now();
      if (blocked && !door) {
        const r = tileCache.addBoxObstacle(DOOR_BLOCK.center, DOOR_BLOCK.half, 0);
        if (!r.success) throw new Error(`addBoxObstacle failed: ${r.status}`);
        door = r.obstacle;
      } else if (!blocked && door) {
        tileCache.removeObstacle(door);
        door = null;
      }
      let updates = 0, upToDate = false;
      while (!upToDate && updates < 16) { upToDate = tileCache.update(navMesh).upToDate; updates++; }
      return { ms: performance.now() - t0, updates };
    },

    /** Navmesh triangles for the debug draw. */
    debugTriangles() {
      const [positions, indices] = RN.getNavMeshPositionsAndIndices(navMesh);
      return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
    },

    /** Run-time link: not supported on a tile-cache navmesh (re-bake with `links` instead). */
    addLink: null,

    raw() { return { navMesh, tileCache, query, crowd }; },

    destroy() {
      crowd?.destroy(); crowd = null; agents.length = 0;
      query?.destroy(); query = null;
      tileCache?.destroy(); tileCache = null;
      navMesh?.destroy(); navMesh = null;
      door = null;
    },
  };
  return be;
}

function countTiles(nm) {
  let n = 0;
  for (let i = 0; i < nm.getMaxTiles(); i++) { const t = nm.getTile(i); if (t.header()) n++; }
  return n;
}
function countPolys(nm) {
  let n = 0;
  for (let i = 0; i < nm.getMaxTiles(); i++) { const t = nm.getTile(i); const h = t.header(); if (h) n += h.polyCount(); }
  return n;
}
