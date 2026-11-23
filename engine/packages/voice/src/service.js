// The voice service ("voice", M1 W6): characters speak lines, blink, and glance about while they look at something.
//
// Simulation (on the step clock, in the snapshot):
//   lines    say({ text, clip }) starts a line on this step. Each step the mouth is sampled from the line's word timings
//            at (step − start) / 60 s and written to the VRM's aa ih ou ee oh, before the characters step, so their
//            vrm.update applies it in the same step. The line ends after its clip (or its last word): `lineEnded`.
//   faces    blinks at intervals from the face's own random stream (2 to 6 s, 0.15 s each); while the character looks
//            at something, a small offset on the target (a saccade) every 0.5 to 2 s.
// Presentation: the line's clip is heard from the character's head (an @vrmxg/audio provider, on the voice bus), and
// captions() says what is being said, word by word.
//
// Word timings live beside the clip: voice/hana-welcome.wav → voice/hana-welcome.timings.json ({ words: [{ text,
// start, duration }], offset? }: `offset` corrects the timing source, seconds added to every word). A line with no timings file mouths estimated timings (estimateWords); a line with only text
// mouths the text. Clips a scene names (in connections' args, behaviour params) are read by prepare().
//
// Live lines (M2 W10, live.js): useLive(provider) gives text-only lines a voice while playing, as presentation only.
import { buildTrack, sampleMouth, wordAt, estimateWords, VOWELS } from './lipsync.js';
import { LiveLines } from './live.js';

const DT = 1 / 60;
const BLINK = [1 / 3, 2 / 3, 1, 0.83, 0.67, 0.5, 0.33, 0.17]; // 8 steps: shut in 3, open in 5

export class VoiceService {
  /** @param {any} tree @param {{ resolve: (ref: string) => Promise<Uint8Array> | Uint8Array, faces?: boolean }} opts */
  constructor(tree, { resolve, faces = true }) {
    this.tree = tree; this.resolve = resolve; this.facesOn = faces;
    /** clip ref → { words, text, duration } */ this.timings = new Map();
    /** character id → { clip, text, startStep, duration, words?, estimated } */ this.lines = new Map();
    /** character id → { nextBlink, blinkAt, nextGlance } */ this.faces = new Map();
    /** track cache: key → viseme keys (derived, not state) */ this.tracks = new Map();
    const audio = tree.services.get('audio');
    if (audio) audio.addProvider((step) => this.sounds(step));
    /** @type {LiveLines | null} presentation: text-only lines through a TTS provider */ this.live = null;
  }

  /**
   * Speak text-only lines through a TTS provider while playing (presentation: see live.js). null turns it off.
   * @param {ConstructorParameters<typeof LiveLines>[1] | null} provider @param {ConstructorParameters<typeof LiveLines>[2]} [opts]
   */
  useLive(provider, opts) { this.live = provider ? new LiveLines(this, provider, opts) : null; return this.live; }

  /** Read every clip a scene names (and its timings), so say() can start it on a step. */
  async prepare(doc) {
    const refs = new Set();
    const scan = (v) => { if (typeof v === 'string') { if (/\.wav$/i.test(v)) refs.add(v); } else if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
    for (const c of doc.connections ?? []) scan(c.args);
    for (const n of doc.nodes) { scan(n.behaviours); scan(n.props); }
    for (const r of refs) await this.preload(r);
    return this;
  }

  /**
   * Read one line's clip into the audio library and its word timings (estimated from the timings' text if missing).
   * A baked line (M4 W7, voicing.js) brings its own: `baked` is the dialogue clip's words, visemes and audio length, and
   * they are what the line plays, with no timings file read and no lip-sync rule run: the mouth is sampled from the
   * baked visemes and the line ends at the baked length, so a replay from the track is the same wherever it runs.
   * @param {string} clip @param {{ words?: any[], visemes?: any[], audio?: { duration?: number }, text?: string } | null} [baked]
   */
  async preload(clip, baked = null) {
    if (baked?.words) {
      const audio = this.tree.services.get('audio');
      if (audio) await audio.library.add(clip);
      const words = baked.words.map((w) => ({ text: w.text, start: w.start, duration: w.duration }));
      const last = words.at(-1);
      const t = { words, text: baked.text ?? words.map((w) => w.text).join(' '), duration: Math.max(baked.audio?.duration ?? 0, last ? last.start + last.duration : 0), estimated: false, visemes: baked.visemes ?? null };
      this.timings.set(clip, t);
      this.tracks.delete(clip);
      return t;
    }
    if (this.timings.has(clip)) return this.timings.get(clip);
    const audio = this.tree.services.get('audio');
    const info = audio ? await audio.library.add(clip) : null;
    let doc = null;
    try { doc = JSON.parse(new TextDecoder().decode(await this.resolve(clip.replace(/\.wav$/i, '.timings.json')))); } catch { /* no timings file */ }
    // `offset`: a correction for the timing source, added to every word (Kokoro's own durations run ~30 ms early)
    const offset = typeof doc?.offset === 'number' ? doc.offset : 0;
    const words = doc?.words ? doc.words.map((w) => ({ ...w, start: w.start + offset })) : estimateWords(doc?.text ?? '');
    const last = words.at(-1);
    const t = { words, text: doc?.text ?? words.map((w) => w.text).join(' '), duration: Math.max(info?.duration ?? 0, last ? last.start + last.duration : 0), estimated: !doc?.words };
    this.timings.set(clip, t);
    return t;
  }

  // ---------------------------------------------------------------- lines

  /**
   * A character starts a line (the Character's say action calls this).
   * @param {any} actor @param {{ text?: string, clip?: string }} [line]
   */
  say(actor, { text, clip } = {}) {
    let line;
    if (clip) {
      const t = this.timings.get(clip);
      if (!t) throw new Error(`${actor.id} says ${clip}, which isn't prepared: name it in the scene or await voice.preload(clip)`);
      line = { clip, text: text ?? t.text, startStep: this.tree.clock.step, duration: t.duration };
    } else {
      const words = estimateWords(text ?? '');
      const last = words.at(-1);
      line = { clip: null, text: text ?? '', startStep: this.tree.clock.step, duration: last ? last.start + last.duration + 0.2 : 0, words };
    }
    this.lines.set(actor.id, line);
    if (!line.clip) this.live?.started(actor.id, line);
    actor.emit('spoke', { text: line.text });
  }

  /** Stop a character's line. */
  hush(actorId) { const l = this.lines.get(actorId); if (!l) return; this.lines.delete(actorId); this.mouth(this.tree.find(actorId), null); }

  speaking(id) { return this.lines.has(id); }
  wordsOf(line) { return line.clip ? this.timings.get(line.clip).words : line.words; }
  trackOf(line) {
    const key = line.clip ?? `text:${line.text}`;
    const baked = line.clip ? this.timings.get(line.clip)?.visemes : null; // a baked line's own visemes (preload)
    if (!this.tracks.has(key)) this.tracks.set(key, baked ? baked.map(([viseme, t0, t1, t2, level]) => ({ viseme, t0, t1, t2, level })) : buildTrack(this.wordsOf(line)));
    return this.tracks.get(key);
  }

  mouth(actor, weights) {
    const em = actor?.vrm?.expressionManager;
    if (!em) return;
    for (const v of VOWELS) if (em.getExpression(v)) em.setValue(v, weights ? weights[v] : 0);
  }

  // ---------------------------------------------------------------- the step

  physicsProcess() {
    const step = this.tree.clock.step;
    for (const [id, line] of [...this.lines]) {
      const actor = this.tree.find(id);
      if (!actor) { this.lines.delete(id); continue; }
      const t = (step - line.startStep) * DT;
      if (t > line.duration) { this.lines.delete(id); this.mouth(actor, null); actor.emit('lineEnded', { text: line.text }); continue; }
      this.mouth(actor, sampleMouth(this.trackOf(line), t));
    }
    if (this.facesOn) for (const n of this.tree.all()) if (n.type === 'Character' && n.vrm) this.face(n, step);
  }

  face(actor, step) {
    const em = actor.vrm.expressionManager;
    let f = this.faces.get(actor.id);
    const rng = this.tree.rng.get(`face:${actor.id}`);
    if (!f) { f = { nextBlink: step + 60 + rng.int(240), blinkAt: -100, nextGlance: step }; this.faces.set(actor.id, f); }
    if (step >= f.nextBlink) { f.blinkAt = step; f.nextBlink = step + 120 + rng.int(240); }
    if (em?.getExpression('blink')) { const d = step - f.blinkAt; em.setValue('blink', d >= 0 && d < BLINK.length ? BLINK[d] : 0); }
    const c = actor.ctrl;
    if (!c) return;
    if (c.look) {
      if (step >= f.nextGlance) { c.lookOffset = [rng.range(-0.04, 0.04), rng.range(-0.025, 0.025), 0]; f.nextGlance = step + 30 + rng.int(90); }
    } else if (c.lookOffset && (c.lookOffset[0] || c.lookOffset[1])) c.lookOffset = [0, 0, 0];
  }

  // ---------------------------------------------------------------- presentation

  /** What the audio service plays for the lines: each clip from its speaker's head, on the voice bus. */
  sounds(step = this.tree.clock.step) {
    const out = [];
    for (const [id, line] of this.lines) {
      if (!line.clip) continue;
      const actor = this.tree.find(id);
      const head = actor?.vrm?.humanoid?.getRawBoneNode('head') ?? actor?.object3d;
      if (!head) continue;
      head.updateWorldMatrix(true, false);
      const e = head.matrixWorld.elements;
      out.push({ key: `voice:${id}`, ref: line.clip, startStep: line.startStep, loop: false, bus: 'voice', gain: 1, position: [e[12], e[13], e[14]], distance: { ref: 1.5, max: 25, rolloff: 1 } });
    }
    if (this.live) out.push(...this.live.sounds(step));
    return out;
  }

  /** The captions now: [{ actor, name, text, words, word, spoken }] (word: the index being said, -1 between words;
   *  spoken: how many words have begun). */
  captions(alpha = 1) {
    const now = this.tree.clock.step - 1 + alpha;
    return [...this.lines].map(([id, line]) => {
      const words = this.wordsOf(line), t = (now - line.startStep) * DT;
      return { actor: id, name: this.tree.find(id)?.name ?? id, text: line.text, words: words.map((w) => w.text), word: wordAt(words, t), spoken: words.filter((w) => w.start <= t).length };
    });
  }

  // ---------------------------------------------------------------- snapshots

  getState() {
    return {
      lines: [...this.lines].map(([id, l]) => [id, { ...l, ...(l.words ? { words: l.words.map((w) => ({ ...w })) } : {}) }]),
      faces: [...this.faces].map(([id, f]) => [id, { ...f }]),
    };
  }

  setState(s) {
    this.lines = new Map(s.lines.map(([id, l]) => [id, { ...l }]));
    this.faces = new Map(s.faces.map(([id, f]) => [id, { ...f }]));
    this.live?.reset();
  }
}
