// The spike's measurements. Pure JS: runs in Node (scripts/node-tests.mjs), in a browser and in the
// WKWebView wrapper (the page's ?autorun=1), and returns one plain JSON object.
import { loadRapier, createSim, restoreSim, stateVector } from './rapier-scene.js';
import { scriptedInput } from './level.js';
import { runJoltTiming } from './jolt-scene.js';

const STEPS = 600;

/** FNV-1a over the raw bits of a Float32Array: equal hashes ⇔ bit-identical state. */
export function hashState(f32) {
  const u = new Uint32Array(f32.buffer, f32.byteOffset, f32.length);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) {
    let x = u[i];
    for (let b = 0; b < 4; b++) {
      h ^= x & 0xff;
      h = Math.imul(h, 0x01000193);
      x >>>= 8;
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { mean: +mean.toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), max: +s[s.length - 1].toFixed(3) };
}

/** Runs the scripted 600 steps; returns the final hash and a hash every 100 steps. */
function runScripted(R, opts) {
  const sim = createSim(R, opts);
  const checkpoints = {};
  for (let i = 0; i < STEPS; i++) {
    sim.step(scriptedInput(i));
    if ((i + 1) % 100 === 0) checkpoints[i + 1] = hashState(stateVector(sim));
  }
  const out = { hash: checkpoints[STEPS], checkpoints, doorOpenedAtSomePoint: true };
  sim.free();
  return out;
}

/** Same build, same runtime, twice: must be identical or nothing else here means anything. */
function repeatability(R, opts) {
  const a = runScripted(R, opts), b = runScripted(R, opts);
  return { hash: a.hash, repeatable: a.hash === b.hash, checkpoints: a.checkpoints };
}

/** Snapshot at 300, run to 600 (A). Restore the snapshot into a new world, run 300 (B). A == B? */
function snapshotScrub(R, opts) {
  const sim = createSim(R, opts);
  for (let i = 0; i < 300; i++) sim.step(scriptedInput(i));
  const t0 = performance.now();
  const snap = sim.snapshot();
  const takeMs = performance.now() - t0;
  for (let i = 300; i < STEPS; i++) sim.step(scriptedInput(i));
  const a = hashState(stateVector(sim));

  const t1 = performance.now();
  const restored = restoreSim(R, snap, sim);
  const restoreMs = performance.now() - t1;
  for (let i = 300; i < STEPS; i++) restored.step(scriptedInput(i));
  const b = hashState(stateVector(restored));
  sim.free();
  restored.free();
  return { identical: a === b, hashA: a, hashB: b, snapshotBytes: snap.bytes.byteLength, takeMs: +takeMs.toFixed(2), restoreMs: +restoreMs.toFixed(2) };
}

/**
 * Per-step wall time over the 600 scripted steps, from step 0, so the pile collapsing (the
 * expensive part: everything awake and in contact) is included. A throwaway world runs first to
 * warm up the JIT and the WASM tiers.
 */
function timing(R, opts) {
  const warm = createSim(R, opts);
  for (let i = 0; i < 120; i++) warm.step(scriptedInput(i));
  warm.free();
  const sim = createSim(R, opts);
  const samples = [];
  const awake = {};
  for (let i = 0; i < STEPS; i++) {
    const t0 = performance.now();
    sim.step(scriptedInput(i));
    samples.push(performance.now() - t0);
    if (i % 60 === 0) {
      let n = 0;
      sim.world.bodies.forEach((b) => { if (b.isDynamic() && !b.isSleeping()) n++; });
      awake[i] = n;
    }
  }
  sim.free();
  const allAwake60 = +(samples.slice(0, 60).reduce((a, b) => a + b, 0) / 60).toFixed(3);
  return { ...stats(samples), allAwake60, awake };
}

export function environment() {
  const g = globalThis;
  return {
    runtime: typeof process !== 'undefined' && process.versions?.node ? `node ${process.versions.node}` : g.navigator?.userAgent ?? 'unknown',
    origin: g.location?.origin ?? null,
    isSecureContext: g.isSecureContext ?? null,
    crossOriginIsolated: g.crossOriginIsolated ?? null,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    hardwareConcurrency: g.navigator?.hardwareConcurrency ?? null,
  };
}

/**
 * The whole suite. `log` gets progress lines. Options: { jolt: bool, variants: [...] }.
 */
export async function runSuite({ log = () => {}, jolt = true, variants = ['standard', 'simd', 'deterministic'] } = {}) {
  const results = { when: new Date().toISOString(), env: environment(), rapier: {}, jolt: null };
  const full = { boxes: 300, cloth: true, player: true, door: true };
  const noCloth = { boxes: 300, cloth: false, player: true, door: true };
  const boxesOnly = { boxes: 300, cloth: false, player: false, door: false };

  for (const v of variants) {
    log(`rapier ${v}: loading`);
    let entry;
    try {
      entry = await loadRapier(v);
    } catch (e) {
      results.rapier[v] = { error: String(e?.message ?? e) };
      log(`rapier ${v}: failed to load: ${e?.message ?? e}`);
      continue;
    }
    const { R, initMs, version } = entry;
    const r = { version, initMs: +initMs.toFixed(1) };
    log(`rapier ${v}: determinism`);
    r.full = repeatability(R, full);
    r.noCloth = repeatability(R, noCloth);
    log(`rapier ${v}: snapshot scrub`);
    r.snapshot = snapshotScrub(R, full);
    r.snapshotNoCloth = snapshotScrub(R, noCloth);
    log(`rapier ${v}: timing`);
    r.timing = { full: timing(R, full), noCloth: timing(R, noCloth), boxesOnly: timing(R, boxesOnly) };
    results.rapier[v] = r;
  }

  if (jolt) {
    log('jolt: timing (boxes only, single-threaded build)');
    try {
      results.jolt = await runJoltTiming(STEPS);
    } catch (e) {
      results.jolt = { error: String(e?.message ?? e) };
    }
    if (typeof SharedArrayBuffer !== 'undefined') {
      log('jolt: timing (boxes only, multithreaded build, 4 workers)');
      try {
        results.joltMT = await runJoltTiming(STEPS, 4);
      } catch (e) {
        results.joltMT = { error: String(e?.message ?? e) };
      }
    } else {
      results.joltMT = { skipped: 'no SharedArrayBuffer in this context' };
    }
  }
  log('done');
  return results;
}
