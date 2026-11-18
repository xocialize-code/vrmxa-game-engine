// Where exported frames go. A sink is { begin(job), frame(n, bytes), audio(wav), end(), cancel() }; frame() may
// return a promise, and the frame loop keeps at most `inflight` of them outstanding (the backpressure).
//
//   shellSink   the VRMXG Mac shell: export.begin opens the file (a save panel, or VRMXG_SHELL_EXPORT), frames go as
//               raw RGBA by fetch POST (an ArrayBuffer body crosses WebKit whole; a Blob arrives empty, typed arrays
//               don't cross postMessage), the WAV likewise, export.end finishes the file (AVAssetWriter).
//   hashSink    keeps a hash of every frame (browsers, tests): two exports of a take must match frame for frame.

/** FNV-1a over the frame's 32-bit words, two lanes: 16 hex digits. Fast enough for 1080p in a browser (~3 ms). */
export function hashFrame(bytes) {
  const u = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >>> 2);
  let a = 0x811c9dc5, b = 0x2545f491;
  for (let i = 0; i < u.length; i++) { a = Math.imul(a ^ u[i], 0x01000193); b = Math.imul(b ^ u[i], 0x5bd1e995) ^ (b >>> 15); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export function hashSink() {
  const s = {
    job: null, hashes: /** @type {string[]} */ ([]), wav: null,
    begin(job) { s.job = job; s.hashes = []; return { id: 'hash' }; },
    frame(n, bytes) { s.hashes[n] = hashFrame(bytes); },
    audio(wav) { s.wav = wav; },
    end() { return { frames: s.hashes.length, frameHashes: s.hashes, audioBytes: s.wav?.length ?? 0 }; },
    cancel() {},
  };
  return s;
}

/**
 * The Mac shell's AVAssetWriter endpoint. `call` is apps/shell/js/shell.js's call. Frames are POSTed to the custom
 * scheme when the page can reach it (the faster transport, spike-frame-export: 373 vs 153 fps at 1080p with two in
 * flight), else to the page's own origin; `transport` says which was used.
 * @param {{ call: (method: string, params?: any) => Promise<any>, fetch?: typeof fetch, base?: string }} o
 */
export function shellSink({ call, fetch: f = globalThis.fetch.bind(globalThis), base = null }) {
  let id = null, url = base;
  const post = async (path, body) => {
    const res = await f(`${url}${path}`, { method: 'POST', body });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
  const s = {
    transport: '',
    begin: async (job) => {
      if (url === null) url = await pickTransport(call, f);
      s.transport = url.startsWith('http') || url === '' ? 'origin' : 'scheme';
      const r = await call('export.begin', job);
      id = r.id;
      return r;
    },
    frame: (n, bytes) => post(`__export/frame?id=${id}&n=${n}`, bytes),
    audio: (wav) => post(`__export/audio?id=${id}`, wav),
    end: (page) => call('export.end', { id, page }),
    cancel: () => (id ? call('export.cancel', { id }).catch(() => {}) : null),
  };
  return s;
}

/** The scheme base if a POST reaches it from this page (cross-origin from loopback), else '' (the page's origin). */
async function pickTransport(call, f) {
  try {
    const info = await call('shell.info');
    if (info.scheme && !String(info.url ?? '').startsWith(info.scheme)) {
      const res = await f(`${info.scheme}__export/ping`, { method: 'POST', body: new Uint8Array(4) });
      if (res.ok) return info.scheme;
    }
  } catch { /* fall through to the page's own origin */ }
  return '';
}
