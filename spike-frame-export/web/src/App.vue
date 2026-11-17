<script setup>
// ?plan=<name> runs one measurement plan and posts the JSON to the wrapper (call('results')).
// Without a plan: a preview that plays the shot at its fixed timestep (for eyeballing only).
import { ref, onMounted, markRaw } from 'vue';
import { Shot } from './shot.js';
import { runJob } from './bench.js';
import { probe as probeWebCodecs, encodeShot } from './webcodecs.js';
import { call, inWrapper, log } from './native.js';

const params = new URLSearchParams(location.search);
const plan = params.get('plan');
const canvas = ref(null);
const lines = ref([]);
const status = ref(plan ? `plan ${plan}` : 'preview');

const HD = [1920, 1080];
const UHD = [3840, 2160];
const MB = 1e6;

function environment(shot) {
  const gl = shot.gl;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    userAgent: navigator.userAgent, origin: location.origin, devicePixelRatio,
    crossOriginIsolated: self.crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer,
    toBase64: typeof Uint8Array.prototype.toBase64,
    webgl: { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxRenderbuffer: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), maxViewport: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)), samples: gl.getParameter(gl.SAMPLES) },
    shot: shot.info,
  };
}

/** Shader compiles, shadow-map allocation, first-use costs: paid here, not in the first measured job. */
async function warmup(shot) {
  for (const [w, h] of [HD, UHD]) await runJob(shot, { method: 'read-only', width: w, height: h, fps: 30, frames: 30, mode: 'sink', name: 'warmup' });
}

const PLANS = {
  // Transparent export check: 1 s of each alpha codec, plus frame 0 raw for an outside (ffmpeg) comparison.
  async alpha(shot) {
    const jobs = [await runJob(shot, { method: 'scheme-post-pbo', width: 1920, height: 1080, fps: 30, frames: 1, mode: 'raw', alpha: true, name: 'alpha-ref0.bgra' })];
    for (const codec of ['hevc-alpha', 'prores4444']) jobs.push(await runJob(shot, { method: 'scheme-post-pbo', inflight: 2, width: 1920, height: 1080, fps: 30, frames: 30, mode: 'encode', alpha: true, codec, name: `alpha-${codec}` }));
    jobs.push(await runJob(shot, { method: 'scheme-post-pbo', inflight: 2, width: 1920, height: 1080, fps: 30, frames: 30, mode: 'encode', alpha: true, codec: 'prores4444', straightAlpha: false, name: 'alpha-prores4444-premultiplied' }));
    return { jobs };
  },
  // Alpha values straight out of readPixels for a transparent frame (before any codec).
  async alphaDebug(shot) {
    shot.configure({ width: 1920, height: 1080, alpha: true }); shot.reset(); shot.renderFrame(0, 30);
    const px = shot.readPixels(new Uint8Array(1920 * 1080 * 4));
    const hist = new Array(256).fill(0);
    for (let i = 3; i < px.length; i += 4) hist[px[i]]++;
    const nz = []; hist.forEach((c, a) => { if (c && a) nz.push([a, c]); });
    return { top: nz.sort((x, y) => y[1] - x[1]).slice(0, 12), zero: hist[0], full: hist[255], attrs: shot.gl.getContextAttributes() };
  },
  // What crosses the bridge, and what WebCodecs offers.
  async probe(shot) {
    const types = await call('probeTypes', { u8: new Uint8Array([1, 2, 3]), ab: new Uint8Array([4, 5]).buffer, f32: new Float32Array([1.5]), arr: [1, 2], str: 'x' });
    return { env: environment(shot), bridgeTypes: types, webcodecs: await probeWebCodecs() };
  },

  // Transfer throughput into a Swift sink (no encode), 1080p and 4K, every method that works from the scheme origin.
  async transfer(shot) {
    const out = [];
    await warmup(shot);
    const methods = ['render-only', 'read-only', 'read-only-pbo', 'b64-msg', 'b64-msg-filereader', 'b64-callasync', 'scheme-post', 'scheme-post-pbo', 'png-post', 'snapshot'];
    for (const [w, h] of [HD, UHD]) {
      const frames = h === 1080 ? 90 : 45;
      for (const method of methods) {
        try { out.push(await runJob(shot, { method, width: w, height: h, fps: 30, frames, mode: 'sink' })); }
        catch (e) { out.push({ method, width: w, height: h, error: String(e.message ?? e) }); log(`[transfer] ${method} ${h}p failed: ${e.message ?? e}`); }
      }
      for (const inflight of [2, 3]) out.push(await runJob(shot, { method: 'scheme-post', width: w, height: h, fps: 30, frames, mode: 'sink', inflight }));
      out.push(await runJob(shot, { method: 'scheme-post-pbo', width: w, height: h, fps: 30, frames, mode: 'sink', inflight: 2 }));
      out.push(await runJob(shot, { method: 'scheme-post', width: w, height: h, fps: 30, frames, mode: 'sink', hash: true, name: 'scheme-post+sha256' }));
    }
    try { await runJob(shot, { method: 'png-post', blobBody: true, width: 1920, height: 1080, fps: 30, frames: 3, mode: 'sink', name: 'png-post (Blob body)' }); }
    catch (e) { out.push({ method: 'png-post', name: 'png-post (Blob body)', width: 1920, height: 1080, error: String(e.message ?? e) }); }
    return { env: environment(shot), jobs: out };
  },

  async transferLoopback(shot) {
    await warmup(shot);
    const out = [];
    for (const [w, h] of [HD, UHD]) {
      const frames = h === 1080 ? 90 : 45;
      for (const method of ['render-only', 'read-only']) out.push(await runJob(shot, { method, width: w, height: h, fps: 30, frames, mode: 'sink' }));
      for (const inflight of [1, 2, 3]) out.push(await runJob(shot, { method: 'loopback-post', width: w, height: h, fps: 30, frames, mode: 'sink', inflight }));
    }
    return { env: environment(shot), jobs: out };
  },

  // End-to-end 10 s exports through AVAssetWriter (scheme POST, 2 in flight), with the WAV muxed in.
  async export(shot) {
    const out = [];
    await warmup(shot);
    const rate = { h264: { 1080: { 30: 16, 60: 24 }, 2160: { 30: 50, 60: 80 } }, hevc: { 1080: { 30: 10, 60: 15 }, 2160: { 30: 30, 60: 48 } } };
    const jobs = [];
    for (const [w, h] of [HD, UHD]) for (const fps of [30, 60]) {
      for (const codec of ['h264', 'hevc', 'hevc-alpha', 'prores4444']) {
        const alpha = codec === 'hevc-alpha' || codec === 'prores4444';
        jobs.push({ codec, width: w, height: h, fps, alpha, bitrate: rate[codec]?.[h]?.[fps] * MB || undefined });
      }
    }
    for (const j of jobs) {
      const name = `exp-${j.codec}-${j.height}p${j.fps}${j.alpha ? '-alpha' : ''}`;
      try { out.push(await runJob(shot, { ...j, method: 'scheme-post-pbo', inflight: 2, frames: j.fps * 10, mode: 'encode', audio: true, name })); }
      catch (e) { out.push({ ...j, name, error: String(e.message ?? e) }); }
    }
    return { env: environment(shot), jobs: out };
  },

  // Quality reference (raw BGRA) + bitrate ladders, native and WebCodecs, 1080p30 10 s.
  async quality(shot) {
    const out = { native: [], webcodecs: [] };
    await warmup(shot);
    out.raw = await runJob(shot, { method: 'scheme-post-pbo', inflight: 2, width: 1920, height: 1080, fps: 30, frames: 300, mode: 'raw', name: 'q-ref.bgra' });
    for (const mbps of [2, 4, 8, 16]) {
      for (const codec of ['h264', 'hevc']) {
        out.native.push(await runJob(shot, { method: 'scheme-post-pbo', inflight: 2, width: 1920, height: 1080, fps: 30, frames: 300, mode: 'encode', codec, bitrate: mbps * MB, name: `q-native-${codec}-${mbps}M` }));
      }
      for (const codec of ['avc-high', 'hevc-main']) {
        out.webcodecs.push(await encodeShot(shot, { codec, width: 1920, height: 1080, fps: 30, frames: 300, bitrate: mbps * MB, name: `q-wc-${codec}-${mbps}M.mp4` }));
      }
    }
    return { env: environment(shot), ...out };
  },

  // Per-frame SHA-256 of the raw readPixels buffers (computed in Swift before any conversion).
  async determinism(shot) {
    const base = { method: 'scheme-post', inflight: 1, width: 1920, height: 1080, fps: 30, frames: 300, mode: 'sink', hash: true };
    const a = await runJob(shot, { ...base, name: 'det-a' });
    const b = await runJob(shot, { ...base, name: 'det-b (same page, after reset)' });
    const sparse = await runJob(shot, { ...base, only: [0, 1, 75, 150, 299], name: 'det-sparse (simulate all, render 5)' });
    const fps60 = await runJob(shot, { ...base, fps: 60, frames: 600, name: 'det-60fps' });
    const pbo = await runJob(shot, { ...base, method: 'scheme-post-pbo', name: 'det-pbo (PBO readback)' });
    const uhd = await runJob(shot, { ...base, method: 'scheme-post-pbo', width: 3840, height: 2160, frames: 60, name: 'det-4k' });
    const enc = [];
    for (const codec of ['h264', 'hevc', 'prores4444']) for (const tag of ['a', 'b']) {
      enc.push(await runJob(shot, { ...base, frames: 90, mode: 'encode', codec, bitrate: codec === 'prores4444' ? undefined : 8 * MB, hash: true, name: `det-enc-${codec}-${tag}` }));
    }
    return { env: environment(shot), a, b, sparse, fps60, pbo, uhd, enc };
  },

  // WebCodecs in WKWebView: the latencyMode wedge (AB-B-0039) at real size, then full encodes with audio.
  async webcodecs(shot) {
    const out = { wedge: [], encodes: [] };
    await warmup(shot);
    for (const [w, h] of [[320, 240], HD]) for (const latencyMode of ['quality', 'realtime']) {
      out.wedge.push(await encodeShot(shot, { codec: 'avc-high', width: w, height: h, fps: 30, frames: 30, bitrate: 4 * MB, latencyMode, timeoutMs: 15000, save: false }));
    }
    for (const latencyMode of ['quality', 'realtime']) out.wedge.push(await encodeShot(shot, { codec: 'hevc-main', width: 1920, height: 1080, fps: 30, frames: 30, bitrate: 4 * MB, latencyMode, timeoutMs: 15000, save: false }));
    const runs = [
      { codec: 'avc-high', width: 1920, height: 1080, fps: 30, bitrate: 16 * MB },
      { codec: 'hevc-main', width: 1920, height: 1080, fps: 30, bitrate: 10 * MB },
      { codec: 'avc-high', width: 1920, height: 1080, fps: 60, bitrate: 24 * MB },
      { codec: 'hevc-main', width: 1920, height: 1080, fps: 60, bitrate: 15 * MB },
      { codec: 'avc-high', width: 3840, height: 2160, fps: 30, bitrate: 50 * MB },
      { codec: 'hevc-main', width: 3840, height: 2160, fps: 30, bitrate: 30 * MB },
      { codec: 'hevc-main', width: 3840, height: 2160, fps: 60, bitrate: 48 * MB },
    ];
    for (const r of runs) {
      out.encodes.push(await encodeShot(shot, { ...r, frames: r.fps * 10, audio: true, timeoutMs: 180000, name: `exp-wc-${r.codec}-${r.height}p${r.fps}.mp4` }));
    }
    out.alpha = await encodeShot(shot, { codec: 'hevc-main', width: 1920, height: 1080, fps: 30, frames: 30, bitrate: 10 * MB, alpha: true, timeoutMs: 15000, save: false });
    return { env: environment(shot), ...out };
  },
};

onMounted(async () => {
  window.addEventListener('error', (e) => log(`[error] ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => log(`[unhandled] ${e.reason?.stack ?? e.reason}`));
  const shot = markRaw(new Shot(canvas.value));
  try {
    await shot.load({ avatar: params.get('avatar') ?? 'models/vroid10.vrm', motion: params.get('motion') ?? 'models/walk.vrma' });
    if (!plan) {
      shot.configure({ width: 1280, height: 720 });
      canvas.value.style.width = '1280px'; canvas.value.style.height = '720px';
      let n = 0;
      const tick = () => { if (n >= 600) { shot.reset(); n = 0; } shot.renderFrame(n++, 60); requestAnimationFrame(tick); };
      tick();
      return;
    }
    const t0 = performance.now();
    const data = await PLANS[plan](shot);
    data.planMs = Math.round(performance.now() - t0);
    status.value = `done in ${data.planMs} ms`;
    if (inWrapper) await call('results', { plan, data });
  } catch (e) {
    status.value = `failed: ${e.stack ?? e}`;
    log(`[plan ${plan}] failed: ${e.stack ?? e}`);
    if (inWrapper) await call('results', { plan, data: { error: String(e.stack ?? e) } });
  }
});
</script>

<template>
  <canvas ref="canvas" class="shot"></canvas>
  <div class="status">{{ status }}</div>
</template>
