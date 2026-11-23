// Exporting a take (M1 W8, AB-T-0520). A take is a world built from step 0 (a scene, plus recorded input replayed);
// the export steps it offline at the shot's frame rate (frame n shows frameToStep(n) blended at α, exactly what live
// play would have shown at n / fps), renders each frame at the export size, reads it back asynchronously (one frame
// behind, a pixel-pack buffer) and hands it to a sink with at most `inflight` frames outstanding. Then it runs on to
// the end of the last frame for the sound, mixes what was recorded offline and hands the sink a WAV.
//
// M4 W2 (AB-T-0574): on either backend. readbackFor(host) gives WebGL's pixel-pack readback or WebGPU's (an output
// target, a ring of 3 map buffers); WebGPU's rows come top-down, and the sink's job says so (`topDown`: the shell's
// writer flips WebGL's rows and leaves WebGPU's).
//
// Nothing here reads a clock except the caller's `now`, for the timings it reports. Frames depend only on the world
// and the frame rate: two exports of a take give the same pixels, frame for frame.
import { frameToStep, rationalFps } from '@vrmxg/core';
import { mixOffline, writeWav } from '@vrmxg/audio';
import { readbackFor } from './gpu-readback.js';
import { stepsFor, audioSamples, secondsOf } from './plan.js';

/**
 * @param {object} o
 * @param {any} o.tree the take's world, at step 0, input replay already set up
 * @param {any} o.host a RenderHost to draw with (its own canvas, dprCap 1: the export size is the drawing buffer)
 * @param {number | { num: number, den: number }} o.fps
 * @param {number} o.frames
 * @param {number} o.width @param {number} o.height
 * @param {any} o.sink see sinks.js
 * @param {object} [o.job] extra fields for the sink's begin (codec, suggestedName, …)
 * @param {boolean} [o.audio] mix and send the sound (needs the tree's audio service)
 * @param {number} [o.inflight] frames outstanding at the sink (2)
 * @param {number} [o.lag] how many frames behind the render readback is copied out (1; 2 measured no faster at 4K: the cost
 *   is the 33 MB copy out of WebKit's GPU process, not the GPU finishing). WebGPU's ring of 3 allows up to 2
 * @param {(p: { n: number, frames: number, phase: string }) => void} [o.onProgress]
 * @param {(n: number, step: number, alpha: number) => void} [o.onFrame] after frame n is drawn (a check hashing the world)
 * @param {{ aborted: boolean }} [o.signal]
 * @param {() => number} [o.now] a wall clock, for the timings only
 * @param {any} [o.OfflineAudioContext]
 */
export async function exportTake({ tree, host, fps, frames, width, height, sink, job = {}, audio = true, inflight = 2, lag = 1, onProgress, onFrame, signal, now = () => 0, OfflineAudioContext }) {
  const rate = rationalFps(fps);
  const sound = audio ? tree.services.get('audio') : null;
  if (audio && !sound) throw new Error('this world has no audio service; export with audio: false');
  if (tree.clock.step !== 0) throw new Error(`a take is exported from step 0 (the tree is at ${tree.clock.step})`);
  const fixed = tree.services.get('cameras')?.fixed;
  if (fixed !== undefined && Math.abs(fixed - width / height) > 1e-9) throw new Error(`this world frames at a fixed aspect of ${fixed.toFixed(4)}; ${width}×${height} is ${(width / height).toFixed(4)}`);
  host.attach(tree);
  host.resize(width, height);
  const gl = host.renderer.isWebGPURenderer ? null : host.renderer.getContext();
  const drawn = gl ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } : host.drawingBufferSize();
  if (drawn.width !== width || drawn.height !== height) throw new Error(`the drawing buffer is ${drawn.width}×${drawn.height}, not ${width}×${height} (give the export host dprCap: 1)`);
  const slots = lag + 1;
  const rb = readbackFor(host, width, height);
  if (slots > rb.ring) throw new Error(`lag ${lag} needs ${slots} readback slots; this backend's ring has ${rb.ring}`);
  const buf = new Uint8Array(width * height * 4);
  const t = { begin: 0, render: 0, readback: 0, wait: 0, audio: 0, end: 0 };
  const t0 = now();
  sound?.record();
  const began = await sink.begin({ width, height, fps: [rate.num, rate.den], frames, audio: !!sound, topDown: rb.topDown, ...job });
  t.begin = now() - t0;
  const pending = [];
  const send = async (n) => {
    if (pending.length >= inflight) { const a = now(); await pending.shift(); t.wait += now() - a; }
    const a = now(); await rb.take(n % slots, buf); t.readback += now() - a;
    pending.push(Promise.resolve(sink.frame(n, buf)));
  };
  try {
    for (let n = 0; n < frames; n++) {
      if (signal?.aborted) throw new Error('export cancelled');
      const { step, alpha } = frameToStep(n, rate);
      let a = now();
      await rb.draw(() => host.frameAt(step, alpha));
      t.render += now() - a;
      onFrame?.(n, step, alpha); // the world as frame n shows it (a check records its hash)
      a = now(); rb.read(n % slots); t.readback += now() - a;
      if (n >= lag) await send(n - lag);
      if (n % 10 === 0) onProgress?.({ n, frames, phase: 'frames' });
    }
    for (let n = Math.max(0, frames - lag); n < frames; n++) await send(n);
    { const a = now(); await Promise.all(pending); t.wait += now() - a; }
    // a cancel after the last frame still stops the export, up to the moment the sink is told to finish the file
    const stop = () => { if (signal?.aborted) throw new Error('export cancelled'); };
    stop();
    let mix = null;
    if (sound) {
      onProgress?.({ n: frames, frames, phase: 'audio' });
      const a = now();
      const end = stepsFor(frames, rate);
      while (tree.clock.step < end) while (!tree.step()) await tree.settle(); // the sound under the last frame
      mix = await mixTake(sound, frames, rate, { OfflineAudioContext });
      stop();
      await sink.audio(mix.wav);
      t.audio = now() - a;
    }
    stop();
    onProgress?.({ n: frames, frames, phase: 'finishing' });
    const a = now();
    const r2 = (x) => Math.round(x * 100) / 100;
    const page = { frames, backend: host.backend, ms: { loop: r2(a - t0), begin: r2(t.begin), render: r2(t.render), readback: r2(t.readback), wait: r2(t.wait), audio: r2(t.audio) }, transport: sink.transport ?? '' };
    const result = await sink.end(page);
    t.end = now() - a;
    const total = now() - t0;
    return {
      ...result, began, frames, fps: [rate.num, rate.den], seconds: secondsOf(frames, rate), width, height, transport: sink.transport, backend: host.backend,
      steps: tree.clock.step, audioHash: mix?.hash ?? null,
      ms: { total: r2(total), begin: r2(t.begin), render: r2(t.render), readback: r2(t.readback), wait: r2(t.wait), audio: r2(t.audio), end: r2(t.end) },
      perFrameMs: { render: r2(t.render / frames), readback: r2(t.readback / frames), wait: r2(t.wait / frames), total: r2(total / frames) },
      framesPerSecond: total > 0 ? r2((frames * 1000) / total) : null,
    };
  } catch (e) {
    await sink.cancel?.();
    throw e;
  } finally {
    rb.release();
  }
}

/**
 * The take's sound as a WAV, exactly the length of its frames. The recording starts at step 0; frame n shows the
 * blend of steps s − 1 and s, so live play hears a sound begun on step k from (k + 1) / 60 s (audio/service.js's
 * offset): the mix is shifted one step later to match.
 * @param {any} sound the audio service (recording since step 0)
 * @param {number} frames @param {number | { num: number, den: number }} fps
 * @param {{ sampleRate?: number, OfflineAudioContext?: any }} [opts]
 */
export async function mixTake(sound, frames, fps, { sampleRate = 48000, OfflineAudioContext } = {}) {
  const rec = sound.recording();
  const buffer = await mixOffline({ ...rec, from: rec.from - 1 }, sound.library, { sampleRate, ...(OfflineAudioContext ? { OfflineAudioContext } : {}) });
  const n = audioSamples(frames, fps, sampleRate);
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) { const out = new Float32Array(n); const d = buffer.getChannelData(c); out.set(d.subarray(0, Math.min(n, d.length))); channels.push(out); }
  const wav = writeWav(channels, sampleRate);
  return { wav, samples: n, sampleRate, hash: hashBytes(wav) };
}

function hashBytes(b) { let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193); return (h >>> 0).toString(16).padStart(8, '0'); }
