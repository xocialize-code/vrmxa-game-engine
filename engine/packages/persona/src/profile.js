// The role profile (M3 W1, research/npc-ai.md §6): a persona's prose as numbers that weight utility scores. Seven traits,
// each 0…1, 0.5 neutral. Derived once (by a model from the persona's text, or from its traits by a small word list),
// then the author's to edit; kept in the app persona (VRMXA §10.2), never in the bundle.

/** The traits, in order, with what 0 and 1 mean (the model's instructions and the inspector's labels). */
export const TRAITS = {
  sociability: ['keeps to themselves', 'seeks company'],
  curiosity: ['incurious', 'notices and asks about everything'],
  boldness: ['timid', 'bold'],
  energy: ['slow and calm', 'restless and quick'],
  talkativeness: ['says little', 'chatty'],
  personalSpace: ['stands close', 'keeps their distance'],
  patience: ['impatient', 'endlessly patient'],
};
const NAMES = Object.keys(TRAITS);

/** Words in a persona's traits or personality that move a trait: word → { trait: value }. */
const WORDS = {
  curious: { curiosity: 0.85 }, inquisitive: { curiosity: 0.85 }, nosy: { curiosity: 0.9, personalSpace: 0.3 },
  warm: { sociability: 0.75, personalSpace: 0.4 }, friendly: { sociability: 0.8 }, outgoing: { sociability: 0.85, talkativeness: 0.75 },
  shy: { sociability: 0.25, boldness: 0.2, talkativeness: 0.25, personalSpace: 0.75 }, reserved: { sociability: 0.35, talkativeness: 0.25, personalSpace: 0.7 },
  quiet: { talkativeness: 0.2 }, chatty: { talkativeness: 0.9 }, talkative: { talkativeness: 0.9 }, 'plain-spoken': { talkativeness: 0.4, boldness: 0.65 },
  bold: { boldness: 0.85 }, brave: { boldness: 0.85 }, confident: { boldness: 0.75 }, timid: { boldness: 0.15 },
  energetic: { energy: 0.85 }, quick: { energy: 0.75 }, lively: { energy: 0.8 }, calm: { energy: 0.3, patience: 0.75 }, relaxed: { energy: 0.3, patience: 0.7 },
  patient: { patience: 0.85 }, impatient: { patience: 0.15 }, grumpy: { patience: 0.25, sociability: 0.35 }, kind: { patience: 0.7, sociability: 0.65 },
};

/** A profile from the persona's traits and personality words; traits it says nothing about stay 0.5. Deterministic. */
export function profileFromTraits(persona) {
  const p = Object.fromEntries(NAMES.map((n) => [n, 0.5]));
  const words = [...(persona?.traits ?? []), ...String(persona?.personality ?? '').toLowerCase().split(/[^a-z-]+/)].map((w) => String(w).toLowerCase().trim()).filter(Boolean);
  const sums = {}, counts = {};
  for (const w of words) for (const [t, v] of Object.entries(WORDS[w] ?? {})) { sums[t] = (sums[t] ?? 0) + v; counts[t] = (counts[t] ?? 0) + 1; }
  for (const t of Object.keys(sums)) p[t] = round(sums[t] / counts[t]);
  return p;
}

/** Every trait present, a number, clamped to 0…1 and rounded to 2 places; unknown keys dropped. */
export function clampProfile(p) {
  return Object.fromEntries(NAMES.map((n) => { const v = Number(p?.[n]); return [n, Number.isFinite(v) ? round(Math.min(1, Math.max(0, v))) : 0.5]; }));
}

/**
 * Ask a model (a @vrmxg/director LanguageModel) for the profile, once, from the persona's text. Falls back to
 * profileFromTraits if the model fails or answers out of shape. The answer is the author's to edit afterwards.
 * @param {any} persona @param {{ respond: (req: any) => Promise<any> }} model
 * @returns {Promise<{ profile: Record<string, number>, from: 'model' | 'traits', error?: string }>}
 */
export async function deriveProfile(persona, model) {
  const scale = NAMES.map((n) => `- ${n}: 0 = ${TRAITS[n][0]}, 1 = ${TRAITS[n][1]}`).join('\n');
  const text = ['name', 'summary', 'personality', 'speech_style'].filter((k) => persona?.[k]).map((k) => `${k}: ${persona[k]}`).concat(persona?.traits?.length ? [`traits: ${persona.traits.join(', ')}`] : []).join('\n');
  const request = {
    messages: [
      { role: 'system', content: `Rate a character on seven traits, each a number from 0 to 1 (0.5 when the description says nothing). Answer with the profile tool.\n${scale}` },
      { role: 'user', content: text },
    ],
    tools: [{ name: 'profile', description: 'The character\'s trait ratings.', parameters: { type: 'object', properties: Object.fromEntries(NAMES.map((n) => [n, { type: 'number', minimum: 0, maximum: 1 }])), required: NAMES, additionalProperties: false } }],
    maxTokens: 120, priority: 2,
  };
  try {
    const r = await model.respond(request);
    let a = r.toolCalls?.find((c) => c.name === 'profile')?.arguments;
    if (typeof a === 'string') a = JSON.parse(a);
    if (!a || NAMES.some((n) => typeof a[n] !== 'number')) throw new Error('the answer lacks some traits');
    return { profile: clampProfile(a), from: 'model' };
  } catch (e) {
    return { profile: profileFromTraits(persona), from: 'traits', error: e.message };
  }
}

const round = (v) => Math.round(v * 100) / 100;
