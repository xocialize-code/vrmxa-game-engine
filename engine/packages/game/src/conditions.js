// Game conditions (AB-D-0283): data in the shape @vrmxg/ai's tests have, { test, ...args }, so a scene carries no code
// and the engine has one small condition language, not two.
//
//   { "test": "state", "key": "counters.served", "op": "ge", "value": 5 }   a value of the game state (view()), by path
//   { "test": "state", "key": "flags.tillClosed" }                          op defaults to "set": there and not false
//   { "test": "all" | "any", "of": [condition, …] }                         every one, or at least one
//   { "test": "not", "of": condition }
//
// `state` compares with ai's `bb` test (the same function, the same ops: eq, ne, gt, ge, lt, le, set, unset). Two things
// are the game's own, because a rule that is wrong must not win or lose a game by accident:
//   - the value is read here, by own properties only (a path can't reach an object's prototype, and no key is special);
//   - a comparison with nothing to compare (the key isn't there, or its value is null, as a stopwatch's `left` is) is
//     false, whichever op: "lives ne 3" doesn't hold because "lives" was mistyped.
// And a scene's conditions are checked against what the scene declares when its rules start (checkKeys).
// all / any / not stand in for the tree nodes (sequence, selector, invert) that compose tests in a behaviour tree: a
// rule is one flat condition, with no tree around it.
import { TESTS as AI_TESTS } from '@vrmxg/ai';

/** The comparisons `state` takes. */
export const OPS = ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'set', 'unset'];
const COMPARES = new Set(['eq', 'ne', 'gt', 'ge', 'lt', 'le']);
const ORDERS = new Set(['gt', 'ge', 'lt', 'le']);

/** A value of a view by dotted path, through own properties only; undefined when any part isn't there. */
export function readKey(view, key) {
  let v = view;
  for (const k of String(key).split('.')) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, k)) return undefined;
    v = v[k];
  }
  return v;
}

/** Tests by name: (view, condition) → boolean. */
export const TESTS = {
  state: (view, c) => {
    const v = readKey(view, c.key), op = c.op ?? 'set';
    if (COMPARES.has(op) && (v === undefined || v === null || c.value === undefined || c.value === null)) return false;
    return AI_TESTS.bb({ bb: { v } }, { key: 'v', op, value: c.value }) === true;
  },
  all: (view, c) => c.of.every((x) => holds(x, view)),
  any: (view, c) => c.of.some((x) => holds(x, view)),
  not: (view, c) => !holds(c.of, view),
};

/**
 * Does a condition hold over a state view? An absent condition never holds.
 * @param {any} condition @param {any} view the game's view() (or any plain object, for tools)
 */
export function holds(condition, view) {
  if (condition === undefined || condition === null) return false;
  return TESTS[condition.test](view, condition);
}

/**
 * Problems with a condition's shape, as messages with the path of each (empty: it is fine). The scene schema checks the
 * same things a few levels deep; this checks the whole of it, and a scene's rules are checked with it when they start.
 * @param {any} c @param {string} [at]
 * @returns {string[]}
 */
export function checkCondition(c, at = 'condition') {
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return [`${at} is not a condition object`];
  if (!Object.hasOwn(TESTS, c.test)) return [`${at} has unknown test "${c.test}" (${Object.keys(TESTS).join(', ')})`];
  const out = [];
  if (c.test === 'state') {
    if (typeof c.key !== 'string' || c.key === '') out.push(`${at} needs a key (a path into the game state, "counters.served")`);
    if (c.op !== undefined && !OPS.includes(c.op)) out.push(`${at} has unknown op "${c.op}" (${OPS.join(', ')})`);
    if (COMPARES.has(c.op) && (c.value === undefined || c.value === null)) out.push(`${at} compares with op "${c.op}" but has no value${c.value === null ? ' (null: test for nothing with "unset")' : ''}`);
    if (ORDERS.has(c.op) && c.value !== undefined && c.value !== null && typeof c.value !== 'number') out.push(`${at} orders with op "${c.op}" against a value that isn't a number`);
  } else if (c.test === 'not') {
    out.push(...checkCondition(c.of, `${at}.of`));
  } else {
    if (!Array.isArray(c.of) || c.of.length === 0) out.push(`${at} needs "of": a list of conditions`);
    else c.of.forEach((x, i) => out.push(...checkCondition(x, `${at}.of[${i}]`)));
  }
  return out;
}

/** Every state key a condition reads (for tools: what a rule depends on). @param {any} c @returns {string[]} */
export function conditionKeys(c) {
  if (!c || typeof c !== 'object') return [];
  if (c.test === 'state') return typeof c.key === 'string' ? [c.key] : [];
  const of = Array.isArray(c.of) ? c.of : c.of ? [c.of] : [];
  return [...new Set(of.flatMap(conditionKeys))];
}

// ---------------------------------------------------------------- keys against what a scene declares

// What a condition may read besides what the scene declares: the key, and the fields under it.
const PLAIN = { score: [], outcome: [], scene: [], step: [], sceneSteps: [], arrivals: [], goal: ['key', 'text'], decided: ['result', 'step', 'scene'], pending: ['to', 'at', 'reset'], checkpoint: ['slot', 'id', 'requested'] };
const TIMER_FIELDS = ['seconds', 'elapsed', 'left', 'steps', 'elapsedSteps', 'leftSteps', 'limit', 'running', 'done', 'declared', 'label'];
const LIMIT_FIELDS = new Set(['seconds', 'left', 'steps', 'leftSteps']); // null for a stopwatch
const GOAL_FIELDS = ['done', 'step'];
const SLOT_FIELDS = ['id', 'requested'];
const list = (names) => ([...names].length ? [...names].join(', ') : 'none');

/**
 * @typedef {{ counters: Set<string>, flags: Set<string>, timers: Map<string, boolean | null>, goals: Set<string>, slots: Set<string> }} Declared
 * What a scene's conditions may read, by the names the game state has: its own counters, the flags its GameRules
 * starts or a connection here sets, its timers (true: a countdown, false: a stopwatch), its goals and its
 * checkpoints' slots, and what its GameRules' `reads` lists as another scene's (a timer read from elsewhere is null
 * here, countdown or stopwatch, until it arrives).
 */

/**
 * Problems with the keys a condition reads, against what its scene declares (empty: every key is something the scene
 * has, or says it reads). Each problem says how to declare what is missing: as this scene's own (a node, a flag's
 * start), or in GameRules' `reads` when another scene owns it.
 * @param {any} c a condition whose shape is fine (checkCondition) @param {Declared} declared @param {string} [at]
 * @returns {string[]}
 */
export function checkKeys(c, declared, at = 'condition') {
  if (!c || typeof c !== 'object') return [];
  if (c.test !== 'state') {
    const of = Array.isArray(c.of) ? c.of.map((x, i) => [x, `${at}.of[${i}]`]) : c.of ? [[c.of, `${at}.of`]] : [];
    return of.flatMap(([x, where]) => checkKeys(x, declared, where));
  }
  if (typeof c.key !== 'string') return [];
  const parts = c.key.split('.'), [root, name, field] = parts, say = (m) => [`${at} reads "${c.key}": ${m}`];
  if (Object.hasOwn(PLAIN, root)) {
    if (parts.length === 1 || (parts.length === 2 && PLAIN[root].includes(name))) return [];
    return say(PLAIN[root].length ? `"${root}" has ${PLAIN[root].join(', ')}` : `"${root}" is a value, with nothing under it`);
  }
  if (root === 'counters') {
    if (parts.length !== 2) return say('a counter is read as "counters.<name>"');
    return declared.counters.has(name) ? [] : say(`this scene has no counter "${name}" (counters: ${list(declared.counters)}). Add a GameCounter with that key, or list it in GameRules' reads.counters if another scene counts it`);
  }
  if (root === 'flags') {
    if (parts.length !== 2) return say('a flag is read as "flags.<name>"');
    return declared.flags.has(name) ? [] : say(`nothing in this scene starts or sets a flag "${name}" (flags: ${list(declared.flags)}). Start it in GameRules' flags, or list it in GameRules' reads.flags if another scene or a behaviour sets it`);
  }
  if (root === 'timers') {
    if (parts.length !== 3 || !TIMER_FIELDS.includes(field)) return say(`a timer is read as "timers.<name>.<field>" (${TIMER_FIELDS.join(', ')})`);
    if (!declared.timers.has(name)) return say(`this scene has no timer "${name}" (timers: ${list(declared.timers.keys())}). Add a GameTimer with that key, or list it in GameRules' reads.timers if another scene runs it`);
    if (declared.timers.get(name) === false && LIMIT_FIELDS.has(field) && COMPARES.has(c.op)) return say(`"${name}" is a stopwatch: it has no ${field} to compare (give it seconds, or read elapsed)`);
    return [];
  }
  if (root === 'goals') {
    if (parts.length !== 3 || !GOAL_FIELDS.includes(field)) return say(`a goal is read as "goals.<name>.<field>" (${GOAL_FIELDS.join(', ')})`);
    return declared.goals.has(name) ? [] : say(`this scene has no goal "${name}" (goals: ${list(declared.goals)}). Add a GameGoal with that key, or list it in GameRules' reads.goals if it is another scene's (reading it doesn't make it one of this scene's objectives)`);
  }
  if (root === 'checkpoints') {
    if (parts.length < 2 || parts.length > 3 || (parts.length === 3 && !SLOT_FIELDS.includes(field))) return say(`a checkpoint is read as "checkpoints.<slot>" or "checkpoints.<slot>.<field>" (${SLOT_FIELDS.join(', ')})`);
    return declared.slots.has(name) ? [] : say(`this scene has no checkpoint for the slot "${name}" (slots: ${list(declared.slots)}). Add a Checkpoint with that slot, or list it in GameRules' reads.checkpoints if another scene's writes it`);
  }
  return say(`a condition can read ${[...Object.keys(PLAIN), 'counters.<name>', 'flags.<name>', 'timers.<name>.<field>', 'goals.<name>.<field>', 'checkpoints.<slot>'].join(', ')}`);
}

// ---------------------------------------------------------------- what a scene reads from elsewhere, and its connections

/** The kinds of value a GameRules' `reads` may list, and the game state's map each is in. */
export const READS = { counters: 'counters', flags: 'flags', timers: 'timers', goals: 'goals', checkpoints: 'checkpoints' };

/**
 * A GameRules' `reads`, checked and filled in: { counters, flags, timers, goals, checkpoints }, each a list of names.
 * `counters` may instead be a map of name → the value the counter has when the game brings none ({ "orders": 0 });
 * as a list, that value is 0.
 * @param {any} reads @returns {{ reads: Record<string, string[]>, defaults: Record<string, number>, problems: string[] }}
 */
export function readReads(reads) {
  const out = { counters: [], flags: [], timers: [], goals: [], checkpoints: [] }, defaults = {}, problems = [];
  if (reads === undefined || reads === null) return { reads: out, defaults, problems };
  if (typeof reads !== 'object' || Array.isArray(reads)) return { reads: out, defaults, problems: ['reads is { counters, flags, timers, goals, checkpoints }, each a list of names'] };
  const names = (list) => Array.isArray(list) && list.every((n) => typeof n === 'string' && n !== '' && n !== '__proto__');
  for (const [kind, value] of Object.entries(reads)) {
    if (!Object.hasOwn(READS, kind)) { problems.push(`reads has no "${kind}" (${Object.keys(READS).join(', ')})`); continue; }
    if (kind === 'counters' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (!names(entries.map(([k]) => k)) || entries.some(([, v]) => typeof v !== 'number' || !Number.isFinite(v))) { problems.push('reads.counters is a list of names, or a map of name → the number it is when the game brings none'); continue; }
      out.counters = entries.map(([k]) => k);
      for (const [k, v] of entries) defaults[k] = v;
      continue;
    }
    if (!names(value)) { problems.push(`reads.${kind} is a list of names`); continue; }
    out[kind] = [...value];
  }
  return { reads: out, defaults, problems };
}

/**
 * What is wrong with a connection's call of a game node's action, where it can be known before the game runs (null:
 * nothing). A connection without args passes its signal's payload, which isn't known here: only a call that can't be
 * right whatever the payload is refused then.
 * @param {'rules' | 'counter' | 'timer' | 'goal' | 'checkpoint'} kind the target @param {{ stopwatch?: boolean }} target
 * @param {string} call @param {any} args the connection's own args, if it has any
 * @returns {string | null}
 */
export function checkCall(kind, target, call, args) {
  const given = args !== undefined && args !== null, num = (v) => typeof v === 'number' && Number.isFinite(v);
  if (kind === 'timer' && call === 'addTime') {
    if (target.stopwatch) return 'addTime is for a countdown, and this timer is a stopwatch (it has no seconds)';
    if (given && !num(args.seconds)) return 'addTime needs { seconds }: a number';
  }
  if (kind === 'counter') {
    if (call === 'set' && given && !num(args.value)) return 'set needs { value }: a number';
    if (call === 'add' && given && args.by !== undefined && !num(args.by)) return 'add\'s "by" is not a number';
  }
  if (kind === 'rules') {
    if ((call === 'setFlag' || call === 'clearFlag') && given) {
      if (typeof args.flag !== 'string' || args.flag === '') return `${call} needs { flag }: the flag's name`;
      if (args.flag === '__proto__') return 'a flag can\'t be named "__proto__"';
      if (call === 'setFlag' && args.value !== undefined && !['boolean', 'number', 'string'].includes(typeof args.value)) return 'setFlag\'s value is a boolean, a number or a string';
    }
    if (call === 'changeScene' && given && (typeof args.to !== 'string' || args.to === '')) return 'changeScene needs { to }: the scene\'s path in the project';
    if ((call === 'changeScene' || call === 'restart') && given && args.after !== undefined && !(num(args.after) && args.after >= 0)) return `${call}'s "after" is seconds, zero or more`;
  }
  return null;
}
