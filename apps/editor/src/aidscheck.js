// ?mode=check-aids&post=0|1 (AB-A-0335): the edit view's aids in the colours they were given, on this page's backend.
// three r187's WebGPURenderer draws a frame with tone mapping into its framebuffer target and tone-maps the whole target on
// its way to the canvas, so a material's `toneMapped: false` does nothing there. The editor's aids are drawn after the
// frame with `toneMapped: false`; this checks what reaches the canvas. The cafe is opened, the espresso machine and the counter's
// spot light are selected (the light's shape handles, the machine's outline), and the view is drawn three times: with no aids,
// with the outline only, and with the handles only. The pixels each aid changed are counted by colour (read from the
// canvas in the drawing task); the commonest is what the aid drew where it covers whole pixels. post=1 gives the scene a
// post look first (the 'clean' preset), so on WebGPU the frame goes through the TSL stack and the composite pass.
// Sets window.__result and window.READY, for acceptance/m6/aids-tonemap.mjs.

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** @param {import('./host.js').EditorHost} ed */
export async function runAidsCheck(ed, { post = false } = {}) {
  await ed.openScene('cafe.vrmxs');
  if (post) ed.session.setProp('env', 'post', 'clean');
  ed.session.select(['espresso']); ed.session.select(['counter-light'], { add: true });
  ed.orbit.setLookAt?.(4.5, 3.4, 2.5, 1.2, 1.4, -2.6, false);
  const canvas = ed.canvas, aids = ed.aids;
  const scratch = document.createElement('canvas'), g = /** @type {CanvasRenderingContext2D} */ (scratch.getContext('2d', { willReadFrequently: true }));
  /** The next edit-view frame's pixels, read in the task that drew them (a WebGPU canvas is readable there). */
  const nextFrame = () => new Promise((resolve) => {
    const draw = aids.draw;
    aids.draw = function drawAndRead(...a) {
      draw.apply(this, a);
      aids.draw = draw;
      scratch.width = canvas.width; scratch.height = canvas.height;
      g.drawImage(canvas, 0, 0);
      resolve(g.getImageData(0, 0, scratch.width, scratch.height).data);
    };
  });
  const settle = async (n = 20) => { for (let i = 0; i < n; i++) await nextFrame(); };
  const show = (outline, handles) => { ed.setAid('outline', outline); ed.setAid('handles', handles); ed.setAid('preview', false); };
  // the colours the aids were given (sRGB): the outline's ring, the spot light's range and angle dots, its cone's lines
  const want = [`#${aids.outline.ring.color.getHexString()}`, '#ffc53d', '#ff8b3e'];
  show(false, false); await settle(60); // the scene's textures and pipelines in, the camera still
  const base = await nextFrame();
  const changed = async (outline, handles) => {
    show(outline, handles); await settle();
    const px = await nextFrame(), counts = new Map();
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] === base[i] && px[i + 1] === base[i + 1] && px[i + 2] === base[i + 2]) continue;
      n++;
      const k = hex(px[i], px[i + 1], px[i + 2]);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const authored = Object.fromEntries(want.map((c) => [c, counts.get(c) ?? 0]));
    return { changed: n, authored, top: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([colour, count]) => ({ colour, count })) };
  };
  const outline = await changed(true, false), handles = await changed(false, true);
  // the frame itself through the composite against three's own output pass (the composite bypassed): the same picture
  show(false, false);
  const helper = ed.gizmo?.getHelper?.(), shown = helper?.visible, boxShown = ed.box?.visible;
  if (helper) helper.visible = false; // the transform gizmo and the selection box are aids too: only the world here
  if (ed.box) ed.box.visible = false;
  const begin = aids.beginFrame;
  aids.beginFrame = () => false; await settle(); const direct = await nextFrame(), again = await nextFrame(); aids.beginFrame = begin;
  await settle(); const via = await nextFrame();
  const W = canvas.width;
  const compare = (x, y) => {
    let differ = 0, maxDiff = 0, box = null;
    const samples = [];
    for (let i = 0; i < x.length; i += 4) {
      const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
      if (!d) continue;
      differ++; maxDiff = Math.max(maxDiff, d);
      const px = (i / 4) % W, py = Math.floor(i / 4 / W);
      box = box ? [Math.min(box[0], px), Math.min(box[1], py), Math.max(box[2], px), Math.max(box[3], py)] : [px, py, px, py];
      if (d > 8 && samples.length < 6) samples.push({ at: [px, py], via: hex(x[i], x[i + 1], x[i + 2]), direct: hex(y[i], y[i + 1], y[i + 2]) });
    }
    return { differ, maxDiff, box, samples };
  };
  if (helper) helper.visible = shown;
  if (ed.box) ed.box.visible = boxShown;
  // what moves on its own between two frames (the espresso's steam is presentation, advanced per drawn frame) is the floor
  const frame = { pixels: via.length / 4, ...compare(via, direct), directTwice: compare(again, direct) };
  show(true, true);
  const r = ed.host.renderer;
  return {
    backend: ed.host.backend, post: !!ed.host.post?.active, composite: !!(r.isWebGPURenderer && ed.host.post?.active),
    toneMapping: r.toneMapping, exposure: r.toneMappingExposure, size: [canvas.width, canvas.height], primary: ed.session.primary,
    authored: { outline: want[0], rangeDot: want[1], angleDot: want[2], lines: '#ffc53d at 0.9 opacity (blended)' },
    outline, handles, frame, ua: navigator.userAgent,
  };
}

/** For a harness: run, then publish the result. */
export async function aidsCheckMain(ed) {
  const q = new URLSearchParams(location.search);
  try { window.__result = await runAidsCheck(ed, { post: q.get('post') === '1' }); } catch (e) { window.__errors.push(`check-aids: ${e?.stack ?? e}`); }
  window.READY = true;
}
