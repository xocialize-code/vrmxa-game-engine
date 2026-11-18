// Live lines (M2 W10): text-only lines spoken through a TTS provider while playing. Presentation only.
//
// The simulation never waits on, or reads, a synthesised clip: a text-only line runs on its estimated word timings
// (its length, its mouth, `lineEnded`) exactly as it does with no provider, so a replay, a snapshot and an export are
// the same with or without one. What a provider adds is sound: when the clip arrives it is heard from the speaker's
// head, from the step it arrived on (nothing is cut off), on the voice bus. While the audio service records (an
// export) live clips are left out: a shot is exported with baked lines (bake.js, tools/bake-lines.mjs).
//
// A provider is { name, speak({ text, voice }) → Promise<{ wav: Uint8Array, words?: [{ text, start, duration }] }> }.
//   shellTTS(native)   the Mac shell's bridge: native.call('tts.speak', { text, voice }) (an MLXEngine endpoint, asked of
//                      the mlx-engine area; until the shell has the method the call fails and live lines stay silent)
//   httpTTS(url)       a loopback TTS server (content/sample/tools/tts-server.py: Kokoro through mlx-audio), POST JSON
// Both answer { wav: base64, sampleRate, words }.

const b64 = (s) => {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const decode = (r) => ({ wav: typeof r.wav === 'string' ? b64(r.wav) : r.wav, words: r.words ?? null, sampleRate: r.sampleRate ?? null });

/** The Mac shell's bridge (window.vrmxgNative or the shell's `native` object). */
export function shellTTS(native) {
  return { name: 'shell', async speak({ text, voice }) { return decode(await native.call('tts.speak', { text, voice })); } };
}

/** A loopback TTS server: POST { text, voice } → { wav (base64), sampleRate, words }. */
export function httpTTS(url, { fetch: f = globalThis.fetch } = {}) {
  return {
    name: `http ${url}`,
    async speak({ text, voice }) {
      const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ text, voice }) });
      if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`);
      return decode(await r.json());
    },
  };
}

export class LiveLines {
  /**
   * @param {any} voice the voice service
   * @param {{ name?: string, speak: (line: { text: string, voice: string }) => Promise<{ wav: Uint8Array, words?: any[] }> }} provider
   * @param {{ voices?: Record<string, string>, voice?: string, onError?: (e: Error) => void, now?: () => number }} [opts] voices:
   *   character id → voice name; now: a clock for the latency stats (the caller's: nothing here reads one by itself)
   */
  constructor(voice, provider, { voices = {}, voice: fallback = 'af_heart', onError = (e) => console.warn(`[voice] live line: ${e.message}`), now = () => 0 } = {}) {
    this.voice = voice; this.provider = provider; this.voices = voices; this.fallback = fallback; this.onError = onError; this.now = now;
    /** text|voice → { state: 'pending' | 'ready' | 'failed', ref?, duration?, ms? } */ this.clips = new Map();
    /** character id → { line (the voice service's line object), key, heardFrom (step) } */ this.playing = new Map();
    this.failures = 0;
    this.stats = { requested: 0, ready: 0, failed: 0, ms: [] };
  }

  voiceOf(id) { return this.voices[id] ?? this.fallback; }

  /** A text-only line started (the voice service calls this): ask for its clip, unless it's cached or on its way. */
  started(id, line) {
    if (line.clip || !line.text || this.failures >= 3) return;
    const v = this.voiceOf(id), key = `${v}|${line.text}`;
    this.playing.set(id, { line, key, heardFrom: null });
    if (this.clips.has(key)) return;
    const entry = { state: 'pending' };
    this.clips.set(key, entry);
    this.stats.requested++;
    const t0 = this.now();
    this.provider.speak({ text: line.text, voice: v }).then(async (r) => {
      const ref = `live:${this.stats.requested}:${key}`;
      const audio = this.voice.tree.services.get('audio');
      const clip = audio ? audio.library.put(ref, r.wav) : null;
      Object.assign(entry, { state: 'ready', ref, duration: clip?.duration ?? 0, words: r.words, ms: this.now() - t0 });
      this.stats.ready++; this.stats.ms.push(Math.round(entry.ms));
    }).catch((e) => {
      entry.state = 'failed'; this.failures++; this.stats.failed++;
      this.onError(e);
    });
  }

  /** What to hear now: each live line whose clip has arrived, from the step it arrived on. */
  sounds(step) {
    const out = [];
    const audio = this.voice.tree.services.get('audio');
    if (audio?.rec) return out; // an export: baked lines only
    for (const [id, p] of [...this.playing]) {
      const entry = this.clips.get(p.key);
      const current = this.voice.lines.get(id);
      // the line was replaced, or ended and its clip has played out
      if (current !== p.line && current) { this.playing.delete(id); continue; }
      if (entry?.state !== 'ready') { if (!current) this.playing.delete(id); continue; }
      if (p.heardFrom === null) p.heardFrom = step;
      if ((step - p.heardFrom) / 60 > entry.duration) { this.playing.delete(id); continue; }
      const actor = this.voice.tree.find(id);
      const head = actor?.vrm?.humanoid?.getRawBoneNode('head') ?? actor?.object3d;
      if (!head) continue;
      head.updateWorldMatrix(true, false);
      const e = head.matrixWorld.elements;
      out.push({ key: `voice:${id}`, ref: entry.ref, startStep: p.heardFrom, loop: false, bus: 'voice', gain: 1, position: [e[12], e[13], e[14]], distance: { ref: 1.5, max: 25, rolloff: 1 } });
    }
    return out;
  }

  /** A restore or a seek: forget what was playing (cached clips stay). */
  reset() { this.playing.clear(); }
}
