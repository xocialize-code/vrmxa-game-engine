// Scrub latency (M2 W1 receipt): the morning sequence stretched to 60 s, scrubbed in Node with the real characters.
// Cold seeks (no snapshots yet: a straight play to the frame) to 30 s and 60 s, then random seeks over the minute with a
// snapshot every 2 s, and what the snapshots cost. Run: node tools/scrub-bench.mjs [snapshot every N steps]; writes results/scrub.json.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { SequencePlayer } from '@vrmxg/sequence';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const sample = await loadSample(bytes, 'sequences/morning.vrmxs');
sample.doc.sequence = { ...sample.doc.sequence, duration: 1440 };
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const opts = { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true };
const R = await loadRapier();
const every = Number(process.argv[2] ?? 120);

const cold = {};
for (const f of [720, 1440]) {
  const W = await buildWorld(R, sample, opts);
  const p = new SequencePlayer(W.tree, { every: 1e9 });
  const t = performance.now(); await p.seek(f); cold[`${f / 24}s`] = +(performance.now() - t).toFixed(1);
}

const W = await buildWorld(R, sample, opts);
const player = new SequencePlayer(W.tree, { every });
let t = performance.now(); await player.seek(1440); const fill = performance.now() - t;
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const lat = [];
for (let i = 0; i < 60; i++) { const f = Math.floor(rnd() * 1440); t = performance.now(); await player.seek(f); lat.push(performance.now() - t); }
lat.sort((a, b) => a - b);
const near = []; // a scrub drag: one frame on from where the world is
for (let i = 0; i < 24; i++) { t = performance.now(); await player.seek(600 + i); near.push(performance.now() - t); }
const snapBytes = [...player.snaps.values()].map((s) => v8.serialize(s).length);
const out = {
  scene: 'sequences/morning.vrmxs stretched to 1440 frames (60 s at 24 fps), cafe with Mira and Hana, stub textures',
  node: process.version, snapshotEverySteps: every,
  coldSeekMs: cold, fillTo60sMs: +fill.toFixed(1), msPerStep: +(fill / 3600).toFixed(3),
  randomSeekMs: { n: lat.length, median: +lat[30].toFixed(1), p90: +lat[54].toFixed(1), max: +lat.at(-1).toFixed(1) },
  nextFrameSeekMs: { median: +near.sort((a, b) => a - b)[12].toFixed(2), max: +near.at(-1).toFixed(2) },
  snapshots: { count: snapBytes.length, meanBytes: Math.round(snapBytes.reduce((a, b) => a + b, 0) / snapBytes.length), totalMB: +(snapBytes.reduce((a, b) => a + b, 0) / 1048576).toFixed(1) },
};
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(import.meta.dirname, `../results/scrub${every === 120 ? '' : `-${every}`}.json`), JSON.stringify(out, null, 2) + '\n');
