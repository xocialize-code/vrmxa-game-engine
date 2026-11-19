// Core and app personas (M3 W1, VRMXA §10).
//
// The core persona travels in the bundle (character.sqlite, §10.1) or, for a character without one, in the exchange
// form ({ format: "vrmxa-persona", version: 1, …, examples: [{ user, character }] }). The app persona is the app's own
// (§10.2): story, framing, overrides, and for VRMXG the role profile, goals and gestures. It is linked by the character's
// id, never written into a bundle. The persona in effect is the core with the app's overrides laid over it.

const JSON_FIELDS = ['traits', 'languages', 'allowed_expressions', 'tags', 'extensions'];
const TEXT_FIELDS = ['name', 'age', 'summary', 'description', 'personality', 'speech_style', 'rest_expression', 'voice_id', 'creator'];

/**
 * A core persona from a bundle's database data ({ persona, examples }, vrmxa-core's readCharacterDb) or the exchange
 * form, with JSON columns parsed and examples as { user, character }.
 * @param {any} src
 * @returns {CorePersona | null}
 *
 * @typedef {{ name: string, age?: string, summary?: string, description?: string, personality?: string,
 *   traits: string[], speech_style?: string, languages: string[], rest_expression?: string,
 *   allowed_expressions: string[], voice_id?: string, examples: { user: string, character: string }[] }} CorePersona
 */
export function corePersona(src) {
  if (!src) return null;
  const row = src.format === 'vrmxa-persona' ? src : src.persona;
  if (!row?.name) return null;
  const out = /** @type {CorePersona} */ ({ name: row.name, traits: [], languages: [], allowed_expressions: [], examples: [] });
  for (const k of TEXT_FIELDS) if (typeof row[k] === 'string' && row[k]) out[k] = row[k];
  for (const k of JSON_FIELDS) {
    let v = row[k];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    if (k === 'tags' || k === 'extensions') continue; // not for the model
    out[k] = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  }
  const ex = src.format === 'vrmxa-persona' ? src.examples ?? [] : (src.examples ?? []).map((e) => ({ user: e.user_text, character: e.character_text }));
  out.examples = ex.filter((e) => e?.user && e?.character).map((e) => ({ user: e.user, character: e.character }));
  return out;
}

/**
 * The persona in effect: the core with the app's overrides laid over it, plus the app's story. null without either.
 * @param {CorePersona | null} core @param {AppPersona | null} app
 *
 * @typedef {{ label?: string, core?: string, overrides?: Partial<CorePersona>, story?: string, framing?: string,
 *   profile?: Record<string, number>, goals?: { name: string, description?: string }[], gestures?: string[] }} AppPersona
 */
export function layer(core, app) {
  if (!core && !app) return null;
  const base = core ? structuredClone(core) : { name: app?.overrides?.name ?? app?.label ?? 'Someone', traits: [], languages: [], allowed_expressions: [], examples: [] };
  const p = /** @type {CorePersona & { story?: string }} */ ({ ...base, ...structuredClone(app?.overrides ?? {}) });
  if (app?.story) p.story = app.story;
  return p;
}
