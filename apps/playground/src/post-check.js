// M4 W1 (AB-T-0573), ?mode=post&renderer=webgpu|webgl: the post stack on this page's backend, drawn the way an export
// draws (host.frameAt, no yield to rAF; every frame read with toDataURL in the task that drew it, AB-L-0372). At 1080p:
//   - every look (the M2 presets, the anime preset without grain, with the sample's LUT, and with its overlays keyed on)
//     drawn on the same frame of the recorded walk, each from a pipeline built for it there and then: the first frame a
//     new pipeline draws is compared with the next draw of the same frame (gotcha 4: a new dof() drew one flat colour)
//     and measured for flatness;
//   - two exports of five consecutive frames with the anime preset, each from a fresh load: the first from a pipeline
//     built at its frame 0, the second from the cached one. Their hashes must be equal;
//   - the cost of a frame without post and with the anime preset.
// The runners (scripts/post-chromium.mjs, post-wkwebview.sh) compare the looks across backends (SSIM, scripts/post-compare.mjs).
import { PRESETS } from '@vrmxg/post';

const anime = PRESETS.anime;
/** The looks drawn: M2's presets and the anime preset's variants a short uses. */
export const LOOKS = {
  none: null,
  clean: 'clean',
  anime: 'anime',
  animeNoGrain: anime.map((e) => (e.effect === 'grain' ? { ...e, amount: 0 } : e)),
  animeLut: [...anime.map((e) => (e.effect === 'grain' ? { ...e, amount: 0 } : e)), { effect: 'lut', file: 'looks/morning.cube' }],
  // the LUT mixed in at the film's 0.85 (sequences/cafe-morning.vrmxs): both stacks honour intensity
  animeLut85: [...anime.map((e) => (e.effect === 'grain' ? { ...e, amount: 0 } : e)), { effect: 'lut', file: 'looks/morning.cube', intensity: 0.85 }],
  animeOverlays: anime.map((e) => (e.effect === 'grain' ? { ...e, amount: 0 } : e.effect === 'anime' ? { ...e, speedLines: 0.9, focusLines: 0.5 } : e)),
  // a close-up's shallow focus (on Hana, 3 m; Mira in front blurs): the strongest bokeh the stack allows
  animeShallow: anime.map((e) => (e.effect === 'grain' ? { ...e, amount: 0 } : e.effect === 'dof' ? { ...e, auto: false, focusDistance: 3.5, focusRange: 0.6, bokehScale: 4 } : e)),
};

/** A PNG data URL's pixels, their FNV-1a hash and how flat they are (the luma's standard deviation, distinct colours). */
async function pixels(url) {
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let h = 0x811c9dc5, s = 0, s2 = 0;
  const colours = new Set();
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 4; k++) h = Math.imul(h ^ d[i + k], 0x01000193) >>> 0;
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += l; s2 += l * l;
    if (colours.size < 4096 && (i & 63) === 0) colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  }
  const n = d.length / 4, mean = s / n;
  return { hash: h.toString(16).padStart(8, '0'), size: [c.width, c.height], lumaStd: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(2), colours: colours.size };
}

/**
 * @param {any} pg the Playground
 * @param {{ frames?: number[], still?: number, width?: number, height?: number, looks?: string[] }} [o]
 */
export async function postCheck(pg, { frames = [300, 301, 302, 303, 304], still = 420, width = 1920, height = 1080, looks = Object.keys(LOOKS) } = {}) {
  const walk = JSON.parse(new TextDecoder().decode(await (await fetch('input/walk-in.json')).arrayBuffer()));
  const env = () => pg.tree.all().find((n) => n.type === 'Environment');
  let host = null, last = null, draw = null;
  await pg.ready;
  const ratio = pg.host.renderer.getPixelRatio(), buf = pg.host.drawingBufferSize(), cssW = buf.width / ratio, cssH = buf.height / ratio;
  pg.offline = true; // the check owns the canvas: no paused-loop draws, no resize back to the page's layout
  try {
    /** A fresh load at 1080p with the walk replayed from its first step; draws are read in their own task. */
    const fresh = async () => {
      await pg.load(pg.scene ?? 'cafe.vrmxs');
      pg.pause(); pg.setBubbles(false);
      host = pg.host;
      host.debug.set(false);
      host.renderer.setPixelRatio(1); host.resize(width, height);
      pg.input.replay({ ...walk, start: pg.tree.clock.step });
      if (!draw) { draw = host.render.bind(host); host.render = (alpha, stepped) => { draw(alpha, stepped); last = pg.canvas.toDataURL('image/png'); }; }
    };
    const setLook = async (look) => { env().props.post = structuredClone(LOOKS[look]); host.views.update(pg.tree); await host.post?.settle?.(); };
    const exportFrames = async () => {
      await fresh();
      await setLook('anime');
      const out = [];
      for (const s of frames) { await host.frameAt(s, 0.5); out.push((await pixels(last))); }
      return out;
    };

    // export A: the anime pipeline is built at its frame 0 (the first frame after the look is set)
    const built0 = host?.post?.cache?.size ?? 0;
    const a = await exportFrames();
    const builtA = host.post?.cache?.size;
    // the looks, on one frame of the walk: each the first frame of a pipeline built for it, then the same frame again
    await host.frameAt(still, 0.5);
    const shots = {};
    for (const look of looks) {
      await setLook(look);
      const cached = host.post?.cache ? host.post.cache.has(host.post.key) : null;
      host.advanceNodeFrame(); host.render(0.5, false);
      const first = last;
      host.advanceNodeFrame(); host.render(0.5, false);
      const p1 = await pixels(first), p2 = await pixels(last);
      shots[look] = { png: first, hash: p1.hash, again: p2.hash, firstEqualsAgain: p1.hash === p2.hash, lumaStd: p1.lumaStd, colours: p1.colours, newPipeline: cached === false, passes: host.post?.active ? [...host.post.passes] : [] };
    }
    // the cost of a frame (median of 20) without post and with the anime preset, GPU work included
    const gl = host.renderer.isWebGLRenderer ? host.renderer.getContext() : null, device = host.renderer.backend?.device;
    const cost = async (look) => {
      await setLook(look); host.advanceNodeFrame(); draw(0.5, false);
      const ms = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        host.advanceNodeFrame(); draw(0.5, false);
        if (gl) gl.finish(); else await device.queue.onSubmittedWorkDone();
        ms.push(performance.now() - t0);
      }
      ms.sort((x, y) => x - y);
      return +ms[10].toFixed(3);
    };
    const costMs = { none: await cost('none'), anime: await cost('anime') };
    // export B: a fresh load, the anime pipeline from the cache
    const b = await exportFrames();
    const size = [pg.canvas.width, pg.canvas.height]; // the stills' size, before the page takes the canvas back
    return {
      backend: host.backend, isWebGPUBackend: !!host.renderer.backend?.isWebGPUBackend, stack: host.post?.constructor?.name ?? null,
      size, frames, still,
      exports: {
        a: a.map((p) => p.hash), b: b.map((p) => p.hash), identical: a.map((p) => p.hash).join() === b.map((p) => p.hash).join(),
        distinct: new Set(a.map((p) => p.hash)).size, frame0: { lumaStd: a[0].lumaStd, colours: a[0].colours },
        pipelinesBuiltByA: builtA == null ? null : builtA - built0,
      },
      looks: shots, costMs,
    };
  } finally { // even when a draw throws: the host's own render, the page's pixel ratio and size, then the page's layout
    if (draw && host) host.render = draw;
    const h = host ?? pg.host;
    h.renderer.setPixelRatio(ratio);
    if (cssW && cssH) h.resize(cssW, cssH);
    pg.offline = false;
  }
}
