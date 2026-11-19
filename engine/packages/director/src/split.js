// The split turn (M3, from the companion's model spike, AB-R-1017): small models write a good line or a good choice of
// actions, and do badly when asked for both in one tool-calling reply. So a turn is two calls:
//   1. the line: her words, as plain text, with no tools (it can be spoken as soon as it arrives);
//   2. the verdict: a small JSON object choosing a face, a gesture, an action and a goal from the moment's choices.
// The two become ordinary calls (say, lookAt, setGoal …) and go through the same validation as a one-call reply.
// A goodbye is decided by rule from the person's words, not by the model (the spike: one model never ended a
// conversation, another ended them when it shouldn't).
import { buildMessages } from './prompt.js';

/** The line call's rules. */
export const LINE_FRAMING = `You are a character in a small 3D world, talking with a person in real time.
Reply with only what you say out loud: one or two short sentences that answer what they just said, in your own words.
No name or label before it, no quotation marks, no actions or stage directions, and never repeat their words back.
If they ask you to do something you can do here, say you will; if you can't, say so in character.`;

/**
 * The line request: the persona, memory and situation as the one-call prompt has them, the line rules, no tools.
 * @param {Parameters<typeof buildMessages>[0]} o
 */
export function lineRequest(o) {
  return { messages: buildMessages({ ...o, framing: LINE_FRAMING }), tools: [] };
}

/**
 * The verdict request: what was said on both sides, and the moment's choices as a JSON shape to fill.
 * @param {{ moment: import('./schema.js').Moment, name: string, userName?: string, heard: string, line: string }} o
 */
export function verdictRequest({ moment: m, name, userName = 'the person', heard, line }) {
  const people = [...(m.user ? ['user'] : []), ...m.characters.map((c) => c.id)];
  const places = [...people, ...m.items.map((i) => i.id)];
  const verbs = [...new Set(m.items.flatMap((i) => i.verbs))].sort();
  const list = (xs) => xs.map((x) => JSON.stringify(x)).join(', ');
  const lines = [
    `${userName} said to ${name}: "${heard}"`,
    `${name} answered: "${line}"`,
    '',
    `Decide what ${name} does along with that answer. Fill in this JSON object and answer with the object only:`,
    '{',
    `  "emotion": ${m.expressions.length ? `one of ${list(m.expressions)}, or null` : 'null'},`,
    `  "gesture": ${m.gestures.length ? `one of ${list(m.gestures)}, or null` : 'null'},`,
    `  "action": null, or { "do": "lookAt" | "goTo" | "follow", "target": one of ${list(places)} }${m.items.length ? `, or { "do": "interact", "item": one of ${list(m.items.map((i) => i.id))}, "verb": one of ${list(verbs)} }` : ''},`,
    `  "goal": ${m.goals.length ? `null, or { "name": one of ${list(m.goals.map((g) => g.name))}, "params": { … } }` : 'null'}`,
    '}',
  ];
  if (m.goals.length) lines.push('', 'Goals:', ...m.goals.map((g) => `- ${g.name}: ${g.description ?? ''}`));
  lines.push('', `Things here: ${m.items.map((i) => `${i.id} (${i.name})`).join(', ') || 'none'}. "user" is ${userName}.`);
  lines.push('Set a goal or an action only when the person asked for it or the answer promised it. Most answers need neither.');
  return { messages: [{ role: 'user', content: lines.join('\n') }], tools: [] };
}

/**
 * A verdict's text → the object, or null. Tolerates code fences and text around the object.
 * @param {string | null} text
 */
export function parseVerdict(text) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ''));
  if (!m) return null;
  try { const v = JSON.parse(m[0]); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

/** A line as spoken: one paragraph, quotes and a leading "Name:" taken off. */
export function cleanLine(text, name = '') {
  let t = String(text ?? '').trim().split(/\n\s*\n/)[0].trim();
  if (name && t.toLowerCase().startsWith(`${name.toLowerCase()}:`)) t = t.slice(name.length + 1).trim();
  if (/^["“].*["”]$/.test(t)) t = t.slice(1, -1).trim();
  return t;
}

/** The person said goodbye (by rule: "bye", "see you later", "good night" …, not "by the way" or "see you have"). */
export function isGoodbye(text) {
  return /\b(?:good ?bye|bye(?:-bye)?|good night|take care|catch you later|have a good (?:one|day|night))\b|\bsee (?:you|ya)(?= (?:later|soon|tomorrow|tonight|around|next|then|again)\b|\s*[!.,]|\s*$)/i.test(String(text ?? ''));
}

/**
 * A verdict made usable: the shapes models write instead of the asked-for one, mapped (measured on four local models):
 *   - an action named after a verb ("sit", "open", "toggle" …) is `interact` with that verb on its target;
 *   - an action named after a goal ("takeOrder", "waitAt" …), or a goal written as a string, is that goal;
 *   - a goal that needs a target ("waitAt", "follow") takes the action's target when it has none;
 *   - takeOrder's customer is the person when it isn't named, and its order is the person's words when it has none;
 *   - a name where an id belongs ("Mira", "Stool") is the id it names (the person's name is "user").
 * Anything else stays as it is; salvage() then drops what still doesn't fit.
 * @param {any} v @param {import('./schema.js').Moment} m @param {{ userName?: string, heard?: string }} [o]
 */
export function normalizeVerdict(v, m, { userName = '', heard = '' } = {}) {
  if (!v || typeof v !== 'object') return {};
  /** @type {Map<string, string>} */ const ids = new Map();
  ids.set(userName.toLowerCase(), 'user');
  for (const x of [...m.characters, ...m.items]) ids.set(x.name.toLowerCase(), x.id);
  ids.delete('');
  const id = (x) => (typeof x === 'string' && ids.has(x.toLowerCase()) ? ids.get(x.toLowerCase()) : x);
  const out = { ...v }, goals = new Set(m.goals.map((g) => g.name)), verbs = new Set(m.items.flatMap((i) => i.verbs));
  if (out.action && typeof out.action === 'object') out.action = { ...out.action, target: id(out.action.target), item: id(out.action.item) };
  if (out.goal && typeof out.goal === 'object' && out.goal.params && typeof out.goal.params === 'object') out.goal = { ...out.goal, params: Object.fromEntries(Object.entries(out.goal.params).map(([k, x]) => [k, id(x)])) };
  if (typeof out.goal === 'string') out.goal = out.goal ? { name: out.goal } : null;
  const a = out.action && typeof out.action === 'object' ? { ...out.action } : null;
  if (a) {
    if (verbs.has(a.do) && (a.target || a.item)) { out.action = { do: 'interact', item: a.item ?? a.target, verb: a.do }; }
    else if (goals.has(a.do)) { out.goal = out.goal ?? { name: a.do, params: a.target ? { target: a.target } : {} }; out.action = null; }
  }
  const g = out.goal && typeof out.goal === 'object' ? { ...out.goal, params: { ...(out.goal.params ?? {}) } } : null;
  if (g) {
    if (['waitAt', 'follow'].includes(g.name) && !g.params.target && out.action?.target) g.params.target = out.action.target;
    if (g.name === 'takeOrder' && !g.params.customer) g.params.customer = 'user';
    if (g.name === 'takeOrder' && !g.params.order && heard) g.params.order = heard;
    out.goal = g;
  }
  return out;
}

/**
 * The split turn's calls, checked part by part (the companion spike's "with validation"): the line must stand on its own
 * (else the whole turn is rejected); each other part (the face, the gesture, the action, the goal) is kept only if it
 * validates by itself, and dropped with its reason otherwise; a goodbye ends the conversation by rule.
 * @param {string} line @param {any} verdict @param {import('./schema.js').Moment} m
 * @param {{ heard?: string, userName?: string, exists?: (id: string) => boolean, validate: (reply: any, m: any, w?: any) => any }} o
 * @returns {{ ok: true, calls: { name: string, args: any }[], dropped: string[] } | { ok: false, errors: string[] }}
 */
export function salvage(line, verdict, m, { heard = '', userName = '', exists, validate }) {
  const v = normalizeVerdict(verdict, m, { userName, heard }), dropped = [];
  const say = { text: line, to: 'user' };
  for (const k of ['emotion', 'gesture']) {
    if (typeof v[k] !== 'string') continue;
    const r = validate({ toolCalls: [{ name: 'say', arguments: { ...say, [k]: v[k] } }] }, m, { exists });
    if (r.ok) say[k] = v[k]; else dropped.push(`${k} ${v[k]}`);
  }
  const head = validate({ toolCalls: [{ name: 'say', arguments: say }] }, m, { exists });
  if (!head.ok) return head;
  const calls = [...head.calls];
  const rest = splitCalls(line, { action: v.action, goal: v.goal }, { heard }).slice(1);
  for (const c of rest) {
    const r = validate({ toolCalls: [c] }, m, { exists });
    if (r.ok) calls.push(...r.calls); else dropped.push(`${c.name}: ${r.errors.join('; ')}`);
  }
  return { ok: true, calls, dropped };
}

/**
 * The line and the verdict → calls in the one-call form (for validate): say with its face and gesture, the action,
 * setGoal; endConversation after a goodbye.
 * @param {string} line @param {any} verdict @param {{ heard?: string }} [o]
 * @returns {{ name: string, arguments: any }[]}
 */
export function splitCalls(line, verdict, { heard = '' } = {}) {
  const v = verdict ?? {}, say = /** @type {Record<string, string>} */ ({ text: line, to: 'user' });
  if (typeof v.emotion === 'string') say.emotion = v.emotion;
  if (typeof v.gesture === 'string') say.gesture = v.gesture;
  /** @type {{ name: string, arguments: any }[]} */ const calls = [{ name: 'say', arguments: say }];
  const a = v.action;
  if (a && typeof a === 'object' && typeof a.do === 'string') {
    calls.push(a.do === 'interact' ? { name: 'interact', arguments: { item: a.item, verb: a.verb } } : { name: a.do, arguments: { target: a.target } });
  }
  const g = v.goal;
  if (g && typeof g === 'object' && typeof g.name === 'string') calls.push({ name: 'setGoal', arguments: { goal: g.name, ...(g.params && typeof g.params === 'object' ? { params: g.params } : {}) } });
  if (isGoodbye(heard)) calls.push({ name: 'endConversation', arguments: {} });
  return calls;
}
