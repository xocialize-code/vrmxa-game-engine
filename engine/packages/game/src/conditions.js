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
 * @typedef {{ counters: Set<string>, flags: Set<string>, timers: Map<string, boolean>, goals: Set<string>, slots: Set<string> }} Declared
 * What a scene declares: its counters, the flags its GameRules starts, its timers (true: a countdown, false: a
 * stopwatch), its goals and its checkpoints' slots, each by the name it has in the game state.
 */

/**
 * Problems with the keys a condition reads, against what its scene declares (empty: every key is something the scene
 * has). A condition reads only what its own scene declares: a value carried from another scene is declared here too
 * (a GameCounter with the same key; the flag in GameRules' flags), which is also what gives it a value in a game that
 * starts in this scene.
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
    return declared.counters.has(name) ? [] : say(`this scene has no counter "${name}" (counters: ${list(declared.counters)})`);
  }
  if (root === 'flags') {
    if (parts.length !== 2) return say('a flag is read as "flags.<name>"');
    return declared.flags.has(name) ? [] : say(`this scene's GameRules doesn't start a flag "${name}" (flags: ${list(declared.flags)})`);
  }
  if (root === 'timers') {
    if (parts.length !== 3 || !TIMER_FIELDS.includes(field)) return say(`a timer is read as "timers.<name>.<field>" (${TIMER_FIELDS.join(', ')})`);
    if (!declared.timers.has(name)) return say(`this scene has no timer "${name}" (timers: ${list(declared.timers.keys())})`);
    if (!declared.timers.get(name) && LIMIT_FIELDS.has(field) && COMPARES.has(c.op)) return say(`"${name}" is a stopwatch: it has no ${field} to compare (give it seconds, or read elapsed)`);
    return [];
  }
  if (root === 'goals') {
    if (parts.length !== 3 || !GOAL_FIELDS.includes(field)) return say(`a goal is read as "goals.<name>.<field>" (${GOAL_FIELDS.join(', ')})`);
    return declared.goals.has(name) ? [] : say(`this scene has no goal "${name}" (goals: ${list(declared.goals)})`);
  }
  if (root === 'checkpoints') {
    if (parts.length < 2 || parts.length > 3 || (parts.length === 3 && !SLOT_FIELDS.includes(field))) return say(`a checkpoint is read as "checkpoints.<slot>" or "checkpoints.<slot>.<field>" (${SLOT_FIELDS.join(', ')})`);
    return declared.slots.has(name) ? [] : say(`this scene has no checkpoint for the slot "${name}" (slots: ${list(declared.slots)})`);
  }
  return say(`a condition can read ${[...Object.keys(PLAIN), 'counters.<name>', 'flags.<name>', 'timers.<name>.<field>', 'goals.<name>.<field>', 'checkpoints.<slot>'].join(', ')}`);
}
