// The fixed simulation clock (AB-D-0245): 60 steps per second, always. Two ways to drive it:
//
//   - offline (export, scrubbing): frame n at a frame rate maps to a step and an interpolation α,
//     with exact integer arithmetic, so 24, 25, 30, 50, 60 and 29.97 fps all land where they should;
//   - live play: an accumulator turns elapsed display time (passed in by the host, never read here)
//     into whole steps plus α. `timeScale` changes how many steps a wall second buys, never the step
//     length, so slow motion stays deterministic.

export const HZ = 60;
export const DT = 1 / HZ;

/**
 * A frame rate as a rational number: 24 → { num: 24, den: 1 }; the NTSC rates as usually written
 * (23.976, 29.97, 59.94) → 24000/1001, 30000/1001, 60000/1001.
 * @param {number | { num: number, den: number }} fps
 */
export function rationalFps(fps) {
  if (typeof fps === 'object') return fps;
  if (Math.abs(fps - 30000 / 1001) < 1e-3) return { num: 30000, den: 1001 };
  if (Math.abs(fps - 24000 / 1001) < 1e-3) return { num: 24000, den: 1001 };
  if (Math.abs(fps - 60000 / 1001) < 1e-3) return { num: 60000, den: 1001 };
  if (!Number.isInteger(fps)) throw new Error(`frame rate ${fps}: pass { num, den } for a non-integer rate`);
  return { num: fps, den: 1 };
}

/**
 * Which step frame n falls on, and how far towards the next step (α in [0, 1)).
 * t = n / fps seconds = n · den / num; in steps, n · 60 · den / num. Integer maths: exact for any
 * n below 2^53 / (60 · den).
 * @param {number} n frame index from the shot's start
 * @param {number | { num: number, den: number }} fps
 * @returns {{ step: number, alpha: number }}
 */
export function frameToStep(n, fps) {
  const { num, den } = rationalFps(fps);
  const ticks = n * HZ * den;
  const step = Math.floor(ticks / num);
  return { step, alpha: (ticks - step * num) / num };
}

export class Clock {
  constructor() {
    /** Steps taken since the start. The only time the simulation knows. */
    this.step = 0;
    /** Wall seconds per wall second in live play; 0.5 = half speed. Never changes the step length. */
    this.timeScale = 1;
    this.paused = false;
    this._acc = 0;
  }

  /** Simulated seconds since the start. */
  get time() { return this.step / HZ; }

  /**
   * Live play: add elapsed display time and get how many steps to run now and the α to render at.
   * At most `maxSteps` per call, so a long stall doesn't spiral (the backlog is dropped).
   * @param {number} elapsedSeconds supplied by the host's frame loop
   */
  advance(elapsedSeconds, maxSteps = 8) {
    if (this.paused) return { steps: 0, alpha: this._acc * HZ };
    this._acc += elapsedSeconds * this.timeScale;
    let steps = Math.floor(this._acc * HZ);
    if (steps > maxSteps) { steps = maxSteps; this._acc = 0; } else this._acc -= steps * DT;
    return { steps, alpha: Math.min(1, Math.max(0, this._acc * HZ)) };
  }

  getState() { return { step: this.step }; }
  setState(s) { this.step = s.step; this._acc = 0; }
}
