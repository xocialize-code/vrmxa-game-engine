// The character library: the "characters" service. A VRM can't be cloned and parsing is asynchronous,
// so characters are prepared before the scene is instantiated (or before a runtime add): every Character
// node gets its own parsed VRM; clips are parsed once per file and shared.
//
// Sources: a .vrmxa bundle (read with @xocialize/vrmxa-core, injected: the avatar studio owns it,
// AB-D-0249) gives avatar.vrm, its animation sets and clips, and the tags of what it wears; a plain .vrm
// gives the body only. Animation sets can be added or replaced per asset (`animations`) and for the
// whole project (`projectAnimations`, lowest priority after the character's own).
import { flatten } from '@vrmxg/scene';
import { parseVRM, parseVRMA } from './load.js';

const sniffZip = (b) => b[0] === 0x50 && b[1] === 0x4b; // "PK"
const decode = (b) => JSON.parse(new TextDecoder().decode(b));

export class CharacterLibrary {
  /**
   * @param {object} opts
   * @param {(ref: string) => Promise<Uint8Array> | Uint8Array} opts.resolve bytes of a project asset by ref
   * @param {any} [opts.vrmxaCore] the vrmxa-core module (its main and ./anim exports: readBundle,
   *   equippedState, resolveSlots), needed for .vrmxa sources
   * @param {boolean} [opts.stubTextures] headless: skip image decoding
   * @param {Map<string, any>} [opts.prefabs] for characters inside prefab instances
   * @param {{ doc: any, clips: Map<string, Uint8Array> }} [opts.projectAnimations] sets every character falls back on
   */
  constructor({ resolve, vrmxaCore = null, stubTextures = false, prefabs = new Map(), projectAnimations = null }) {
    this.resolve = resolve;
    this.vrmxaCore = vrmxaCore;
    this.stubTextures = stubTextures;
    this.prefabs = prefabs;
    this.projectAnimations = projectAnimations;
    /** ref → { animations override } */
    this.overrides = new Map();
    /** ref → source (bundle contents, parsed once) */
    this.sources = new Map();
    /** sha256 → VRMAnimation (parsed once) */
    this.clipCache = new Map();
    /** node id → prepared character */
    this.prepared = new Map();
  }

  /** Replace or add animation sets for one asset ref: { doc, clips: Map sha256 → .vrma bytes }. */
  setAnimations(ref, animations) { this.overrides.set(ref, animations); }

  /** Prepare every Character node of a scene (prefab instances included). */
  async prepare(doc) {
    const flat = flatten(doc, this.prefabs);
    const assets = new Map((doc.assets ?? []).map((a) => [a.id, a]));
    for (const n of flat.nodes) {
      if (n.type !== 'Character') continue;
      const ref = assets.get(n.asset)?.ref ?? n.asset;
      await this.prepareNode(n.id, ref);
    }
    return this;
  }

  /** Prepare one Character node (for a runtime add). */
  async prepareNode(id, ref) {
    const src = await this.source(ref);
    const vrm = await parseVRM(src.vrmBytes, { stubTextures: this.stubTextures });
    const doc = mergeSets(this.overrides.get(ref)?.doc ?? src.animations.doc, this.projectAnimations?.doc);
    const clipBytes = new Map([...(this.projectAnimations?.clips ?? []), ...src.animations.clips, ...(this.overrides.get(ref)?.clips ?? [])]);
    const clips = new Map();
    for (const c of doc.clips) {
      const bytes = clipBytes.get(c.sha256);
      if (!bytes) continue; // a clip the sets name but nobody supplied: its slots stay empty
      if (!this.clipCache.has(c.sha256)) this.clipCache.set(c.sha256, await parseVRMA(bytes));
      clips.set(c.sha256, { anim: this.clipCache.get(c.sha256), meta: c });
    }
    this.prepared.set(id, { vrm, ref, animations: doc, clips, tags: new Set(src.tags) });
    return this.prepared.get(id);
  }

  /** Parse another body for a character already in the tree (a closet redraw's avatar.vrm). */
  parseBody(bytes) { return parseVRM(bytes, { stubTextures: this.stubTextures }); }

  /** The prepared character for a node; each one is used once. */
  take(id) {
    const p = this.prepared.get(id);
    if (!p) throw new Error(`character "${id}" isn't prepared: await library.prepare(doc) before instantiate`);
    this.prepared.delete(id);
    return p;
  }

  /** Resolve VRMXA animation slots for what is worn (vrmxa-core's resolveSlots when available). */
  resolveSlots(doc, tags) {
    if (this.vrmxaCore?.resolveSlots) return this.vrmxaCore.resolveSlots(doc, tags);
    return resolveSlotsFallback(doc, tags);
  }

  async source(ref) {
    if (this.sources.has(ref)) return this.sources.get(ref);
    const bytes = await this.resolve(ref);
    let src;
    if (sniffZip(bytes)) {
      if (!this.vrmxaCore) throw new Error(`${ref} is a .vrmxa bundle: pass vrmxaCore (@xocialize/vrmxa-core) to read it`);
      const bundle = await this.vrmxaCore.readBundle(bytes);
      const s = bundle.manifest.sections ?? {};
      const animFile = s.animations?.file;
      const doc = animFile && bundle.entries.has(animFile) ? decode(bundle.entries.get(animFile)) : { format: 'vrmxa-animations', version: 1, clips: [], sets: [] };
      const clips = new Map();
      for (const c of doc.clips ?? []) if (c.file && bundle.entries.has(c.file)) clips.set(c.sha256, bundle.entries.get(c.file));
      // VRMXA §8.3: sets follow every worn item's tags plus its state's (vrmxa-core's equippedState).
      const tags = this.vrmxaCore.equippedState ? (await this.vrmxaCore.equippedState(bundle)).tags : [];
      src = { vrmBytes: bundle.entries.get('avatar.vrm'), animations: { doc, clips }, tags };
    } else {
      src = { vrmBytes: bytes, animations: { doc: { format: 'vrmxa-animations', version: 1, clips: [], sets: [] }, clips: new Map() }, tags: [] };
    }
    this.sources.set(ref, src);
    return src;
  }
}

// The character's own sets first; project sets after, never default (the character's default wins).
function mergeSets(own, project) {
  if (!project) return own;
  const shas = new Set(own.clips.map((c) => c.sha256));
  return {
    ...own,
    clips: [...own.clips, ...project.clips.filter((c) => !shas.has(c.sha256))],
    sets: [...own.sets, ...project.sets.map((s) => ({ ...s, from: s.from ?? 'project', ...(own.sets.some((x) => x.default) ? { default: false } : {}) }))],
  };
}

// The same rule as vrmxa-core's resolveSlots (VRMXA §8.3), for plain-VRM projects without it.
function resolveSlotsFallback(doc, tags) {
  const T = tags instanceof Set ? tags : new Set(tags ?? []);
  const sets = (doc?.sets ?? []).map((s, i) => ({ s, i })).filter(({ s }) => !s.default && (s.requires ?? []).every((t) => T.has(t)));
  sets.sort((a, b) => (b.s.priority ?? 0) - (a.s.priority ?? 0) || (a.s.from ? 1 : 0) - (b.s.from ? 1 : 0) || a.i - b.i);
  const def = (doc?.sets ?? []).find((s) => s.default);
  const out = {};
  for (const { s } of [...sets, ...(def ? [{ s: def }] : [])]) {
    for (const [slot, list] of Object.entries(s.slots ?? {})) {
      if (out[slot] || !list?.length) continue;
      out[slot] = { set: { id: s.id, name: s.name, from: s.from ?? null, default: !!s.default }, clips: list.map((e) => ({ weight: 1, rate: 1, blendIn: 0.25, ...e })) };
    }
  }
  return out;
}
