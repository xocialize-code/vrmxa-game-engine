// Ten NPCs in the cafe (M2 W7 receipt; M2 exit 6 asks for ten within the step budget): Hana serving, Mira as a customer,
// and eight more Hanas wandering, each on a brain, all on the navmesh. Times the whole step, and the brains' and the nav
// service's share, over 20 s after a 1 s warm-up, in Node. Run: node engine/packages/ai/tools/npc-bench.mjs
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const sample = await loadSample(bytes);
const hana = sample.doc.nodes.find((n) => n.id === 'hana-1');
const spots = [[-3, 0, -1.4], [-2, 0, 3], [1.5, 0, 2.5], [3, 0, -1], [-4.5, 0, 1.5], [2.5, 0, 4], [0, 0, 2], [-1.2, 0, 4]];
sample.doc = { ...sample.doc, nodes: [
  ...sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [{ use: 'brain', preset: 'server' }] } : n.id === 'mira' ? { ...n, behaviours: [{ use: 'brain', preset: 'customer' }] } : n)),
  ...spots.map((p, i) => ({ ...hana, id: `npc-${i}`, name: `Wanderer ${i}`, transform: { p }, behaviours: [{ use: 'brain', preset: 'wanderer' }] })),
] };
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const W = await buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
const tree = W.tree, now = () => performance.now();
// time the brains (behaviour) and the nav service by wrapping their step methods
const t = { brains: 0, nav: 0 };
const navStep = W.nav.physicsProcess.bind(W.nav);
W.nav.physicsProcess = () => { const a = now(); navStep(); t.nav += now() - a; };
const brains = tree.all().flatMap((n) => n.behaviours.filter((b) => b.name === 'brain'));
for (const b of brains) { const f = b.physicsProcess.bind(b); b.physicsProcess = (dt) => { const a = now(); f(dt); t.brains += now() - a; }; }
for (let i = 0; i < 60; i++) tree.step();
t.brains = 0; t.nav = 0;
const N = 1200, steps = [];
for (let i = 0; i < N; i++) { const a = now(); tree.step(); steps.push(now() - a); }
steps.sort((a, b) => a - b);
const npcs = tree.all().filter((n) => n.type === 'Character').length;
const moved = spots.map((p, i) => { const q = tree.find(`npc-${i}`).object3d.position; return Math.hypot(q.x - p[0], q.z - p[2]); });
const out = {
  scene: 'cafe: Hana (server), Mira (customer), 8 wandering Hanas; stub textures', node: process.version, characters: npcs, brains: brains.length, steps: N,
  stepMs: { mean: +(steps.reduce((a, b) => a + b, 0) / N).toFixed(3), p95: +steps[Math.floor(N * 0.95)].toFixed(3), max: +steps.at(-1).toFixed(3) },
  brainsMsPerStep: +(t.brains / N).toFixed(3), navMsPerStep: +(t.nav / N).toFixed(3),
  navBakeMs: +W.nav.stats.bakeMs.toFixed(1), wanderersMoved: moved.filter((d) => d > 0.3).length,
};
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(import.meta.dirname, '../results/npcs.json'), JSON.stringify(out, null, 2) + '\n');
