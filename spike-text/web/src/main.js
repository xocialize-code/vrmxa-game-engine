// AB-T-0536: in-canvas text for VRMXG. One page, cases by query string; every case ends with window.__result,
// window.__shots and window.READY = true (the Mac wrapper and scripts/chromium.mjs read those).
//
//   ?mode=title&lib=troika|slug|hbslug[&sdf=js][&worker=0][&wght=700][&w=3840&h=2160]
//        the title card drawn into a render target, read back and hashed (FNV-1a, as @vrmxg/export); drawn twice in a
//        row, then everything rebuilt (new renderer, new text) and drawn again
//   ?mode=bench&lib=…     frame ms: the title card and a full-frame fill at 4K, 2,000 glyphs at 1080p and 4K
//   ?mode=font&lib=…      the Japanese TrueType font: parse, glyph count, data size, build time; renders a sample
//   ?mode=hb              HarfBuzz-wasm, single-threaded: shaping, glyph ids, kerning, palt, vertical, variations
import * as THREE from 'three';
import { troika, slug, hbslug, loadHarfBuzz, numGlyphs, FONT_FILE } from './libs.js';
import { titleItems, fillItems, denseItems, charSet, TITLE } from './content.js';

const P = Object.fromEntries(new URLSearchParams(location.search));
const now = () => performance.now();
const errors = [], warnings = [];
window.__errors = errors; window.__warnings = warnings; window.__shots = [];
addEventListener('error', (e) => errors.push(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => errors.push(`rejection: ${e.reason?.stack ?? e.reason}`));
for (const k of ['error', 'warn']) {
  const orig = console[k];
  console[k] = (...a) => { (k === 'error' ? errors : warnings).push(a.map(String).join(' ').slice(0, 400)); orig.apply(console, a); };
}
const log = (s) => { document.getElementById('log').textContent += s + '\n'; };

/** FNV-1a over the frame's 32-bit words, two lanes (the same function as @vrmxg/export's hashFrame). */
function hashFrame(bytes) {
  const u = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >>> 2);
  let a = 0x811c9dc5, b = 0x2545f491;
  for (let i = 0; i < u.length; i++) { a = Math.imul(a ^ u[i], 0x01000193); b = Math.imul(b ^ u[i], 0x5bd1e995) ^ (b >>> 15); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
const stats = (xs) => { const s = [...xs].sort((a, b) => a - b); return { median: +s[s.length >> 1].toFixed(3), min: +s[0].toFixed(3), max: +s[s.length - 1].toFixed(3), n: s.length }; };

async function fontBuffer() {
  const t0 = now();
  const buf = await (await fetch(FONT_FILE)).arrayBuffer();
  return { buf, ms: +(now() - t0).toFixed(1) };
}

function makeRenderer() {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 360;
  document.body.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function makeScene(w, h, boxes) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1626);
  const cam = new THREE.OrthographicCamera(0, w, h, 0, -10, 10);
  for (const b of boxes) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: b.opacity, depthWrite: false }));
    m.position.set(b.x, b.y, -1);
    scene.add(m);
  }
  return { scene, cam };
}

function target(w, h) {
  // RGBA8 sRGB target: what the canvas (and so an export) would get.
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, colorSpace: THREE.SRGBColorSpace });
  return rt;
}

function readFrame(renderer, rt, out) {
  renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, out);
  return out;
}

function shot(name, w, h, rgba, scale = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(rgba.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // flip
  ctx.putImageData(img, 0, 0);
  let out = c;
  if (scale !== 1) {
    out = document.createElement('canvas');
    out.width = Math.round(w * scale); out.height = Math.round(h * scale);
    out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
  }
  window.__shots.push({ name, dataUrl: out.toDataURL('image/png') });
}

/** A crop of the frame (bottom-left origin in GL rows) at 1:1, for looking at edges. */
function crop(name, w, h, rgba, x, y, cw, ch) {
  const out = new Uint8Array(cw * ch * 4);
  for (let r = 0; r < ch; r++) out.set(rgba.subarray(((y + r) * w + x) * 4, ((y + r) * w + x + cw) * 4), r * cw * 4);
  shot(name, cw, ch, out);
}

async function makeLib(lib, fontBuf) {
  if (lib === 'troika') return troika(P);
  if (lib === 'slug') return slug(P, fontBuf);
  if (lib === 'hbslug') return hbslug(P, fontBuf);
  throw new Error(`lib=${lib}?`);
}

/** Renders the atlas texture texel for texel into a target and hashes it (troika: was the SDF atlas the same?). */
function hashTexture(renderer, tex) {
  const w = tex.image.width, h = tex.image.height;
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: { t: { value: tex } },
    vertexShader: 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'precision highp float; uniform sampler2D t; out vec4 o; void main(){ o = texelFetch(t, ivec2(gl_FragCoord.xy), 0); }',
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const s = new THREE.Scene(); s.add(quad);
  renderer.setRenderTarget(rt); renderer.render(s, new THREE.Camera()); renderer.setRenderTarget(null);
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  rt.dispose(); mat.dispose();
  return hashFrame(px);
}

// ------------------------------------------------------------------------------------------------ modes

async function modeTitle() {
  const w = +(P.w ?? 3840), h = +(P.h ?? 2160);
  const { buf } = await fontBuffer();
  const tag = `${P.lib}${P.sdf === 'js' ? '-sdfjs' : ''}${P.sdfSize ? '-sdf' + P.sdfSize : ''}${P.worker === '0' ? '-noworker' : ''}${P.lib === 'hbslug' ? `-w${P.wght ?? 700}` : ''}-${h === 2160 ? '4k' : h + 'p'}`;
  const out = new Uint8Array(w * h * 4);
  const runs = [];
  for (let pass = 0; pass < 2; pass++) {
    const renderer = makeRenderer();
    const L = await makeLib(P.lib, buf);
    const { boxes, items } = titleItems(w, h);
    const { scene, cam } = makeScene(w, h, boxes);
    const built = await L.build(items);
    scene.add(built.group);
    const rt = target(w, h);
    const hashes = [];
    for (let i = 0; i < 2; i++) {
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      hashes.push(hashFrame(readFrame(renderer, rt, out)));
    }
    const run = { hashes, info: built.info };
    if (built.sdfTexture) run.atlasHash = hashTexture(renderer, built.sdfTexture);
    if (pass === 0) {
      shot(`title-${tag}`, w, h, out, h > 1080 ? 0.5 : 1);
      // 1:1 crops of the big title's first glyph and of the caption
      const k = h / 2160;
      crop(`crop-title-${tag}`, w, h, out, Math.round(w / 2 - 1350 * k), Math.round(h * 0.6 - 40 * k), Math.round(560 * k), Math.round(300 * k));
      crop(`crop-caption-${tag}`, w, h, out, Math.round(w / 2 - 700 * k), Math.round(170 * k), Math.round(700 * k), Math.round(240 * k));
    }
    runs.push(run);
    rt.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }
  const all = runs.flatMap((r) => r.hashes);
  return { mode: 'title', lib: P.lib, tag, size: `${w}x${h}`, hash: all[0], repeatable: all.every((x) => x === all[0]), runs };
}

/** ms per frame for `n` frames drawn back to back into `rt`, with one sync (a 1-pixel readPixels) at the end. */
function frameLoop(renderer, scene, cam, rt, n) {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  renderer.setRenderTarget(rt);
  const t0 = now();
  for (let i = 0; i < n; i++) renderer.render(scene, cam);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = (now() - t0) / n;
  renderer.setRenderTarget(null);
  return ms;
}

/** ms of one frame drawn into `rt` and synced (a 1-pixel readPixels after it), per frame. */
function syncedFrame(renderer, scene, cam, rt, px) {
  const gl = renderer.getContext();
  renderer.setRenderTarget(rt);
  const t0 = now();
  renderer.render(scene, cam);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = now() - t0;
  renderer.setRenderTarget(null);
  return ms;
}

/** GPU time from EXT_disjoint_timer_query_webgl2 where the browser exposes it (Chromium does; WebKit doesn't).
 *  Frames with and without the text alternate, so clock changes hit both alike. */
async function timerQuery(renderer, scene, cam, rt, group, n = 60) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const qs = [];
  renderer.setRenderTarget(rt);
  for (let i = 0; i < 2 * n; i++) {
    group.visible = i % 2 === 0;
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q); renderer.render(scene, cam); gl.endQuery(ext.TIME_ELAPSED_EXT);
    qs.push({ q, text: group.visible });
  }
  group.visible = true;
  renderer.setRenderTarget(null);
  const text = [], empty = [];
  for (let tries = 0; tries < 400 && qs.length; tries++) {
    await new Promise((r) => setTimeout(r, 10));
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return { disjoint: true };
    while (qs.length && gl.getQueryParameter(qs[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const { q, text: t } = qs.shift();
      (t ? text : empty).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q);
    }
  }
  if (!text.length) return null;
  const a = stats(text), b = stats(empty);
  return { text: a, empty: b, textMs: +(a.median - b.median).toFixed(3) };
}

async function benchCase(renderer, L, name, w, h, layout) {
  const { boxes, items } = layout(w, h);
  const { scene, cam } = makeScene(w, h, boxes);
  const built = await L.build(items);
  scene.add(built.group);
  const rt = target(w, h);
  const px = new Uint8Array(4);
  for (let i = 0; i < 3; i++) frameLoop(renderer, scene, cam, rt, 20); // warm-up (compiles, uploads)
  const loopText = [], loopEmpty = [], syncText = [], syncEmpty = [];
  for (let r = 0; r < 6; r++) {
    built.group.visible = true; loopText.push(frameLoop(renderer, scene, cam, rt, 60));
    built.group.visible = false; loopEmpty.push(frameLoop(renderer, scene, cam, rt, 60));
    for (let i = 0; i < 20; i++) {
      built.group.visible = true; syncText.push(syncedFrame(renderer, scene, cam, rt, px));
      built.group.visible = false; syncEmpty.push(syncedFrame(renderer, scene, cam, rt, px));
    }
  }
  built.group.visible = true;
  const tq = await timerQuery(renderer, scene, cam, rt, built.group);
  const a = stats(syncText), b = stats(syncEmpty), c = stats(loopText), d = stats(loopEmpty);
  const res = {
    name, size: `${w}x${h}`, quads: built.info.quads,
    synced: { text: a, empty: b, textMs: +(a.median - b.median).toFixed(3) },
    backToBack: { text: c, empty: d, textMs: +(c.median - d.median).toFixed(3) },
    timerQuery: tq, info: built.info,
  };
  rt.dispose();
  built.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); o.dispose?.(); });
  return res;
}

async function modeBench() {
  const { buf } = await fontBuffer();
  const renderer = makeRenderer();
  const L = await makeLib(P.lib, buf);
  const cases = [];
  cases.push(await benchCase(renderer, L, 'title', 3840, 2160, titleItems));
  cases.push(await benchCase(renderer, L, 'fill', 3840, 2160, fillItems));
  cases.push(await benchCase(renderer, L, 'glyphs2000', 1920, 1080, denseItems));
  cases.push(await benchCase(renderer, L, 'glyphs2000', 3840, 2160, denseItems));
  // 2,000 glyphs, one frame for the eye
  {
    const { boxes, items } = denseItems(1920, 1080);
    const { scene, cam } = makeScene(1920, 1080, boxes);
    const built = await L.build(items); scene.add(built.group);
    const rt = target(1920, 1080); renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
    const px = readFrame(renderer, rt, new Uint8Array(1920 * 1080 * 4));
    crop(`dense-${P.lib}${P.sdf === 'js' ? '-sdfjs' : ''}${P.lib === 'hbslug' ? '-w' + (P.wght ?? 700) : ''}-1080p`, 1920, 1080, px, 400, 680, 640, 360);
  }
  return { mode: 'bench', lib: P.lib, sdf: P.sdf ?? 'gpu', cases, gl: glInfo(renderer) };
}

function glInfo(renderer) {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE), timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
}

async function modeFont() {
  const { buf, ms: fetchMs } = await fontBuffer();
  const { hb, ms: wasmMs } = await loadHarfBuzz();
  const face = new hb.Face(new hb.Blob(buf.slice(0)));
  const cmap = new Set(face.collectUnicodes());
  const fontInfo = { file: FONT_FILE, bytes: buf.byteLength, fetchMs, glyphs: numGlyphs(face), cmapCodePoints: cmap.size, axes: face.getAxisInfos(), tables: ['glyf', 'CFF ', 'CFF2', 'gvar', 'HVAR', 'GSUB', 'GPOS'].filter((t) => face.referenceTable(t)?.length) };
  const set3000 = charSet(cmap, 3000);
  const res = { mode: 'font', lib: P.lib, font: fontInfo, hbWasmMs: wasmMs };
  const renderer = makeRenderer();
  res.gl = glInfo(renderer);
  const w = 1920, h = 1080;
  // A sample to show it renders: the first 300 of the 3,000-character set, 12 lines of 25 at 40 px
  const sample = [];
  for (let i = 0; i < 12; i++) sample.push({ str: String.fromCodePoint(...set3000.slice(800 + i * 25, 800 + i * 25 + 25)), size: 40, x: w / 2, y: h - 100 - i * 72, color: 0xffffff });
  sample.push({ str: TITLE.main, size: 40, x: w / 2, y: 60, color: 0xf2c46d });
  let L, pre;
  if (P.lib === 'slug') {
    L = await slug(P, buf);
    const t0 = now();
    const ascii = await L.generate({});
    const s3000 = await L.generate({ codePoints: set3000 });
    const full = await L.generate({ full: true });
    res.slug = { ascii: ascii.info, set3000: s3000.info, full: full.info, totalMs: +(now() - t0).toFixed(1) };
    pre = full;
  } else if (P.lib === 'hbslug') {
    L = await hbslug(P, buf);
    const n = numGlyphs(face);
    const all = Array.from({ length: n }, (_, i) => i);
    const full = L.generate(all);
    const gids3000 = [...new Set(set3000.map((cp) => L.shape(String.fromCodePoint(cp))[0].gid))];
    const s3000 = L.generate(gids3000);
    res.hbslug = { wght: L.wght, set3000: s3000.info, full: full.info };
  } else if (P.lib === 'troika') {
    L = await troika(P);
    // the 3,000-character set through troika's atlas, 30 lines of 100
    const lines = [];
    for (let i = 0; i < 30; i++) lines.push({ str: String.fromCodePoint(...set3000.slice(i * 100, i * 100 + 100)), size: 10, x: w / 2, y: h - 20 - i * 12, color: 0xffffff });
    const built = await L.build(lines);
    res.troika = { set3000: built.info };
  }
  const { scene, cam } = makeScene(w, h, []);
  const built = P.lib === 'slug' ? await L.build(sample, pre) : await L.build(sample);
  scene.add(built.group);
  const rt = target(w, h);
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
  const px = readFrame(renderer, rt, new Uint8Array(w * h * 4));
  let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 128) lit++;
  res.sample = { hash: hashFrame(px), litPixels: lit, info: built.info };
  shot(`font-${P.lib}${P.sdf === 'js' ? '-sdfjs' : ''}`, w, h, px, 0.5);
  return res;
}

async function modeHb() {
  const env = { crossOriginIsolated: self.crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined', protocol: location.protocol, hardwareConcurrency: navigator.hardwareConcurrency };
  const { buf } = await fontBuffer();
  const { hb, ms: wasmMs } = await loadHarfBuzz();
  const t0 = now();
  const face = new hb.Face(new hb.Blob(buf.slice(0)));
  const font = new hb.Font(face);
  const faceMs = +(now() - t0).toFixed(2);
  const shape = (str, { features, dir, wght } = {}) => {
    if (wght) font.setVariations([new hb.Variation('wght', wght)]); else font.setVariations([]);
    const b = new hb.Buffer();
    b.addText(str); b.guessSegmentProperties();
    if (dir) b.setDirection(dir);
    hb.shape(font, b, features);
    const infos = b.getGlyphInfos(), pos = b.getGlyphPositions();
    return infos.map((g, i) => [g.codepoint, g.cluster, pos[i].xAdvance, pos[i].yAdvance, pos[i].xOffset, pos[i].yOffset]);
  };
  const F = (s) => s.split(',').map((x) => hb.Feature.fromString(x));
  const dense = denseItems(1920, 1080).items.map((i) => i.str).join('');
  const times = [];
  let glyphs;
  for (let i = 0; i < 15; i++) { const t = now(); glyphs = shape(dense); times.push(now() - t); }
  const flat = new Int32Array(glyphs.flat());
  const kernAV = { kern: shape('AVATAR To'), noKern: shape('AVATAR To', { features: F('-kern') }) };
  const palt = { default: shape('「はじまり」、喫茶店。'), palt: shape('「はじまり」、喫茶店。', { features: F('+palt') }) };
  const vertical = { horizontal: shape('「喫茶店」、ー', {}), vertical: shape('「喫茶店」、ー', { dir: hb.Direction.TTB }) };
  const sum = (run, k = 2) => run.reduce((a, g) => a + g[k], 0);
  const variations = { w100: shape('Café 喫茶'), w400: shape('Café 喫茶', { wght: 400 }), w700: shape('Café 喫茶', { wght: 700 }), w900: shape('Café 喫茶', { wght: 900 }) };
  return {
    mode: 'hb', env, hbVersion: hb.versionString?.() ?? null, wasmMs, faceMs,
    shape2000: { chars: [...dense].length, glyphs: glyphs.length, ms: stats(times), hash: hashFrame(new Uint8Array(flat.buffer)) },
    kerning: { withKern: sum(kernAV.kern), withoutKern: sum(kernAV.noKern), runs: kernAV },
    palt: { defaultAdvance: sum(palt.default), paltAdvance: sum(palt.palt), runs: palt },
    vertical: { horizontalGids: vertical.horizontal.map((g) => g[0]), verticalGids: vertical.vertical.map((g) => g[0]), verticalYAdvance: sum(vertical.vertical, 3), substituted: vertical.vertical.filter((g, i) => g[0] !== vertical.horizontal[i]?.[0]).length },
    variations: Object.fromEntries(Object.entries(variations).map(([k, run]) => [k, { advance: sum(run), gids: run.map((g) => g[0]) }])),
    note: 'gid is HarfBuzz\'s glyph id (glyph.codepoint); vertical forms and palt metrics have no cmap entry, so a code-point keyed renderer cannot draw them',
  };
}

async function main() {
  const t0 = now();
  let result;
  try {
    const mode = P.mode ?? 'title';
    log(`mode=${mode} lib=${P.lib ?? '-'}`);
    result = mode === 'title' ? await modeTitle() : mode === 'bench' ? await modeBench() : mode === 'font' ? await modeFont() : mode === 'hb' ? await modeHb() : { failed: `mode=${mode}?` };
  } catch (e) {
    result = { failed: String(e?.stack ?? e) };
  }
  result.query = location.search;
  result.ua = navigator.userAgent;
  result.origin = location.protocol;
  result.three = THREE.REVISION;
  result.totalMs = +(now() - t0).toFixed(0);
  result.errors = errors.slice(0, 40);
  result.warnings = warnings.slice(0, 40);
  window.__result = result;
  log(JSON.stringify(result).slice(0, 600));
  if (P.save && location.port) {
    await fetch(`/__save/${P.save}`, { method: 'POST', body: JSON.stringify(result, null, 2) });
    for (const s of window.__shots) await fetch(`/__shot/${s.name}`, { method: 'POST', body: s.dataUrl });
  }
  window.READY = true;
}
main();
