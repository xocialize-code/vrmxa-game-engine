// The "persona" service (M3 W1): who each character is, for the director and the brains.
//
// For each Character node: its VRMXA id and core persona come from its bundle (the character library keeps them,
// @vrmxg/character), or from an exchange-form file the app persona names. The app persona comes from the project's
// personas document, keyed by VRMXA id (§10.2). What the app remembers (§11) comes from a provider the app sets; the
// engine stores none of it. The role profile weights utility through @vrmxg/ai's `trait` input.
//
// All of it is project data, like a scene or an asset: not in the snapshot. Changing a profile changes what a run
// does, as editing a scene does; a recorded run replays with the data it was recorded with.
import { corePersona, layer } from './core.js';
import { clampProfile } from './profile.js';

/** The project's personas document: { format: "vrmxg-personas", version: 1, characters: { <vrmxa id>: AppPersona } }. */
export const FORMAT = 'vrmxg-personas';

export class PersonaService {
  /**
   * @param {any} tree
   * @param {{ resolve?: (ref: string) => Promise<Uint8Array> | Uint8Array, library?: any, doc?: any, overrides?: Record<string, any> }} [opts]
   *   library: the character library (installCharacters' return); doc: the project's personas document, already read;
   *   overrides: the scene's own (M3 W10: its `settings.personas`, by VRMXA id), laid over the project's, so a scene can
   *   tune a character and an editor's Undo covers it
   */
  constructor(tree, { resolve = null, library = null, doc = null, overrides = null } = {}) {
    this.tree = tree; this.resolve = resolve; this.library = library;
    this.doc = doc ? checkDoc(doc) : { format: FORMAT, version: 1, characters: {} };
    this.overrides = structuredClone(overrides ?? {});
    /** Exchange-form core personas the app personas name, by ref. */ this.cores = new Map();
    /** @type {(vrmxaId: string | null, nodeId: string) => string | null} what the app remembers, as text */
    this.memory = () => null;
  }

  /** Read the exchange-form core personas the app personas name (before the director asks). */
  async prepare() {
    for (const a of Object.values(this.doc.characters)) {
      if (!a.core || this.cores.has(a.core)) continue;
      if (!this.resolve) throw new Error(`a persona names ${a.core}: install the persona service with a resolve`);
      const j = JSON.parse(new TextDecoder().decode(await this.resolve(a.core)));
      if (j.format !== 'vrmxa-persona') throw new Error(`${a.core}: not a vrmxa-persona document`);
      this.cores.set(a.core, j);
    }
    return this;
  }

  /** The character's VRMXA id (its bundle's manifest id), or null for a plain VRM. */
  vrmxaIdOf(nodeId) { return this.library?.characters?.get(nodeId)?.vrmxaId ?? null; }
  /** The app persona for a node (by its VRMXA id), or null. */
  appOf(nodeId) {
    const id = this.vrmxaIdOf(nodeId);
    if (!id) return null;
    const base = this.doc.characters[id] ?? null, over = this.overrides[id] ?? null;
    if (!over) return base;
    return { ...(base ?? {}), ...over, ...(base?.profile || over.profile ? { profile: { ...(base?.profile ?? {}), ...(over.profile ?? {}) } } : {}) };
  }
  /** The core persona: the bundle's, else the exchange file its app persona names. */
  coreOf(nodeId) {
    const own = corePersona(this.library?.characters?.get(nodeId)?.persona);
    if (own) return own;
    const a = this.appOf(nodeId);
    return a?.core ? corePersona(this.cores.get(a.core)) : null;
  }
  /** The persona in effect (core with the app's laid over), or null. */
  personaOf(nodeId) { return layer(this.coreOf(nodeId), this.appOf(nodeId)); }
  /** The role profile (seven traits, 0…1), or null. */
  profileOf(nodeId) { const p = this.appOf(nodeId)?.profile; return p ? clampProfile(p) : null; }
  /** What the app remembers about the person, for this character. */
  memoryOf(nodeId) { return this.memory(this.vrmxaIdOf(nodeId), nodeId); }

  /**
   * What the director needs (its `persona` provider): the persona's text, the faces a reply may carry
   * (allowed_expressions), and the app's goals, gestures and framing.
   */
  forDirector(nodeId) {
    const p = this.personaOf(nodeId), a = this.appOf(nodeId);
    if (!p) return null;
    const { allowed_expressions, ...text } = p;
    return {
      ...text,
      ...(allowed_expressions?.length ? { allowedExpressions: allowed_expressions.filter((e) => e !== 'neutral') } : {}),
      ...(a?.goals ? { goals: structuredClone(a.goals) } : {}),
      ...(a?.gestures ? { gestures: [...a.gestures] } : {}),
      ...(a?.framing ? { framing: a.framing } : {}),
    };
  }

  /** Set a character's profile in the app persona (the editor, MCP); returns the document to save. */
  setProfile(nodeId, profile) {
    const id = this.vrmxaIdOf(nodeId);
    if (!id) throw new Error(`${nodeId} has no VRMXA id: an app persona is keyed by it (VRMXA §10.2)`);
    this.doc.characters[id] = { ...(this.doc.characters[id] ?? { label: this.tree.find(nodeId)?.name ?? nodeId }), profile: clampProfile(profile) };
    return this.document();
  }
  /** The personas document as it stands (to save in the project). */
  document() { return structuredClone(this.doc); }
}

function checkDoc(d) {
  if (d.format !== FORMAT || typeof d.characters !== 'object') throw new Error(`a personas document is { "format": "${FORMAT}", "version": 1, "characters": { <vrmxa id>: … } }`);
  return structuredClone(d);
}
