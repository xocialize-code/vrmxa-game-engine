// Step cost of @vrmxg/physics against raw Rapier on the physics spike's "boxes only" scene
// (300 dynamic boxes at density 200, the walls, stairs, ramp and bounds, the trimesh ground), the
// way AB-R-0923 timed it: 600 steps from step 0, after a 120-step warm-up. Raw and engine runs
// alternate four times. Sets window.__result / window.READY for the
// WKWebView harness, or prints when run in Node (node bench/main.js).
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics, ColliderNode } from '@vrmxg/physics';
import { groundMesh, fixedBoxes, dynamicBoxes } from './level.js';

installPortableMath();
const R = await loadRapier();
const STEPS = 600, WARM = 120;
const now = () => performance.now(); // timing only: never feeds the simulation
const q = (r) => [r.x, r.y, r.z, r.w];

function rawScene() {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const g = groundMesh();
  world.createCollider(R.ColliderDesc.trimesh(g.vertices, g.indices), world.createRigidBody(R.RigidBodyDesc.fixed()));
  for (const b of fixedBoxes()) world.createCollider(R.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z), world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(b.pos.x, b.pos.y, b.pos.z).setRotation(b.rot)));
  for (const b of dynamicBoxes(300)) world.createCollider(R.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setDensity(200), world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(b.pos.x, b.pos.y, b.pos.z)));
  return { step: () => world.step(), free: () => world.free() };
}

class Ground extends ColliderNode { constructor(d, def) { super(d, def); this.meshData = groundMesh(); } }

function engineScene() {
  const nodes = [{ id: 'ground', type: 'Ground', props: { shape: 'trimesh' } }];
  fixedBoxes().forEach((b, i) => nodes.push({ id: `fixed-${i}`, type: 'Collider', transform: { p: [b.pos.x, b.pos.y, b.pos.z], q: q(b.rot) }, props: { shape: 'box', size: [2 * b.half.x, 2 * b.half.y, 2 * b.half.z] } }));
  dynamicBoxes(300).forEach((b, i) => {
    const size = [2 * b.half.x, 2 * b.half.y, 2 * b.half.z];
    nodes.push({ id: `box-${i}`, type: 'RigidBody', transform: { p: [b.pos.x, b.pos.y, b.pos.z] }, props: { mass: 200 * size[0] * size[1] * size[2], angularDamping: 0 } });
    nodes.push({ id: `box-${i}-shape`, type: 'Collider', parent: `box-${i}`, props: { shape: 'box', size } });
  });
  const tree = new SceneTree({ registry: m0Registry() });
  tree.classes.set('Ground', Ground);
  installPhysics(tree, R);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'bench', nodes });
  return { step: () => tree.step(), free: () => tree.services.get('physics').world.free() };
}

function time(make) {
  const w = make(); for (let i = 0; i < WARM; i++) w.step(); w.free();
  const s = make(), samples = [];
  for (let i = 0; i < STEPS; i++) { const t0 = now(); s.step(); samples.push(now() - t0); }
  s.free();
  samples.sort((a, b) => a - b);
  return { mean: +(samples.reduce((a, b) => a + b, 0) / STEPS).toFixed(4), p50: +samples[STEPS >> 1].toFixed(4), p95: +samples[Math.floor(STEPS * 0.95)].toFixed(4) };
}

// Four alternating passes; the first is a warm-up, the means of the other three are averaged (run-to-run
// noise on this machine is about ±10%, as large as the effect being measured).
const passes = [];
for (let k = 0; k < 4; k++) passes.push({ raw: time(rawScene), engine: time(engineScene) });
const avg = (key, f) => +(passes.slice(1).reduce((a, p) => a + p[key][f], 0) / 3).toFixed(4);
const raw = { mean: avg('raw', 'mean'), p50: avg('raw', 'p50'), p95: avg('raw', 'p95') };
const engine = { mean: avg('engine', 'mean'), p50: avg('engine', 'p50'), p95: avg('engine', 'p95') };
const result = {
  rapier: R.version(), passes, raw, engine,
  overheadPct: +((engine.mean / raw.mean - 1) * 100).toFixed(1),
  overheadMs: +(engine.mean - raw.mean).toFixed(4),
  ua: typeof navigator !== 'undefined' ? navigator.userAgent : `node ${process.version}`,
  isolated: typeof self !== 'undefined' ? self.crossOriginIsolated : null,
};
if (typeof window !== 'undefined') { window.__result = result; window.__errors = []; window.READY = true; document.getElementById('out').textContent = JSON.stringify(result, null, 1); }
else console.log(JSON.stringify(result, null, 1));
