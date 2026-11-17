// The spike's measurements. Pure JS: runs in Node (scripts/node-tests.mjs), in a browser and in the
// WKWebView wrapper (?autorun=1), and returns one plain JSON object. Two backends, same scenarios.
import { navInput, AGENT, JUMP_LINK } from './geometry.js';
import { rng } from './level.js';
import { createRecastBackend } from './nav-recast.js';
import { createNavcatBackend } from './nav-navcat.js';
import { loadRapier, createCoupled } from './coupled.js';
import { hashState, stats, randomNavPoint, rngState, cloneDeep } from './util.js';

export { hashState, stats, randomNavPoint };

export const DT = 1 / 60;
const STEPS = 600;
const SEED = 20261117;
const DOOR_CLOSE_AT = 200, DOOR_OPEN_AT = 400;

/**
 * The crowd scenario: n agents at seeded random points, each walking to a seeded random target and
 * getting a new one on arrival; the door closes at step 200 and opens at 400. Returns per-step
 * crowd.update() times, the final position hash and how many targets were reached.
 */
export function runCrowd(be, n, { steps = STEPS, time = true } = {}) {
  be.crowdCreate(Math.max(n, 1));
  const rand = rng(SEED + n);
  const targets = [];
  for (let i = 0; i < n; i++) {
    be.addAgent(randomNavPoint(be, rand));
    targets.push(randomNavPoint(be, rand));
    be.setTarget(i, targets[i]);
  }
  const samples = [];
  const p = [0, 0, 0];
  let arrivals = 0, doorMs = [];
  for (let s = 0; s < steps; s++) {
    if (s === DOOR_CLOSE_AT) doorMs.push(be.setDoor(true).ms);
    if (s === DOOR_OPEN_AT) doorMs.push(be.setDoor(false).ms);
    const t0 = time ? performance.now() : 0;
    be.step(DT);
    if (time) samples.push(performance.now() - t0);
    for (let i = 0; i < n; i++) {
      be.getPosition(i, p);
      const dx = p[0] - targets[i][0], dz = p[2] - targets[i][2];
      if (dx * dx + dz * dz < 0.36) {
        arrivals++;
        targets[i] = randomNavPoint(be, rand);
        be.setTarget(i, targets[i]);
      }
    }
  }
  if (be.setDoor) be.setDoor(false);
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { be.getPosition(i, p); out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2]; }
  return { hash: hashState(out), arrivals, timing: time ? stats(samples) : null, doorMs };
}

function crowdScrub(be, n) {
  be.crowdCreate(n);
  const rand = rngState(SEED + 7);
  const st = { targets: [] };
  for (let i = 0; i < n; i++) { be.addAgent(randomNavPoint(be, rand)); st.targets.push(randomNavPoint(be, rand)); be.setTarget(i, st.targets[i]); }
  const p = [0, 0, 0];
  const step = (s) => {
    if (s === 350) be.setDoor(true);
    if (s === 450) be.setDoor(false);
    be.step(DT);
    for (let i = 0; i < n; i++) {
      be.getPosition(i, p);
      const dx = p[0] - st.targets[i][0], dz = p[2] - st.targets[i][2];
      if (dx * dx + dz * dz < 0.36) { st.targets[i] = randomNavPoint(be, rand); be.setTarget(i, st.targets[i]); }
    }
  };
  const hash = () => { const o = new Float64Array(n * 3); for (let i = 0; i < n; i++) { be.getPosition(i, p); o.set(p, i * 3); } return hashState(o); };
  for (let s = 0; s < 300; s++) step(s);
  const t0 = performance.now();
  const snap = { nav: be.snapshot(), rng: { ...rand.state }, st: cloneDeep(st) };
  const takeMs = performance.now() - t0;
  for (let s = 300; s < 600; s++) step(s);
  const a = hash();
  const t1 = performance.now();
  be.restore(snap.nav); rand.state.a = snap.rng.a; st.targets = cloneDeep(snap.st).targets;
  const restoreMs = performance.now() - t1;
  for (let s = 300; s < 600; s++) step(s);
  const b = hash();
  return { supported: true, identical: a === b, hashA: a, hashB: b, takeMs: +takeMs.toFixed(2), restoreMs: +restoreMs.toFixed(2), jsonBytes: JSON.stringify(snap.nav, (k, v) => (typeof v === 'function' ? undefined : v)).length };
}

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

async function suiteFor(make, R, log, sizes) {
  const be = make();
  const r = { library: be.name, version: be.version };
  log(`${be.name}: init`);
  r.initMs = +(await be.init()).toFixed(2);
  const input = navInput();
  r.input = { triangles: input.indices.length / 3, vertices: input.positions.length / 3 };

  // Bake: the first (cold, includes JIT warm-up for the JS library) and the median of 5 after.
  log(`${be.name}: bake`);
  const soloRuns = [], tiledRuns = [];
  for (let k = 0; k < 6; k++) soloRuns.push(be.bakeSolo(input));
  for (let k = 0; k < 6; k++) tiledRuns.push(be.bake(input));
  r.bake = {
    solo: { coldMs: +soloRuns[0].ms.toFixed(2), warmMedianMs: +median(soloRuns.slice(1).map((x) => x.ms)).toFixed(2), polys: soloRuns[0].polys },
    tiled: { coldMs: +tiledRuns[0].ms.toFixed(2), warmMedianMs: +median(tiledRuns.slice(1).map((x) => x.ms)).toFixed(2), polys: tiledRuns[0].polys, tiles: tiledRuns[0].tiles },
  };
  r.debugTriangles = be.debugTriangles().indices.length / 3;

  // Door: path through the doorway, then blocked, then reopened; 10 close/open cycles timed.
  log(`${be.name}: door`);
  const a = [0, 0, 4], b = [0, 0, -10];
  const lens = { open: be.pathLength(a, b) };
  be.setDoor(true); lens.closed = be.pathLength(a, b);
  be.setDoor(false); lens.reopened = be.pathLength(a, b);
  const closeMs = [], openMs = [];
  let updates = 0;
  for (let k = 0; k < 10; k++) {
    const c = be.setDoor(true); closeMs.push(c.ms); updates = c.updates;
    openMs.push(be.setDoor(false).ms);
  }
  r.door = {
    pathLength: Object.fromEntries(Object.entries(lens).map(([k, x]) => [k, x === null ? null : +x.toFixed(3)])),
    closeMs: stats(closeMs), openMs: stats(openMs), tilesTouched: updates,
  };

  // Off-mesh link: a one-way jump down from the stairs. Baked in (both), then at run time (navcat).
  log(`${be.name}: off-mesh link`);
  {
    const la = JUMP_LINK.start, lb = JUMP_LINK.end;
    be.bake(input);
    const link = { without: be.pathLength(la, lb) };
    const tb = performance.now();
    be.bake(input, { links: [JUMP_LINK] });
    link.bakeWithLinkMs = +(performance.now() - tb).toFixed(2);
    link.baked = be.pathLength(la, lb);
    link.bakedReverse = be.pathLength(lb, la);
    if (be.addLink) {
      be.bake(input);
      const t0 = performance.now(); const id = be.addLink(JUMP_LINK); link.runtimeAddMs = +(performance.now() - t0).toFixed(4);
      link.runtime = be.pathLength(la, lb);
      const t1 = performance.now(); be.removeLink(id); link.runtimeRemoveMs = +(performance.now() - t1).toFixed(4);
      link.afterRemove = be.pathLength(la, lb);
    } else link.runtime = 'not supported on a tile-cache navmesh';
    for (const k of Object.keys(link)) if (typeof link[k] === 'number' && !k.endsWith('Ms')) link[k] = +link[k].toFixed(3);
    r.offMeshLink = link;
    be.bake(input);
  }

  // Path query cost: 200 seeded random pairs.
  {
    const rand = rng(SEED);
    const pairs = [];
    for (let k = 0; k < 200; k++) pairs.push([randomNavPoint(be, rand), randomNavPoint(be, rand)]);
    for (const [p, q] of pairs.slice(0, 50)) be.pathLength(p, q); // warm-up
    const t0 = performance.now();
    let found = 0;
    for (const [p, q] of pairs) if (be.pathLength(p, q) !== null) found++;
    r.pathQuery = { pairs: pairs.length, found, meanMs: +((performance.now() - t0) / pairs.length).toFixed(4) };
  }

  // Crowd: warm-up run, then timed runs; determinism = the same run twice in this runtime.
  r.crowd = {};
  for (const n of sizes) {
    log(`${be.name}: crowd ${n}`);
    // Re-bake before every run so each starts from the same navmesh state (tile salts, obstacles).
    be.bake(input); runCrowd(be, n, { steps: 120, time: false });
    be.bake(input); const first = runCrowd(be, n);
    be.bake(input); const again = runCrowd(be, n, { time: false });
    r.crowd[n] = { ...first, repeatable: first.hash === again.hash };
  }

  // Snapshot/restore of the crowd (timeline scrubbing): snapshot at 300, run to 600 (A); restore,
  // run 300 again (B). Only possible when the library exposes its crowd state.
  if (be.snapshot) {
    log(`${be.name}: crowd snapshot scrub`);
    be.bake(input);
    r.crowdSnapshot = crowdScrub(be, 50);
  } else {
    r.crowdSnapshot = { supported: false, why: 'dtCrowd state (corridors, path queue, boundaries) lives in WASM; no snapshot API' };
  }

  // Rapier-coupled characters: crowd velocities drive kinematic character controllers.
  if (R) {
    r.coupled = {};
    for (const n of [50, 200]) {
      for (const mode of ['sync', 'free']) {
        log(`${be.name}: coupled ${n} ${mode}`);
        be.bake(input);
        const c1 = createCoupled(R, be, n, { mode, seed: SEED + n });
        const res = c1.run(STEPS);
        c1.free();
        let repeatable = null;
        if (mode === 'sync') {
          be.bake(input);
          const c2 = createCoupled(R, be, n, { mode, seed: SEED + n });
          repeatable = c2.run(STEPS, { time: false }).hash === res.hash;
          c2.free();
        }
        r.coupled[`${n}-${mode}`] = { ...res, repeatable };
      }
    }
  }
  be.destroy();
  return r;
}

export function environment() {
  const g = globalThis;
  return {
    runtime: typeof process !== 'undefined' && process.versions?.node ? `node ${process.versions.node}` : g.navigator?.userAgent ?? 'unknown',
    origin: g.location?.origin ?? null,
    isSecureContext: g.isSecureContext ?? null,
    crossOriginIsolated: g.crossOriginIsolated ?? null,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    timerResolutionMs: timerResolution(),
  };
}

function timerResolution() {
  let min = Infinity, last = performance.now();
  for (let i = 0; i < 200000 && min > 0.0005; i++) {
    const t = performance.now();
    if (t !== last) { min = Math.min(min, t - last); last = t; }
  }
  return +min.toFixed(4);
}

export async function runSuite({ log = () => {}, backends = ['recast', 'navcat'], sizes = [10, 50, 200], rapier = true } = {}) {
  const results = { when: new Date().toISOString(), env: environment(), agent: AGENT, steps: STEPS, seed: SEED, backends: {} };
  let R = null;
  if (rapier) {
    const entry = await loadRapier();
    R = entry.R;
    results.rapier = { version: entry.version, initMs: +entry.initMs.toFixed(1) };
  }
  const makers = { recast: createRecastBackend, navcat: createNavcatBackend };
  for (const name of backends) {
    try {
      results.backends[name] = await suiteFor(makers[name], R, log, sizes);
    } catch (e) {
      results.backends[name] = { error: String(e?.stack ?? e) };
      log(`${name}: failed: ${e?.message ?? e}`);
    }
  }
  log('done');
  return results;
}
