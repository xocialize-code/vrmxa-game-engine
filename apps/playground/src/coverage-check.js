// M4 W8 (AB-T-0580), ?mode=coverage&renderer=webgpu|webgl: the sample script's coverage by rule, a thumbnail per shot.
// The script (scripts/cafe-order.fountain) is built over the cafe with @vrmxg/coverage's rules, composed with its set and
// built into a world on an offline host (dprCap 1). The storyboard gives each shot's thumbnail frame; the thumbnails are
// rendered from snapshots (@vrmxg/coverage/thumbnails: SequencePlayer seeks, captureStill draws) twice: in film order
// (stepping forward, taking a snapshot every 2 s) and last shot first (every seek restores a snapshot). The two passes
// must give the same pixels. Also a strip of all the thumbnails with their numbers, as the creator's storyboard shows
// them. The runner (scripts/coverage-chromium.mjs) writes the PNGs to results/coverage/.
import { RenderHost } from '@vrmxg/render';
import { parse, serialize } from '@vrmxg/scene';
import { buildSequence } from '@vrmxg/script';
import { coverByRule, storyboard, lintLine } from '@vrmxg/coverage';
import { renderThumbnails } from '@vrmxg/coverage/thumbnails';
import { hashValue } from '@vrmxg/snapshot';
import { buildWorld, loadSample } from './world.js';

const SCRIPT = 'scripts/cafe-order.fountain', SEQ = 'sequences/cafe-order.vrmxs';
const text = (b) => new TextDecoder().decode(b);

/** RGBA (top row first) as a PNG data URL. */
function png(rgba, width, height) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return c.toDataURL('image/png');
}

/** The storyboard strip: every thumbnail in a row, the shot number and camera under each. */
function strip(thumbs, board, width, height) {
  const pad = 8, label = 34, c = document.createElement('canvas');
  c.width = pad + thumbs.length * (width + pad); c.height = pad + height + label;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1d22'; g.fillRect(0, 0, c.width, c.height);
  thumbs.forEach((t, i) => {
    const x = pad + i * (width + pad), s = board.shots[i];
    g.putImageData(new ImageData(new Uint8ClampedArray(t.rgba), width, height), x, pad);
    g.fillStyle = '#e8e8e8'; g.font = 'bold 14px sans-serif'; g.fillText(s.name, x + 2, pad + height + 16);
    g.fillStyle = s.crossesLine ? '#ff6b6b' : '#9aa0a6'; g.font = '12px sans-serif'; g.fillText(`${s.camera} · ${s.rig}`, x + 2, pad + height + 30);
  });
  return c.toDataURL('image/png');
}

/**
 * @param {{ R: any, bytes: (ref: string) => Promise<Uint8Array>, opts: any, backend: string, post?: any, width?: number, height?: number }} o
 */
export async function coverageCheck({ R, bytes, opts, backend, post = null, width = 480, height = 270 }) {
  const script = text(await bytes(SCRIPT)), set = parse(text(await bytes('cafe.vrmxs')));
  const { marks } = JSON.parse(text(await bytes('scripts/cafe-marks.json')));
  const built = buildSequence(script, { set, marks, id: 'cafe-order', source: SCRIPT, coverage: coverByRule() });
  if (!built.ok) throw new Error(built.errors.map((e) => `${SCRIPT}:${e.line}: ${e.message}`).join('\n'));
  const seqText = serialize(built.doc);
  const board = storyboard(built.doc, { set }), lint = lintLine(built.doc, { set });
  // the built sequence stands in for the committed one: the world loads it by its ref
  const read = async (ref) => (ref === SEQ ? new TextEncoder().encode(seqText) : bytes(ref));
  const sample = await loadSample(read, SEQ);
  const pass = async (order) => {
    const host = await RenderHost.create({ canvas: document.createElement('canvas'), backend, dprCap: 1, post });
    const w = await buildWorld(R, sample, { ...opts, mtoonMaterial: host.mtoonMaterial });
    const r = await renderThumbnails({ tree: w.tree, host, board, width, height, order });
    host.dispose(); host.renderer.forceContextLoss?.();
    w.audio?.dispose?.();
    return r.thumbs;
  };
  const film = await pass('film'), reverse = await pass('reverse');
  const differ = film.filter((t, i) => t.hash !== reverse[i].hash).map((t) => t.name);
  return {
    backend, size: [width, height], sequenceHash: hashValue(seqText), shots: board.shots.length,
    board, lint, sameFromSnapshots: !differ.length, differ,
    restoredInReverse: reverse.filter((t) => t.restored !== null).length,
    thumbs: film.map((t, i) => ({ shot: t.shot, name: t.name, frame: t.frame, step: t.step, hash: t.hash, reverseHash: reverse[i].hash, restored: reverse[i].restored, png: png(t.rgba, width, height) })),
    strip: strip(film.map((t) => ({ rgba: half(t.rgba, width, height) })), board, width >> 1, height >> 1),
  };
}

/** A thumbnail at half size (box filter), for the strip. */
function half(rgba, w, h) {
  const W = w >> 1, H = h >> 1, out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let k = 0; k < 4; k++) {
    const i = (2 * y * w + 2 * x) * 4 + k;
    out[(y * W + x) * 4 + k] = (rgba[i] + rgba[i + 4] + rgba[i + w * 4] + rgba[i + w * 4 + 4] + 2) >> 2;
  }
  return out;
}
