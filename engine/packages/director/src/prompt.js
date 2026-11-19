// What the director puts in front of the model (M3 W0), in VRMXA §11's order: the core persona with the app's persona
// laid over it (§10.1–10.2; the app's framing is part of its persona), what the app remembers, then the conversation in
// hand. The moment (who is around, what the character is doing, what was just said) closes the last user turn.
// The engine stores none of it: persona and memory come from the app through providers (@vrmxg/persona, W1).

/**
 * @param {object} o
 * @param {string} [o.framing] the app's rules (how replies are made: one short line, use the tools …)
 * @param {Persona} o.persona
 * @param {string | null} [o.memory] what the app remembers about this person, as text
 * @param {{ role: 'user' | 'assistant', content: string }[]} [o.history] the conversation so far
 * @param {string} o.moment the situation and the newest turn
 * @returns {{ role: string, content: string }[]}
 *
 * @typedef {{ name: string, summary?: string, description?: string, personality?: string, traits?: string[],
 *   speech_style?: string, languages?: string[], examples?: { user: string, character: string }[], story?: string }} Persona
 */
export function buildMessages({ framing = FRAMING, persona, memory = null, history = [], moment }) {
  const p = persona, lines = [framing.trim(), '', `You are ${p.name}.`];
  if (p.summary) lines.push(p.summary);
  if (p.description) lines.push(`Appearance and manner: ${p.description}`);
  if (p.personality) lines.push(`Personality: ${p.personality}`);
  if (p.traits?.length) lines.push(`Traits: ${p.traits.join(', ')}.`);
  if (p.speech_style) lines.push(`How you talk: ${p.speech_style}`);
  if (p.languages?.length) lines.push(`Languages: ${p.languages.join(', ')}.`);
  if (p.story) lines.push(`Your situation: ${p.story}`);
  if (p.examples?.length) lines.push('', 'How you sound:', ...p.examples.map((e) => `- They: ${e.user}\n  You: ${e.character}`));
  if (memory) lines.push('', 'What you remember about the person you are talking to:', memory.trim());
  return [{ role: 'system', content: lines.join('\n') }, ...history.map((h) => ({ role: h.role, content: h.content })), { role: 'user', content: moment }];
}

/** The app's default rules: short spoken replies, through the tools, never narrating. */
export const FRAMING = `You are a character in a small 3D world, talking with a person in real time. Answer through the tools you are given:
- Speak with the say tool: one or two short sentences, as you would say them out loud. Never describe your actions in words.
- Act with the other tools (walk, look, use things, take on a goal) when the person asks or it suits the moment.
- Only use the people, things, faces and gestures the tools list. If you can't do something, say so in character.`;

/**
 * The moment as text: where the character is, who and what it notices, what it is doing, and what was just said.
 * @param {{ characters: { id: string, name: string }[], items: { id: string, name: string, verbs: string[] }[] }} m
 * @param {{ heard?: { from: string, text: string } | null, doing?: string | null, reason?: string | null, userName?: string | null }} [now]
 */
export function describeMoment(m, { heard = null, doing = null, reason = null, userName = null } = {}) {
  const out = [];
  if (m.characters.length) out.push(`Around you: ${m.characters.map((c) => `${c.name} (${c.id})`).join(', ')}.`);
  if (m.items.length) out.push(`Nearby: ${m.items.map((i) => `${i.name} (${i.id}${i.verbs.length ? `: ${i.verbs.join(', ')}` : ''})`).join(', ')}.`);
  if (doing) out.push(`You are ${doing}.`);
  if (reason) out.push(reason);
  if (heard) out.push(`${heard.from === 'user' ? (userName ?? 'The person') : heard.from} says: "${heard.text}"`);
  return out.join('\n');
}

/** A stable hash of a request (FNV-1a, 64 bits as two 32-bit halves), logged with each decision. */
export function promptHash(request) {
  const s = canonical(request);
  let a = 0x811c9dc5, b = 0xcbf29ce4;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x01000193) ^ (a >>> 7); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}
