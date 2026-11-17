// The determinism spike's measurements. Pure JS: runs in Node (scripts/node-tests.mjs), headless
// Chromium (scripts/chromium-tests.mjs) and the WKWebView wrapper (the page's ?autorun=1), and
// returns one plain JSON object. Compare runtimes with scripts/compare.mjs.
import * as THREE from 'three';
import { installDMath, uninstallDMath, nativeMath, dsin, dcos, dacos, dasin, datan, datan2 } from './dmath.js';
import { parseVRM, parseVRMA } from './load.js';
import { Character, STEPS, snapshotBytes } from './character.js';

export const CLIP_FILES = { idle: 'idle.vrma', walk: 'walk.vrma', run: 'run_b.vrma', wave: 'wave_b.vrma' };
export const MODEL_FILES = { spec: 'spec.vrm', vroid10: 'vroid10.vrm', vroid0x: 'vroid0x.vrm', seed: 'seed-san.vrm' };

// ---------------------------------------------------------------- hashing

/** FNV-1a over the raw bits of a Float64Array: equal hashes ⇔ bit-identical state. */
export function hashF64(f64) {
  const u = new Uint32Array(f64.buffer, f64.byteOffset, f64.length * 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) {
    let x = u[i];
    for (let b = 0; b < 4; b++) { h ^= x & 0xff; h = Math.imul(h, 0x01000193); x >>>= 8; }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const hashStr = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };

export function toB64(f64) {
  const bytes = new Uint8Array(f64.buffer, f64.byteOffset, f64.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { mean: +mean.toFixed(4), p50: +q(0.5).toFixed(4), p95: +q(0.95).toFixed(4), max: +s[s.length - 1].toFixed(4) };
}
const now = () => performance.now();
const tick = () => new Promise((r) => setTimeout(r, 0)); // lets the page repaint its log

// ---------------------------------------------------------------- modes

const origSlerpFlat = THREE.Quaternion.slerpFlat;
/** slerpFlat replaced by normalised lerp: +, *, sqrt only. */
function nlerpFlat(dst, dstOffset, src0, o0, src1, o1, t) {
  let x0 = src0[o0], y0 = src0[o0 + 1], z0 = src0[o0 + 2], w0 = src0[o0 + 3];
  let x1 = src1[o1], y1 = src1[o1 + 1], z1 = src1[o1 + 2], w1 = src1[o1 + 3];
  if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
    if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    const s = 1 - t;
    x0 = x0 * s + x1 * t; y0 = y0 * s + y1 * t; z0 = z0 * s + z1 * t; w0 = w0 * s + w1 * t;
    const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
    x0 *= f; y0 *= f; z0 *= f; w0 *= f;
  }
  dst[dstOffset] = x0; dst[dstOffset + 1] = y0; dst[dstOffset + 2] = z0; dst[dstOffset + 3] = w0;
}

export const MODES = {
  native: { install() {}, uninstall() {} },
  dmath: { install: installDMath, uninstall: uninstallDMath },
  nlerp: { install() { THREE.Quaternion.slerpFlat = nlerpFlat; }, uninstall() { THREE.Quaternion.slerpFlat = origSlerpFlat; } },
};

async function withMode(mode, fn) {
  MODES[mode].install();
  try { return await fn(); } finally { MODES[mode].uninstall(); }
}

// ---------------------------------------------------------------- scenarios

export const SCENARIOS = {
  mixer: { driver: 'crossfade', spring: false, move: false, look: false, expr: true },  // Q1: sampling, crossfades, blend weights
  springs: { driver: 'crossfade', spring: true, move: true, look: false, expr: false }, // Q2: + vrm.update, walking parent
  full: { driver: 'crossfade', spring: true, move: true, look: true, expr: true },      // Q3: + lookAt target, expressions
  timeline: { driver: 'timeline', spring: true, move: true, look: true, expr: true },   // full, stateless mixer driver
};

async function makeChar(assets, model, opts) {
  const vrm = await parseVRM(assets.models[model]);
  const anims = {};
  for (const c of Object.keys(CLIP_FILES)) anims[c] = await parseVRMA(assets.clips[c]);
  return new Character(vrm, anims, opts);
}

const COMPS = ['norm', 'bones', 'springs', 'expr'];

/** cadence: 'none' (pure observer), 'every' (scene.updateMatrixWorld after each step, as a 60 Hz
 *  render does) or '24fps' (only on steps where a 24 fps render would fall). */
async function runScenario(assets, model, scenario, { cadence = 'none', keepFinal = false } = {}) {
  const ch = await makeChar(assets, model, SCENARIOS[scenario]);
  const per = { norm: '', bones: '', springs: '', expr: '' };
  const combined = [];
  let last, mid;
  for (let k = 0; k < STEPS; k++) {
    ch.step();
    if (cadence === 'every' || (cadence === '24fps' && Math.floor((k + 1) * 24 / 60) !== Math.floor(k * 24 / 60))) ch.scene.updateMatrixWorld();
    last = ch.state();
    if (k + 1 === 450) mid = last;
    let c = '';
    for (const p of COMPS) { const h = hashF64(last[p]); per[p] += h; c += h; }
    combined.push(hashStr(c));
  }
  const out = { final: combined[STEPS - 1], checkpoints: Object.fromEntries([60, 120, 180, 300, 420, 510, 600].map((s) => [s, combined[s - 1]])), perStep: per };
  if (keepFinal) {
    out.state450 = Object.fromEntries(COMPS.map((p) => [p, toB64(mid[p])]));
    out.finalState = Object.fromEntries(COMPS.map((p) => [p, toB64(last[p])]));
  }
  return { out, info: ch.info() };
}

// ---------------------------------------------------------------- parts

/** Native Math on fixed inputs, hashed and dumped, so runtimes can be compared function by function. */
export function mathFingerprint({ dump = true } = {}) {
  const N = 2000;
  let s = 0x12345678;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const angle = Array.from({ length: N }, () => (rnd() * 2 - 1) * 7);
  const unit = Array.from({ length: N }, () => rnd() * 2 - 1);
  const pos = Array.from({ length: N }, () => rnd() * 50 + 1e-3);
  const small = Array.from({ length: N }, () => (rnd() * 2 - 1) * 5);
  const M = nativeMath;
  const fns = {
    sin: (i) => M.sin(angle[i]), cos: (i) => M.cos(angle[i]), tan: (i) => M.tan(angle[i]),
    asin: (i) => M.asin(unit[i]), acos: (i) => M.acos(unit[i]), atan: (i) => M.atan(small[i]),
    atan2: (i) => M.atan2(small[i], small[(i * 7 + 3) % N]),
    exp: (i) => Math.exp(small[i]), log: (i) => Math.log(pos[i]), pow: (i) => Math.pow(pos[i], small[i] * 0.3),
    cbrt: (i) => Math.cbrt(small[i]), hypot: (i) => Math.hypot(small[i], small[(i * 7 + 3) % N]),
    sinh: (i) => Math.sinh(small[i]), cosh: (i) => Math.cosh(small[i]), tanh: (i) => Math.tanh(small[i]),
    expm1: (i) => Math.expm1(small[i] * 0.1), log1p: (i) => Math.log1p(pos[i] * 0.01), log2: (i) => Math.log2(pos[i]), log10: (i) => Math.log10(pos[i]),
    sqrt: (i) => Math.sqrt(pos[i]),
    // the shim, which must agree everywhere
    'dmath.sin': (i) => dsin(angle[i]), 'dmath.cos': (i) => dcos(angle[i]), 'dmath.asin': (i) => dasin(unit[i]),
    'dmath.acos': (i) => dacos(unit[i]), 'dmath.atan': (i) => datan(small[i]), 'dmath.atan2': (i) => datan2(small[i], small[(i * 7 + 3) % N]),
  };
  const out = {};
  for (const [name, f] of Object.entries(fns)) {
    const v = new Float64Array(N);
    for (let i = 0; i < N; i++) v[i] = f(i);
    out[name] = { hash: hashF64(v), ...(dump ? { values: toB64(v) } : {}) };
  }
  return out;
}

/** How often the mixer takes slerpFlat's acos/sin branch (dot < 0.9995) vs the nlerp branch. */
async function slerpBranches(assets, model) {
  const counts = { calls: 0, identical: 0, nlerpBranch: 0, acosBranch: 0, acosByStep: {} };
  let k = 0;
  THREE.Quaternion.slerpFlat = function (dst, dO, s0, o0, s1, o1, t) {
    counts.calls++;
    const a = [s0[o0], s0[o0 + 1], s0[o0 + 2], s0[o0 + 3]], b = [s1[o1], s1[o1 + 1], s1[o1 + 2], s1[o1 + 3]];
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]) counts.identical++;
    else {
      const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
      if (d < 0.9995) { counts.acosBranch++; const bucket = Math.floor(k / 30) * 30; counts.acosByStep[bucket] = (counts.acosByStep[bucket] ?? 0) + 1; } else counts.nlerpBranch++;
    }
    return origSlerpFlat(dst, dO, s0, o0, s1, o1, t);
  };
  try {
    const ch = await makeChar(assets, model, SCENARIOS.mixer);
    for (k = 0; k < STEPS; k++) ch.step();
  } finally { THREE.Quaternion.slerpFlat = origSlerpFlat; }
  return counts;
}

/** How many transcendental calls one character makes per step, by function (engine-independent). */
async function mathCalls(assets, model, scenario) {
  const counts = {};
  const saved = {};
  for (const fn of ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'log', 'pow', 'hypot']) {
    saved[fn] = Math[fn];
    counts[fn] = 0;
    Math[fn] = function (...a) { counts[fn]++; return saved[fn].apply(Math, a); };
  }
  let ch;
  try {
    ch = await makeChar(assets, model, SCENARIOS[scenario]);
    for (const k of Object.keys(counts)) counts[k] = 0; // count steps only, not loading
    for (let k = 0; k < STEPS; k++) ch.step();
  } finally { Object.assign(Math, saved); }
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n).map(([k, n]) => [k, +(n / STEPS).toFixed(1)]));
}

/** Straight run vs restore at step N and re-simulate to the end. */
async function snapshotTests(assets, model, driver, log) {
  const scenario = driver === 'timeline' ? 'timeline' : 'full';
  const at = [130, 300, 430];
  const straight = await makeChar(assets, model, SCENARIOS[scenario]);
  const snaps = {};
  const takeMs = [];
  const wantSteps = [];
  const Hs = (ch) => { const st = ch.state(); return hashStr(COMPS.map((p) => hashF64(st[p])).join('')); };
  for (let k = 0; k < STEPS; k++) {
    straight.step();
    wantSteps.push(Hs(straight));
    if (at.includes(straight.k)) { const t0 = now(); snaps[straight.k] = straight.snapshot(); takeMs.push(now() - t0); }
  }
  const H = (ch) => { const st = ch.state(); return hashStr(COMPS.map((p) => hashF64(st[p])).join('')); };
  const res = { bytes: snapshotBytes(snaps[300]), takeMs: +(takeMs.reduce((a, b) => a + b, 0) / takeMs.length).toFixed(3), cases: {} };
  // Compare every step after the restore point, not only the last one: small spring and pose
  // differences can damp back to the same bits by step 600.
  const runFrom = (ch) => { const hs = []; while (ch.k < STEPS) { ch.step(); hs.push(H(ch)); } return hs; };
  const same = (hs, n) => hs.every((h, i) => h === wantSteps[n + i]);
  const firstDiff = (hs, n) => { const i = hs.findIndex((h, j) => h !== wantSteps[n + j]); return i < 0 ? null : n + i + 1; };
  const restoreMs = [];
  for (const n of at) {
    log?.(`snapshot ${model}/${driver}: from step ${n}`);
    // same instance, scrubbed back from the end
    let t0 = now();
    straight.restore(snaps[n]);
    restoreMs.push(now() - t0);
    const scrub = runFrom(straight);
    // fresh instance (a re-render in a new session), full restore
    const fresh = await makeChar(assets, model, SCENARIOS[scenario]);
    t0 = now(); fresh.restore(snaps[n]); restoreMs.push(now() - t0);
    const freshFull = runFrom(fresh);
    // fresh instance, local TRS of every node only; matrices recomputed
    const trs = await makeChar(assets, model, SCENARIOS[scenario]);
    trs.restore(snaps[n], { nodes: 'trs' });
    const freshTrs = runFrom(trs);
    // fresh instance, only root transform + spring tails + mixer (no other node state)
    const lean = await makeChar(assets, model, SCENARIOS[scenario]);
    lean.restore(snaps[n], { nodes: 'root' });
    const freshLean = runFrom(lean);
    // fresh instance, root + mixer but spring tails left at their initial state
    const bare = await makeChar(assets, model, SCENARIOS[scenario]);
    bare.restore({ ...snaps[n], springs: Float64Array.from(bare.snapshot().springs) }, { nodes: 'root' });
    const freshNoSprings = runFrom(bare);
    res.cases[n] = {
      sameInstanceScrub: same(scrub, n), freshFullRestore: same(freshFull, n), freshTrsRestore: same(freshTrs, n), freshTrsFirstDiff: firstDiff(freshTrs, n),
      freshSpringsAndRootOnly: same(freshLean, n), freshSpringsAndRootOnlyFirstDiff: firstDiff(freshLean, n),
      freshWithoutSprings: same(freshNoSprings, n), freshWithoutSpringsFirstDiff: firstDiff(freshNoSprings, n),
      freshWithoutSpringsFinalMatches: freshNoSprings[freshNoSprings.length - 1] === wantSteps[STEPS - 1],
    };
  }
  res.restoreMs = +(restoreMs.reduce((a, b) => a + b, 0) / restoreMs.length).toFixed(3);
  return res;
}

/** Per-step cost of mixer + vrm.update (and the matrix work a render adds) for N characters. */
async function timing(assets, model, n, mode, log) {
  return withMode(mode, async () => {
    log?.(`timing ${model} ×${n} (${mode}): loading`);
    const chars = [];
    for (let i = 0; i < n; i++) {
      const ch = await makeChar(assets, model, SCENARIOS.full);
      ch.root.position.x = (i % 5) * 1.5;
      ch.root.position.z = Math.floor(i / 5) * 1.5;
      chars.push(ch);
      if (i % 5 === 4) await tick();
    }
    const skeletons = chars.map((c) => { const set = new Set(); c.scene.traverse((o) => { if (o.isSkinnedMesh) set.add(o.skeleton); }); return [...set]; });
    log?.(`timing ${model} ×${n} (${mode}): running`);
    const sim = [], mats = [];
    const w0 = now();
    for (let k = 0; k < STEPS; k++) {
      const t0 = now();
      for (const c of chars) c.step();
      const t1 = now();
      for (let i = 0; i < chars.length; i++) { chars[i].scene.updateMatrixWorld(); for (const s of skeletons[i]) s.update(); }
      const t2 = now();
      sim.push(t1 - t0); mats.push(t2 - t1);
    }
    const wallMsPerStep = +((now() - w0) / STEPS).toFixed(4); // one long interval: immune to a coarse timer
    const total = sim.reduce((a, b) => a + b, 0);
    return {
      wallMsPerStep,
      model, n, mode, steps: STEPS,
      sim: stats(sim), simPerCharMs: +(total / STEPS / n).toFixed(4),
      matrices: stats(mats), springJoints: chars[0].joints.length,
    };
  });
}

function shimMicrobench() {
  const N = 2_000_000;
  const xs = new Float64Array(1024), us = new Float64Array(1024);
  for (let i = 0; i < 1024; i++) { xs[i] = (i / 1024 - 0.5) * 6; us[i] = i / 1024 * 2 - 1; }
  const bench = (f, arr) => { let acc = 0; for (let i = 0; i < 100000; i++) acc += f(arr[i & 1023]); const t0 = now(); for (let i = 0; i < N; i++) acc += f(arr[i & 1023]); return { ns: +((now() - t0) * 1e6 / N).toFixed(2), acc }; };
  const M = nativeMath;
  const r = {};
  for (const [name, n, d, arr] of [['sin', M.sin, dsin, xs], ['cos', M.cos, dcos, xs], ['acos', M.acos, dacos, us], ['asin', M.asin, dasin, us], ['atan', M.atan, datan, xs]]) {
    r[name] = { nativeNs: bench(n, arr).ns, dmathNs: bench(d, arr).ns };
  }
  const a2n = bench((x) => M.atan2(x, 0.7), xs).ns, a2d = bench((x) => datan2(x, 0.7), xs).ns;
  r.atan2 = { nativeNs: a2n, dmathNs: a2d };
  return r;
}

export function environment() {
  const g = globalThis;
  return {
    runtime: typeof process !== 'undefined' && process.versions?.node ? `node ${process.versions.node} (V8 ${process.versions.v8})` : g.navigator?.userAgent ?? 'unknown',
    origin: g.location?.origin ?? null,
    crossOriginIsolated: g.crossOriginIsolated ?? null,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    timerResolutionMs: (() => { let a = now(), b = a, n = 0; while (b === a && n++ < 1e6) b = now(); return +(b - a).toFixed(4); })(),
  };
}

// ---------------------------------------------------------------- the whole suite

/**
 * assets: { models: { key: ArrayBuffer }, clips: { idle, walk, run, wave: ArrayBuffer } }
 * parts:  any of fingerprint, determinism, cadence, snapshot, timing, micro
 */
export async function runSuite({ assets, log = () => {}, parts = ['fingerprint', 'determinism', 'cadence', 'snapshot', 'calls', 'timing', 'micro'],
  models = Object.keys(assets.models), modes = Object.keys(MODES), timingModels = ['spec', 'vroid10'], timingCounts = [1, 5, 20] } = {}) {
  const r = { when: new Date().toISOString(), env: environment(), steps: STEPS };
  if (parts.includes('fingerprint')) { log('math fingerprint'); r.mathFingerprint = mathFingerprint(); }

  if (parts.includes('determinism')) {
    r.models = {};
    for (const model of models) {
      const m = { modes: {} };
      for (const mode of modes) {
        const runs = {};
        for (const sc of Object.keys(SCENARIOS)) {
          log(`determinism ${model} ${mode} ${sc}`); await tick();
          const { out, info } = await withMode(mode, () => runScenario(assets, model, sc, { keepFinal: mode === 'native' && (sc === 'full' || sc === 'mixer') }));
          runs[sc] = out;
          m.info ??= info;
        }
        log(`determinism ${model} ${mode} repeat`); await tick();
        const again = await withMode(mode, () => runScenario(assets, model, 'full'));
        runs.repeatable = COMPS.every((p) => again.out.perStep[p] === runs.full.perStep[p]);
        m.modes[mode] = runs;
      }
      r.models[model] = m;
    }
    log('slerp branch counts'); await tick();
    r.slerpBranches = await slerpBranches(assets, models[0]);
  }

  if (parts.includes('cadence')) {
    r.cadence = {};
    for (const model of models.slice(0, 2)) {
      const res = {};
      for (const c of ['none', 'every', '24fps']) { log(`cadence ${model} ${c}`); await tick(); res[c] = (await runScenario(assets, model, 'full', { cadence: c })).out; }
      r.cadence[model] = {
        final: Object.fromEntries(Object.entries(res).map(([c, o]) => [c, o.final])),
        everyMatchesNone: COMPS.every((p) => res.every.perStep[p] === res.none.perStep[p]),
        fps24MatchesNone: COMPS.every((p) => res['24fps'].perStep[p] === res.none.perStep[p]),
      };
    }
  }

  if (parts.includes('snapshot')) {
    r.snapshot = {};
    for (const model of models.slice(0, 2)) {
      for (const driver of ['crossfade', 'timeline']) {
        await tick();
        r.snapshot[`${model}/${driver}`] = await snapshotTests(assets, model, driver, log);
      }
    }
  }

  if (parts.includes('calls')) {
    r.mathCallsPerStep = {};
    for (const model of models) for (const sc of ['mixer', 'full', 'timeline']) r.mathCallsPerStep[`${model}/${sc}`] = await mathCalls(assets, model, sc);
  }

  if (parts.includes('micro')) { log('dmath microbench'); await tick(); r.micro = shimMicrobench(); }

  if (parts.includes('timing')) {
    r.timing = [];
    for (const model of timingModels) {
      for (const n of timingCounts) {
        for (const mode of ['native', 'dmath']) {
          await tick();
          try { r.timing.push(await timing(assets, model, n, mode, log)); } catch (e) { r.timing.push({ model, n, mode, error: String(e?.message ?? e) }); }
        }
      }
    }
  }
  log('done');
  return r;
}
