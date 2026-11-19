// Tool schemas narrowed to the moment, and replies checked against them (M3 W0, research/npc-ai.md §4.6).
//
// The director adds no actions of its own: its tools are @vrmxg/ai's vocabulary (say, emote, gesture, lookAt, goTo,
// follow, interact, setGoal, wait) with the free strings replaced by what this character can do now:
//   emotions   the persona's allowed expressions (VRMXA §10.1 allowed_expressions) that the VRM has
//   gestures   the animation slots the character's set fills
//   targets    ids the character has perceived (its memory), the user, and items within reach and their verbs
//   goals      the role's goal list
// plus endConversation. A tool whose choices are empty is left out. A reply is valid only if every call matches its
// tool, every id is still in the world, and it asks for at most one line and one movement; otherwise it is rejected
// whole, with reasons, and the tree carries on.

/** The most calls a reply may make. */
export const MAX_CALLS = 4;
/**
 * Markup that never belongs in speech (M3 W3, measured on LFM2.5 with reasoning skipped): special tokens (<|…|>, <｜…｜>),
 * tool-call or think tags, bracketed task markers, and a role label starting a line ("You:", "User:", "Assistant:").
 */
export const MARKUP = /<\s*[|｜]|[|｜]\s*>|<\/?\s*(?:think|tool_call|function|invoke|parameter)\b|<\s*[A-Z_]{4,}\s*>|(?:^|\n)\s*(?:you|user|assistant|system)\s*:/i;
/** Movement calls: at most one per reply. */
const MOVES = new Set(['goTo', 'follow', 'interact']);

const enumOf = (values, description) => ({ type: 'string', enum: [...values], description });

/**
 * The tools for one character at one moment.
 * @param {Moment} m
 * @returns {{ name: string, description: string, parameters: any }[]}
 *
 * @typedef {{ id: string, name: string }} Who
 * @typedef {{ id: string, name: string, verbs: string[] }} Thing
 * @typedef {{
 *   agent: string, characters: Who[], items: Thing[], expressions: string[], gestures: string[],
 *   goals: { name: string, description?: string }[], user?: string | null,
 * }} Moment
 */
export function toolsFor(m) {
  const people = [...(m.user ? ['user'] : []), ...m.characters.map((c) => c.id)];
  const places = [...people.filter((p) => p !== 'user' || m.user), ...m.items.map((i) => i.id)];
  const verbs = [...new Set(m.items.flatMap((i) => i.verbs))].sort();
  const t = [];
  const say = { text: { type: 'string', minLength: 1, maxLength: 400, description: 'What you say, in your own voice.' } };
  if (people.length) say.to = enumOf(people, 'Who you say it to.');
  if (m.expressions.length) say.emotion = enumOf(m.expressions, 'The face you make as you say it.');
  if (m.gestures.length) say.gesture = enumOf(m.gestures, 'A gesture as you say it.');
  t.push(tool('say', 'Say one line out loud (with a face and a gesture if you like).', say, ['text']));
  if (m.expressions.length) t.push(tool('emote', 'Make a face for a moment, without speaking.', { name: enumOf(m.expressions, 'The expression.') }, ['name']));
  if (m.gestures.length) t.push(tool('gesture', 'Make a gesture, without speaking.', { slot: enumOf(m.gestures, 'The gesture.') }, ['slot']));
  if (places.length) t.push(tool('lookAt', 'Look at someone or something.', { target: enumOf(places, 'Who or what.') }, ['target']));
  if (places.length) t.push(tool('goTo', 'Walk over to someone or something.', { target: enumOf(places, 'Who or what.') }, ['target']));
  if (m.characters.length) t.push(tool('follow', 'Follow someone, staying close.', { target: enumOf(m.characters.map((c) => c.id), 'Who.') }, ['target']));
  if (m.items.length && verbs.length) t.push(tool('interact', 'Use an item nearby: sit on a stool, open a door …', { item: enumOf(m.items.map((i) => i.id), 'The item.'), verb: enumOf(verbs, 'What to do with it.') }, ['item', 'verb']));
  if (m.goals.length) t.push(tool('setGoal', 'Take on one of your goals (what you will do next, on your own).', { goal: enumOf(m.goals.map((g) => g.name), m.goals.map((g) => `${g.name}: ${g.description ?? ''}`).join('; ')), params: { type: 'object', description: 'What the goal is about (who for, which item).' } }, ['goal']));
  t.push(tool('wait', 'Pause for a few seconds.', { seconds: { type: 'number', minimum: 0.5, maximum: 30, description: 'How long (s).' } }, ['seconds']));
  t.push(tool('endConversation', 'End the conversation politely (say goodbye first).', {}, []));
  return t;
}

function tool(name, description, properties, required) {
  return { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } };
}

/**
 * Check a reply against the moment's tools and the world. A reply with text and no calls is read as `say` (models do
 * that). Returns the calls normalised (arguments parsed) or the reasons it was rejected.
 * @param {{ text?: string | null, toolCalls: { name: string, arguments: any }[] }} reply
 * @param {Moment} m
 * @param {{ exists?: (id: string) => boolean }} [world]
 * @returns {{ ok: true, calls: { name: string, args: any }[] } | { ok: false, errors: string[] }}
 */
export function validate(reply, m, { exists = () => true } = {}) {
  const tools = new Map(toolsFor(m).map((t) => [t.name, t]));
  const raw = reply.toolCalls?.length ? reply.toolCalls : reply.text ? [{ name: 'say', arguments: { text: reply.text } }] : [];
  const errors = [], calls = [];
  if (!raw.length) errors.push('no calls and no text');
  if (raw.length > MAX_CALLS) errors.push(`${raw.length} calls (at most ${MAX_CALLS})`);
  for (const [i, c] of raw.entries()) {
    const at = `call ${i + 1} (${c?.name ?? '?'})`;
    const t = tools.get(c?.name);
    if (!t) { errors.push(`${at}: not a tool you have now`); continue; }
    let args = c.arguments ?? {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args || '{}'); } catch { errors.push(`${at}: arguments are not JSON`); continue; }
    }
    const e = check(args, t.parameters, at);
    if (e.length) { errors.push(...e); continue; }
    for (const k of ['to', 'target', 'item']) if (typeof args[k] === 'string' && args[k] !== 'user' && !exists(args[k])) errors.push(`${at}: ${args[k]} is no longer here`);
    // a line is speech: a model that writes its tool calls, a chat template or a role label into the text has not spoken
    if (c.name === 'say' && MARKUP.test(args.text)) { errors.push(`${at}: the line holds markup, not speech`); continue; }
    calls.push({ name: c.name, args });
  }
  if (calls.filter((c) => c.name === 'say').length > 1) errors.push('more than one line');
  if (calls.filter((c) => MOVES.has(c.name)).length > 1) errors.push('more than one movement');
  return errors.length ? { ok: false, errors } : { ok: true, calls };
}

/** A small JSON Schema check: the subset toolsFor writes (object, string, number, enum, required, lengths, ranges). */
export function check(v, s, at = 'value') {
  const e = [];
  if (s.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [`${at}: not an object`];
    for (const k of s.required ?? []) if (v[k] === undefined) e.push(`${at}: ${k} is missing`);
    for (const [k, x] of Object.entries(v)) {
      const p = s.properties?.[k];
      if (!p) { if (s.additionalProperties === false) e.push(`${at}: ${k} is not an argument`); continue; }
      e.push(...check(x, p, `${at}.${k}`));
    }
  } else if (s.type === 'string') {
    if (typeof v !== 'string') return [`${at}: not a string`];
    if (s.enum && !s.enum.includes(v)) e.push(`${at}: "${v}" is not one of ${s.enum.join(', ')}`);
    if (s.minLength !== undefined && v.trim().length < s.minLength) e.push(`${at}: empty`);
    if (s.maxLength !== undefined && v.length > s.maxLength) e.push(`${at}: longer than ${s.maxLength}`);
  } else if (s.type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return [`${at}: not a number`];
    if (s.minimum !== undefined && v < s.minimum) e.push(`${at}: below ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) e.push(`${at}: above ${s.maximum}`);
  }
  return e;
}
