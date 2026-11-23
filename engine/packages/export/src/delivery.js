// Delivery (M4 W10, AB-T-0582): what a delivery holds besides the film, worked out as plain data so it is the same on
// every engine and testable in Node.
//   - stills: one per shot, the frame in the middle of the shot, taken from the film's own read-back bytes as they pass
//     (so a still is exactly the delivered frame, not a second render), at the delivery size;
//   - thumbnails: the same frames boxed down to 480×270 (integer arithmetic: the same bytes everywhere);
//   - a turntable: an orbit once around a character, its camera from orbitPose (dmath's sines, portable: AB-L-0345);
//   - the file names, under one folder per delivery.
import { sin, cos } from '@vrmxg/dmath';
import { rationalFps } from '@vrmxg/core';

/** The thumbnail size (16:9, the storyboard's). */
export const THUMB = Object.freeze([480, 270]);

/**
 * The frames a delivery keeps as stills and thumbnails: each shot's middle frame, in the export's frames (a sequence at
 * 24 fps exported at 24 maps one to one; another rate scales). No shots: the film's middle frame.
 * @param {{ fps: number, shots?: Array<{ id: string, start: number, end: number }> }} seq
 * @param {number} frames the export's frame count @param {number | { num: number, den: number }} fps the export's rate
 * @returns {Array<{ shot: string, n: number }>} in frame order, one per frame
 */
export function stillFrames(seq, frames, fps) {
  const { num, den } = rationalFps(fps);
  const at = (seqFrame) => Math.min(frames - 1, Math.floor((seqFrame * num) / (den * seq.fps)));
  const shots = (seq.shots ?? []).filter((s) => s.end > s.start);
  const picks = shots.length ? shots.map((s) => ({ shot: s.id, n: at(Math.floor((s.start + s.end - 1) / 2)) })) : [{ shot: 'film', n: Math.floor((frames - 1) / 2) }];
  const seen = new Set();
  return picks.filter((p) => p.n >= 0 && !seen.has(p.n) && seen.add(p.n)).sort((a, b) => a.n - b.n);
}

/**
 * Straight-alpha RGBA (top-down) boxed down to tw × th: each output pixel the rounded mean of the source pixels its box
 * covers (boxes split at floor(x · w / tw), so any size works; 1080p and 4K to 480×270 are whole 4×4 and 8×8 boxes).
 * Integer arithmetic only. @returns {Uint8ClampedArray}
 */
export function boxDown(rgba, w, h, tw, th) {
  if (tw > w || th > h) throw new Error(`boxDown makes images smaller: ${w}×${h} → ${tw}×${th}`);
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor((y * h) / th), y1 = Math.floor(((y + 1) * h) / th);
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * w) / tw), x1 = Math.floor(((x + 1) * w) / tw);
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3]; }
      const c = (x1 - x0) * (y1 - y0), half = c >> 1, o = (y * tw + x) * 4;
      out[o] = Math.floor((r + half) / c); out[o + 1] = Math.floor((g + half) / c); out[o + 2] = Math.floor((b + half) / c); out[o + 3] = Math.floor((a + half) / c);
    }
  }
  return out;
}

/**
 * The camera of turntable frame n of `frames`: once round `center` at `radius`, `height` above it, looking at it,
 * starting in front (+Z) and turning anticlockwise seen from above. Portable sines (dmath), so every engine agrees.
 * @param {number} n @param {number} frames @param {{ center: number[], radius: number, height?: number, start?: number }} o
 */
export function orbitPose(n, frames, { center, radius, height = 0, start = 0 }) {
  const a = start + (2 * Math.PI * n) / frames;
  return { position: [center[0] + radius * sin(a), center[1] + height, center[2] + radius * cos(a)], target: [center[0], center[1], center[2]] };
}

/**
 * How far a camera with a vertical field of view `fovDeg` must stand to fit something `tall` metres high and `wide`
 * across in a frame of `aspect`, with `margin` around it. @returns {number} metres
 */
export function fitDistance(tall, wide, fovDeg, aspect, margin = 1.15) {
  const half = (fovDeg * Math.PI) / 360;
  const t = sin(half) / cos(half);
  return (Math.max(tall, wide / aspect) * margin) / (2 * t) + wide / 2;
}

/** A file-name-safe piece: letters, digits, '-' and '_'. */
export function slug(s) { return String(s).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'export'; }

/**
 * The files of a delivery, by role, under `deliveries/<base>/` (a project's folder for its deliveries).
 * @param {{ base: string, ext: string, stills?: Array<{ shot: string }>, turntables?: string[], subtitles?: boolean }} o
 */
export function deliveryFiles({ base, ext, stills = [], turntables = [], subtitles = false }) {
  const dir = `deliveries/${slug(base)}`, b = slug(base);
  return {
    dir,
    film: `${dir}/${b}.${ext}`,
    subtitles: subtitles ? `${dir}/${b}.srt` : null,
    stills: stills.map((s) => `${dir}/stills/${b}-${slug(s.shot)}.png`),
    thumbnails: stills.map((s) => `${dir}/thumbnails/${b}-${slug(s.shot)}.png`),
    turntables: turntables.map((id) => `${dir}/turntables/${b}-${slug(id)}.${ext}`),
    manifest: `${dir}/delivery.json`,
  };
}
