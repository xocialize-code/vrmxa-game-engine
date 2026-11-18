// The render host on the cafe (the W6 harness's world and recorded input), for W5's acceptance:
//   ?mode=trace  (default) three runs of the 600 recorded steps: headless, rendered at a 120 Hz frame
//                rate with interpolation, and without; per-step simulation hashes compared; Mira's rendered
//                position traced per frame; then a live requestAnimationFrame run to measure the display.
//   ?mode=live   play it live with keyboard / mouse / gamepad (WASD, Shift, Space, C; F1 debug draw)
//   &debug=1     debug draw on (colliders, sensors, capsules, rays)    &shot=N  end on step N for a screenshot
//   &components=1  include the headless run's per-step component hashes (compare runtimes with compareRuns)
//   &stub=1 skip texture decoding   &bare=1 the harness cafe without the demo's Environment, lamp and overview camera
//   &headlessOnly=1 only the headless run
// window.__result, __errors, __warnings and READY for the runners (chromium.mjs, wkwebview.sh).
import { loadRapier } from '@vrmxg/physics';
import { KeyboardDevice, MouseDevice, GamepadDevice } from '@vrmxg/input';
import { RenderHost } from '@vrmxg/render';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { loadAssets, buildWorld, pack } from '../../snapshot/harness/world.js';

window.__errors = []; window.__warnings = [];
const origError = console.error, origWarn = console.warn;
console.error = (...a) => { window.__errors.push(a.map(String).join(' ')); origError(...a); };
console.warn = (...a) => { window.__warnings.push(a.map(String).join(' ')); origWarn(...a); };
addEventListener('error', (e) => window.__errors.push(`${e.message} @${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => window.__errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'trace', debug = q.get('debug') === '1', shot = Number(q.get('shot') ?? 100);
const out = document.getElementById('out'), canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const files = { bytes: async (p) => new Uint8Array(await (await fetch(`models/${p}`)).arrayBuffer()), json: async (p) => (await fetch(`models/${p}`)).json() };
const ENV = [
  { id: 'env', type: 'Environment', parent: 'root', props: { background: 'gradient', ground: true, groundColor: '#b9ab98', fog: 'linear', fogNear: 14, fogFar: 60 } },
  { id: 'overview', type: 'Camera', parent: 'root', transform: { p: [5.5, 4.2, 11] }, props: { preset: 'fixed', target: 'mira', focalLength: 22 } },
  { id: 'lamp', type: 'SpotLight', parent: 'root', transform: { p: [0, 3, 5], q: [-0.5, 0, 0, 0.866] }, props: { intensity: 25, angle: 35, range: 9, castShadow: true, shadowPreset: 'low' } },
];
const R = await loadRapier();
const assets = await loadAssets(files);

const host = new RenderHost({ canvas, preserveDrawingBuffer: true });
window.__host = host; // for inspection
const size = () => host.resize(innerWidth, innerHeight);
addEventListener('resize', size);
const stub = q.get('stub') === '1', bare = q.get('bare') === '1';
const world = async (replay = true) => buildWorld(R, assets, { stubTextures: stub, extraNodes: bare ? [] : ENV, replay });

async function rendered(interpolate) {
  const w = await world();
  host.interpolate = interpolate;
  host.attach(w.tree); size();
  host.debug.set(debug);
  const hashes = [], xs = [], renderMs = [], mira = w.tree.find('mira').object3d, v = mira.position.clone();
  host.onPresent = () => { mira.getWorldPosition(v); xs.push([w.tree.clock.step, v.x, v.z]); };
  while (w.tree.clock.step < 600) {
    host.frame(1 / 120, () => hashes.push(hashValue(worldHashes(w.tree))));
    renderMs.push(host.last.renderMs);
  }
  host.onPresent = null;
  return { w, hashes, xs, renderMs };
}

// Mira's per-frame movement while she walks steadily to the door (steps 40 to 100).
function smoothness(xs) {
  const seg = xs.filter(([s]) => s >= 40 && s < 100), d = [];
  for (let i = 1; i < seg.length; i++) d.push(Math.hypot(seg[i][1] - seg[i - 1][1], seg[i][2] - seg[i - 1][2]));
  const mean = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) * (b - mean), 0) / d.length);
  return { frames: d.length, meanMm: +(mean * 1000).toFixed(3), cv: +(sd / mean).toFixed(4), stillFrames: d.filter((x) => x < 1e-6).length, sample: d.slice(0, 8).map((x) => +(x * 1000).toFixed(2)) };
}
const stats = (s) => { const a = [...s].sort((x, y) => x - y); return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3), p50: +a[a.length >> 1].toFixed(3), p95: +a[Math.floor(a.length * 0.95)].toFixed(3) }; };

async function trace() {
  // 1. headless
  const H = await world();
  const headless = [], components = [];
  for (let k = 0; k < 600; k++) { H.tree.step(); const h = worldHashes(H.tree); components.push({ step: H.tree.clock.step, h }); headless.push(hashValue(h)); }
  if (q.get('headlessOnly') === '1') return { headlessRun: pack(components), hashes: { headlessFinal: headless.at(-1) } };
  // 2-3. rendered, with and without interpolation
  const on = await rendered(true), off = await rendered(false);
  const firstDiff = (a) => { const i = a.findIndex((h, k) => h !== headless[k]); return i < 0 ? null : i + 1; };
  // 4. live: requestAnimationFrame for 2 s on a fresh world, interpolation on
  const L = await world();
  host.interpolate = true; host.attach(L.tree); size();
  const intervals = [], stepsPer = {};
  await new Promise((done) => {
    let last = null, t0 = null;
    const tick = (t) => {
      if (last !== null) { const dt = (t - last) / 1000; intervals.push(t - last); const { steps } = host.frame(dt); stepsPer[steps] = (stepsPer[steps] ?? 0) + 1; }
      last = t; t0 ??= t;
      if (t - t0 < 2000) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  // 5. the screenshot frame: the cafe at step `shot`, debug draw as asked, between steps
  const S = await world();
  host.interpolate = true; host.attach(S.tree); size(); host.debug.set(debug);
  while (S.tree.clock.step < shot) host.frame(1 / 120);
  S.tree.find('overview').call('makeCurrent'); // after the run: a wide view for the picture
  host.frame(1 / 120);
  const physics = S.tree.services.get('physics');
  return {
    ...(q.get('components') === '1' ? { headlessRun: pack(components) } : {}),
    hashes: { steps: 600, headlessFinal: headless.at(-1), interpolatedSame: firstDiff(on.hashes) === null, plainSame: firstDiff(off.hashes) === null, firstDiffInterpolated: firstDiff(on.hashes), firstDiffPlain: firstDiff(off.hashes) },
    smoothness120: { interpolated: smoothness(on.xs), plain: smoothness(off.xs) },
    renderMs: { interpolated: stats(on.renderMs), plain: stats(off.renderMs) },
    live: { frames: intervals.length, intervalMs: stats(intervals), displayHz: +(1000 / stats(intervals).p50).toFixed(1), stepsPerFrame: stepsPer },
    debug: { ...host.debug.counts(), physicsColliders: physics.colliders.size, sensors: [...host.debug.wires.values()].filter((x) => x.kind === 'sensor').map((x) => x.line.userData.node).sort() },
    renderer: { calls: host.renderer.info.render.calls, triangles: host.renderer.info.render.triangles, programs: host.renderer.info.programs?.length, dpr: host.renderer.getPixelRatio() },
  };
}

async function live() {
  const w = await world(false);
  w.input.addDevice(new KeyboardDevice()).attach(window); w.input.addDevice(new MouseDevice()).attach(canvas); w.input.addDevice(new GamepadDevice());
  host.attach(w.tree); size(); host.debug.set(debug);
  addEventListener('keydown', (e) => { if (e.code === 'F1') { e.preventDefault(); host.debug.set(!host.debug.enabled); } });
  let last = null;
  const tick = (t) => { if (last !== null) host.frame(Math.min(0.25, (t - last) / 1000)); last = t; out.textContent = `step ${w.tree.clock.step}  α ${host.last.alpha.toFixed(2)}  render ${host.last.renderMs.toFixed(2)} ms  F1 debug`; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

try {
  if (mode === 'live') await live();
  else {
    const result = await trace();
    window.__result = { mode, debug, ua: navigator.userAgent, ...result };
    const h = result.hashes, sm = result.smoothness120;
    out.textContent = `hashes headless = interpolated ${h.interpolatedSame} = plain ${h.plainSame}   120 Hz motion cv ${sm.interpolated.cv} (plain ${sm.plain.cv})   debug ${result.debug.colliders}+${result.debug.sensors.length}+${result.debug.capsules} of ${result.debug.physicsColliders}`;
  }
} catch (e) { window.__errors.push(String(e?.stack ?? e)); out.textContent = String(e?.stack ?? e); }
window.READY = true;
