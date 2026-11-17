// WebCodecs inside WKWebView: what is there, and an encode of the shot muxed in JS with mediabunny.
import { Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource, EncodedPacket, AudioBufferSource } from 'mediabunny';
import { post, log, sleep } from './native.js';
import { layoutCanvas } from './bench.js';

export const CODECS = {
  'avc-high': { string: 'avc1.640033', mb: 'avc', extra: { avc: { format: 'avc' } } },
  'avc-main': { string: 'avc1.4d0033', mb: 'avc', extra: { avc: { format: 'avc' } } },
  'hevc-main': { string: 'hvc1.1.6.L153.B0', mb: 'hevc', extra: { hevc: { format: 'hevc' } } },
  'hevc-main-hev1': { string: 'hev1.1.6.L153.B0', mb: 'hevc', extra: { hevc: { format: 'hevc' } } },
  'vp9': { string: 'vp09.00.51.08', mb: 'vp9', extra: {} },
  'av1': { string: 'av01.0.12M.08', mb: 'av1', extra: {} },
};

async function supported(cfg) {
  try { const r = await VideoEncoder.isConfigSupported(cfg); return r.supported ? true : false; }
  catch (e) { return `throws: ${e.name}: ${e.message}`; }
}

export async function probe() {
  const out = {
    VideoEncoder: typeof VideoEncoder, VideoDecoder: typeof VideoDecoder, VideoFrame: typeof VideoFrame,
    AudioEncoder: typeof AudioEncoder, AudioData: typeof AudioData, MediaStreamTrackProcessor: typeof MediaStreamTrackProcessor,
    video: {}, audio: {},
  };
  if (typeof VideoEncoder === 'undefined') return out;
  for (const [key, c] of Object.entries(CODECS)) {
    const row = {};
    for (const [w, h] of [[1920, 1080], [3840, 2160]]) {
      const base = { codec: c.string, width: w, height: h, bitrate: 12e6, framerate: 30, ...c.extra };
      row[`${h}p`] = await supported(base);
      row[`${h}p_hw`] = await supported({ ...base, hardwareAcceleration: 'prefer-hardware' });
      row[`${h}p_sw`] = await supported({ ...base, hardwareAcceleration: 'prefer-software' });
      row[`${h}p_alphaKeep`] = await supported({ ...base, alpha: 'keep' });
      row[`${h}p_quantizer`] = await supported({ ...base, bitrateMode: 'quantizer' });
      row[`${h}p_realtime`] = await supported({ ...base, latencyMode: 'realtime' });
    }
    out.video[key] = row;
  }
  if (typeof AudioEncoder !== 'undefined') {
    for (const [key, codec] of [['aac', 'mp4a.40.2'], ['opus', 'opus'], ['flac', 'flac'], ['pcm', 'pcm-s16']]) {
      try { out.audio[key] = (await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 })).supported; }
      catch (e) { out.audio[key] = `throws: ${e.message}`; }
    }
  }
  return out;
}

/** Decode the dialogue WAV once (OfflineAudioContext keeps the sample rate). */
let wavCache = null;
export async function loadWav(url = 'audio/dialogue.wav') {
  if (wavCache) return wavCache;
  const bytes = await (await fetch(url)).arrayBuffer();
  const ctx = new OfflineAudioContext(2, 48000, 48000);
  wavCache = await ctx.decodeAudioData(bytes);
  return wavCache;
}

/**
 * Encode `frames` frames of the shot with WebCodecs and mux them (and the WAV, if audio) with mediabunny.
 * Times out instead of hanging: AB-B-0039 saw Safari 27.2 wedge forever under latencyMode 'quality'.
 */
export async function encodeShot(shot, { codec = 'avc-high', width = 1920, height = 1080, fps = 30, frames = 300, bitrate = 12e6,
  latencyMode = 'realtime', bitrateMode = 'variable', audio = false, gop = null, timeoutMs = 60000, name = null, alpha = false, save = true } = {}) {
  const c = CODECS[codec];
  layoutCanvas(shot.canvas, width, height, false);
  shot.configure({ width, height, alpha });
  shot.reset();
  const keyEvery = gop ?? fps * 2;
  const t0 = performance.now();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const vsrc = new EncodedVideoPacketSource(c.mb);
  output.addVideoTrack(vsrc, { frameRate: fps });
  let asrc = null;
  if (audio) { asrc = new AudioBufferSource({ codec: 'aac', bitrate: 192000 }); output.addAudioTrack(asrc); }
  await output.start();

  let chain = Promise.resolve();
  let chunks = 0, keyChunks = 0, maxTs = -1, reordered = 0, bytes = 0, maxQueue = 0, err = null;
  const decodeOrder = [];
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      chunks++; bytes += chunk.byteLength;
      if (chunk.type === 'key') keyChunks++;
      if (chunk.timestamp < maxTs) reordered++;
      maxTs = Math.max(maxTs, chunk.timestamp);
      if (decodeOrder.length < 12) decodeOrder.push(chunk.timestamp);
      const pkt = EncodedPacket.fromEncodedChunk(chunk);
      chain = chain.then(() => vsrc.add(pkt, meta));
    },
    error: (e) => { err = e; },
  });
  const config = { codec: c.string, width, height, bitrate, framerate: fps, latencyMode, bitrateMode, ...c.extra };
  if (alpha) config.alpha = 'keep';
  enc.configure(config);

  const deadline = t0 + timeoutMs;
  const until = async (cond, what) => {
    while (!cond()) {
      if (err) throw err;
      if (performance.now() > deadline) throw new Error(`timeout (${what}): queue=${enc.encodeQueueSize} chunks=${chunks}`);
      await new Promise((r) => { const t = setTimeout(r, 50); enc.addEventListener('dequeue', () => { clearTimeout(t); r(); }, { once: true }); });
    }
  };
  let renderMs = 0;
  let status = 'ok';
  try {
    for (let n = 0; n < frames; n++) {
      await until(() => enc.encodeQueueSize < 8, `frame ${n}`);
      maxQueue = Math.max(maxQueue, enc.encodeQueueSize);
      const a = performance.now();
      shot.renderFrame(n, fps);
      const vf = new VideoFrame(shot.canvas, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps), alpha: alpha ? 'keep' : 'discard' });
      renderMs += performance.now() - a;
      enc.encode(vf, { keyFrame: n % keyEvery === 0 });
      vf.close();
    }
    const flush = enc.flush();
    const timer = sleep(Math.max(1000, deadline - performance.now())).then(() => { throw new Error(`timeout in flush(): queue=${enc.encodeQueueSize} chunks=${chunks}`); });
    await Promise.race([flush, timer]);
    await chain;
  } catch (e) {
    status = String(e.message ?? e);
    try { enc.close(); } catch { /* wedged */ }
    log(`[webcodecs] ${codec} ${width}x${height}: ${status}`);
    return { codec, codecString: c.string, width, height, fps, frames, bitrate, latencyMode, status, chunks, wallMs: Math.round(performance.now() - t0) };
  }
  const encodeDoneMs = performance.now() - t0;
  enc.close();
  if (asrc) {
    const wav = await loadWav();
    // Trim to the shot's length.
    const len = Math.min(wav.length, Math.round((frames / fps) * wav.sampleRate));
    const ab = new AudioBuffer({ length: len, numberOfChannels: wav.numberOfChannels, sampleRate: wav.sampleRate });
    for (let ch = 0; ch < wav.numberOfChannels; ch++) ab.copyToChannel(wav.getChannelData(ch).subarray(0, len), ch);
    await asrc.add(ab);
  }
  await output.finalize();
  const mp4 = new Uint8Array(output.target.buffer);
  const muxDoneMs = performance.now() - t0;
  let saved = null;
  if (save) saved = await post(`__save?name=${encodeURIComponent(name ?? `wc-${codec}-${height}p${fps}-${Math.round(bitrate / 1e6)}M.mp4`)}`, mp4);
  const wallMs = performance.now() - t0;
  const r = {
    codec, codecString: c.string, width, height, fps, frames, bitrate, latencyMode, bitrateMode, audio, alpha, status,
    chunks, keyChunks, reorderedChunks: reordered, firstTimestampsDecodeOrder: decodeOrder, maxEncodeQueue: maxQueue,
    videoBytes: bytes, mp4Bytes: mp4.byteLength, actualMbps: Math.round((bytes * 8) / (frames / fps) / 1e4) / 100,
    renderMsPerFrame: Math.round((renderMs / frames) * 100) / 100,
    encodeDoneMs: Math.round(encodeDoneMs), muxDoneMs: Math.round(muxDoneMs), wallMs: Math.round(wallMs),
    encodeFps: Math.round((frames * 1000) / encodeDoneMs * 10) / 10, saved,
  };
  log(`[webcodecs] ${codec} ${width}x${height}@${fps} ${frames}f ${status}: ${r.wallMs} ms, ${r.mp4Bytes} B, reordered ${reordered}`);
  return r;
}
