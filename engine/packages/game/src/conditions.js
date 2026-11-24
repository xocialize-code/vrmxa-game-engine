// Game conditions (AB-D-0283): data in the shape @vrmxg/ai's tests have, { test, ...args }, so a scene carries no code
// and the engine has one small condition language, not two.
//
//   { "test": "state", "key": "counters.served", "op": "ge", "value": 5 }   a value of the game state (view()), by path
//   { "test": "state", "key": "flags.tillClosed" }                          op defaults to "set": there and not false
//   { "test": "all" | "any", "of": [condition, …] }                         every one, or at least one
//   { "test": "not", "of": condition }
//
// `state` IS ai's `bb` test (the same function, the same ops: eq, ne, gt, ge, lt, le, set, unset), run over the game's
// state view where a brain runs it over its blackboard. all / any / not stand in for the tree nodes (sequence, selector,
// invert) that compose tests in a behaviour tree: a rule is one flat condition, with no tree around it.
import { TESTS as AI_TESTS } from '@vrmxg/ai';

/** The comparisons `state` takes. */
export const OPS = ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'set', 'unset'];

/** Tests by name: (view, condition) → boolean. */
export const TESTS = {
  state: (view, c) => AI_TESTS.bb({ bb: view }, c),
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
 * Problems with a condition, as messages with the path of each (empty: it is fine). The scene schema checks the same
 * things a few levels deep; this checks the whole of it, and a scene's rules are checked with it when they start.
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
    if (['eq', 'ne', 'gt', 'ge', 'lt', 'le'].includes(c.op) && c.value === undefined) out.push(`${at} compares with op "${c.op}" but has no value`);
    if (['gt', 'ge', 'lt', 'le'].includes(c.op) && c.value !== undefined && typeof c.value !== 'number') out.push(`${at} orders with op "${c.op}" against a value that isn't a number`);
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
