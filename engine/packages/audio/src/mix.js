// The offline mix (for frame export, M1 W8): a recording (service.js) rendered through OfflineAudioContexts. Every
// sound starts at its step's time, at its recorded gain, positional ones moved step by step with the listener. Each
// sound is rendered on its own and the results are added in a fixed order, so two mixes of the same recording are the
// same samples. The listener's bus settings are not applied: an export is mixed at full level.
import { setPos, setListener } from './service.js';

const DT = 1 / 60;

/**
 * @param {{ from: number, to: number, steps: Array<{ step: number, sounds: any[], listener: any }> }} recording
 * @param {import('./library.js').AudioLibrary} library
 * @param {{ sampleRate?: number, OfflineAudioContext?: any, channels?: number }} [opts]
 * @returns {Promise<AudioBuffer | { numberOfChannels: number, length: number, sampleRate: number, getChannelData: (c: number) => Float32Array }>}
 */
export async function mixOffline(recording, library, { sampleRate = 48000, OfflineAudioContext: Ctor = globalThis.OfflineAudioContext, channels = 2 } = {}) {
  const t0 = recording.from;
  const length = Math.ceil(Math.max(DT, (recording.to - t0) * DT) * sampleRate);
  const at = (step) => Math.max(0, (step - t0) * DT);
  // the sounds: each key's runs (start step → the steps it was heard on)
  const runs = new Map();
  for (const { step, sounds } of recording.steps) {
    for (const s of sounds) {
      const id = `${s.key}@${s.startStep}`;
      if (!runs.has(id)) runs.set(id, { s, steps: [] });
      runs.get(id).steps.push({ step, position: s.position, gain: s.gain });
    }
  }
  // Web Audio sums sources that play together in an order it doesn't promise, and float addition isn't associative:
  // render each sound on its own (each render is deterministic) and add them here, in key order
  const out = Array.from({ length: channels }, () => new Float32Array(length));
  for (const id of [...runs.keys()].sort()) {
    const { s, steps } = runs.get(id);
    const ctx = new Ctor({ numberOfChannels: channels, length, sampleRate });
    const buffer = await library.buffer(ctx, s.ref);
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = s.loop;
    const gain = ctx.createGain();
    let tail = gain;
    if (s.position) {
      const p = ctx.createPanner();
      Object.assign(p, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: s.distance.ref, maxDistance: s.distance.max, rolloffFactor: s.distance.rolloff });
      for (const x of steps) if (x.position) setPos(p, x.position, at(x.step));
      for (const { step, listener } of recording.steps) if (listener) setListener(ctx.listener, listener, at(step));
      gain.connect(p); tail = p;
    }
    for (const x of steps) gain.gain.setValueAtTime(x.gain, at(x.step));
    tail.connect(ctx.destination);
    src.connect(gain);
    const first = steps[0].step, last = steps.at(-1).step;
    const offset = (first - s.startStep) * DT; // a sound already playing when the recording began
    src.start(at(first), s.loop ? offset % buffer.duration : offset);
    src.stop(at(last + 1));
    const r = await ctx.startRendering();
    for (let c = 0; c < channels; c++) { const a = out[c], b = r.getChannelData(Math.min(c, r.numberOfChannels - 1)); for (let i = 0; i < length; i++) a[i] += b[i]; }
  }
  if (typeof AudioBuffer === 'function') {
    const b = new AudioBuffer({ numberOfChannels: channels, length, sampleRate });
    out.forEach((d, c) => b.copyToChannel(d, c));
    return b;
  }
  return { numberOfChannels: channels, length, sampleRate, getChannelData: (c) => out[c] };
}

/** A hash of a buffer's samples (FNV-1a over the float bits), to compare renders. */
export function hashSamples(buffer) {
  let h = 0x811c9dc5 >>> 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const u = new Uint32Array(buffer.getChannelData(c).slice().buffer);
    for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, '0');
}
