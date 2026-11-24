// A scene's rules read from its document, without running it: what tools (MCP's "read the rules", a project check)
// and a scene list need. It reads top-level nodes only; game nodes inside a prefab are found once the scene is
// flattened (pass flatten(doc, prefabs).nodes as `nodes`).
import { flatten } from '@vrmxg/scene';
import { checkCondition, checkKeys, checkCall, conditionKeys, readReads } from './conditions.js';

const GAME_TYPES = new Set(['GameRules', 'GameCounter', 'GameTimer', 'GameGoal', 'Checkpoint']);

/**
 * @param {{ nodes?: any[], connections?: any[] }} doc a .vrmxs document (or its flattened nodes and connections)
 * @returns {{
 *   rules: null | { id: string, win: any, lose: any, flags: Record<string, any>, reads: Record<string, string[]>, defaults: Record<string, number>, keepOutcome: boolean },
 *   counters: Array<{ id: string, key: string, start: number, min: number | null, max: number | null, label: string | null, scope: string }>,
 *   timers: Array<{ id: string, key: string, seconds: number | null, autostart: boolean, label: string | null, scope: string }>,
 *   goals: Array<{ id: string, key: string, text: string, when: any, optional: boolean, scope: string }>,
 *   checkpoints: Array<{ id: string, slot: string, when: any, once: boolean, label: string | null }>,
 *   scenes: string[],
 *   reads: string[],
 *   sets: string[],
 *   problems: string[],
 * }} scenes: every scene a connection here can change to; reads: every state key a condition here tests; sets:
 *   the flags its connections set;
 *   timers' seconds: null for a stopwatch; problems: what would stop the rules starting (two GameRules, a duplicate
 *   name, a condition that isn't one, a condition that reads a counter, flag, timer or goal the scene neither declares
 *   nor lists in the rules' `reads`, a connection that calls a game node's action in a way it can't do). Whether
 *   some scene of the game declares what this one reads is checkGame's to say: one document can't.
 */
export function describeRules(doc) {
  const nodes = (doc.nodes ?? []).filter((n) => GAME_TYPES.has(n.type));
  const out = { rules: null, counters: [], timers: [], goals: [], checkpoints: [], scenes: [], reads: [], sets: [], problems: [] };
  const reads = new Set(), seen = { GameCounter: new Map(), GameTimer: new Map(), GameGoal: new Map() };
  const conditions = []; // those whose shape is fine: their keys are checked once everything the scene declares is known
  const condition = (n, name) => {
    const c = n.props?.[name];
    if (c === undefined) return null;
    const wrong = checkCondition(c, name);
    for (const p of wrong) out.problems.push(`${n.type} "${n.id}": ${p}`);
    if (!wrong.length) conditions.push([n, name, c]);
    for (const k of conditionKeys(c)) reads.add(k);
    return c;
  };
  const named = (n) => {
    const key = n.props?.key ?? n.id, was = seen[n.type].get(key);
    if (key === '__proto__') out.problems.push(`${n.type} "${n.id}" can't be named "__proto__"`);
    if (was !== undefined) out.problems.push(`two ${n.type} nodes named "${key}": "${was}" and "${n.id}"`);
    seen[n.type].set(key, n.id);
    return key;
  };
  for (const n of nodes) {
    const p = n.props ?? {};
    if (n.type === 'GameRules') {
      if (out.rules) { out.problems.push(`a scene has one GameRules node: "${out.rules.id}" and "${n.id}"`); continue; }
      const reads = readReads(p.reads);
      for (const m of reads.problems) out.problems.push(`GameRules "${n.id}": ${m}`);
      for (const k of Object.keys(p.flags ?? {})) if (k === '__proto__') out.problems.push(`GameRules "${n.id}": a flag can't be named "__proto__"`);
      out.rules = { id: n.id, win: condition(n, 'win'), lose: condition(n, 'lose'), flags: { ...(p.flags ?? {}) }, reads: reads.reads, defaults: reads.defaults, keepOutcome: p.keepOutcome === true };
    } else if (n.type === 'GameCounter') out.counters.push({ id: n.id, key: named(n), start: p.start ?? 0, min: p.min ?? null, max: p.max ?? null, label: p.label ?? null, scope: p.scope ?? 'game' });
    else if (n.type === 'GameTimer') { if (p.seconds !== undefined && !(typeof p.seconds === 'number' && p.seconds > 0)) out.problems.push(`GameTimer "${n.id}": seconds is ${JSON.stringify(p.seconds)}: a countdown needs seconds above zero (leave seconds out for a stopwatch)`); out.timers.push({ id: n.id, key: named(n), seconds: p.seconds ?? null, autostart: p.autostart !== false, label: p.label ?? null, scope: p.scope ?? 'scene' }); }
    else if (n.type === 'GameGoal') out.goals.push({ id: n.id, key: named(n), text: p.text ?? (p.key ?? n.id), when: condition(n, 'when'), optional: p.optional === true, scope: p.scope ?? 'scene' });
    else out.checkpoints.push({ id: n.id, slot: p.slot ?? 'checkpoint', when: condition(n, 'when'), once: p.once !== false, label: p.label ?? null });
  }
  const KIND = { GameRules: 'rules', GameCounter: 'counter', GameTimer: 'timer', GameGoal: 'goal', Checkpoint: 'checkpoint' };
  const byId = new Map(nodes.map((n) => [n.id, n])), calls = (doc.connections ?? []).filter((c) => byId.has(c.to));
  const r = out.rules?.reads ?? readReads(null).reads, rulesId = out.rules?.id;
  const sets = calls.filter((c) => c.to === rulesId && c.call === 'setFlag' && typeof c.args?.flag === 'string').map((c) => c.args.flag);
  const declared = {
    counters: new Set([...out.counters.map((c) => c.key), ...r.counters]), flags: new Set([...Object.keys(out.rules?.flags ?? {}), ...sets, ...r.flags]),
    timers: new Map([...r.timers.map((k) => [k, null]), ...out.timers.map((t) => [t.key, t.seconds !== null])]), goals: new Set([...out.goals.map((g) => g.key), ...r.goals]),
    slots: new Set([...out.checkpoints.map((c) => c.slot), ...r.checkpoints]),
  };
  const mine = { counters: out.counters.map((c) => c.key), timers: out.timers.map((t) => t.key), goals: out.goals.map((g) => g.key), flags: Object.keys(out.rules?.flags ?? {}), checkpoints: out.checkpoints.map((c) => c.slot) };
  for (const kind of Object.keys(mine)) for (const k of r[kind]) if (mine[kind].includes(k)) out.problems.push(`GameRules "${rulesId}": reads.${kind} lists "${k}", which this scene declares itself: take it out of reads`);
  out.sets = [...new Set(sets)].sort();
  for (const [n, name, c] of conditions) for (const p of checkKeys(c, declared, name)) out.problems.push(`${n.type} "${n.id}": ${p}`);
  for (const c of calls) {
    const to = byId.get(c.to), m = checkCall(KIND[to.type], { stopwatch: to.type === 'GameTimer' && to.props?.seconds === undefined }, c.call, c.args);
    if (m) out.problems.push(`the connection ${c.from}.${c.signal} → ${c.to}.${c.call}: ${m}`);
  }
  const scenes = new Set();
  for (const c of calls) if (c.to === rulesId && c.call === 'changeScene' && typeof c.args?.to === 'string') scenes.add(c.args.to);
  out.scenes = [...scenes].sort(); out.reads = [...reads].sort();
  return out;
}

/**
 * A game as a whole, from its scenes' documents, without running it: what one scene alone can't show. Each scene's
 * own problems (describeRules), and across them:
 *   - a name in a scene's `reads` that no scene of the game declares (no GameCounter, GameTimer or GameGoal with that
 *     key, no flag started in a GameRules' flags or set by a connection, no Checkpoint with that slot): nothing could
 *     ever bring it, so the condition reading it is wrong, whatever is played;
 *   - a connection that changes to a scene the game doesn't have.
 * Whether a value that some scene declares has arrived by the time another reads it depends on how the game is
 * played, and is not an error: a read value that isn't there is seen as its default (a flag false, a goal not done,
 * a counter 0 or the default given).
 *
 * Game nodes inside prefab instances count: with `prefabs` every scene is flattened first. A scene that has Instance
 * nodes and can't be flattened (no prefabs given, or one missing) can't be read whole, so it isn't judged: it is
 * listed in `unchecked` with the reason, none of its own problems are reported, and the check for reads that no
 * scene declares is left out for the whole game (what it can't see might declare them). Never a valid game refused.
 * @param {Map<string, any> | Record<string, any>} scenes parsed documents by the name changeScene uses
 * @param {{ prefabs?: Map<string, any> | null }} [o] parsed prefab documents by ref, as SceneTree takes them
 * @returns {{ ok: boolean, problems: string[], unchecked: string[], scenes: Record<string, ReturnType<typeof describeRules>> }}
 */
export function checkGame(scenes, { prefabs = null } = {}) {
  const docs = scenes instanceof Map ? [...scenes] : Object.entries(scenes), problems = [], unchecked = [], described = {};
  const has = { counters: new Set(), flags: new Set(), timers: new Set(), goals: new Set(), checkpoints: new Set() };
  for (const [name, doc] of docs) {
    let whole = doc;
    if ((doc.nodes ?? []).some((n) => n.type === 'Instance')) {
      try { whole = flatten(doc, prefabs ?? new Map()); } catch (e) { unchecked.push(`${name}: it has prefab instances that couldn't be flattened (${e?.message ?? e}): pass the game's prefabs`); whole = null; }
    }
    const d = described[name] = describeRules(whole ?? doc);
    if (whole === null) { d.problems = []; continue; }
    for (const p of d.problems) problems.push(`${name}: ${p}`);
    for (const c of d.counters) has.counters.add(c.key);
    for (const t of d.timers) has.timers.add(t.key);
    for (const g of d.goals) has.goals.add(g.key);
    for (const c of d.checkpoints) has.checkpoints.add(c.slot);
    for (const f of [...Object.keys(d.rules?.flags ?? {}), ...d.sets]) has.flags.add(f);
  }
  const ONE = { counters: 'GameCounter with that key', timers: 'GameTimer with that key', goals: 'GameGoal with that key', flags: 'flag started in a GameRules\' flags or set by a connection', checkpoints: 'Checkpoint with that slot' };
  for (const [name, d] of Object.entries(described)) {
    if (!unchecked.length) for (const kind of Object.keys(has)) for (const k of d.rules?.reads[kind] ?? []) if (!has[kind].has(k)) problems.push(`${name}: GameRules "${d.rules.id}" reads ${kind}.${k}, and no scene of the game has a ${ONE[kind]}`);
    for (const to of d.scenes) if (!Object.hasOwn(described, to)) problems.push(`${name}: a connection changes to "${to}", which isn't a scene of the game (${Object.keys(described).join(', ')})`);
  }
  return { ok: problems.length === 0, problems, unchecked, scenes: described };
}
