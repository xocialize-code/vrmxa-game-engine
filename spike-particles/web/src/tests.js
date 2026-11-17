// The spike's test suite. Runs unchanged in Node (V8) and in the page (WKWebView/JSC, Chromium).
// The page passes `render` to add draw calls and render time; Node skips those.
import * as quarks from './libs/quarks.js';
import * as nebula from './libs/nebula.js';
import * as stateless from './libs/stateless.js';
import { protonRun, newkrokRun } from './libs/probes.js';
import { now, stats } from './core/timing.js';

export const DT = 1 / 60;
export const SEED = 20261117;
const r3 = (x) => Math.round(x * 1000) / 1000;

// ---- scenario builders --------------------------------------------------------------------
// "mixed": 10 bench emitters x ~1000 particles plus every anime effect of that library.
export function buildMixed(lib, opts = {}) {
  if (lib === 'quarks') {
    const w = quarks.createWorld({ seed: SEED, ...opts });
    for (let i = 0; i < 10; i++) w.add(quarks.benchSystem(w, i, 10, 1000));
    for (const k of Object.keys(quarks.effects)) w.add(quarks.effects[k](w));
    return w;
  }
  if (lib === 'nebula') {
    const w = nebula.createWorld({ seed: SEED, ...opts });
    for (let i = 0; i < 10; i++) w.add(nebula.benchSystem(w, i, 10, 1000));
    for (const k of Object.keys(nebula.effects)) w.add(nebula.effects[k](w));
    return w;
  }
  const w = stateless.createWorld({ seed: SEED, ...opts });
  for (let i = 0; i < 10; i++) w.add(stateless.benchSpec(i, 10, 1000), undefined, stateless.benchOffset(i, 10));
  for (const k of Object.keys(stateless.effects)) w.add(stateless.effects[k]());
  return w;
}
function buildBench(lib, n, total, extra = {}) {
  const per = total / n;
  if (lib === 'quarks') { const w = quarks.createWorld({ seed: SEED, ...extra }); for (let i = 0; i < n; i++) w.add(quarks.benchSystem(w, i, n, per)); return w; }
  if (lib === 'nebula') { const w = nebula.createWorld({ seed: SEED, ...extra }); for (let i = 0; i < n; i++) w.add(nebula.benchSystem(w, i, n, per)); return w; }
  const w = stateless.createWorld({ seed: SEED, ...extra });
  for (let i = 0; i < n; i++) w.add(stateless.benchSpec(i, n, per), undefined, stateless.benchOffset(i, n));
  return w;
}
export const run = (w, steps) => { for (let i = 0; i < steps; i++) w.step(DT); return w; };

// ---- 1. repeatability and cross-runtime hashes ------------------------------------------------
const VARIANTS = [
  { lib: 'quarks', opts: { seeding: 'none' }, name: 'quarks · unseeded (Math.random)' },
  { lib: 'quarks', opts: { seeding: 'stream' }, name: 'quarks · adapter RNG, one stream' },
  { lib: 'quarks', opts: { seeding: 'frame' }, name: 'quarks · adapter RNG, per-frame seed' },
  { lib: 'nebula', opts: { seeding: 'none' }, name: 'nebula · unseeded' },
  { lib: 'nebula', opts: { seeding: 'seed' }, name: 'nebula · setSeed' },
  { lib: 'stateless', opts: {}, name: 'stateless · closed form (CPU twin)' },
  { lib: 'quarks', opts: { seeding: 'frame', math: 'portable' }, name: 'quarks · per-frame seed + portable math' },
  { lib: 'nebula', opts: { seeding: 'seed', math: 'portable' }, name: 'nebula · setSeed + portable math' },
  { lib: 'stateless', opts: { math: 'portable' }, name: 'stateless · CPU twin + portable math' },
];
export function determinism() {
  const out = [];
  for (const v of VARIANTS) {
    const runs = [0, 1].map(() => {
      const w = buildMixed(v.lib, v.opts);
      run(w, 300); const h300 = w.hash();
      run(w, 300); const h600 = w.hash();
      w.dispose();
      return { h300, h600 };
    });
    out.push({
      variant: v.name, lib: v.lib, opts: v.opts,
      hash300: runs[0].h300.ordered, hash600: runs[0].h600.ordered, particles600: runs[0].h600.particles,
      repeatable: runs[0].h600.ordered === runs[1].h600.ordered && runs[0].h300.ordered === runs[1].h300.ordered,
    });
  }
  // probes for the libraries not spiked in depth
  const p = [protonRun({ seed: SEED }), protonRun({ seed: SEED })];
  out.push({ variant: 'three.proton.js · Math.random swap (probe)', lib: 'proton', hash600: p[0].ordered, particles600: p[0].particles, repeatable: p[0].ordered === p[1].ordered, msPerStep: p[0].msPerStep, sceneObjects: p[0].drawObjects });
  const pp = [protonRun({ seed: SEED, math: 'portable' }), protonRun({ seed: SEED, math: 'portable' })];
  out.push({ variant: 'three.proton.js · Math.random swap + portable math (probe)', lib: 'proton', hash600: pp[0].ordered, particles600: pp[0].particles, repeatable: pp[0].ordered === pp[1].ordered, msPerStep: pp[0].msPerStep });
  const k = [newkrokRun({ seed: SEED }), newkrokRun({ seed: SEED })];
  out.push({ variant: '@newkrok/three-particles · Math.random swap + synthetic clock (probe)', lib: 'newkrok', hash600: k[0].ordered, repeatable: k[0].ordered === k[1].ordered, msPerStep: k[0].msPerStep });
  return out;
}

// ---- 2. restore to a frame (timeline scrubbing) ----------------------------------------------
export function scrub() {
  const out = {};
  const A = 300, B = 450, W = 100; // W frames covers the longest life in the mixed scene (1.5 s)
  // quarks, full snapshot
  {
    const w = buildMixed('quarks', { seeding: 'frame' });
    run(w, A);
    let t = now(); const snap = quarks.snapshotFull(w); const snapMs = now() - t;
    const bytes = JSON.stringify(snap).length;
    run(w, B - A); const ref = w.hash();
    t = now(); quarks.restoreFull(w, snap); const restoreMs = now() - t;
    run(w, B - A); const got = w.hash();
    out.quarksFull = { ordered: got.ordered === ref.ordered, unordered: got.unordered === ref.unordered, snapshotBytes: bytes, snapshotMs: r3(snapMs), restoreMs: r3(restoreMs), particles: ref.particles };
    w.dispose();
  }
  // quarks, window restore: keep only emission state per frame, re-simulate W frames
  {
    const w = buildMixed('quarks', { seeding: 'frame' });
    const states = [];
    for (let f = 0; f < B; f++) { states.push(quarks.emitterState(w)); w.step(DT); }
    const ref = w.hash();
    const perFrameBytes = JSON.stringify(states[B - W]).length;
    run(w, 37); // wander off, as a scrub would
    const t = now(); quarks.restoreWindow(w, states[B - W], B - W, B, DT); const ms = now() - t;
    const got = w.hash();
    out.quarksWindow = { ordered: got.ordered === ref.ordered, unordered: got.unordered === ref.unordered, windowFrames: W, restoreMs: r3(ms), emitterStateBytesPerFrame: perFrameBytes, particles: ref.particles };
    w.dispose();
  }
  // quarks and nebula: re-simulate from frame 0 (the baseline any seeded library allows)
  for (const lib of ['quarks', 'nebula']) {
    const w0 = run(buildMixed(lib, lib === 'quarks' ? { seeding: 'frame' } : { seeding: 'seed' }), B); const ref = w0.hash(); w0.dispose();
    const t = now(); const w1 = run(buildMixed(lib, lib === 'quarks' ? { seeding: 'frame' } : { seeding: 'seed' }), B); const ms = now() - t;
    const got = w1.hash(); w1.dispose();
    out[`${lib}Resim`] = { ordered: got.ordered === ref.ordered, frames: B, ms: r3(ms), msPerFrame: r3(ms / B) };
  }
  // stateless: seek
  {
    const w = run(buildMixed('stateless'), B); const ref = w.hash();
    run(w, 37);
    const t = now(); w.seek(B, DT); const ms = now() - t;
    out.statelessSeek = { ordered: w.hash().ordered === ref.ordered, seekMs: r3(ms) };
    w.dispose();
  }
  return out;
}

// ---- 3. JSON round trip ------------------------------------------------------------------------
export function json() {
  const out = {};
  {
    const a = quarks.createWorld({ seed: SEED, seeding: 'frame' });
    for (const k of Object.keys(quarks.effects)) a.add(quarks.effects[k](a));
    const doc = quarks.toJSON(a);
    const text = JSON.stringify(doc);
    const b = quarks.createWorld({ seed: SEED, seeding: 'frame' });
    quarks.fromJSON(b, JSON.parse(text));
    run(a, 120); run(b, 120);
    const textNoImages = JSON.stringify(doc.map((d) => ({ ...d, images: [] })));
    out.quarks = { bytes: text.length, bytesWithoutImages: textNoImages.length, systems: a.systems.length, loadedSystems: b.systems.length, sameState: a.hash().ordered === b.hash().ordered, particles: a.count() };
    a.dispose(); b.dispose();
  }
  {
    const a = stateless.createWorld({ seed: SEED });
    for (const k of Object.keys(stateless.effects)) a.add(stateless.effects[k]());
    const text = JSON.stringify(a.toJSON());
    const b = stateless.createWorld({ seed: SEED });
    for (const s of JSON.parse(text)) b.emitters.push({ spec: s, mesh: stateless.createMesh(s), offset: [0, 0, 0] });
    a.seek(120); b.seek(120);
    out.stateless = { bytes: text.length, sameState: a.hash().ordered === b.hash().ordered };
  }
  return out;
}

// ---- 4. CPU cost per step ---------------------------------------------------------------------
// render(world, lib) is supplied by the page: it adds the world's objects to a scene, renders one
// frame and returns { calls, ms }. Node passes nothing.
export async function perf({ render = null, configs = [[1, 10000], [10, 10000], [50, 10000]], warm = 120, measure = 300, makeExtra = null } = {}) {
  const out = [];
  // Two passes over every config; only the second is kept, so JIT warm-up and the order the
  // libraries run in don't land on whichever config happens to go first.
  for (const pass of [0, 1]) for (const lib of ['quarks', 'nebula', 'stateless']) {
    for (const [n, total] of configs) {
      const extra = makeExtra ? makeExtra(lib) : {};
      const w = buildBench(lib, n, total, extra);
      run(w, warm);
      const steps = [], renders = []; let calls = null;
      for (let i = 0; i < measure; i++) {
        const t = now(); w.step(DT); steps.push(now() - t);
        if (render) { const r = await render(w, lib, i); renders.push(r.ms); calls = r.calls; }
      }
      if (pass === 0) { w.dispose(); continue; }
      out.push({ lib, emitters: n, target: total, live: w.count(), step: stats(steps), render: render ? stats(renders) : null, drawCalls: calls });
      w.dispose();
    }
  }
  // the cost of portable math: 10 emitters x 1000, step only
  for (const pass of [0, 1]) for (const lib of ['quarks', 'nebula']) {
    const w = buildBench(lib, 10, 10000, { math: 'portable', ...(lib === 'quarks' ? { seeding: 'frame' } : {}) });
    run(w, warm);
    const steps = [];
    for (let i = 0; i < measure; i++) { const t = now(); w.step(DT); steps.push(now() - t); }
    if (pass) out.push({ lib: `${lib} + portable math`, emitters: 10, target: 10000, live: w.count(), step: stats(steps), render: null, drawCalls: null });
    w.dispose();
  }
  return out;
}

export function environment() {
  const g = globalThis;
  return {
    userAgent: g.navigator?.userAgent ?? `node ${g.process?.version}`,
    timerResolutionMs: (() => { let a = now(), b = a; while (b === a) b = now(); return r3(b - a); })(),
    location: g.location?.href ?? null,
  };
}

export async function runSuite(opts = {}) {
  const t0 = now();
  const result = { env: environment() };
  result.determinism = determinism();
  result.scrub = scrub();
  result.json = json();
  result.perf = await perf(opts);
  result.totalMs = Math.round(now() - t0);
  return result;
}
