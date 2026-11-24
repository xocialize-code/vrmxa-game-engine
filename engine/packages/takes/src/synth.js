// A synthetic face session (M4 W9): what a camera would report of a person who holds still for a moment, then blinks,
// smiles, raises and lowers their brows, talks, winks and turns their head, with a resting face that isn't zero and a
// little seeded noise. The take pipeline, its replay and the acceptance run on this, with no camera; a real session only
// changes the numbers. Deterministic: dmath's sine and an integer generator.
import { sin } from '@vrmxg/dmath';
import { HZ } from '@vrmxg/core';
import { r4, clamp } from './take.js';

const TAU = 6.283185307179586;
const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
/** 0 → 1 over [a, a + up], held, 1 → 0 over [b, b + down]. */
const pulse = (t, a, b, up = 0.3, down = 0.4) => Math.min(ramp(t, a, a + up), 1 - ramp(t, b, b + down));

/**
 * @param {{ start?: number, seconds?: number, fps?: number, seed?: number, noise?: number }} [o] start: the step of the
 *   first sample; fps: the camera's rate
 * @returns {any[]} face samples, each with its step
 */
export function syntheticFace({ start = 0, seconds = 9, fps = 15, seed = 7, noise = 0.012 } = {}) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  const out = [], n = Math.floor(seconds * fps);
  for (let k = 0; k < n; k++) {
    const t = k / fps;
    const blink = Math.max(pulse(t, 1.6, 1.7, 0.07, 0.1), pulse(t, 3.4, 3.5, 0.07, 0.1), pulse(t, 5.9, 6.0, 0.07, 0.1));
    const wink = pulse(t, 7.9, 8.2, 0.08, 0.12);
    const talk = t > 6.3 && t < 7.6 ? Math.max(0, 0.3 + 0.3 * sin(TAU * 3 * t)) : 0;
    const turn = t > 2 ? 0.35 * sin((TAU * (t - 2)) / 4) : 0;
    const nod = 0.2 * pulse(t, 4.6, 4.9, 0.2, 0.25);
    const j = () => rnd() * noise * 2;
    out.push({
      step: start + Math.round((k * HZ) / fps),
      blinkL: r4(clamp(0.08 + 0.9 * Math.max(blink, wink) + j(), 0, 1)), blinkR: r4(clamp(0.08 + 0.9 * blink + j(), 0, 1)),
      jaw: r4(clamp(0.05 + talk + j(), 0, 1)),
      smile: r4(clamp(0.1 + 0.75 * pulse(t, 2.0, 3.5) + j(), 0, 1)),
      browUp: r4(clamp(0.12 + 0.7 * pulse(t, 4.2, 5.0) + j(), 0, 1)),
      browDown: r4(clamp(0.05 + 0.6 * pulse(t, 5.4, 6.1) + j(), 0, 1)),
      yaw: r4(0.03 + turn + j()), pitch: r4(-0.05 - nod + j()), roll: r4(0.02 + 0.1 * pulse(t, 7.0, 7.6) + j()),
    });
  }
  return out;
}
