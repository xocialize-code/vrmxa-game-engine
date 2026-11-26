// Target 4: 90 Hz presentation over the 60 Hz step (AB-D-0245: the simulation stays at 60 Hz; frames between steps
// draw the presentation interpolated at α). The render demo's method (engine/packages/render/demo), at 1/90 s a frame
// instead of 1/120, on the WebGPU host with MToonNodeMaterial, and once more drawing both eyes (the stereo page's
// ArrayCamera following the tree's camera) every frame:
//   1. 600 recorded steps headless, hashed after every step
//   2. the same, drawn at a paced 90 Hz with interpolation; 3. without; 4. with interpolation, in stereo
//   per-step hashes compared with (1); Mira's drawn position per frame while she walks (steps 40 to 100)
//   5. requestAnimationFrame for 2 s: what the display actually runs at
// The attached display runs at 60 Hz, and nothing here presents to a headset: "90 Hz" is paced frames (each frame told
// 1/90 s passed), not a presented 90 Hz.
//   ?backend=webgpu|webgl   &w=1280&h=720
import { ArrayCamera, PerspectiveCamera, Vector4, Matrix4 } from 'three';
import { RenderHost } from '@vrmxg/render';
import { q, run, stats } from './report.js';
import { buildWorld, envNodes, worldHashes, hashValue } from './world.js';

const BACKEND = q.get('backend') ?? 'webgpu', W = Number(q.get('w') ?? 1280), H = Number(q.get('h') ?? 720), HZ = Number(q.get('hz') ?? 90);
const IPD = 0.063;

function smoothness(xs) {
  const seg = xs.filter(([s]) => s >= 40 && s < 100), d = [];
  for (let i = 1; i < seg.length; i++) d.push(Math.hypot(seg[i][1] - seg[i - 1][1], seg[i][2] - seg[i - 1][2]));
  const mean = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) * (b - mean), 0) / d.length);
  return { frames: d.length, meanMm: +(mean * 1000).toFixed(3), cv: +(sd / mean).toFixed(4), stillFrames: d.filter((x) => x < 1e-6).length, sample: d.slice(0, 9).map((x) => +(x * 1000).toFixed(2)) };
}

run('present', async () => {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
  const host = await RenderHost.create({ canvas, backend: BACKEND, dprCap: 1 });
  const world = () => buildWorld({ extraNodes: envNodes(), mtoonMaterial: host.mtoonMaterial });

  // 1. headless
  const A = await world(), headless = [];
  for (let k = 0; k < 600; k++) { while (!A.tree.step()) await A.tree.settle(); headless.push(hashValue(worldHashes(A.tree))); }

  // 2 to 4. drawn
  const eyes = [0, 1].map((i) => { const e = new PerspectiveCamera(60, (W / 2) / H, 0.05, 100); e.matrixAutoUpdate = false; e.viewport = new Vector4(i * W / 2, 0, W / 2, H); return e; });
  const stereoCam = new ArrayCamera(eyes); stereoCam.matrixAutoUpdate = false;
  const offset = [new Matrix4().makeTranslation(-IPD / 2, 0, 0), new Matrix4().makeTranslation(IPD / 2, 0, 0)];
  async function drawn(interpolate, stereo = false) {
    const w = await world();
    host.interpolate = interpolate; host.attach(w.tree); host.resize(W, H);
    const hashes = [], xs = [], renderMs = [], alphas = {}, stepsPer = {}, mira = w.tree.find('mira').object3d, v = mira.position.clone();
    host.camera = stereo ? stereoCam : null;
    host.onPresent = (alpha) => {
      mira.getWorldPosition(v); xs.push([w.tree.clock.step, v.x, v.z]);
      const a = alpha.toFixed(4); alphas[a] = (alphas[a] ?? 0) + 1;
      if (stereo) { // the eyes follow the tree's camera as the head would, at this frame's (interpolated) pose
        const cam = w.tree.services.get('cameras')?.current?.camera;
        if (!cam) return;
        cam.updateMatrixWorld(true);
        stereoCam.matrix.copy(cam.matrixWorld); stereoCam.updateMatrixWorld(true);
        eyes.forEach((e, i) => { e.fov = cam.fov; e.near = cam.near; e.far = cam.far; e.updateProjectionMatrix(); e.matrix.copy(cam.matrixWorld).multiply(offset[i]); e.updateMatrixWorld(true); });
        stereoCam.projectionMatrix.copy(eyes[0].projectionMatrix); stereoCam.projectionMatrixInverse.copy(eyes[0].projectionMatrixInverse);
      }
    };
    while (w.tree.clock.step < 600) {
      const { steps } = host.frame(1 / HZ, () => hashes.push(hashValue(worldHashes(w.tree))));
      stepsPer[steps] = (stepsPer[steps] ?? 0) + 1;
      renderMs.push(host.last.renderMs);
      if (host.lost) throw new Error(`device lost: ${JSON.stringify(host.lost)}`);
    }
    host.onPresent = null; host.camera = null;
    return { hashes, xs, renderMs, alphas, stepsPer };
  }
  const on = await drawn(true), off = await drawn(false), st = await drawn(true, true);
  const firstDiff = (a) => { const i = a.findIndex((h, k) => h !== headless[k]); return i < 0 ? (a.length === headless.length ? null : `length ${a.length}`) : i + 1; };

  // 5. the display
  const L = await world();
  host.interpolate = true; host.attach(L.tree); host.resize(W, H);
  const intervals = [];
  await new Promise((done) => { let last = null, t0 = null; const tick = (t) => { if (last !== null) { intervals.push(t - last); host.frame((t - last) / 1000); } last = t; t0 ??= t; if (t - t0 < 2000) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });

  const topAlphas = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    backend: host.backend, hz: HZ, size: [W, H],
    hashes: { steps: 600, headlessFinal: headless.at(-1), interpolatedSame: firstDiff(on.hashes) === null, plainSame: firstDiff(off.hashes) === null, stereoSame: firstDiff(st.hashes) === null, firstDiff: { interpolated: firstDiff(on.hashes), plain: firstDiff(off.hashes), stereo: firstDiff(st.hashes) } },
    frames: { interpolated: on.renderMs.length, stepsPerFrame: on.stepsPer, alphas: topAlphas(on.alphas) },
    smoothness: { interpolated: smoothness(on.xs), plain: smoothness(off.xs), stereo: smoothness(st.xs) },
    renderMs: { interpolated: stats(on.renderMs), plain: stats(off.renderMs), stereo: stats(st.renderMs) },
    display: { frames: intervals.length, intervalMs: stats(intervals), displayHz: +(1000 / stats(intervals).p50).toFixed(1) },
    renderer: { calls: host.renderer.info.render.calls, triangles: host.renderer.info.render.triangles },
  };
});
