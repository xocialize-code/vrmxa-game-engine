#!/usr/bin/env node
// Minified + gzipped size of what each candidate costs a production bundle, measured with the same
// Vite as the app. Each entry imports what the engine would use; three is external (we ship it anyway).
//   node scripts/bundle-sizes.mjs [--out results/bundle-sizes.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { build } from 'vite';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const entries = {
  'recast-navigation (core + generators: bake, tile cache, crowd, queries)': `
    import { init, Crowd, NavMeshQuery, getNavMeshPositionsAndIndices } from '@recast-navigation/core';
    import { generateSoloNavMesh, generateTileCache } from '@recast-navigation/generators';
    export { init, Crowd, NavMeshQuery, getNavMeshPositionsAndIndices, generateSoloNavMesh, generateTileCache };`,
  '@recast-navigation/three helpers (on top)': `
    export { NavMeshHelper, CrowdHelper } from '@recast-navigation/three';`,
  'navcat (bake solo + tiled, crowd, queries, off-mesh)': `
    export * as N from 'navcat';
    export { crowd, generateSoloNavMesh, generateTiledNavMesh, chunkyTriMesh } from 'navcat/blocks';`,
  'navcat (tree-shaken: what this spike imports)': `
    import { findPath, findNearestPoly, createFindNearestPolyResult, DEFAULT_QUERY_FILTER, addTile, removeTile, buildTile, createNavMesh, markBoxArea, addOffMeshConnection } from 'navcat';
    import { crowd, generateSoloNavMesh, generateTiledNavMesh } from 'navcat/blocks';
    export { findPath, findNearestPoly, createFindNearestPolyResult, DEFAULT_QUERY_FILTER, addTile, removeTile, buildTile, createNavMesh, markBoxArea, addOffMeshConnection, crowd, generateSoloNavMesh, generateTiledNavMesh };`,
  'navcat/three helpers (on top)': `
    export { createNavMeshHelper } from 'navcat/three';`,
  'three-pathfinding (queries only, no baking)': `
    export { Pathfinding, PathfindingHelper } from 'three-pathfinding';`,
  'yuka (whole library: navmesh queries, steering, no baking)': `
    export * from 'yuka';`,
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-sizes-'));
const out = {};
for (const [label, code] of Object.entries(entries)) {
  const entry = path.join(web, `.size-entry-${Object.keys(out).length}.js`);
  fs.writeFileSync(entry, code);
  try {
    const res = await build({
      configFile: false, root: web, logLevel: 'silent',
      build: {
        write: false, minify: true, target: 'safari16',
        lib: { entry, formats: ['es'], fileName: 'x' },
        rollupOptions: { external: (id) => id === 'three' || id.startsWith('three/') },
      },
    });
    const chunks = (Array.isArray(res) ? res : [res]).flatMap((r) => r.output).filter((o) => o.type === 'chunk' || o.type === 'asset');
    const bytes = chunks.reduce((a, c) => a + Buffer.byteLength(c.code ?? c.source), 0);
    const gz = chunks.reduce((a, c) => a + zlib.gzipSync(c.code ?? c.source, { level: 9 }).length, 0);
    out[label] = { minKB: +(bytes / 1024).toFixed(1), gzipKB: +(gz / 1024).toFixed(1) };
  } finally {
    fs.rmSync(entry);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.table(out);
const i = process.argv.indexOf('--out');
if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2));
