// What can roll back (AB-T-0622). In each world, a reference run steps unbroken and hashes every component after every
// step, Rapier's whole serialisation included (`physics:bytes`). A second run of the same world, in one process and one
// tree, keeps a snapshot of every step in a ring and, every `every` steps, restores the one from `depth` steps ago *into
// the same live tree* and re-simulates back to where it was. Every re-simulated step is compared with the reference;
// the first that differs is reported with the components that differ there.
//
// Most worlds re-simulate with the same inputs they ran forward (a round trip). cafe-2p also runs corrupted: its forward
// pass feeds a wrong input for player 2 (jump flipped, move_x mirrored), as a mispredicted remote input would, and every
// rollback re-simulates with the true inputs, re-taking the snapshots it passes. Only the re-simulated steps (and the
// state after the last rollback) are compared there: the forward pass is wrong on purpose.
//
//   node rollback.mjs [--worlds cafe-2p,cafe-items,cafe-follow-inject,rush-level] [--every 4] [--depth 8]
//                     [--out results/rollback.json]
//
// Worlds:
//   cafe-2p              the two-player cafe (Mira and Hana, both players), seeded bots on both: physics, characters,
//                        cameras, input
//   cafe-items           the cafe's recorded take with items (content/sample/input/play-items.json, 1668 steps): Mira
//                        takes the sword into her closet, opens the cupboard, sits, switches the lights; Hana greets her
//                        with a voiced line
//   cafe-follow-inject   cafe-follow (Hana's follower brain), Mira walking in (input/walk-in.json), with director-style
//                        `ai.inject` events (lookAt, say, emote) landing inside rollback windows; run twice: restoring
//                        the snapshot alone, and re-queueing the injected events past the restored step
//   rush-level           the sample game ("The Morning Rush") through @vrmxg/game's GameFlow, played by M5's scripted
//                        player (acceptance/m5/rush-player.js): rollbacks inside the level (three regulars' brains,
//                        dialogue choices, the game service); a window that would cross a scene change is skipped and
//                        counted, since a scene change frees the world a snapshot was taken in
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier, RAPIER_BUILD } from '@vrmxg/physics';
import { worldHashes, compareRuns, hashValue } from '@vrmxg/snapshot';
import { captureWorld, restoreWorld, SHIM } from './lib/snap.mjs';
import { loadSample, buildWorld } from '../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../content/sample/behaviours.js';
import { twoPlayerWorld, freeWorld, HAS_MODELS } from './lib/world.mjs';
import { makeBot, frameOf } from './lib/inputs.mjs';
import { stats } from './lib/stats.mjs';

installPortableMath();
const here = import.meta.dirname, root = path.join(here, '..'), content = path.join(root, 'content/sample');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const EVERY = +opt('every', 4), DEPTH = +opt('depth', 8);
const WORLDS = opt('worlds', 'cafe-2p,cafe-items,cafe-follow-inject,rush-level').split(',');
const OUT = path.resolve(here, opt('out', 'results/rollback.json'));
if (!HAS_MODELS) { console.error('needs vrmxa-avatar-studio beside the repository (the characters)'); process.exit(1); }

const now = () => performance.now();
const hashes = (tree) => worldHashes(tree, { physicsBytes: true });
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
let R = null, core = null, closet = null;
async function cafeWorld(scene) {
  R ??= await loadRapier(); core ??= await vrmxaCore(); closet ??= await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  return buildWorld(R, await loadSample(bytes, scene), { vrmxaCore: core, closet, behaviours, stubTextures: true });
}

/** A snapshot's bytes (v8.serialize) by part: core, each service, the nodes with their own state. */
function parts(snap) {
  const size = (x) => v8.serialize(x).length, out = { total: size(snap), core: size(snap.core), nodes: size(snap.nodes) };
  for (const [k, v] of Object.entries(snap.services)) out[`service:${k}`] = size(v);
  if (snap.services.physics) out['physics:rapierBytes'] = snap.services.physics.data.bytes.length;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/** A restore that threw (before it changed anything: SceneTree.setState checks first): counted, the run goes on. */
function refused(out, from, at, e) {
  out.refused++;
  const msg = String(e.message).replace(/\s+/g, ' ');
  if (out.refusals.length < 8 && !out.refusals.some((r) => r.message === msg)) out.refusals.push({ from, at, message: msg });
}

/** Step once, waiting out a held step (a closet redraw); returns how many times it was held. */
async function step(tree) { let held = 0; while (!tree.step()) { held++; await tree.settle(); } return held; }

/**
 * A world's sweep. `make()` → { tree, feed(step), after?(tree), requeue?(tree, fromStep, liveLog), close() }.
 * feed(s) writes the input for step s (before it runs); the same function feeds the reference and the sweep.
 */
async function sweep(name, make, steps, { requeue = false, corrupt = false } = {}) {
  console.log(`${name}: reference run, ${steps} steps`);
  const A = await make(), ref = [];
  for (let s = 0; s < steps; s++) { A.feed(s, A.tree); await step(A.tree); ref.push({ step: A.tree.clock.step, h: hashes(A.tree) }); }
  A.close();
  console.log(`${name}: rollback sweep (every ${EVERY}, depth ${DEPTH}${requeue ? ', events re-queued' : ''}${corrupt ? ', forward inputs corrupted' : ''})`);
  const B = await make(), ring = new Map();
  const out = { world: name, steps, every: EVERY, depth: DEPTH, requeue, corrupt, shim: SHIM, forwardOff: 0, held: 0, rollbacks: 0, resimSteps: 0, skipped: 0, refused: 0, refusals: [], heldInResim: 0, firstDivergence: null, divergences: 0, captureMs: [], restoreMs: [], resimStepMs: [], stepMs: [], snapshotBytes: [], rapierBytes: [] };
  for (let s = 0; s < steps; s++) {
    // the state at clock s, before step s runs
    let t = now(); const snap = captureWorld(B.tree); out.captureMs.push(now() - t);
    ring.set(s, snap); ring.delete(s - DEPTH - 1);
    if (s % 60 === 0) { out.snapshotBytes.push(v8.serialize(snap).length); out.rapierBytes.push(snap.services.physics?.data?.bytes?.length ?? 0); }
    if (s === Math.floor(steps / 2)) out.snapshotParts = parts(snap);
    B.feed(s, B.tree, corrupt);
    t = now(); out.held += await step(B.tree); out.stepMs.push(now() - t);
    const at = s + 1;
    const d0 = compareRuns([ref[s]], [{ step: at, h: hashes(B.tree) }]);
    if (d0 && corrupt) out.forwardOff++; // expected: the forward pass ran a wrong input
    else if (d0 && !out.firstDivergence) { out.firstDivergence = { step: at, during: 'forward', components: d0.components ?? d0 }; }
    if (at % EVERY !== 0 || at < DEPTH) continue;
    const from = at - DEPTH, back = ring.get(from);
    if (!back) { out.skipped++; continue; }
    if (B.crosses?.(from, at)) { out.skipped++; continue; }
    const liveLog = B.tree.services.get('ai')?.record?.() ?? null;
    t = now();
    try { restoreWorld(B.tree, back); } catch (e) { refused(out, from, at, e); continue; }
    out.restoreMs.push(now() - t);
    if (requeue && B.requeue) B.requeue(B.tree, from, liveLog);
    out.rollbacks++;
    for (let k = from; k < at; k++) {
      if (corrupt && k > from) ring.set(k, captureWorld(B.tree)); // the corrected state replaces the mispredicted one
      B.feed(k, B.tree, false);
      t = now(); out.heldInResim += await step(B.tree); out.resimStepMs.push(now() - t); out.resimSteps++;
      const d = compareRuns([ref[k]], [{ step: k + 1, h: hashes(B.tree) }]);
      if (d) { out.divergences++; if (!out.firstDivergence) out.firstDivergence = { step: k + 1, during: `re-simulating from ${from}`, components: d.components ?? d }; }
    }
  }
  out.finalMatches = hashValue(hashes(B.tree)) === hashValue(ref.at(-1).h);
  B.close();
  for (const k of ['captureMs', 'restoreMs', 'resimStepMs', 'stepMs', 'snapshotBytes', 'rapierBytes']) out[k] = stats(out[k]);
  const ok = !out.firstDivergence && out.finalMatches;
  console.log(`${ok ? 'ok  ' : 'PART'} ${name}${corrupt ? ' (corrupted forward)' : ''}: ${out.rollbacks} rollbacks, ${out.resimSteps} steps re-simulated, ${out.skipped} skipped, ${out.refused} refused${corrupt ? `, ${out.forwardOff} forward steps off the reference` : ''}${out.firstDivergence ? `; first divergence at step ${out.firstDivergence.step} (${out.firstDivergence.during}): ${JSON.stringify(out.firstDivergence.components).slice(0, 200)}` : ''}`);
  return out;
}

// ---------------------------------------------------------------- the worlds

const recording = async (ref) => JSON.parse(new TextDecoder().decode(await bytes(ref)));

const WORLD = {
  'cafe-2p': async () => {
    const steps = 1200, b1 = makeBot(11), b2 = makeBot(22), inputs = [];
    for (let s = 0; s < steps; s++) inputs.push([b1(s), b2(s)]);
    // a mispredicted player 2: jump flipped, move_x mirrored
    const wrong = (i) => [i[0], [-i[1][0], i[1][1], i[1][2], i[1][3] ^ 1]];
    const make = async () => {
      const W = await twoPlayerWorld();
      return { tree: W.tree, feed: (s, _t, bad = false) => { W.rec.frames[s] = frameOf(W.rec, bad ? wrong(inputs[s]) : inputs[s]); }, close: () => { if (!W.input.isReplaying) throw new Error('the input service stopped replaying'); freeWorld(W); } };
    };
    return [await sweep('cafe-2p', make, steps), await sweep('cafe-2p', make, steps, { corrupt: true })];
  },
  'cafe-items': async () => {
    const rec = await recording('input/play-items.json');
    return [await sweep('cafe-items', async () => {
      const W = await cafeWorld('cafe.vrmxs'); W.input.replay(structuredClone(rec));
      return { tree: W.tree, feed: () => {}, close: () => freeWorld(W) };
    }, rec.frames.length)];
  },
  'cafe-follow-inject': async () => {
    const rec = await recording('input/walk-in.json'), steps = Math.min(rec.frames.length, 900);
    // director-style events, each queued a little before it is due (as a model's answer arrives), landing in windows
    const EVENTS = [
      { at: 100, e: { step: 112, agent: 'hana-1', action: { do: 'lookAt', args: { target: 'mira' } } } },
      { at: 230, e: { step: 236, agent: 'hana-1', action: { do: 'emote', args: { name: 'happy' } } } },
      { at: 400, e: { step: 413, agent: 'hana-1', action: { do: 'say', args: { text: 'Morning! The usual?', topic: 'greeting' } } } },
      { at: 600, e: { step: 604, agent: 'hana-1', bb: { mood: 'busy' } } },
    ];
    const make = async () => {
      const W = await cafeWorld('cafe-follow.vrmxs'); W.input.replay(structuredClone(rec));
      const ai = W.tree.services.get('ai'), sent = new Set();
      return {
        tree: W.tree,
        feed: (s) => { for (const x of EVENTS) if (x.at === s && !sent.has(x)) { sent.add(x); ai.inject(x.e); } }, // arrives once
        // the harness's "rewind": put back every logged event past the restored step (the snapshot keeps only those due)
        requeue: (tree, from, liveLog) => { for (const e of liveLog ?? []) if (e.step > from) ai.inject(e); },
        close: () => freeWorld(W),
      };
    };
    return [await sweep('cafe-follow-inject', make, steps), await sweep('cafe-follow-inject', make, steps, { requeue: true })];
  },
  'rush-level': async () => [await rushSweep()],
};

// The sample game through GameFlow. The scripted player decides from the world, so the reference records its inputs and
// the sweep replays them (a frame and a choice per step), as a network peer would receive them.
async function rushSweep() {
  const { exportRush, RUSH_PLANS } = await import('../acceptance/m5/rush-node.mjs');
  const { openFolder, behavioursImporter } = await import('@vrmxg/bundle/node');
  const { GameFlow } = await import('@vrmxg/game');
  const { VirtualDevice } = await import('@vrmxg/input');
  const { gameScenes, worldLoader, freeWorld: freeGameWorld } = await import('../apps/game/src/world.js');
  const { createRushPlayer } = await import('../acceptance/m5/rush-player.js');
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-net-rush-')), 'build');
  await exportRush(dir);
  const build = await openFolder(dir);
  R ??= await loadRapier(); core ??= await vrmxaCore(); closet ??= await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const scenes = gameScenes(build.bytes, build.game), docs = await scenes.documents();
  const load = worldLoader({ R, scenes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions(), vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
  const steps = 60 * 240; // the level's 240 s clock: won before it runs out, then the won scene
  let plan = null; // the reference's decisions: [stick, buttons, choose] per step
  const make = async () => {
    const pad = new VirtualDevice();
    const flow = new GameFlow({ load, unload: freeGameWorld, seed: 1, scenes: docs.scenes, prefabs: docs.prefabs, onWorld: (tree) => tree.services.get('input').addDevice(pad) });
    await flow.start(build.game.entry);
    flow.tree.services.get('input').addDevice(pad);
    const player = createRushPlayer(RUSH_PLANS.win), recorded = [];
    const sceneAt = new Map();
    const w = {
      get tree() { return flow.tree; },
      scene: () => flow.view().scene,
      crosses: (from, at) => { for (let k = from; k <= at; k++) if (sceneAt.has(k) && sceneAt.get(k) !== sceneAt.get(at)) return true; return false; },
      feed: (s, tree) => {
        const d = plan ? plan[s] : (() => { const x = player.decide(tree); const b = new Array(17).fill(0); if (x.interact) b[2] = 1; const r = { stick: [x.stick[0], -x.stick[1]], b, choose: x.choose ?? null }; recorded.push(r); return r; })();
        pad.setGamepad([d.stick[0], d.stick[1], 0, 0], d.b);
        if (d.choose) tree.services.get('input').choose('dialogue.choose', d.choose);
        sceneAt.set(s, flow.view().scene);
      },
      close: () => { if (!plan) plan = recorded; flow.dispose(); },
    };
    // GameFlow steps the session (scene changes happen at its step boundaries): route step() through it
    w.flow = flow;
    return w;
  };
  // GameFlow's step, not the tree's: patch the shared stepper for this world
  const res = await sweepFlow('rush-level', make, steps);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  return res;
}

/** sweep() for a GameFlow session: steps through flow.step() so scene changes happen. */
async function sweepFlow(name, make, steps) {
  const flowStep = async (w) => { let held = 0; while (!w.flow.step()) { held++; await w.flow.settle(); } return held; };
  console.log(`${name}: reference run, ${steps} steps`);
  const A = await make(), ref = [];
  for (let s = 0; s < steps; s++) { A.feed(s, A.tree); await flowStep(A); ref.push({ step: A.tree.clock.step, h: hashes(A.tree), scene: A.scene() }); }
  A.close();
  console.log(`${name}: rollback sweep (every ${EVERY}, depth ${DEPTH})`);
  const B = await make(), ring = new Map();
  const out = { world: name, steps, every: EVERY, depth: DEPTH, requeue: false, corrupt: false, shim: SHIM, held: 0, rollbacks: 0, resimSteps: 0, skipped: 0, refused: 0, refusals: [], heldInResim: 0, firstDivergence: null, divergences: 0, decided: null, scenes: [...new Set(ref.map((r) => r.scene))], captureMs: [], restoreMs: [], resimStepMs: [], stepMs: [], snapshotBytes: [], rapierBytes: [] };
  for (let s = 0; s < steps; s++) {
    let t = now(); const snap = captureWorld(B.tree, { meta: { scene: B.scene() } }); out.captureMs.push(now() - t);
    ring.set(s, { snap, tree: B.tree }); ring.delete(s - DEPTH - 1);
    if (s % 60 === 0) { out.snapshotBytes.push(v8.serialize(snap).length); out.rapierBytes.push(snap.services.physics?.data?.bytes?.length ?? 0); }
    if (s === 60 * 60) out.snapshotParts = parts(snap); // in the level
    B.feed(s, B.tree);
    t = now(); out.held += await flowStep(B); out.stepMs.push(now() - t);
    const v = B.flow.view(); if (v.outcome && !out.decided) out.decided = { result: v.outcome, step: v.step, scene: v.scene };
    const at = s + 1;
    const d0 = compareRuns([ref[s]], [{ step: at, h: hashes(B.tree) }]);
    if (d0 && !out.firstDivergence) out.firstDivergence = { step: at, during: 'forward', components: d0.components ?? d0 };
    if (at % EVERY !== 0 || at < DEPTH) continue;
    const from = at - DEPTH, back = ring.get(from);
    if (!back || back.tree !== B.tree) { out.skipped++; continue; } // the window crosses a scene change: that world is gone
    t = now();
    try { restoreWorld(B.tree, back.snap); } catch (e) { refused(out, from, at, e); continue; }
    out.restoreMs.push(now() - t);
    out.rollbacks++;
    for (let k = from; k < at; k++) {
      if (corrupt && k > from) ring.set(k, captureWorld(B.tree)); // the corrected state replaces the mispredicted one
      B.feed(k, B.tree, false);
      t = now(); out.heldInResim += await flowStep(B); out.resimStepMs.push(now() - t); out.resimSteps++;
      const d = compareRuns([ref[k]], [{ step: k + 1, h: hashes(B.tree) }]);
      if (d) { out.divergences++; if (!out.firstDivergence) out.firstDivergence = { step: k + 1, during: `re-simulating from ${from}`, components: d.components ?? d }; }
    }
  }
  out.finalMatches = hashValue(hashes(B.tree)) === hashValue(ref.at(-1).h);
  B.close();
  for (const k of ['captureMs', 'restoreMs', 'resimStepMs', 'stepMs', 'snapshotBytes', 'rapierBytes']) out[k] = stats(out[k]);
  const ok = !out.firstDivergence && out.finalMatches;
  console.log(`${ok ? 'ok  ' : 'PART'} ${name}: ${out.rollbacks} rollbacks, ${out.resimSteps} re-simulated, ${out.skipped} skipped (scene changes), ${out.refused} refused, decided ${JSON.stringify(out.decided)}${out.firstDivergence ? `; first divergence at ${out.firstDivergence.step} (${out.firstDivergence.during}): ${JSON.stringify(out.firstDivergence.components).slice(0, 200)}` : ''}`);
  return out;
}

const results = [];
for (const w of WORLDS) results.push(...await WORLD[w]());
const doc = { spike: 'networking', what: 'rollback round trips: restore in place, re-simulate, compare per-step hashes (physics:bytes included)', runtime: `node ${process.versions.node} (V8 ${process.versions.v8})`, rapier: RAPIER_BUILD ?? null, results };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
let prior = {}; try { prior = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
const merged = { ...doc, results: [...(prior.results ?? []).filter((r) => !results.some((x) => x.world === r.world && x.requeue === r.requeue && !!x.corrupt === !!r.corrupt && x.shim === r.shim)), ...results] };
fs.writeFileSync(OUT, JSON.stringify(merged, null, 1) + '\n');
console.log(`wrote ${path.relative(here, OUT)}`);
