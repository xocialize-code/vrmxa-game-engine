// A performance take (M4 W9, AB-T-0581): one character's performance over a sequence, as a log.
//
// A take is its inputs, each stamped with the simulation step it applies on, and nothing else:
//   puppet     the input recording (@vrmxg/input, the puppet's own action map) and the camera yaw her walking was
//              relative to
//   director   the ai service's log for her: every request, and every decision the model's replies became. The replies
//              are the input, so nothing here ever asks a model again
//   face       the face samples the camera gave (blink, jaw, smile, brows, head angles), as measured
// The tracks a take becomes are a pure function of this document (tracks.js: takeTracks), so the same log gives the same
// tracks, byte for byte, in Node, Chromium and WKWebView, and the film that plays them is the same world in all three.
//
//   { "format": "vrmxg-performance", "version": 1, "id": "take-3", "kind": "puppet", "target": "mira",
//     "sequence": { "id": "the-regular", "hash": "…" }, "fps": 24, "start": 600, "end": 1320, "setup": { … }, "log": { … } }
// start and end are steps: the first step the log applies on, and the step recording stopped at (the first it doesn't).
import { rationalFps, HZ } from '@vrmxg/core';

export const TAKE_FORMAT = 'vrmxg-performance';
export const TAKE_KINDS = ['puppet', 'director', 'face'];

/** Four decimals: what a log and its keys keep of a measured value. */
export const r4 = (v) => Math.round(v * 1e4) / 1e4;
/** Three decimals: expression weights. */
export const r3 = (v) => Math.round(v * 1e3) / 1e3;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The sequence frame a value applied on `step` is seen at: the frame that step arrives at, in the sequence service's own
 * arithmetic (a sequence that started at step 0 from frame 0), so a key there lands on exactly that step.
 */
export function frameOfStep(step, fps) {
  const { num, den } = rationalFps(fps);
  return ((step + 1) * num) / (HZ * den);
}

/** The first step whose frame is at or past `frame` (the step a take punched in at that frame starts on). */
export function stepOfFrame(frame, fps) {
  const { num, den } = rationalFps(fps);
  return Math.max(0, Math.ceil((frame * HZ * den) / num) - 1);
}

/**
 * A take document, checked. Its keys are in one order whatever made it, so its text and its hash are stable.
 * @param {{ id: string, kind: string, target: string, sequence?: { id?: string, hash?: string } | null, fps: number | { num: number, den: number }, start: number, end: number, setup?: any, log: any, note?: string }} o
 */
export function makeTake({ id, kind, target, sequence = null, fps, start, end, setup = {}, log, note = null }) {
  const take = { format: TAKE_FORMAT, version: 1, id, kind, target, sequence: sequence ? { id: sequence.id ?? null, hash: sequence.hash ?? null } : null, fps, start, end, setup: structuredClone(setup), log: structuredClone(log), ...(note ? { note } : {}) };
  const problems = checkTake(take);
  if (problems.length) throw new Error(`not a take: ${problems.join('; ')}`);
  return take;
}

export const isTake = (d) => d?.format === TAKE_FORMAT;

/** Problems with a take document, as messages (empty when it is fine). */
export function checkTake(t) {
  const out = [];
  if (t?.format !== TAKE_FORMAT) return [`format is "${t?.format}", not "${TAKE_FORMAT}"`];
  if (t.version !== 1) out.push(`version ${t.version}: this build reads 1`);
  if (typeof t.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(t.id)) out.push('id: letters, digits, - and _');
  if (!TAKE_KINDS.includes(t.kind)) out.push(`kind "${t.kind}" (${TAKE_KINDS.join(', ')})`);
  if (typeof t.target !== 'string' || !t.target) out.push('target: the character it performs');
  if (!(typeof t.fps === 'number' && t.fps > 0) && !(t.fps?.num > 0 && t.fps?.den > 0)) out.push('fps: the sequence\'s frame rate');
  if (!Number.isInteger(t.start) || !Number.isInteger(t.end) || t.start < 0 || t.end <= t.start) out.push(`steps ${t.start} → ${t.end}: a take ends after it starts`);
  if (!t.log || typeof t.log !== 'object') return [...out, 'log: missing'];
  if (t.kind === 'puppet') {
    const rec = t.log.input;
    if (rec?.version !== 1 || !Array.isArray(rec.frames) || !Array.isArray(rec.axes) || !Array.isArray(rec.buttons)) out.push('log.input: an @vrmxg/input recording');
    else if (rec.start !== t.start) out.push(`log.input starts at step ${rec.start}, the take at ${t.start}`);
    else if (rec.frames.length !== t.end - t.start) out.push(`log.input has ${rec.frames.length} steps, the take ${t.end - t.start}`);
    if (!Array.isArray(t.log.yaw)) out.push('log.yaw: [[step, yaw], …]');
  } else if (t.kind === 'director') {
    if (!Array.isArray(t.log.ai)) out.push('log.ai: the ai service\'s log for the character');
    else if (t.log.ai.some((e) => !Number.isInteger(e?.step) || e.agent !== t.target)) out.push('log.ai: every event has a step and is the target\'s');
  } else if (t.kind === 'face') {
    if (!Array.isArray(t.log.face)) out.push('log.face: [{ step, blinkL, blinkR, jaw, smile, browUp, browDown, yaw, pitch, roll }, …]');
    else for (let i = 0; i < t.log.face.length; i++) {
      const s = t.log.face[i];
      if (!Number.isInteger(s?.step) || (i > 0 && s.step < t.log.face[i - 1].step)) { out.push('log.face: samples carry their step, in order'); break; }
    }
  }
  return out;
}
