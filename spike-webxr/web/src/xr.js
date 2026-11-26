// Targets 3 and 5 through a real WebXR session, on an emulated headset: IWER (Meta's Immersive Web Emulation Runtime,
// MIT, iwer 2.8.0) installed over navigator.xr, a Meta Quest Pro profile (hands, gaze), three's XRManager on the render
// host's 'webgl-fallback' backend (a WebGPURenderer on three's WebGL2 backend drawing MToonNodeMaterial), because no
// runtime here has XRGPUBinding, which three's WebGPU-backend XR needs. Emulated, not measured on a headset: the views,
// frame rate and hands are IWER's, the presented rate is the page's requestAnimationFrame.
//
//   1. the session: modes, features, views per frame, their projections, frame rates (asked for 90)
//   2. the cafe drawn through the XR camera for 300 steps, the head on a rig outside the tree (presentation only)
//   3. hands and gaze: a script pinches and drags the emulated hands; XRHandsDevice (xr-input.js) turns them into the
//      input service's actions and a gaze choice; the input is recorded, then replayed in a fresh world with no XR at
//      all, and every step's hash is compared with the session's
//   ?camera=tree   hand three the tree's own Camera node instead of the rig (three writes the head pose into it)
import { XRDevice, metaQuestPro } from 'iwer';
import { Group, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { RenderHost } from '@vrmxg/render';
import { q, run, stats } from './report.js';
import { buildWorld, envNodes, worldHashes, hashValue } from './world.js';
import { XRHandsDevice } from './xr-input.js';

const STEPS = Number(q.get('steps') ?? 300), CAMERA = q.get('camera') ?? 'rig';
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms} ms`)), ms))]);

/** The emulated hands, by XR frame: left pinch-drag forward then right, right pinches (with gaze) twice. */
function script(device, f, home) {
  const L = device.hands.left, R = device.hands.right;
  const lp = (f >= 20 && f < 140) || (f >= 170 && f < 250), rp = (f >= 145 && f < 160) || (f >= 260 && f < 275);
  L.updatePinchValue(lp ? 1 : 0); R.updatePinchValue(rp ? 1 : 0);
  const k = f < 140 ? Math.min(1, Math.max(0, (f - 20) / 30)) : 0, j = f >= 170 && f < 250 ? Math.min(1, (f - 170) / 30) : 0;
  L.position.set(home.left[0] + j * 0.08, home.left[1], home.left[2] - k * 0.08);
}


/** A 5 x 5 grid of RGBA pixels inside each eye's viewport of the session's WebGL layer, and what they say. */
function readEyes(renderer, session, pose, f) {
  const gl = renderer.backend?.gl, layer = session.renderState.baseLayer;
  if (!gl || !layer) return { frame: f, error: `no ${gl ? 'base layer' : 'WebGL context'}` };
  const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, layer.framebuffer ?? null);
  const px = new Uint8Array(4), eyes = {};
  for (const v of pose.views) {
    const vp = layer.getViewport(v), grid = [];
    for (let j = 1; j <= 5; j++) for (let i = 1; i <= 5; i++) { gl.readPixels(vp.x + Math.floor((vp.width * i) / 6), vp.y + Math.floor((vp.height * j) / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); grid.push([...px]); }
    const lum = grid.map((p) => (p[0] + p[1] + p[2]) / 3);
    eyes[v.eye] = { viewport: [vp.x, vp.y, vp.width, vp.height], distinct: new Set(grid.map((p) => p.join(','))).size, meanLum: +(lum.reduce((a, b) => a + b, 0) / lum.length).toFixed(1), allBlackOrClear: grid.every((p) => p[0] + p[1] + p[2] === 0), grid };
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev);
  const L = eyes.left?.grid, R = eyes.right?.grid;
  return { frame: f, eyes, leftRightDiffer: !!(L && R) && L.some((p, k) => p.join() !== R[k].join()), framebuffer: layer.framebuffer ? 'layer' : 'default' };
}

run('xr', async () => {
  const device = new XRDevice(metaQuestPro, { stereoEnabled: true });
  device.installRuntime({ forceInstall: true }); // Chromium has a native navigator.xr (no immersive device behind it)
  device.primaryInputMode = 'hand';
  const xr = /** @type {any} */ (navigator).xr;
  const r = { device: device.name, iwer: '2.8.0', supported: {}, session: null, frames: null, hands: null, replay: null };
  for (const m of ['inline', 'immersive-vr', 'immersive-ar']) r.supported[m] = await xr.isSessionSupported(m);

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
  const host = await RenderHost.create({ canvas, backend: 'webgl-fallback', dprCap: 1 });
  const { tree, input } = await buildWorld({ replay: false, extraNodes: envNodes(), mtoonMaterial: host.mtoonMaterial });
  const hands = new XRHandsDevice();
  input.addDevice(hands);
  host.attach(tree); host.resize(1280, 720); host.interpolate = true;

  // the head rig: presentation only, outside the tree, 1.8 m behind Mira looking the way she faces
  const rig = new Group(); rig.userData.presentation = true; host.scene.add(rig);
  const head = new PerspectiveCamera(70, 1, 0.05, 100); rig.add(head);
  const miraObj = tree.find('mira').object3d;
  const placeRig = () => { const p = miraObj.getWorldPosition(new Vector3()); rig.position.set(p.x, 0, p.z + 2.2); };
  placeRig();
  host.camera = CAMERA === 'tree' ? null : head;

  const renderer = host.renderer;
  renderer.xr.enabled = true;
  const session = await timeout(xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'gaze-tracking'] }), 10000, 'requestSession');
  await renderer.xr.setSession(session);
  const ref = renderer.xr.getReferenceSpace();
  let rate = null;
  try { if (session.updateTargetFrameRate) { await session.updateTargetFrameRate(90); rate = { asked: 90, got: session.frameRate ?? null }; } } catch (e) { rate = { asked: 90, error: String(e?.message ?? e) }; }
  r.session = { mode: 'immersive-vr', enabledFeatures: session.enabledFeatures ?? null, supportedFrameRates: session.supportedFrameRates ? [...session.supportedFrameRates] : null, targetFrameRate: rate, presenting: renderer.xr.isPresenting, glBinding: !!renderer.xr.getBinding?.(), webgpuSession: renderer.xr._isWebGPUSession?.() ?? null };

  const home = { left: device.hands.left.position.toArray?.() ?? [-0.15, 1.2, -0.3], right: device.hands.right.position.toArray?.() ?? [0.15, 1.2, -0.3] };
  // node ids by object, for the gaze ray's hit
  const owner = new Map();
  const walk = (n) => { if (n?.object3d) n.object3d.traverse((o) => { if (!owner.has(o)) owner.set(o, n.id); }); for (const c of n?.children ?? []) walk(c); };
  for (const id of ['mira', 'hana-1', 'entrance', 'side-door']) { const n = tree.find(id); if (n) n.object3d.traverse((o) => owner.set(o, id)); }
  walk(tree.root);
  const ray = new Raycaster();
  const choices = [], hashes = [], intervals = [], views = [], pixels = [];
  let f = 0, last = null;
  const recordedFrom = tree.clock.step;
  input.record();
  await timeout(new Promise((done, fail) => {
    renderer.setAnimationLoop((t, frame) => {
      try {
        if (!frame) return;
        if (last !== null) intervals.push(t - last);
        script(device, f, home);
        const pose = frame.getViewerPose(ref);
        if (pose && views.length < 3) views.push(pose.views.map((v) => ({ eye: v.eye, projection: [0, 5, 8, 9].map((i) => +v.projectionMatrix[i].toFixed(4)), x: +v.transform.position.x.toFixed(4) })));
        const { selectStarted } = hands.update(frame, ref, session);
        if (selectStarted) { // the gaze ray, in the world: the rig is where the reference space sits
          const g = hands.rays.get('gaze') ?? hands.rays.get('transient-pointer');
          if (g) {
            rig.updateMatrixWorld(true);
            const o = new Vector3(...g.origin).applyMatrix4(rig.matrixWorld), d = new Vector3(...g.direction).transformDirection(rig.matrixWorld);
            ray.set(o, d);
            const hit = ray.intersectObject(tree.root.object3d, true).find((h) => owner.has(h.object) && owner.get(h.object) !== 'root');
            const id = hit ? owner.get(hit.object) : null;
            if (id) input.choose('xr.target', id);
            choices.push({ frame: f, step: tree.clock.step, target: id, distance: hit ? +hit.distance.toFixed(3) : null });
          } else choices.push({ frame: f, step: tree.clock.step, target: null, ray: 'none' });
        }
        host.frame(last === null ? 1 / 60 : Math.min(0.1, (t - last) / 1000), () => hashes.push(hashValue(worldHashes(tree))));
        // what the session drew: at three frames, a 5 x 5 grid of pixels inside each eye's viewport of the XR layer,
        // read back in the frame callback right after the draw (the layer's framebuffer, before it is composited)
        if ((f === 60 || f === 150 || f === 240) && pose) pixels.push(readEyes(renderer, session, pose, f));
        last = t; f++;
        if (tree.clock.step - recordedFrom >= STEPS) { renderer.setAnimationLoop(null); done(); }
      } catch (e) { renderer.setAnimationLoop(null); fail(e); }
    });
  }), 120000, 'the XR frame loop');
  const rec = input.stop();
  await session.end().catch(() => {});

  r.pixels = pixels.map(({ eyes, ...x }) => ({ ...x, eyes: Object.fromEntries(Object.entries(eyes ?? {}).map(([k, e]) => [k, { viewport: e.viewport, distinct: e.distinct, meanLum: e.meanLum, allBlackOrClear: e.allBlackOrClear, centre: e.grid[12] }])) }));
  r.frames = { xrFrames: f, steps: hashes.length, intervalMs: stats(intervals), firstViews: views, presentedHzOnThisDisplay: intervals.length ? +(1000 / stats(intervals).p50).toFixed(1) : null };
  const latched = rec.frames ?? [];
  r.hands = {
    inputSources: [...hands.seen].sort(), jointsPerHand: hands.jointsPerHand, rightPinches: hands.selectStarts, choices,
    recording: { version: rec.version, start: rec.start, frames: latched.length, bytes: JSON.stringify(rec).length },
    mira: (() => { const p = miraObj.position; return [p.x, p.y, p.z].map((v) => +v.toFixed(4)); })(),
  };

  // replay: a fresh world, no XR, no devices, the recording; every step's hash against the session's
  const B = await buildWorld({ replay: false, extraNodes: envNodes(), mtoonMaterial: host.mtoonMaterial });
  while (B.tree.clock.step < recordedFrom) { while (!B.tree.step()) await B.tree.settle(); }
  B.input.replay(rec);
  const again = [];
  for (let k = 0; k < hashes.length; k++) { while (!B.tree.step()) await B.tree.settle(); again.push(hashValue(worldHashes(B.tree))); }
  const first = again.findIndex((h, k) => h !== hashes[k]);
  // and the same steps with no input at all: the hands must have moved something
  const C = await buildWorld({ replay: false, extraNodes: envNodes(), mtoonMaterial: host.mtoonMaterial });
  for (let k = 0; k < recordedFrom + hashes.length; k++) { while (!C.tree.step()) await C.tree.settle(); }
  r.replay = { steps: again.length, sameEveryStep: first < 0, firstDiff: first < 0 ? null : first + 1, final: hashes.at(-1), idleFinal: hashValue(worldHashes(C.tree)), handsChangedTheWorld: hashValue(worldHashes(C.tree)) !== hashes.at(-1) };
  r.camera = CAMERA;
  return r;
});
