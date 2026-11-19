// Listening (M3 W3, AB-T-0542): the person's voice into a conversation. Presentation side, outside the step.
//
// A microphone's frames go through an energy voice-activity detector (EnergyVAD). When the person starts speaking the
// director is told (director.speaking: the character listens, and holds a line until they stop); when they stop, the
// utterance goes to a speech-to-text provider and its text to director.talk. Everything that reaches the simulation goes
// through the director, which logs it, so a conversation replays with no microphone, no STT and no model.
//
// A speech-to-text provider is { name, transcribe(wav: Uint8Array) → Promise<{ text, ms? }> }:
//   shellSTT(native)   the Mac shell's bridge: native.call('stt.transcribe', { wav: base64 }) (MLXEngine's live plane,
//                      asked of mlx-engine, AB-A-0311; until the shell has the method the call fails)
//   httpSTT(url)       the loopback stand-in (content/sample/tools/voice-server.py: whisper through mlx-whisper)
// Nothing here reads a clock: the detector counts frames, and latency is measured by whoever calls it.

const b64 = (bytes) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** The Mac shell's bridge. */
export function shellSTT(native) {
  return { name: 'shell', async transcribe(wav) { const r = await native.call('stt.transcribe', { wav: b64(wav) }); return { text: String(r.text ?? '').trim(), ms: r.ms ?? null }; } };
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
  const code = `registerProcessor('vrmxg-mic', class extends AudioWorkletProcessor { process(i) { const c = i[0]?.[0]; if (c) this.port.postMessage(c.slice(0)); return true; } });`;
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  const node = new AudioWorkletNode(ctx, 'vrmxg-mic');
  ctx.createMediaStreamSource(stream).connect(node);
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
  return () => { node.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close(); };
}
