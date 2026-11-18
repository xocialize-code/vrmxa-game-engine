// Word timings → VRM 1.0 mouth expressions (aa ih ou ee oh), sampled on the step clock.
//
// The word → viseme step and the envelope timing are a port of met4citizen/TalkingHead (MIT, © 2023-2024 Mika
// Suominen): speakAudio()'s word branch in talkinghead.mjs 1.8.2, with its English module (vendor/lipsync-en.js)
// unchanged. What is ours (from AB-T-0490's spike, mlxengine-3d/DEV/VRMLipSync): the output goes to VRM's five vowel
// expressions instead of 15 Oculus visemes, with PP / FF closing the lips; the track is sampled at a time, not run as an
// animation queue. Polynomials only (smoothstep): the same weights in every engine, so lip sync is simulation.
//
// Words are { text, start, duration } in seconds from the clip's first sample (the engine's TTSWordTiming shape).
import { LipsyncEn } from './vendor/lipsync-en.js';

/** Oculus viseme → weights on VRM vowels. PP and FF close the lips (CLOSURE). */
export const OCULUS_TO_VRM = {
  aa: { aa: 1.0 }, E: { ee: 1.0 }, I: { ih: 1.0 }, O: { oh: 1.0 }, U: { ou: 1.0 },
  RR: { ou: 0.6, ih: 0.1 }, CH: { ih: 0.5, ou: 0.3 }, SS: { ih: 0.45 }, TH: { ih: 0.3, aa: 0.15 }, DD: { ih: 0.3, aa: 0.2 },
  kk: { aa: 0.35, ih: 0.15 }, nn: { ih: 0.3, aa: 0.1 }, FF: { ih: 0.15 }, PP: {}, sil: {},
};
const CLOSURE = { PP: 1.0, FF: 0.5 };
export const GAIN = 1.3;
export const VOWELS = ['aa', 'ih', 'ou', 'ee', 'oh'];

const en = new LipsyncEn();
const convertRange = (v, [a, b], [c, d]) => c + ((v - a) * (d - c)) / (b - a);

/**
 * A viseme key track from word timings (TalkingHead.speakAudio, times in ms there): visemes from the word's letters,
 * spread over min(duration, 200 ms × visemes); each ramps up from t − min(60, 2d/3) to t + min(25, d/2) and back to 0
 * at t + d + min(60, d/2). → [{ viseme, t0, t1, t2, level }] in seconds
 */
export function buildTrack(words) {
  const keys = [];
  for (const w of words) {
    if (!w.text) continue;
    const time = w.start * 1000;
    let duration = w.duration * 1000;
    const val = en.wordsToVisemes(en.preProcessText(w.text));
    if (!val || !val.visemes.length) continue;
    const n = val.visemes.length;
    const dTotal = val.times[n - 1] + val.durations[n - 1];
    if (!(dTotal > 0) || !(duration > 0)) continue;
    const overdrive = Math.min(duration, Math.max(0, duration - n * 150));
    const level = 0.6 + convertRange(overdrive, [0, duration], [0, 0.4]);
    duration = Math.min(duration, n * 200);
    for (let j = 0; j < n; j++) {
      const v = val.visemes[j];
      const t = time + (val.times[j] / dTotal) * duration;
      const d = (val.durations[j] / dTotal) * duration;
      keys.push({ viseme: v, t0: (t - Math.min(60, (2 * d) / 3)) / 1000, t1: (t + Math.min(25, d / 2)) / 1000, t2: (t + d + Math.min(60, d / 2)) / 1000, level: v === 'PP' || v === 'FF' ? 0.9 : level });
    }
  }
  return keys;
}

const ease = (x) => x * x * (3 - 2 * x); // smoothstep (TalkingHead uses a sigmoid)

/** The mouth at time t (s) → { aa, ih, ou, ee, oh } in 0..1. */
export function sampleMouth(track, t) {
  const vis = {};
  for (const k of track) {
    if (t <= k.t0 || t >= k.t2) continue;
    const v = t < k.t1 ? k.level * ease((t - k.t0) / Math.max(1e-6, k.t1 - k.t0)) : k.level * (1 - ease((t - k.t1) / Math.max(1e-6, k.t2 - k.t1)));
    if (!(k.viseme in vis) || v > vis[k.viseme]) vis[k.viseme] = v;
  }
  const out = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  let closure = 0;
  for (const [v, a] of Object.entries(vis)) {
    for (const [e, wgt] of Object.entries(OCULUS_TO_VRM[v] || {})) out[e] += a * wgt;
    if (CLOSURE[v]) closure = Math.max(closure, a * CLOSURE[v]);
  }
  // VRM vowels carry the jaw that Oculus consonant shapes carry on their own: lift the mouth a little (GAIN), keep the
  // vowel sum at most 1 (they are authored one at a time), and close it by the lip closure
  let sum = 0;
  for (const e of VOWELS) { out[e] *= GAIN; sum += out[e]; }
  const scale = (sum > 1 ? 1 / sum : 1) * (1 - closure);
  for (const e of VOWELS) out[e] = Math.min(1, out[e] * scale);
  return out;
}

/** Index of the word being spoken at t, or -1. */
export function wordAt(words, t) {
  for (let i = 0; i < words.length; i++) { const w = words[i]; if (t >= w.start && t < w.start + Math.max(w.duration, 0.06)) return i; }
  return -1;
}

/**
 * Word timings for a line with no clip (a caption the character mouths): about 13 characters a second, a pause after
 * punctuation. Deterministic from the text alone.
 */
export function estimateWords(text, { start = 0.15, cps = 13 } = {}) {
  const words = [];
  let t = start;
  for (const raw of String(text).split(/\s+/)) {
    const clean = raw.replace(/[^\p{L}\p{N}']/gu, '');
    if (!clean) continue;
    const d = Math.max(0.12, clean.length / cps);
    words.push({ text: clean, start: Math.round(t * 1000) / 1000, duration: Math.round(d * 1000) / 1000 });
    t += d + (/[.!?]$/.test(raw) ? 0.35 : /[,;:]$/.test(raw) ? 0.15 : 0.04);
  }
  return words;
}
