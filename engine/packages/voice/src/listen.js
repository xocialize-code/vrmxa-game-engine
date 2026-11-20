// Listening (M3 W3, AB-T-0542): the person's voice into a conversation. Presentation side, outside the step.
//
// A microphone's frames go through an energy voice-activity detector (EnergyVAD). When the person starts speaking the
// director is told (director.speaking: the character listens, and holds a line until they stop); when they stop, the
// utterance goes to a speech-to-text provider and its text to director.talk. Everything that reaches the simulation goes
// through the director, which logs it, so a conversation replays with no microphone, no STT and no model.
//
// A speech-to-text provider is { name, transcribe(wav: Uint8Array) → Promise<{ text, ms? }> }:
//   shellSTT(native)   the Mac shell's bridge: native.call('stt.transcribe', { wav: base64 }) (Nemotron through MLXEngine,
//                      in the shell's voice product apps/shell/Voice; AB-A-0311)
//   httpSTT(url)       the loopback stand-in (content/sample/tools/voice-server.py: whisper through mlx-whisper)
// The shell's own microphone is the other way in: shellListen() takes its stt.listen events (VoiceChatKit's capture, VAD
// and live STT, natively) in place of microphone() + listenTo(). Use one microphone or the other, never both.
// Nothing here reads a clock: the detector counts frames, and latency is measured by whoever calls it.

const b64 = (bytes) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** The Mac shell's bridge: stt.transcribe (Nemotron through MLXEngine, in the shell's voice product). */
export function shellSTT(native) {
  return { name: 'shell', async transcribe(wav) { const r = await native.call('stt.transcribe', { wav: b64(wav) }); return { text: String(r.text ?? '').trim(), ms: r.ms ?? null }; } };
}

/**
 * The shell's native microphone into a conversation with `agent` (stt.listen: VoiceChatKit's capture, EnergyVAD and the
 * live plane). Its events do what listenTo's do: speech start and end go to director.speaking, a final transcript to
 * director.talk. The shell listens one utterance at a time; this reopens after each until stop().
 * No echo cancellation natively: stop it while the character speaks through speakers, or use headphones.
 * @param {{ native: { call: (m: string, p?: any) => Promise<any>, on: (name: string, fn: (e: any) => void) => () => void },
 *   director: any, agent: string, onTranscript?: (t: { text: string }) => void, onEvent?: (e: any) => void,
 *   onError?: (e: Error) => void }} o
 */
export function shellListen({ native, director, agent, onTranscript = () => {}, onEvent = () => {}, onError = (e) => console.warn(`[voice] listen: ${e.message}`) }) {
  let open = false, off = null;
  const listen = () => native.call('stt.listen').catch((e) => { open = false; onError(e); });
  return {
    get listening() { return open; },
    async start() {
      if (open) return;
      open = true;
      off = native.on('stt.event', (e) => {
        onEvent(e);
        if (e.type === 'speechStarted') director.speaking(agent, true);
        else if (e.type === 'speechEnded') director.speaking(agent, false);
        else if (e.type === 'final' || e.type === 'failed' || e.type === 'cancelled') {
          const text = e.type === 'final' ? String(e.text ?? '').trim() : '';
          if (text && !/^\[.*\]$/.test(text)) { onTranscript({ text }); director.talk(agent, text); }
          if (e.type === 'failed') onError(new Error(e.text ?? 'listening failed'));
          if (open && e.type !== 'cancelled') listen();
        }
      });
      await listen();
    },
    async stop() {
      open = false;
      off?.(); off = null;
      await native.call('stt.stop', { cancel: true }).catch(() => {});
    },
  };
}

/** A 16-bit PCM or 32-bit float WAV (the first channel) → { samples, rate }. */
export function decodeWav(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), tag = (i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV');
  let i = 12, format = 1, channels = 1, rate = 16000, bits = 16;
  while (i + 8 <= b.length) {
    const id = tag(i), size = v.getUint32(i + 4, true), body = i + 8;
    if (id === 'fmt ') { format = v.getUint16(body, true); channels = v.getUint16(body + 2, true) || 1; rate = v.getUint32(body + 4, true); bits = v.getUint16(body + 14, true); }
    else if (id === 'data') {
      const frame = channels * (bits / 8), n = Math.floor(Math.min(size, b.length - body) / frame), out = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const o = body + k * frame;
        if (format === 1 && bits === 16) out[k] = v.getInt16(o, true) / 32768;
        else if (format === 3 && bits === 32) out[k] = v.getFloat32(o, true);
        else throw new Error(`a WAV of 16-bit PCM or 32-bit float, please (format ${format}, ${bits} bits)`);
      }
      return { samples: out, rate };
    }
    i = body + size + (size & 1);
  }
  throw new Error('the WAV has no data');
}

/**
 * A recording as a microphone (tests, measurements): the WAV's samples at `rate` in `frameMs` frames, paced by `now`
 * as a live microphone would deliver them, then `tailMs` of silence so a detector closes. onSpeechEnd(t) reports when
 * the recording's last sample went in, by the same clock. The caller brings the clock and the timer (`now`, `tick`,
 * `untick`): nothing here reads one. Returns { done, stop }.
 * @param {Uint8Array} wav @param {(frame: Float32Array) => void} onFrame
 * @param {{ now: () => number, tick: (fn: () => void) => any, untick: (h: any) => void, rate?: number, frameMs?: number,
 *   leadMs?: number, tailMs?: number, onSpeechEnd?: (t: number) => void }} o
 */
export function wavFrames(wav, onFrame, { now, tick, untick, rate = 16000, frameMs = 20, leadMs = 400, tailMs = 1200, onSpeechEnd = () => {} }) {
  const { samples, rate: from } = decodeWav(wav);
  const step = from / rate, n = Math.floor(samples.length / step), speech = new Float32Array(n);
  for (let k = 0; k < n; k++) { const p = k * step, i = Math.floor(p), t = p - i; speech[k] = i + 1 < samples.length ? samples[i] * (1 - t) + samples[i + 1] * t : samples[i]; }
  const per = Math.round((rate * frameMs) / 1000), lead = Math.round((rate * leadMs) / 1000), all = new Float32Array(lead + n + Math.round((rate * tailMs) / 1000));
  all.set(speech, lead);
  const frames = Math.floor(all.length / per), endFrame = Math.ceil((lead + n) / per);
  let sent = 0, h = null, resolve;
  const done = new Promise((r) => { resolve = r; });
  const t0 = now();
  const pump = () => {
    const due = Math.min(frames, Math.floor((now() - t0) / frameMs));
    while (sent < due) {
      onFrame(all.subarray(sent * per, (sent + 1) * per));
      sent++;
      if (sent === endFrame) onSpeechEnd(now());
    }
    if (sent >= frames) { untick(h); resolve(); }
  };
  h = tick(pump);
  return { done, stop() { untick(h); resolve(); } };
}

/** A loopback STT server: POST the WAV's bytes → { text, ms }. */
export function httpSTT(url, { fetch: f = globalThis.fetch } = {}) {
  return {
    name: `http ${url}`,
    async transcribe(wav) {
      const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
      if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return { text: String(j.text ?? '').trim(), ms: j.ms ?? null };
    },
  };
}

/** Mono float samples → a 16-bit PCM WAV. */
export function encodeWav(samples, rate) {
  const n = samples.length, out = new Uint8Array(44 + n * 2), v = new DataView(out.buffer);
  const tag = (o, s) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); tag(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return out;
}

/**
 * An energy voice-activity detector over fixed frames: speech starts after `startMs` of frames above the threshold and
 * ends after `endMs` of quiet. The threshold follows the noise floor (a slow average of quiet frames) times `ratio`, never
 * below `floor`. Each utterance keeps `preMs` of audio before its start, so the first syllable isn't cut.
 * feed(frame) returns the events that frame caused: { type: 'start', frame } and { type: 'end', frame, audio }.
 */
export class EnergyVAD {
  /**
   * @param {{ rate?: number, frameMs?: number, ratio?: number, floor?: number, startMs?: number, endMs?: number,
   *   minMs?: number, maxMs?: number, preMs?: number, calibrateMs?: number }} [o] calibrateMs: the first frames only
   *   learn the noise floor
   */
  constructor({ rate = 16000, frameMs = 20, ratio = 3, floor = 0.006, startMs = 80, endMs = 450, minMs = 250, maxMs = 15000, preMs = 200, calibrateMs = 300 } = {}) {
    this.rate = rate; this.frameMs = frameMs; this.ratio = ratio; this.floor = floor;
    const f = (ms) => Math.max(1, Math.round(ms / frameMs));
    this.calibrationFrames = calibrateMs > 0 ? f(calibrateMs) : 0;
    this.startFrames = f(startMs); this.endFrames = f(endMs); this.minFrames = f(minMs); this.maxFrames = f(maxMs); this.preFrames = f(preMs);
    this.noise = floor / ratio; this.n = 0; this.speaking = false; this.loud = 0; this.quiet = 0; this.spoken = 0;
    /** @type {Float32Array[]} */ this.pre = []; /** @type {Float32Array[]} */ this.cur = [];
  }

  /** The energy threshold now. */
  get threshold() { return Math.max(this.floor, this.noise * this.ratio); }

  /** @param {Float32Array} frame one frame of `rate · frameMs / 1000` samples */
  feed(frame) {
    const ev = [];
    let e = 0;
    for (let i = 0; i < frame.length; i++) e += frame[i] * frame[i];
    e = Math.sqrt(e / Math.max(1, frame.length));
    this.n++;
    if (this.n <= this.calibrationFrames) { // the first frames only learn the room's noise (their mean energy)
      this.noise += (e - this.noise) / this.n;
      this.pre.push(frame); if (this.pre.length > this.preFrames + this.startFrames) this.pre.shift();
      return ev;
    }
    const loud = e > this.threshold;
    if (!this.speaking) {
      if (!loud) this.noise += (e - this.noise) * 0.05; // the floor follows quiet only
      this.pre.push(frame); if (this.pre.length > this.preFrames + this.startFrames) this.pre.shift();
      this.loud = loud ? this.loud + 1 : 0;
      if (this.loud >= this.startFrames) { this.speaking = true; this.quiet = 0; this.spoken = this.startFrames; this.cur = this.pre.slice(); this.pre = []; ev.push({ type: 'start', frame: this.n }); }
    } else {
      this.cur.push(frame); this.spoken++;
      this.quiet = loud ? 0 : this.quiet + 1;
      if (this.quiet >= this.endFrames || this.cur.length >= this.maxFrames) {
        this.speaking = false; this.loud = 0;
        const speech = this.spoken - this.quiet; // from the first loud frame to the last, the pre-roll aside
        const audio = concat(this.cur);
        this.cur = [];
        ev.push({ type: 'end', frame: this.n, audio, short: speech < this.minFrames });
      }
    }
    return ev;
  }
}

function concat(frames) {
  const out = new Float32Array(frames.reduce((s, f) => s + f.length, 0));
  let o = 0;
  for (const f of frames) { out.set(f, o); o += f.length; }
  return out;
}

/**
 * The person's voice into a conversation with `agent`: feed() takes microphone frames; speech start and end go to
 * director.speaking, and each utterance (long enough) to the STT provider and then director.talk.
 * @param {{ director: any, agent: string, stt: { transcribe: (wav: Uint8Array) => Promise<{ text: string }> },
 *   vad?: EnergyVAD, onTranscript?: (t: { text: string, ms?: number | null, seconds: number }) => void,
 *   onError?: (e: Error) => void }} o
 */
export function listenTo({ director, agent, stt, vad = new EnergyVAD(), onTranscript = () => {}, onError = (e) => console.warn(`[voice] stt: ${e.message}`) }) {
  return {
    vad,
    /** @param {Float32Array} frame */
    feed(frame) {
      for (const e of vad.feed(frame)) {
        if (e.type === 'start') director.speaking(agent, true);
        else {
          director.speaking(agent, false);
          if (e.short) continue;
          const seconds = e.audio.length / vad.rate;
          stt.transcribe(encodeWav(e.audio, vad.rate)).then((t) => {
            onTranscript({ ...t, seconds });
            if (t.text && !/^\[.*\]$/.test(t.text)) director.talk(agent, t.text);
          }, onError);
        }
      }
    },
  };
}

/**
 * Microphone frames in a browser (or the shell's web view): getUserMedia → an AudioWorklet that posts 20 ms frames at
 * the context's rate, resampled to `rate`. Returns a stop function. The microphone stays off until this is called.
 * @param {(frame: Float32Array) => void} onFrame @param {{ rate?: number, frameMs?: number }} [o]
 */
export async function microphone(onFrame, { rate = 16000, frameMs = 20 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {}); // not awaited: WebKit holds it until a user gesture
  const code = `registerProcessor('vrmxg-mic', class extends AudioWorkletProcessor { process(i) { const c = i[0]?.[0]; if (c) this.port.postMessage(c.slice(0)); return true; } });`;
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  const node = new AudioWorkletNode(ctx, 'vrmxg-mic');
  ctx.createMediaStreamSource(stream).connect(node);
  // WebKit renders only nodes that reach the destination: a silent gain gets the worklet pulled without being heard
  const mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute).connect(ctx.destination);
  const per = Math.round((rate * frameMs) / 1000), step = ctx.sampleRate / rate;
  let buf = new Float32Array(0), pos = 0;
  node.port.onmessage = (m) => {
    const x = /** @type {Float32Array} */ (m.data), joined = new Float32Array(buf.length + x.length);
    joined.set(buf); joined.set(x, buf.length); buf = joined;
    const out = [];
    while (pos + 1 < buf.length) { const i = Math.floor(pos), t = pos - i; out.push(buf[i] * (1 - t) + buf[i + 1] * t); pos += step; }
    const used = Math.floor(pos); buf = buf.subarray(used); pos -= used;
    for (let k = 0; k + per <= out.length; k += per) onFrame(Float32Array.from(out.slice(k, k + per)));
  };
  const stop = () => { node.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close(); };
  return Object.assign(stop, { context: ctx, stream }); // for a status line: the context's state, the track's
}
