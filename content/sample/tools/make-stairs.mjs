// Writes sets/stairs.glb (M3 W12, AB-T-0551): a flight of stairs outside the cafe, where the ragdoll falls (M3 W7): a
// landing 0.9 m up and four 18 cm steps down towards −x, with a low side wall and a handrail. Boxes with flat colours and
// KHR_physics colliders (@vrmxg/model's writer), as the cafe set. The model's origin is the landing's edge, on the
// ground, in the middle of the flight's width; apps/playground/src/stairs.js places it (STAIRS: edge 2.5, z 9.5).
//   node content/sample/tools/make-stairs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { writeGLB } from '@vrmxg/model';

const root = path.resolve(import.meta.dirname, '..');
const GEN = 'VRMXG sample content (content/sample/tools/make-stairs.mjs)';
const TOP = 0.9, RISE = 0.18, TREAD = 0.3, WIDTH = 2.4;
const C = { stone: '#b9b2a6', edge: '#8f887d', wall: '#d8cfc0', rail: '#4a4f55' };
const parts = [{ name: 'landing', size: [2, TOP, WIDTH], p: [1, TOP / 2, 0], color: C.stone, collider: true }];
for (let i = 0; i < 4; i++) {
  const h = TOP - RISE * (i + 1), x = -TREAD * (i + 0.5);
  parts.push({ name: `step-${i + 1}`, size: [TREAD, h, WIDTH], p: [x, h / 2, 0], color: C.stone, collider: true });
  parts.push({ name: `step-${i + 1}-nosing`, size: [TREAD, 0.02, WIDTH], p: [x, h + 0.01, 0], color: C.edge }); // a darker edge on each tread
}
// a low wall along the far side of the landing and the flight, and a handrail on the near side (posts and a bar)
parts.push({ name: 'side-wall', size: [3.2, TOP + 0.3, 0.12], p: [0.4, (TOP + 0.3) / 2, -WIDTH / 2 - 0.06], color: C.wall, collider: true });
for (const x of [-1.15, 0, 1.9]) parts.push({ name: `rail-post-${x}`, size: [0.05, 0.9, 0.05], p: [x, (x < 0 ? TOP + RISE * x / TREAD : TOP) + 0.45, WIDTH / 2 - 0.05], color: C.rail });
parts.push({ name: 'rail-landing', size: [1.9, 0.05, 0.05], p: [0.95, TOP + 0.9, WIDTH / 2 - 0.05], color: C.rail });
parts.push({ name: 'rail-flight', size: [1.5, 0.05, 0.05], p: [-0.575, TOP - 0.345 + 0.9, WIDTH / 2 - 0.05], q: [0, 0, Math.sin(Math.atan(RISE / TREAD) / 2), Math.cos(Math.atan(RISE / TREAD) / 2)], color: C.rail });
const out = path.join(root, 'sets/stairs.glb');
fs.writeFileSync(out, writeGLB({ name: 'stairs', generator: GEN, parts }));
console.log(`wrote sets/stairs.glb (${fs.statSync(out).size} bytes)`);
