// The audio library: every clip a scene uses (AudioPlayer assets, voice lines added by @vrmxg/voice), read once. Its
// length comes from the file's header (wav.js), so the simulation knows when a clip ends without Web Audio; decoding
// to an AudioBuffer happens per audio context, for presentation.
import { wavInfo } from './wav.js';

export class AudioLibrary {
  /** @param {{ resolve: (ref: string) => Promise<Uint8Array> | Uint8Array, prefabs?: Map<string, any> }} opts */
  constructor({ resolve, prefabs = new Map() }) {
    this.resolve = resolve; this.prefabs = prefabs;
    /** ref → { bytes, duration } */ this.clips = new Map();
    /** node id → ref */ this.refs = new Map();
    /** context → ref → Promise<AudioBuffer> */ this.decoded = new WeakMap();
  }

  /** Read every AudioPlayer's clip, prefab instances included. */
  async prepare(doc) {
    const walk = async (d, prefix, depth) => {
      if (depth > 16) return;
      const assets = new Map((d.assets ?? []).map((a) => [a.id, a]));
      for (const n of d.nodes) {
        const ref = assets.get(n.asset)?.ref;
        if ((n.type === 'AudioPlayer' || n.type === 'AudioPlayer3D') && ref) { await this.add(ref); this.refs.set(prefix + n.id, ref); }
        else if (n.type === 'Instance' && ref && this.prefabs.has(ref)) await walk(this.prefabs.get(ref), `${prefix}${n.id}/`, depth + 1);
      }
    };
    await walk(doc, '', 0);
    return this;
  }

  /** Read one clip (a voice line, a runtime add). Its length must be known: WAV only for now. */
  async add(ref) {
    if (this.clips.has(ref)) return this.clips.get(ref);
    const bytes = await this.resolve(ref);
    const info = wavInfo(bytes);
    if (!info) throw new Error(`${ref}: the engine reads WAV clips (PCM or float); this isn't one`);
    const clip = { bytes, duration: info.duration, sampleRate: info.sampleRate, channels: info.channels };
    this.clips.set(ref, clip);
    return clip;
  }

  clip(ref) { return this.clips.get(ref) ?? null; }
  refOf(id) { return this.refs.get(id) ?? null; }

  /** The clip decoded for a context (BaseAudioContext.decodeAudioData), once per context. */
  buffer(ctx, ref) {
    let m = this.decoded.get(ctx);
    if (!m) { m = new Map(); this.decoded.set(ctx, m); }
    if (!m.has(ref)) {
      const c = this.clips.get(ref);
      if (!c) return Promise.reject(new Error(`${ref} isn't in the audio library`));
      m.set(ref, ctx.decodeAudioData(c.bytes.slice().buffer));
    }
    return m.get(ref);
  }
}
