// A character to cast, read from a .vrmxa (VRMXA through vrmxa-core, injected as the character library does,
// AB-D-0249): who she is, the persona's voice and allowed expressions, and what she wears (the closet, CLOSET.md).
// A card is plain data, so casting itself (cast.js) is synchronous and runs without vrmxa-core.

/** The engine id that names Kokoro-82M under a voice's `engines` (AB-A-0323: the operator's "kokoro-82m is fine"). */
export const KOKORO = 'kokoro-82m';
/**
 * Kokoro presets handed out, in order, to roles neither a persona nor the caller's map gives a voice: the sample's
 * two first (Hana af_heart, Mira af_bella), then others, so two unvoiced roles don't share one.
 */
export const KOKORO_PRESETS = Object.freeze(['af_heart', 'af_bella', 'af_sky', 'af_nicole', 'am_adam', 'am_michael', 'bf_emma', 'bm_george']);
/** VRMXA's expressions (§10.1, vrmxa-core's EMOTIONS) plus neutral, which every role may wear. */
export const EXPRESSIONS = Object.freeze(['happy', 'angry', 'sad', 'relaxed', 'surprised', 'neutral']);

/**
 * Read a .vrmxa into a card.
 * @param {Uint8Array} bytes the file
 * @param {{ ref: string, vrmxa: { readBundle: Function, sha256: Function, voicesOf: Function, personaOf: Function, closetOf: Function } }} o
 *   ref: the file's path relative to the project root (the asset ref casting writes); vrmxa: vrmxa-core's main,
 *   ./voice, ./persona and ./closet modules spread into one object
 * @returns {Promise<Card>}
 *
 * @typedef {{ ref: string, sha256: string, vrmxaId: string | null, title: string | null, name: string,
 *   persona: { name: string, voice_id: string | null, allowed_expressions: string[], rest_expression: string | null } | null,
 *   voices: { id: string, name: string | null, origin: string | null, engines: Record<string, any> }[], defaultVoice: string | null,
 *   wardrobe: { worn: string[], states: Record<string, string>, outfit: string | null,
 *     outfits: { id: string, name: string | null, items: string[] }[], items: { id: string, slot: string | null, kind: string | null, name: string | null }[] } }} Card
 */
export async function readCharacter(bytes, { ref, vrmxa }) {
  if (!ref) throw new Error('readCharacter needs the file\'s ref (its path in the project), which the sequence names');
  for (const f of ['readBundle', 'sha256', 'voicesOf', 'personaOf', 'closetOf']) if (typeof vrmxa?.[f] !== 'function') throw new Error(`readCharacter needs vrmxa-core's ${f} (pass its main, ./voice, ./persona and ./closet modules as vrmxa)`);
  const bundle = await vrmxa.readBundle(bytes);
  const p = vrmxa.personaOf(bundle);
  const v = vrmxa.voicesOf(bundle);
  const c = vrmxa.closetOf(bundle);
  const title = bundle.manifest?.title ?? null;
  return cardOf({
    ref, sha256: await vrmxa.sha256(bytes), vrmxaId: bundle.manifest?.id ?? null, title,
    persona: p ? { name: p.name, voice_id: p.voice_id ?? null, allowed_expressions: p.allowed_expressions ?? [], rest_expression: p.rest_expression ?? null } : null,
    voices: (v.voices ?? []).map((x) => ({ id: x.id, name: x.name ?? null, origin: x.origin ?? null, engines: x.engines ?? {} })),
    defaultVoice: v.default ?? null,
    wardrobe: {
      worn: [...(c.worn?.items ?? [])], states: { ...(c.worn?.states ?? {}) }, outfit: c.worn?.outfit ?? null,
      outfits: (c.outfits ?? []).map((o) => ({ id: o.id, name: o.name ?? null, items: [...(o.items ?? [])] })),
      items: (c.items ?? []).map((e) => ({ id: e.id, slot: e.slot ?? null, kind: e.kind ?? null, name: e.name ?? null })),
    },
  });
}

/**
 * A card from plain data (tests, a project's cache of read cards, a picker that has already read the file), with
 * every field present and in order.
 * @param {Partial<Card> & { ref: string }} d
 * @returns {Card}
 */
export function cardOf(d) {
  if (!d?.ref) throw new Error('a card needs ref: the .vrmxa\'s path in the project');
  const w = d.wardrobe ?? /** @type {any} */ ({});
  return {
    ref: d.ref, sha256: d.sha256 ?? null, vrmxaId: d.vrmxaId ?? null, title: d.title ?? null,
    name: d.name ?? d.persona?.name ?? d.title ?? basename(d.ref),
    persona: d.persona ? { name: d.persona.name, voice_id: d.persona.voice_id ?? null, allowed_expressions: [...(d.persona.allowed_expressions ?? [])], rest_expression: d.persona.rest_expression ?? null } : null,
    voices: (d.voices ?? []).map((x) => ({ id: x.id, name: x.name ?? null, origin: x.origin ?? null, engines: structuredClone(x.engines ?? {}) })),
    defaultVoice: d.defaultVoice ?? null,
    wardrobe: { worn: [...(w.worn ?? [])], states: { ...(w.states ?? {}) }, outfit: w.outfit ?? null, outfits: (w.outfits ?? []).map((o) => ({ id: o.id, name: o.name ?? null, items: [...(o.items ?? [])] })), items: (w.items ?? []).map((e) => ({ ...e })) },
  };
}

/**
 * The role's voice. In order:
 *   1. a preset the caller picked (the creator's voice menu): from "pick";
 *   2. the persona's voice (voice_id, else the voices document's default) when it names a Kokoro preset
 *      (`engines["kokoro-82m"].preset`, AB-A-0323): from "persona";
 *   3. the role → preset map (the sample's hana-1 = af_heart, mira = af_bella): from "map";
 *   4. the first of KOKORO_PRESETS no other role has: from "default".
 * A persona voice the shell can't speak (a designed or cloned voice with no Kokoro preset) falls through with a warning.
 * @param {Card} card @param {string} roleId
 * @param {{ voice?: string, presets?: Record<string, string>, taken?: string[] }} [o] taken: presets other roles have
 * @returns {{ voice: { engine: string, preset: string, from: 'pick' | 'persona' | 'map' | 'default', id?: string, name?: string }, warnings: string[] }}
 */
export function resolveVoice(card, roleId, { voice, presets = {}, taken = [] } = {}) {
  const warnings = [];
  if (voice) return { voice: { engine: KOKORO, preset: voice, from: 'pick' }, warnings };
  const id = card.persona?.voice_id ?? card.defaultVoice ?? null;
  if (id) {
    const v = card.voices.find((x) => x.id === id);
    const preset = v?.engines?.[KOKORO]?.preset;
    if (typeof preset === 'string' && preset) return { voice: { engine: KOKORO, preset, from: 'persona', id, ...(v.name ? { name: v.name } : {}) }, warnings };
    warnings.push(v
      ? `${card.name}'s voice "${v.name ?? id}" (${v.origin ?? 'no origin'}) names no ${KOKORO} preset, so the shell can't speak it yet; ${roleId} takes a Kokoro preset instead`
      : `${card.name}'s persona names voice ${id}, which her voices document doesn't have; ${roleId} takes a Kokoro preset instead`);
  }
  if (presets[roleId]) return { voice: { engine: KOKORO, preset: presets[roleId], from: 'map' }, warnings };
  const free = KOKORO_PRESETS.find((p) => !taken.includes(p)) ?? KOKORO_PRESETS[0];
  return { voice: { engine: KOKORO, preset: free, from: 'default' }, warnings };
}

/** The expressions the persona allows, in VRMXA's order, neutral always among them; null when she has no persona (all allowed). */
export function allowedExpressions(card) {
  if (!card.persona) return null;
  const allowed = new Set([...card.persona.allowed_expressions, 'neutral']);
  return EXPRESSIONS.filter((e) => allowed.has(e));
}

/**
 * What the role wears: one of the character's own outfits (CLOSET.md §5.5) when the caller names one, by id or name,
 * else what her closet says she has on. The closet service puts an outfit on at play (dress.js).
 * @param {Card} card @param {string | null} [outfit]
 * @returns {{ outfit: string | null, worn: string[] }}
 */
export function pickWardrobe(card, outfit = undefined) {
  const w = card.wardrobe;
  if (outfit === undefined || outfit === null) return { outfit: w.outfit, worn: [...w.worn] };
  const o = w.outfits.find((x) => x.id === outfit) ?? w.outfits.find((x) => x.name === outfit);
  if (!o) throw new Error(`${card.name} has no outfit "${outfit}"${w.outfits.length ? ` (she has: ${w.outfits.map((x) => x.name ?? x.id).join(', ')})` : ' (her closet has no outfits)'}`);
  return { outfit: o.id, worn: [...o.items] };
}

export const basename = (ref) => String(ref).split('/').pop().replace(/\.vrmxa$/i, '');
