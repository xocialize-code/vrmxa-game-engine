// The sample's sounds (M1 W5), synthesised here (CC0, no recordings): the doors opening and closing, the light
// switch, the cafe's room tone and a music loop. Deterministic (a seeded generator), so a re-run writes the same bytes.
//   node tools/make-sounds.mjs        (from content/sample)
import fs from 'node:fs';
import path from 'node:path';
import { writeWav } from '../../../engine/packages/audio/src/wav.js';

const here = path.join(import.meta.dirname, '..');
const R = 24000;
const TAU = 2 * Math.PI;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const buf = (s, rate = R) => new Float32Array(Math.round(s * rate));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
function lowpass(x, cut, rate = R) { const k = 1 - Math.exp((-TAU * cut) / rate); let y = 0; for (let i = 0; i < x.length; i++) { y += k * (x[i] - y); x[i] = y; } return x; }
function normalize(x, peak) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); const g = m ? peak / m : 1; for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
function write(rel, x, rate = R) { fs.writeFileSync(path.join(here, rel), writeWav([x], rate)); console.log('wrote', rel, (x.length / rate).toFixed(2), 's'); }

// the door opening: a short creak (a gliding, wobbling buzz through a low-pass) after the latch's click
{
  const r = rng(1), x = buf(0.9);
  for (let i = 0; i < x.length; i++) {
    const t = i / R;
    const click = t < 0.012 ? (r() * 2 - 1) * (1 - t / 0.012) : 0;
    const f = 180 + 220 * Math.min(1, t / 0.7), wob = 1 + 0.35 * Math.sin(TAU * 23 * t);
    const saw = ((t * f) % 1) * 2 - 1;
    const creak = t > 0.05 ? saw * wob * env(t - 0.05, 0.08, 0.35) * 0.5 : 0;
    x[i] = click * 0.8 + creak;
  }
  write('sounds/door-open.wav', normalize(lowpass(x, 2200), 0.7));
}
// the door closing: a low thud with a little rattle
{
  const r = rng(2), x = buf(0.6);
  for (let i = 0; i < x.length; i++) { const t = i / R; x[i] = Math.sin(TAU * (70 - 30 * t) * t) * env(t, 0.004, 0.09) + (r() * 2 - 1) * env(t, 0.002, 0.03) * 0.6; }
  write('sounds/door-close.wav', normalize(lowpass(x, 1500), 0.8));
}
// the light switch: two clicks, down and back
{
  const r = rng(3), x = buf(0.12);
  for (let i = 0; i < x.length; i++) { const t = i / R; const a = env(t, 0.0005, 0.004), b = t > 0.035 ? env(t - 0.035, 0.0005, 0.006) * 0.5 : 0; x[i] = (r() * 2 - 1) * (a + b) + Math.sin(TAU * 3200 * t) * a * 0.4; }
  write('sounds/switch.wav', normalize(x, 0.6));
}
// the cafe's room tone: soft brown noise with now and then a cup on a saucer; 8 s, loops seamlessly
{
  const r = rng(4), s = 8, x = buf(s);
  let b = 0;
  for (let i = 0; i < x.length; i++) { b = (b + (r() * 2 - 1) * 0.02) * 0.998; x[i] = b; }
  for (let k = 0; k < 7; k++) {
    const t0 = 0.4 + r() * (s - 1), f = 2400 + r() * 1800, i0 = Math.round(t0 * R);
    for (let i = 0; i < R * 0.4 && i0 + i < x.length; i++) { const t = i / R; x[i0 + i] += Math.sin(TAU * f * t) * env(t, 0.001, 0.05) * 0.05 + Math.sin(TAU * f * 1.51 * t) * env(t, 0.001, 0.03) * 0.03; }
  }
  const fade = Math.round(0.5 * R); // crossfade the end into the start: no seam when it loops
  for (let i = 0; i < fade; i++) { const w = i / fade; x[i] = x[i] * w + x[x.length - fade + i] * (1 - w); }
  write('sounds/cafe-ambience.wav', normalize(x.subarray(0, x.length - fade).slice(), 0.25));
}
// the music: a slow loop of four chords (Fmaj7, Dm7, Bbmaj7, C) with a plucked line over it; 16 s at 80 bpm
{
  const rate = 22050, bar = 3, x = buf(bar * 4 + 4, rate), r = rng(5);
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  const chords = [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 60]];
  const line = [[72, 0], [69, 0.75], [67, 1.5], [65, 2.25], [69, 3], [65, 3.75], [64, 4.5], [62, 5.25], [65, 6], [62, 6.75], [60, 7.5], [62, 8.25], [64, 9], [67, 9.75], [64, 10.5], [60, 11.25]];
  chords.forEach((c, k) => {
    const t0 = k * bar;
    for (const n of c) { const f = midi(n); for (let i = 0; i < bar * 1.3 * rate; i++) { const t = i / rate, j = Math.round(t0 * rate) + i; if (j >= x.length) break; x[j] += (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t)) * env(t, 0.4, 1.6) * 0.06; } }
  });
  for (const [n, beat] of line) { const f = midi(n), t0 = beat; for (let i = 0; i < 1.2 * rate; i++) { const t = i / rate, j = Math.round(t0 * rate) + i; if (j >= x.length) break; x[j] += (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * 3 * f * t) * env(t, 0.002, 0.05)) * env(t, 0.003, 0.35) * 0.12 * (0.85 + r() * 0.3); } }
  const loop = bar * 4 * rate; // fold the tail that rings past the loop point back onto its start
  for (let i = loop; i < x.length; i++) x[i - loop] += x[i];
  write('sounds/music.wav', normalize(x.subarray(0, loop).slice(), 0.5), rate);
}
