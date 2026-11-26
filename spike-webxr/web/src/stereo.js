// Target 3: the engine's MToon character in stereo on WebGPU. No runtime here offers a WebGPU XR session (that needs
// XRGPUBinding and the session's 'webgpu' feature, which three r187's XRManager requires on the WebGPU backend), so this
// is a stand-in for the part of that path that draws: an ArrayCamera of two eyes, which three's WebGPU backend draws per
// sub-camera with camera-indexed uniforms (WebGPUBackend.draw, nodes/accessors/Camera.js), the same shader path an XR
// session takes. The eyes are off-axis (asymmetric frusta) and an IPD apart, as real XR views are.
//
// "Draws correctly in both eyes" is measured: each eye of the stereo frame is compared, pixel for pixel, with a mono frame
// drawn through that eye's camera alone. Then outlines (drawn vs not, per eye), shadows (on vs off, per eye) and the post
// stack (through the ArrayCamera, and per eye in one node frame) are checked the same way.
//   ?w=576&h=640   one eye's size   &step=150   where the cafe is drawn   &outline=world|screen   &post=0|1
//   &backend=webgpu|webgl   &pngs=0   no images
import { ArrayCamera, PerspectiveCamera, Vector3, Vector4, Matrix4, Quaternion } from 'three';
import { RenderHost } from '@vrmxg/render';
import { readbackFor } from '@vrmxg/export';
import { q, run } from './report.js';
import { buildWorld, envNodes } from './world.js';

const W = Number(q.get('w') ?? 576), H = Number(q.get('h') ?? 640), STEP = Number(q.get('step') ?? 150);
const OUTLINE = q.get('outline') ?? 'world', POST = q.get('post') === '1', BACKEND = q.get('backend') ?? 'webgpu';
const IPD = 0.063, NEAR = 0.05, FAR = 100;
// Tangents of the half-angles, outward wider than inward, as a headset's eyes are (made up, plausible)
const TAN = { left: { l: 1.05, r: 0.8, u: 0.95, d: 1.1 }, right: { l: 0.8, r: 1.05, u: 0.95, d: 1.1 } };

/** A camera with an off-axis frustum: three's renderer calls updateProjectionMatrix on ArrayCamera sub-cameras when the coordinate system changes, so the frustum lives here. */
class EyeCamera extends PerspectiveCamera {
  constructor(tan) { super(60, 1, NEAR, FAR); this.tan = tan; this.updateProjectionMatrix(); }
  updateProjectionMatrix() {
    if (!this.tan) return super.updateProjectionMatrix();
    const n = this.near, t = this.tan;
    this.projectionMatrix.makePerspective(-t.l * n, t.r * n, t.u * n, -t.d * n, n, this.far, this.coordinateSystem, this.reversedDepth);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}

/** Pixels that differ between two RGBA buffers (any channel), the largest channel difference, and their bounding box. */
function diff(a, b, w, h) {
  let n = 0, max = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
    if (d) { n++; if (d > max) max = d; const p = i >> 2, x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { pixels: n, fraction: +(n / (w * h)).toFixed(6), maxChannel: max, box: n ? [x0, y0, x1, y1] : null };
}
const half = (buf, w2, h, which) => { const w = w2 / 2, out = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) out.set(buf.subarray((y * w2 + which * w) * 4, (y * w2 + which * w + w) * 4), y * w * 4); return out; };
/** Where two buffers differ: red over a dimmed copy of the first. */
function diffImage(a, b) { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i += 4) { const d = a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]; o[i] = d ? 255 : a[i] >> 2; o[i + 1] = d ? 0 : a[i + 1] >> 2; o[i + 2] = d ? 0 : a[i + 2] >> 2; o[i + 3] = 255; } return o; }
function png(buf, w, h, topDown) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  if (topDown) img.data.set(buf); else for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; // the canvas is opaque; premultiplied alpha doesn't matter here
  ctx.putImageData(img, 0, 0); return c.toDataURL('image/png');
}

run('stereo', async () => {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
  const post = POST ? [{ effect: 'bloom', intensity: 1.2 }, { effect: 'vignette' }] : null;
  const host = await RenderHost.create({ canvas, backend: BACKEND, dprCap: 1, ...(POST ? { post: {} } : {}) });
  const { tree } = await buildWorld({ extraNodes: envNodes({ post }), mtoonMaterial: host.mtoonMaterial });
  host.attach(tree); host.resize(W, H);
  while (tree.clock.step < STEP) { while (!tree.step()) await tree.settle(); }
  host.interpolate = false;

  // MToon materials: which class drew, and the outline mode asked for
  const mtoon = [];
  tree.root.object3d.traverse((o) => { for (const m of [o.material].flat()) if (m && (m.isMToonNodeMaterial || m.isMToonMaterial) && !mtoon.includes(m)) mtoon.push(m); });
  const outlineMaterials = mtoon.filter((m) => m.isOutline);
  // 'screen' switches the outlined materials to screen-space width (Mira's are world-space, 0.8 mm); 'off' hides the
  // outline pass's materials, 'on' shows them again
  const outlined = mtoon.filter((m) => m.outlineWidthMode && m.outlineWidthMode !== 'none');
  const toScreen = () => { for (const m of outlined) { m.outlineWidthMode = 'screenCoordinates'; m.outlineWidthFactor = 0.004; m.needsUpdate = true; } };
  const setOutline = (on) => { for (const m of outlineMaterials) m.visible = on; };
  if (OUTLINE === 'screen') toScreen();

  // The head: in front of Mira, 1.6 m off, at eye height, looking at her chest (presentation only, outside the tree)
  const mira = tree.find('mira').object3d, mp = new Vector3(), fwd = new Vector3(0, 0, 1);
  mira.getWorldPosition(mp); fwd.applyQuaternion(mira.getWorldQuaternion(new Quaternion())).setY(0).normalize();
  const headPos = mp.clone().addScaledVector(fwd, 1.6).add(new Vector3(0, 1.45, 0)), look = mp.clone().add(new Vector3(0, 1.25, 0));
  const head = new Matrix4().lookAt(headPos, look, new Vector3(0, 1, 0)).setPosition(headPos);
  const eyes = ['left', 'right'].map((side, i) => {
    const e = new EyeCamera(TAN[side]);
    e.matrixAutoUpdate = false;
    e.matrix.copy(head).multiply(new Matrix4().makeTranslation((i ? 1 : -1) * IPD / 2, 0, 0));
    e.updateMatrixWorld(true);
    e.viewport = new Vector4(i * W, 0, W, H);
    return e;
  });
  const stereo = new ArrayCamera(eyes);
  stereo.matrixAutoUpdate = false; stereo.matrix.copy(head); stereo.updateMatrixWorld(true);
  stereo.projectionMatrix.copy(eyes[0].projectionMatrix); stereo.projectionMatrixInverse.copy(eyes[0].projectionMatrixInverse);

  const topDown = host.backend === 'webgpu';
  const shot = async (camera, w, h, { advance = true } = {}) => {
    host.resize(w, h);
    const rb = readbackFor(host, w, h), out = new Uint8Array(w * h * 4);
    host.camera = camera;
    await rb.draw(() => { if (advance) host.advanceNodeFrame(); host.render(1, false); });
    await rb.readNow(out);
    return out;
  };
  const pngs = (window.__pngs = {}), keep = q.get('pngs') !== '0';
  const errorsBefore = window.__errors.length;

  // warm up: a fresh WebGPU host's first draws of what is in view can differ (AB-T-0596)
  await shot(eyes[0], W, H); await shot(stereo, 2 * W, H); await shot(eyes[1], W, H);

  const monoL = await shot(eyes[0], W, H), monoR = await shot(eyes[1], W, H), monoL2 = await shot(eyes[0], W, H);
  const st = await shot(stereo, 2 * W, H), stL = half(st, 2 * W, H, 0), stR = half(st, 2 * W, H, 1);
  const r = {
    backend: host.backend, mtoonClass: host.mtoonMaterial?.name ?? 'MToonMaterial (WebGL)', mtoonMaterials: mtoon.length, mtoonNodeMaterials: mtoon.filter((m) => m.isMToonNodeMaterial).length, outlinePasses: outlineMaterials.length,
    outlineModes: [...new Set(mtoon.map((m) => m.outlineWidthMode))], eye: { w: W, h: H, ipd: IPD, tangents: TAN }, step: STEP, post: post ?? 'none',
    control: { monoLeftTwice: diff(monoL, monoL2, W, H) },
    stereo: { leftVsMono: diff(stL, monoL, W, H), rightVsMono: diff(stR, monoR, W, H), leftVsRight: diff(monoL, monoR, W, H) },
  };
  // control for three's PCF filter, whose sample rotation is noise keyed to the framebuffer pixel
  // (ShadowFilterNode: interleavedGradientNoise(screenCoordinate.xy)): the right eye drawn alone at the same offset (x = W)
  // in a frame as wide as the stereo one. If that matches the stereo right eye, what differs from mono is that noise.
  const solo = new ArrayCamera([eyes[1]]);
  solo.matrixAutoUpdate = false; solo.matrix.copy(head); solo.updateMatrixWorld(true);
  solo.projectionMatrix.copy(eyes[1].projectionMatrix); solo.projectionMatrixInverse.copy(eyes[1].projectionMatrixInverse);
  const soloR = half(await shot(solo, 2 * W, H), 2 * W, H, 1);
  r.stereo.rightVsRightAloneAtSameOffset = diff(stR, soloR, W, H);
  if (keep) { pngs.stereo = png(st, 2 * W, H, topDown); pngs.monoLeft = png(monoL, W, H, topDown); pngs.monoRight = png(monoR, W, H, topDown); pngs.diffRight = png(diffImage(stR, monoR), W, H, topDown); pngs.diffLeft = png(diffImage(stL, monoL), W, H, topDown); }

  // outlines: the stereo frame without them; each eye must lose some pixels
  setOutline(false);
  const noOut = await shot(stereo, 2 * W, H);
  setOutline(true);
  r.outlines = { left: diff(stL, half(noOut, 2 * W, H, 0), W, H), right: diff(stR, half(noOut, 2 * W, H, 1), W, H) };

  // shadows: the stereo frame with the renderer's shadow maps off; each eye must change
  host.renderer.shadowMap.enabled = false;
  const noShadow = await shot(stereo, 2 * W, H), monoLns = await shot(eyes[0], W, H), monoRns = await shot(eyes[1], W, H);
  host.renderer.shadowMap.enabled = true;
  r.shadows = { left: diff(stL, half(noShadow, 2 * W, H, 0), W, H), right: diff(stR, half(noShadow, 2 * W, H, 1), W, H) };
  // and the stereo frame against mono with shadows off: what is left when the shadow maps are out of it
  r.stereoNoShadows = { leftVsMono: diff(half(noShadow, 2 * W, H, 0), monoLns, W, H), rightVsMono: diff(half(noShadow, 2 * W, H, 1), monoRns, W, H) };
  await shot(stereo, 2 * W, H); // shadows back on before anything compares against them

  if (POST) {
    // the second eye in the same node frame: r187 updates a pipeline's passes once per frame id (the render host's
    // gotcha 1), so a second post render without advancing could show the first eye's passes. Both eyes are drawn in one
    // readback callback with nothing awaited between them (so no rAF tick can advance the frame id), the node frame's id
    // recorded before each; the target then holds the right eye, compared with mono right (correct) and mono left (stale)
    const nodeFrame = host.renderer._nodes?.nodeFrame, ids = [];
    host.resize(W, H);
    const rb = readbackFor(host, W, H), same = new Uint8Array(W * H * 4);
    await rb.draw(() => {
      host.advanceNodeFrame();
      host.camera = eyes[0]; ids.push(nodeFrame?.frameId ?? null); host.render(1, false);
      host.camera = eyes[1]; ids.push(nodeFrame?.frameId ?? null); host.render(1, false);
      ids.push(nodeFrame?.frameId ?? null);
    });
    await rb.readNow(same);
    // the same, advancing the node frame before the second eye (what a per-eye post would have to do)
    const ids2 = [], adv = new Uint8Array(W * H * 4);
    await rb.draw(() => {
      host.advanceNodeFrame(); host.camera = eyes[0]; ids2.push(nodeFrame?.frameId ?? null); host.render(1, false);
      host.advanceNodeFrame(); host.camera = eyes[1]; ids2.push(nodeFrame?.frameId ?? null); host.render(1, false);
    });
    await rb.readNow(adv);
    r.postPerEyeAdvancing = { frameIds: ids2, rightVsMonoRight: diff(adv, monoR, W, H), rightVsMonoLeft: diff(adv, monoL, W, H) };
    const seqL = await shot(eyes[0], W, H);
    r.postPerEye = { leftVsMono: diff(seqL, monoL, W, H), frameIds: ids, sameFrameId: ids[0] !== null && ids.every((x) => x === ids[0]), rightSameFrameVsMonoRight: diff(same, monoR, W, H), rightSameFrameVsMonoLeft: diff(same, monoL, W, H) };
    const seqR = same;
    // the post stack through the ArrayCamera: is the frame drawn per eye at all, and where does a screen-space effect sit
    r.postArrayCamera = { leftVsMono: r.stereo.leftVsMono, rightVsMono: r.stereo.rightVsMono };
    if (keep) { pngs.postRightSameFrame = png(seqR, W, H, topDown); }
  }
  host.camera = null;
  r.errorsDuring = window.__errors.slice(errorsBefore);
  return r;
});
