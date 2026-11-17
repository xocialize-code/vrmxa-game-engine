// Frame-transfer jobs: render the shot frame by frame and hand each frame to Swift by one method.
// Swift either discards it (mode 'sink', optionally hashing), encodes it (mode 'encode', AVAssetWriter)
// or appends it to a raw file (mode 'raw', the quality reference).
import { call, post, toBase64Native, toBase64FileReader, nextFrame, log } from './native.js';

const now = () => performance.now();

export const METHODS = {
  'b64-msg': 'readPixels → Uint8Array.toBase64 → postMessage (reply handler)',
  'b64-msg-filereader': 'readPixels → FileReader data URL → postMessage (the avatar studio bridge)',
  'b64-callasync': 'Swift pulls: callAsyncJavaScript returns readPixels as base64',
  'bin-msg': 'readPixels → postMessage(Uint8Array) (binary, if WebKit passes it)',
  'scheme-post': 'readPixels → fetch POST to the custom scheme handler',
  'loopback-post': 'readPixels → fetch POST to the 127.0.0.1 server',
  'png-post': 'canvas.toBlob(PNG) → fetch POST to the custom scheme handler',
  'snapshot': 'WKWebView.takeSnapshot of the composited canvas',
  'read-only-pbo': 'baseline: render + readPixels into a pixel-pack buffer, copied out one frame later',
  'scheme-post-pbo': 'PBO readback (one frame behind) → fetch POST to the custom scheme handler',
  'render-only': 'baseline: render + a 1-pixel readPixels (waits for the GPU), nothing sent',
  'read-only': 'baseline: render + full readPixels, nothing sent',
};

/** Size the canvas's CSS box (snapshot needs it 1:1 on screen; everyone else keeps it small). */
export function layoutCanvas(canvas, width, height, onScreen1to1) {
  const dpr = window.devicePixelRatio || 1;
  if (onScreen1to1) { canvas.style.width = `${width / dpr}px`; canvas.style.height = `${height / dpr}px`; }
  else { canvas.style.width = '480px'; canvas.style.height = `${Math.round((480 * height) / width)}px`; }
}

/**
 * job: { method, width, height, fps, frames, inflight=1, mode='sink'|'encode'|'raw', hash, alpha,
 *        codec, bitrate, audio, name }
 */
export async function runJob(shot, job) {
  const { method, width, height, fps, frames } = job;
  const inflight = Math.max(1, job.inflight ?? 1);
  layoutCanvas(shot.canvas, width, height, method === 'snapshot');
  if (method === 'snapshot') { await call('window', { width: width / (devicePixelRatio || 1), height: height / (devicePixelRatio || 1) }); await nextFrame(); await nextFrame(); }
  shot.configure({ width, height, alpha: !!job.alpha });
  shot.reset();
  const frameBytes = width * height * 4;
  const buf = new Uint8Array(frameBytes);
  const st = { render: 0, read: 0, pack: 0, send: 0, bytesSent: 0 };
  await call('begin', { ...job, inflight, dpr: devicePixelRatio || 1 });
  const t0 = now();

  if (method === 'b64-callasync' || method === 'bin-callasync') {
    window.__vrmxgPull = (n) => {
      let a = now(); shot.renderFrame(n, fps); st.render += now() - a;
      a = now(); shot.readPixels(buf); st.read += now() - a;
      a = now(); const out = method === 'b64-callasync' ? toBase64Native(buf) : buf; st.pack += now() - a;
      return out;
    };
    await call('pull', { count: frames, kind: method === 'b64-callasync' ? 'b64' : 'bin' });
  } else {
    const pending = [];
    for (let n = 0; n < frames; n++) {
      if (job.only && !job.only.includes(n)) { shot.advanceTo(n / fps); continue; } // simulate without rendering
      if (pending.length >= inflight) { const a = now(); await pending.shift(); st.send += now() - a; }
      let a = now();
      shot.renderFrame(n, fps);
      st.render += now() - a;
      let p;
      switch (method) {
        case 'png-post': {
          a = now();
          const blob = await new Promise((r) => shot.canvas.toBlob(r, 'image/png')); // grabbed synchronously, encoded async
          // A Blob body reaches WKURLSchemeHandler empty (measured); an ArrayBuffer arrives intact.
          const body = job.blobBody ? blob : await blob.arrayBuffer();
          st.pack += now() - a; st.bytesSent += blob.size;
          p = post(`__framepng?n=${n}`, body);
          break;
        }
        case 'read-only-pbo':
        case 'scheme-post-pbo': {
          // Read frame n into a PBO; copy out and send frame n-1, whose readback has had a frame to finish.
          a = now(); shot.readToPBO(n % 2);
          if (n > 0) { shot.fromPBO((n - 1) % 2, buf); }
          st.read += now() - a;
          if (n > 0 && method === 'scheme-post-pbo') { st.bytesSent += frameBytes; p = post(`__frame?n=${n - 1}`, buf); }
          if (n === frames - 1) {
            const last = (n) % 2;
            const before = p;
            a = now(); shot.fromPBO(last, buf); st.read += now() - a;
            if (method === 'scheme-post-pbo') { await before; p = post(`__frame?n=${n}`, buf); }
          }
          p ??= Promise.resolve();
          break;
        }
        case 'render-only': {
          a = now(); shot.gl.readPixels(0, 0, 1, 1, shot.gl.RGBA, shot.gl.UNSIGNED_BYTE, buf.subarray(0, 4)); st.read += now() - a; // wait for the GPU
          p = Promise.resolve();
          break;
        }
        case 'read-only':
          a = now(); shot.readPixels(buf); st.read += now() - a;
          p = Promise.resolve();
          break;
        case 'snapshot':
          a = now(); await nextFrame(); await nextFrame(); st.pack += now() - a; // let WebKit composite it
          p = call('snapshot', { n });
          break;
        default: {
          a = now(); shot.readPixels(buf); st.read += now() - a;
          st.bytesSent += frameBytes;
          if (method === 'scheme-post' || method === 'loopback-post') p = post(`__frame?n=${n}`, buf);
          else if (method === 'bin-msg') p = call('frameBin', { n, data: buf });
          else {
            a = now();
            const data = method === 'b64-msg-filereader' ? await toBase64FileReader(buf) : toBase64Native(buf);
            st.pack += now() - a;
            p = call('frameB64', { n, data });
          }
        }
      }
      pending.push(p);
    }
    const a = now();
    await Promise.all(pending);
    st.send += now() - a;
  }
  const loopMs = now() - t0;
  const swift = await call('end', {});
  const wallMs = now() - t0;
  const r1 = (x) => Math.round(x * 100) / 100;
  const res = {
    ...job, inflight,
    wallMs: r1(wallMs), loopMs: r1(loopMs),
    framesPerSec: r1((frames * 1000) / wallMs),
    rawMBps: r1((frames * frameBytes) / 1e6 / (wallMs / 1000)),
    perFrameMs: { render: r1(st.render / frames), read: r1(st.read / frames), pack: r1(st.pack / frames), waitSend: r1(st.send / frames), total: r1(wallMs / frames) },
    bytesSentPerFrame: st.bytesSent ? Math.round(st.bytesSent / frames) : undefined,
    swift,
  };
  log(`[job] ${job.name ?? method} ${width}x${height} ${frames}f → ${res.framesPerSec} fps, ${res.rawMBps} MB/s raw`);
  return res;
}
