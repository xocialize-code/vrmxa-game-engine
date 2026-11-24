// Exporting a take (M1 W8, AB-T-0520). A take is a world built from step 0 (a scene, plus recorded input replayed);
// the export steps it offline at the shot's frame rate (frame n shows frameToStep(n) blended at α, exactly what live
// play would have shown at n / fps; frame 0 shows the first step as simulated, since step 0 is the world before anything
// ran: RenderHost.frameAt, AB-T-0595), renders each frame at the export size, reads it back asynchronously (one frame
// behind, a pixel-pack buffer) and hands it to a sink with at most `inflight` frames outstanding. Then it runs on to
// the end of the last frame for the sound, mixes what was recorded offline and hands the sink a WAV.
//
// M4 W2 (AB-T-0574): on either backend. readbackFor(host) gives WebGL's pixel-pack readback or WebGPU's (an output
// target, a ring of 3 map buffers); WebGPU's rows come top-down, and the sink's job says so (`topDown`: the shell's
// writer flips WebGL's rows and leaves WebGPU's).
//
// M4 W10 (AB-T-0582): the frame loop is shared (pumpFrames) with exportTurntable, an orbit around a held world; and
// `check: 'redraw'` draws every frame twice and compares the two readbacks, with a third draw to break a tie (the rare odd
// WebGPU frame on the macOS 27.3 beta, AB-D-0279). Off here unless asked; the creator's delivery presets ask for it when
// they draw on WebGPU (AB-D-0280, until AB-T-0591's release-OS re-test).
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
 * @param {(n: number, step: number, alpha: number) => void} [o.onFrame] after frame n is drawn (a check hashing the world),
 *   with the step and α it was drawn at
 * @param {{ aborted: boolean }} [o.signal]
 * @param {() => number} [o.now] a wall clock, for the timings only
 * @param {any} [o.OfflineAudioContext]
 * @param {'redraw' | null} [o.check] 'redraw': draw each frame again after reading it and compare (see pumpFrames)
 * @param {(n: number, bytes: Uint8Array) => void} [o.onBytes] frame n's read-back bytes, before the sink has them (stills;
 *   the buffer is reused for the next frame: copy what you keep)
 * @param {boolean} [o.warm] draw and read frame 0 once before the film and throw it away (default: on WebGPU, where a
 *   fresh host's first draw can differ, AB-T-0596; off on WebGL)
 */
export async function exportTake({ tree, host, fps, frames, width, height, sink, job = {}, audio = true, inflight = 2, lag = 1, onProgress, onFrame, signal, now = () => 0, OfflineAudioContext, check = null, onBytes, warm = undefined }) {
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
  const rb = readbackFor(host, width, height);
  const t = { begin: 0, render: 0, readback: 0, wait: 0, audio: 0, end: 0 };
  const t0 = now();
  sound?.record();
  const began = await sink.begin({ width, height, fps: [rate.num, rate.den], frames, audio: !!sound, topDown: rb.topDown, ...job });
  t.begin = now() - t0;
  try {
    const plan = (n) => frameToStep(n, rate);
    // Frame 0 is the first thing a fresh host draws, and on WebGPU a host's first draw of what is in view can come out
    // different each time (AB-T-0596: one tile of the cafe's frame 0, the espresso machine, in every export measured).
    // Until AB-T-0595 a film's frame 0 was the world before anything ran, seen from the set's camera: nobody looked at
    // it, and it warmed the host for frame 1. So frame 0 is drawn and read once, thrown away, and then drawn for the
    // film: the same step again, no simulation in between
    if (warm ?? host.backend === 'webgpu') {
      const { step, alpha } = plan(0), a = now();
      await rb.draw(() => host.frameAt(step, alpha));
      await rb.readNow(new Uint8Array(width * height * 4));
      t.begin += now() - a;
    }
    const pumped = await pumpFrames({
      rb, sink, frames, width, height, inflight, lag, signal, now, t, onProgress, check, onBytes,
      draw: (n) => { const { step, alpha } = plan(n); return host.frameAt(step, alpha); },
      // what the host drew, which for a film's first frames is step 1 as simulated, not the plan's blend (AB-T-0595)
      redraw: () => { host.advanceNodeFrame(); host.render(host.last.alpha, false); },
      onFrame: onFrame ? (n) => onFrame(n, tree.clock.step, host.last.alpha) : undefined,
    });
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
    const page = { frames, backend: host.backend, check: pumped.check, ms: { loop: r2(a - t0), begin: r2(t.begin), render: r2(t.render), readback: r2(t.readback), wait: r2(t.wait), audio: r2(t.audio) }, transport: sink.transport ?? '' };
    const result = await sink.end(page);
    t.end = now() - a;
    const total = now() - t0;
    return {
      ...result, began, frames, fps: [rate.num, rate.den], seconds: secondsOf(frames, rate), width, height, transport: sink.transport, backend: host.backend,
      steps: tree.clock.step, audioHash: mix?.hash ?? null, check: pumped.check,
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

/**
 * The frame loop exportTake and exportTurntable share: draw frame n, start reading it back, and hand frame n − lag to
 * the sink with at most `inflight` frames outstanding there; then the last `lag` frames. Accumulates timings into `t`.
 *
 * `check: 'redraw'` (M4 W10, a measured option): after frame n is drawn and read, `redraw(n)` draws the same moment again
 * (no step: the node frame advanced and the scene rendered as it stands) and the two readbacks are compared. Equal: the
 * frame goes on. Different: a third draw breaks the tie, and the frame that two draws agree on goes on; three different
 * draws throw. Each frame is read at once (readNow), so this mode gives up the one-frame lag. `check` in the result
 * counts the frames compared and lists each odd draw ({ n, odd: 'first' | 'second' }).
 * @param {{ rb: any, sink: any, frames: number, width: number, height: number, inflight?: number, lag?: number, signal?: { aborted: boolean },
 *   now?: () => number, t: any, onProgress?: Function, draw: (n: number) => any, redraw: (n: number) => any, onFrame?: (n: number) => void,
 *   onBytes?: (n: number, bytes: Uint8Array) => void, check?: 'redraw' | null }} o
 * @returns {Promise<{ check: null | { mode: 'redraw', frames: number, odd: Array<{ n: number, odd: string }> } }>}
 */
export async function pumpFrames({ rb, sink, frames, width, height, inflight = 2, lag = 1, signal, now = () => 0, t, onProgress, draw, redraw, onFrame, onBytes, check = null }) {
  if (check !== null && check !== 'redraw') throw new Error(`check is 'redraw' or null, not ${check}`);
  const slots = lag + 1;
  if (!check && slots > rb.ring) throw new Error(`lag ${lag} needs ${slots} readback slots; this backend's ring has ${rb.ring}`);
  const buf = new Uint8Array(width * height * 4);
  const pending = [];
  const out = async (n, bytes) => {
    if (pending.length >= inflight) { const a = now(); await pending.shift(); t.wait += now() - a; }
    onBytes?.(n, bytes);
    pending.push(Promise.resolve(sink.frame(n, bytes)));
  };
  const send = async (n) => {
    if (pending.length >= inflight) { const a = now(); await pending.shift(); t.wait += now() - a; }
    const a = now(); await rb.take(n % slots, buf); t.readback += now() - a;
    onBytes?.(n, buf);
    pending.push(Promise.resolve(sink.frame(n, buf)));
  };
  const verdict = check ? { mode: /** @type {'redraw'} */ ('redraw'), frames: 0, odd: /** @type {Array<{ n: number, odd: string }>} */ ([]) } : null;
  const second = check ? new Uint8Array(buf.length) : null, third = check ? new Uint8Array(buf.length) : null;
  for (let n = 0; n < frames; n++) {
    if (signal?.aborted) throw new Error('export cancelled');
    let a = now();
    await rb.draw(() => draw(n));
    t.render += now() - a;
    onFrame?.(n);
    if (check) {
      a = now(); await rb.readNow(buf); t.readback += now() - a;
      a = now(); await rb.draw(() => redraw(n)); t.render += now() - a;
      a = now(); await rb.readNow(second); t.readback += now() - a;
      verdict.frames++;
      let keep = buf;
      if (!sameBytes(buf, second)) {
        a = now(); await rb.draw(() => redraw(n)); t.render += now() - a;
        a = now(); await rb.readNow(third); t.readback += now() - a;
        if (sameBytes(third, buf)) verdict.odd.push({ n, odd: 'second' });
        else if (sameBytes(third, second)) { verdict.odd.push({ n, odd: 'first' }); keep = second; }
        else throw new Error(`frame ${n}: three draws of the same moment gave three different pictures`);
      }
      await out(n, keep);
    } else {
      a = now(); rb.read(n % slots); t.readback += now() - a;
      if (n >= lag) await send(n - lag);
    }
    if (n % 10 === 0) onProgress?.({ n, frames, phase: 'frames' });
  }
  if (!check) for (let n = Math.max(0, frames - lag); n < frames; n++) await send(n);
  { const a = now(); await Promise.all(pending); t.wait += now() - a; }
  return { check: verdict };
}

/** Two frames' bytes, word by word. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  const x = new Uint32Array(a.buffer, a.byteOffset, a.byteLength >>> 2), y = new Uint32Array(b.buffer, b.byteOffset, b.byteLength >>> 2);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  for (let i = x.length * 4; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * A turntable (M4 W10): the world held still (never stepped here) while a camera orbits a point once, `frames` frames
 * at `fps`, through the same readback and sink as a take. The caller sets up what is seen (isolating a character) and
 * gives `pose(n)` → { position: [x, y, z], target: [x, y, z] } (orbitPose: portable sines, so two runs agree). The host's
 * camera is put back afterwards. No sound. `warm`: draw and read back frame 0 once first, thrown away: a fresh WebGPU
 * host's first frame through the TSL post stack can differ under GPU load (AB-T-0596), and a turntable's frame 0 is
 * that frame. (So is a film's, now that its frame 0 draws with its look, AB-T-0595: exportTake warms the same way by
 * default on WebGPU.)
 * @param {object} o
 * @param {any} o.tree @param {any} o.host @param {any} o.camera a three PerspectiveCamera to draw through
 * @param {number | { num: number, den: number }} o.fps @param {number} o.frames @param {number} o.width @param {number} o.height
 * @param {(n: number) => { position: number[], target: number[] }} o.pose
 * @param {any} o.sink @param {object} [o.job] @param {'redraw' | null} [o.check]
 * @param {(n: number, bytes: Uint8Array) => void} [o.onBytes]
 * @param {(p: { n: number, frames: number, phase: string }) => void} [o.onProgress] @param {{ aborted: boolean }} [o.signal]
 * @param {() => number} [o.now] @param {number} [o.inflight] @param {number} [o.lag] @param {boolean} [o.warm]
 */
export async function exportTurntable({ tree, host, camera, fps, frames, width, height, pose, sink, job = {}, check = null, onBytes, onProgress, signal, now = () => 0, inflight = 2, lag = 1, warm = false }) {
  const rate = rationalFps(fps);
  host.attach(tree);
  host.resize(width, height);
  const was = host.camera;
  camera.aspect = width / height; camera.updateProjectionMatrix();
  host.camera = camera;
  const rb = readbackFor(host, width, height);
  const t = { begin: 0, render: 0, readback: 0, wait: 0 };
  const t0 = now();
  const place = (n) => { const p = pose(n); camera.position.set(p.position[0], p.position[1], p.position[2]); camera.lookAt(p.target[0], p.target[1], p.target[2]); camera.updateMatrixWorld(true); };
  const alpha = host.last?.alpha ?? 1;
  try {
    if (warm) { await rb.draw(() => { place(0); host.advanceNodeFrame(); host.render(alpha, false); }); await rb.readNow(new Uint8Array(width * height * 4)); }
    const began = await sink.begin({ width, height, fps: [rate.num, rate.den], frames, audio: false, topDown: rb.topDown, ...job });
    t.begin = now() - t0;
    const pumped = await pumpFrames({
      rb, sink, frames, width, height, inflight, lag, signal, now, t, onProgress, check, onBytes,
      draw: (n) => { place(n); host.advanceNodeFrame(); host.render(alpha, false); },
      redraw: () => { host.advanceNodeFrame(); host.render(alpha, false); },
    });
    if (signal?.aborted) throw new Error('export cancelled');
    onProgress?.({ n: frames, frames, phase: 'finishing' });
    const a = now();
    const r2 = (x) => Math.round(x * 100) / 100;
    const result = await sink.end({ frames, backend: host.backend, turntable: true, check: pumped.check, ms: { loop: r2(a - t0), render: r2(t.render), readback: r2(t.readback), wait: r2(t.wait) }, transport: sink.transport ?? '' });
    return { ...result, began, frames, fps: [rate.num, rate.den], seconds: secondsOf(frames, rate), width, height, backend: host.backend, check: pumped.check, ms: { total: r2(now() - t0), render: r2(t.render), readback: r2(t.readback), wait: r2(t.wait) } };
  } catch (e) {
    await sink.cancel?.();
    throw e;
  } finally {
    rb.release();
    host.camera = was;
  }
}
