// What an export is: a size, a frame rate (rational, so 29.97 lands exactly), how many frames, and how far the
// simulation must run for them and for the sound under them. Pure arithmetic on the 60 Hz clock (AB-D-0245).
import { frameToStep, rationalFps } from '@vrmxg/core';

/** Output sizes the editor offers (width × height, even numbers as the encoders need). */
export const SIZES = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '4k': [3840, 2160] };

/** Frame rates the editor offers, by label. */
export const RATES = { '24': { num: 24, den: 1 }, '25': { num: 25, den: 1 }, '29.97': { num: 30000, den: 1001 }, '30': { num: 30, den: 1 }, '50': { num: 50, den: 1 }, '60': { num: 60, den: 1 } };

/** Codecs the shell's writer takes; the alpha ones keep transparency (a .mov). */
export const CODECS = {
  h264: { label: 'H.264', short: 'H.264', ext: 'mp4', alpha: false },
  hevc: { label: 'HEVC', short: 'HEVC', ext: 'mp4', alpha: false },
  'hevc-alpha': { label: 'HEVC with alpha', short: 'HEVC α', ext: 'mov', alpha: true },
  prores4444: { label: 'ProRes 4444', short: 'ProRes', ext: 'mov', alpha: true },
};

/** Frames in `seconds` at `fps` (rounded to the nearest frame). */
export function framesFor(seconds, fps) {
  const { num, den } = rationalFps(fps);
  return Math.max(1, Math.round((seconds * num) / den));
}

/** The take's length in seconds, exactly: frames · den / num. */
export function secondsOf(frames, fps) { const { num, den } = rationalFps(fps); return (frames * den) / num; }

/**
 * The steps a shot of `frames` frames simulates. Frame n shows step frameToStep(n).step blended at α; the sound runs
 * to the end of the last frame, so the shot steps on to frame `frames`' step (those last steps are heard, not seen).
 */
export function stepsFor(frames, fps) { return frameToStep(frames, fps).step; }

/** Audio samples under `frames` frames at `rate` Hz, rounded. */
export function audioSamples(frames, fps, rate = 48000) { const { num, den } = rationalFps(fps); return Math.round((frames * den * rate) / num); }

/** Every frame's step and α, for checks and the frame loop. */
export function framePlan(frames, fps) { return Array.from({ length: frames }, (_, n) => frameToStep(n, fps)); }
