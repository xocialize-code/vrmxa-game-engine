// The three text paths under test, behind one interface: build(items) → { group, info }.
//   troika   troika-three-text 0.53.1: SDF atlas (GPU- or JS-generated), its own typesetter (Typr), worker or main thread
//   slug     three-slug 1.1.4 (JSlug): opentype.js parses the font, curves + bands in float/uint textures, keyed by
//            code point; its own left-to-right layout (advance widths only)
//   hbslug   our own path on JSlug's shader: HarfBuzz-wasm shapes (glyph ids + positions, GPOS kerning, features,
//            variations) and draws the outlines (glyphToPath at the chosen wght); the curve/band build and the shader
//            are three-slug's, keyed by glyph id instead of code point
import * as THREE from 'three';
import { Text, configureTextBuilder } from 'troika-three-text';
import { SlugGenerator, SlugGeometry, injectSlug } from 'three-slug';

const now = () => performance.now();
export const FONT_FILE = 'NotoSansJP-wght.ttf';
export const fontUrl = () => new URL(FONT_FILE, location.href).href;

// ---------------------------------------------------------------- troika

let troikaConfigured = false;
export async function troika(P) {
  if (!troikaConfigured) configureTextBuilder({ useWorker: P.worker !== '0', sdfGlyphSize: +(P.sdfSize ?? 64) });
  troikaConfigured = true;
  return {
    name: 'troika',
    async build(items) {
      const t0 = now();
      const group = new THREE.Group();
      const texts = items.map((it) => {
        const t = new Text();
        t.text = it.str; t.font = fontUrl(); t.fontSize = it.size; t.color = it.color;
        t.anchorX = 'center'; t.anchorY = 'top-baseline'; t.position.set(it.x, it.y, 0);
        t.gpuAccelerateSDF = P.sdf !== 'js';
        t.unicodeFontsURL = new URL('no-fallback-fonts/', location.href).href; // never the CDN
        if (P.outline) t.outlineWidth = P.outline; // e.g. '8%'
        group.add(t);
        return t;
      });
      await Promise.all(texts.map((t) => new Promise((r) => t.sync(r))));
      const info0 = texts[0].textRenderInfo;
      const glyphs = texts.reduce((n, t) => n + (t.textRenderInfo?.glyphBounds.length ?? 0) / 4, 0);
      const tex = info0?.sdfTexture;
      const atlas = tex?.image ? { w: tex.image.width, h: tex.image.height, bytes: tex.image.width * tex.image.height * 4 } : null;
      return { group, texts, sdfTexture: tex, info: { buildMs: +(now() - t0).toFixed(1), quads: glyphs, atlas, sdfGlyphSize: info0?.sdfGlyphSize, timings: info0 && { fontLoad: info0.timings.fontLoad, typesetting: info0.timings.typesetting, sdfGlyphs: Object.keys(info0.timings.sdf ?? {}).length, sdfTotal: info0.timings.sdfTotal, total: info0.timings.total } } };
    },
  };
}

// ---------------------------------------------------------------- slug (three-slug as published)

function slugBytes(data) {
  const c = data.curvesTex.image, b = data.bandsTex.image;
  return { curves: { w: c.width, h: c.height, bytes: c.data.byteLength }, bands: { w: b.width, h: b.height, bytes: b.data.byteLength }, total: c.data.byteLength + b.data.byteLength };
}

function slugMesh(data, color, max) {
  const geo = new SlugGeometry(max);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  injectSlug(mesh, mat, data);
  mesh.frustumCulled = false;
  return mesh;
}

/** Counts three-slug's "has bicubic curves" warnings while `fn` runs (it skips those glyphs). */
async function countingCubic(fn) {
  const warn = console.warn; let cubic = 0;
  console.warn = (...a) => { if (String(a[0]).includes('bicubic')) cubic++; else warn(...a); };
  try { return { value: await fn(), cubic }; } finally { console.warn = warn; }
}

export async function slug(P, fontBuf) {
  return {
    name: 'slug',
    /** Builds the font data for these code points (or every glyph with `full`). */
    async generate({ codePoints, full } = {}) {
      const t0 = now();
      const gen = new SlugGenerator(full ? { fullRange: true } : { whitelist: codePoints });
      const { value: data, cubic } = await countingCubic(() => gen.generateFromBuffer(fontBuf.slice(0)));
      return { data, info: { buildMs: +(now() - t0).toFixed(1), glyphs: data.codePoints.size, cubicSkipped: cubic, ...slugBytes(data) } };
    },
    async build(items, pre) {
      const t0 = now();
      const cps = [...new Set(items.flatMap((it) => [...it.str].map((ch) => ch.codePointAt(0))))];
      const gen = pre ?? (await this.generate({ codePoints: cps }));
      const data = gen.data;
      const group = new THREE.Group();
      let quads = 0, missing = 0;
      for (const it of items) {
        for (const ch of it.str) if (!data.codePoints.has(ch.codePointAt(0)) && ch !== ' ') missing++;
        const mesh = slugMesh(data, it.color, [...it.str].length);
        mesh.geometry.addText(it.str, data, { fontScale: it.size / data.unitsPerEm, startX: it.x, startY: it.y, justify: 'center' });
        quads += mesh.geometry.instanceCount;
        group.add(mesh);
      }
      return { group, info: { buildMs: +(now() - t0).toFixed(1), quads, missingGlyphs: missing, font: gen.info } };
    },
  };
}

// ---------------------------------------------------------------- hbslug (HarfBuzz shaping + outlines → Slug)

let hbModule;
export async function loadHarfBuzz() {
  const t0 = now();
  hbModule ??= await import('harfbuzzjs');
  return { hb: hbModule, ms: +(now() - t0).toFixed(1) };
}

/** SVG path from hb's glyphToPath (font units, y up) → opentype.js-style commands. */
function parsePath(d) {
  const cmds = [];
  const re = /([MLQCZ])([^MLQCZ]*)/g;
  let m;
  while ((m = re.exec(d))) {
    const n = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    if (m[1] === 'M' || m[1] === 'L') cmds.push({ type: m[1], x: n[0], y: n[1] });
    else if (m[1] === 'Q') cmds.push({ type: 'Q', x1: n[0], y1: n[1], x: n[2], y: n[3] });
    else if (m[1] === 'C') cmds.push({ type: 'C', x1: n[0], y1: n[1], x2: n[2], y2: n[3], x: n[4], y: n[5] });
    else cmds.push({ type: 'Z' });
  }
  return cmds;
}

/** An opentype.js-shaped glyph for SlugGenerator.generate(); `unicode` carries the glyph id. The box is snapped
 *  outward to whole font units, because the generator floors the box's size and scales the curves by it. */
function hbGlyph(font, gid) {
  const commands = parsePath(font.glyphToPath(gid));
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const c of commands) for (const [x, y] of [[c.x, c.y], [c.x1, c.y1], [c.x2, c.y2]]) {
    if (x === undefined) continue;
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  }
  const box = commands.length ? { x1: Math.floor(x1), y1: Math.floor(y1), x2: Math.ceil(x2), y2: Math.ceil(y2) } : { x1: 0, y1: 0, x2: 0, y2: 0 };
  return { unicode: gid, advanceWidth: font.glyphHAdvance(gid), path: { commands }, getBoundingBox: () => box };
}

export function numGlyphs(face) {
  const maxp = face.referenceTable('maxp');
  return (maxp[4] << 8) | maxp[5];
}

export async function hbslug(P, fontBuf) {
  const { hb, ms: wasmMs } = await loadHarfBuzz();
  const face = new hb.Face(new hb.Blob(fontBuf.slice(0)));
  const font = new hb.Font(face);
  const wght = +(P.wght ?? 700);
  font.setVariations([new hb.Variation('wght', wght)]);
  const upem = 1000;
  const shape = (str, features) => {
    const b = new hb.Buffer();
    b.addText(str); b.guessSegmentProperties();
    hb.shape(font, b, features);
    const infos = b.getGlyphInfos(), pos = b.getGlyphPositions();
    return infos.map((g, i) => ({ gid: g.codepoint, cluster: g.cluster, ...pos[i] }));
  };
  return {
    name: 'hbslug', hb, face, font, shape, wasmMs, wght,
    generate(gids) {
      const t0 = now();
      const glyphs = gids.map((g) => hbGlyph(font, g));
      const pathMs = now() - t0;
      const { value: data, cubic } = { value: new SlugGenerator({ fullRange: true }).generate({ glyphs: { length: glyphs.length, get: (i) => glyphs[i] }, unitsPerEm: upem, ascender: 0, descender: 0, lineGap: 0 }), cubic: 0 };
      return { data, info: { buildMs: +(now() - t0).toFixed(1), outlineMs: +pathMs.toFixed(1), glyphs: data.codePoints.size, cubicSkipped: cubic, ...slugBytes(data) } };
    },
    async build(items) {
      const t0 = now();
      const shaped = items.map((it) => shape(it.str));
      const shapeMs = now() - t0;
      const gids = [...new Set(shaped.flat().map((g) => g.gid))];
      const gen = this.generate(gids);
      const data = gen.data;
      const group = new THREE.Group();
      let quads = 0;
      items.forEach((it, n) => {
        const run = shaped[n];
        const s = it.size / upem;
        const total = run.reduce((a, g) => a + g.xAdvance, 0) * s;
        const mesh = slugMesh(data, it.color, run.length);
        const geo = mesh.geometry;
        let pen = it.x - total / 2;
        for (const g of run) {
          const d = data.codePoints.get(g.gid);
          if (d && d.width > 0 && d.height > 0) geo.addGlyph(d, pen + (g.xOffset + d.bearingX) * s, it.y + (g.yOffset + d.bearingY) * s, d.width * s, d.height * s);
          pen += g.xAdvance * s;
        }
        geo.updateBuffers();
        quads += geo.instanceCount;
        group.add(mesh);
      });
      return { group, info: { buildMs: +(now() - t0).toFixed(1), shapeMs: +shapeMs.toFixed(2), quads, wght, font: gen.info } };
    },
  };
}
