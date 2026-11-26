// A native immersive session, for a browser that has one (Safari on visionOS): no emulator here. A tap on the button
// starts it (WebXR needs a user activation); optional features 'webgpu' (the WebXR/WebGPU binding three r187 needs for
// XR on its WebGPU backend), 'hand-tracking' and 'local-floor'. The render host is made after the grant: WebGPU when
// the session has 'webgpu' and the page has XRGPUBinding, else 'webgl-fallback'. Then the cafe is stepped at 60 Hz with
// interpolation through three's XRManager for ?seconds=10, and the page reports:
//   what was granted, the binding, the views (count, projections, eye offsets), frame rates (supported, asked 90,
//   what came), XR frame intervals, input sources and select events (in the simulator a click is a pinch), spot pixels
//   on WebGL, hashes against a headless run of the same steps, and errors.
// ?report=<name> sends it to scripts/serve.mjs. ?backend=webgl-fallback forces the WebGL2 path; ?webgpu=0 doesn't ask.
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { RenderHost } from '@vrmxg/render';
import { q, run, stats, out } from './report.js';
import { buildWorld, envNodes, worldHashes, hashValue } from './world.js';
import { readEyes } from './xr-pixels.js';

const SECONDS = Number(q.get('seconds') ?? 10), ASK_WEBGPU = q.get('webgpu') !== '0', FORCE = q.get('backend');
const button = /** @type {HTMLButtonElement} */ (document.getElementById('go'));
const xr = /** @type {any} */ (navigator).xr;
const settle = (p) => p.then((v) => ({ ok: v }), (e) => ({ error: `${e?.name ?? 'Error'}: ${e?.message ?? e}` }));

const pre = { xr: typeof xr, XRGPUBinding: typeof self.XRGPUBinding, XRWebGLBinding: typeof self.XRWebGLBinding, gpu: typeof navigator.gpu, supported: {} };
if (xr) for (const m of ['inline', 'immersive-vr', 'immersive-ar']) pre.supported[m] = await settle(xr.isSessionSupported(m));
out.textContent = JSON.stringify(pre);

// the session starts in the click handler (user activation); everything after it is the page's run()
const granted = new Promise((resolve) => {
  button.onclick = () => {
    button.disabled = true;
    const optionalFeatures = [...(ASK_WEBGPU ? ['webgpu'] : []), 'hand-tracking', 'local-floor'];
    resolve(settle(xr.requestSession('immersive-vr', { optionalFeatures })).then((s) => ({ ...s, optionalFeatures })));
  };
});
button.disabled = !xr; button.textContent = xr ? 'Enter VR' : 'no navigator.xr';

run('immersive', async () => {
  if (!xr) return { pre, failed: 'no navigator.xr' };
  const g = await granted;
  if (!g.ok) return { pre, asked: g.optionalFeatures, failed: `requestSession: ${g.error}` };
  const session = g.ok, events = [];
  const r = { pre, asked: g.optionalFeatures, enabledFeatures: session.enabledFeatures ?? null, environmentBlendMode: session.environmentBlendMode, supportedFrameRates: session.supportedFrameRates ? [...session.supportedFrameRates] : null, frameRate: session.frameRate ?? null };
  for (const t of ['selectstart', 'select', 'selectend', 'squeezestart', 'inputsourceschange']) session.addEventListener(t, (e) => events.push({ t, ms: Math.round(performance.now()), mode: e.inputSource?.targetRayMode ?? null, hand: !!e.inputSource?.hand, handedness: e.inputSource?.handedness ?? null, added: e.added?.length, removed: e.removed?.length }));
  let ended = null;
  session.addEventListener('end', () => { ended ??= Math.round(performance.now()); });
  try { if (session.updateTargetFrameRate) { await session.updateTargetFrameRate(90); r.targetFrameRate = { asked: 90, got: session.frameRate ?? null }; } else r.targetFrameRate = 'no updateTargetFrameRate'; } catch (e) { r.targetFrameRate = { asked: 90, error: String(e?.message ?? e) }; }

  const useWebGPU = !FORCE && (session.enabledFeatures ?? []).includes('webgpu') && typeof self.XRGPUBinding !== 'undefined';
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
  const host = await RenderHost.create({ canvas, backend: FORCE ?? (useWebGPU ? 'webgpu' : 'webgl-fallback'), dprCap: 1 });
  r.backend = host.backend;
  const { tree } = await buildWorld({ extraNodes: envNodes(), mtoonMaterial: host.mtoonMaterial });
  host.attach(tree); host.interpolate = true;
  const rig = new Group(); rig.userData.presentation = true; host.scene.add(rig);
  const head = new PerspectiveCamera(70, 1, 0.05, 100); rig.add(head);
  rig.position.set(0, 0, 7.5); host.camera = head; // where the overview camera looks from, at floor height
  const renderer = host.renderer;
  renderer.xr.enabled = true;
  const t0 = performance.now();
  await renderer.xr.setSession(session);
  r.setSessionMs = Math.round(performance.now() - t0);
  r.webgpuSession = renderer.xr._isWebGPUSession?.() ?? null;
  const ref = renderer.xr.getReferenceSpace();
  const hashes = [], intervals = [], views = [], pixels = [], sources = new Set();
  let f = 0, last = null;
  await new Promise((done, fail) => {
    const stop = setTimeout(() => { renderer.setAnimationLoop(null); done(); }, SECONDS * 1000 + 20000);
    renderer.setAnimationLoop((t, frame) => {
      try {
        if (!frame) return;
        if (last !== null) intervals.push(t - last);
        const pose = frame.getViewerPose(ref);
        if (pose && views.length < 2) views.push(pose.views.map((v) => ({ eye: v.eye, projection: [0, 5, 8, 9].map((i) => +v.projectionMatrix[i].toFixed(4)), offset: [v.transform.position.x, v.transform.position.y, v.transform.position.z].map((x) => +x.toFixed(4)) })));
        for (const s of session.inputSources) sources.add(`${s.handedness}:${s.targetRayMode}${s.hand ? `:hand(${s.hand.size})` : ''}${s.gamepad ? ':gamepad' : ''}`);
        host.frame(last === null ? 1 / 60 : Math.min(0.1, (t - last) / 1000), () => hashes.push(hashValue(worldHashes(tree))));
        if (!host.backend.startsWith('webgpu') && (f === 30 || f === 300) && pose) pixels.push(readEyes(renderer, session, pose, f));
        last = t; f++;
        out.textContent = `frame ${f} step ${tree.clock.step} ${host.backend}`;
        if (performance.now() - t0 > SECONDS * 1000 || ended) { clearTimeout(stop); renderer.setAnimationLoop(null); done(); }
      } catch (e) { clearTimeout(stop); renderer.setAnimationLoop(null); fail(e); }
    });
  });
  if (!ended) await settle(session.end());
  r.frames = { xrFrames: f, steps: hashes.length, intervalMs: stats(intervals), hz: intervals.length ? +(1000 / stats(intervals).p50).toFixed(1) : null, views, endedEarlyAtMs: ended };
  r.inputSources = [...sources].sort(); r.events = events; r.pixels = pixels.map(({ eyes, ...x }) => ({ ...x, eyes: Object.fromEntries(Object.entries(eyes ?? {}).map(([k, e]) => [k, { viewport: e.viewport, distinct: e.distinct, meanLum: e.meanLum, allBlackOrClear: e.allBlackOrClear }])) }));
  // the same steps headless: the session's drawing must not have moved the simulation
  const H = await buildWorld({ extraNodes: envNodes(), mtoonMaterial: host.mtoonMaterial }), again = [];
  for (let k = 0; k < hashes.length; k++) { while (!H.tree.step()) await H.tree.settle(); again.push(hashValue(worldHashes(H.tree))); }
  const first = again.findIndex((h, k) => h !== hashes[k]);
  r.hashes = { steps: hashes.length, sameAsHeadless: first < 0, firstDiff: first < 0 ? null : first + 1, final: hashes.at(-1) ?? null };
  return r;
});
