// A scene's rules read from its document, without running it: what tools (MCP's "read the rules", a project check)
// and a scene list need. It reads top-level nodes only; game nodes inside a prefab are found once the scene is
// flattened (pass flatten(doc, prefabs).nodes as `nodes`).
import { checkCondition, conditionKeys } from './conditions.js';

const GAME_TYPES = new Set(['GameRules', 'GameCounter', 'GameTimer', 'GameGoal', 'Checkpoint']);

/**
 * @param {{ nodes?: any[], connections?: any[] }} doc a .vrmxs document (or its flattened nodes and connections)
 * @returns {{
 *   rules: null | { id: string, win: any, lose: any, flags: Record<string, any>, keepOutcome: boolean },
 *   counters: Array<{ id: string, key: string, start: number, min: number | null, max: number | null, label: string | null, scope: string }>,
 *   timers: Array<{ id: string, key: string, seconds: number, autostart: boolean, label: string | null, scope: string }>,
 *   goals: Array<{ id: string, key: string, text: string, when: any, optional: boolean, scope: string }>,
 *   checkpoints: Array<{ id: string, slot: string, when: any, once: boolean, label: string | null }>,
 *   scenes: string[],
 *   reads: string[],
 *   problems: string[],
 * }} scenes: every scene a connection here can change to; reads: every state key a condition here tests;
 *   problems: what would stop the rules starting (two GameRules, a duplicate name, a condition that isn't one)
 */
export function describeRules(doc) {
  const nodes = (doc.nodes ?? []).filter((n) => GAME_TYPES.has(n.type));
  const out = { rules: null, counters: [], timers: [], goals: [], checkpoints: [], scenes: [], reads: [], problems: [] };
  const reads = new Set(), seen = { GameCounter: new Map(), GameTimer: new Map(), GameGoal: new Map() };
  const condition = (n, name) => {
    const c = n.props?.[name];
    if (c === undefined) return null;
    for (const p of checkCondition(c, name)) out.problems.push(`${n.type} "${n.id}": ${p}`);
    for (const k of conditionKeys(c)) reads.add(k);
    return c;
  };
  const named = (n) => {
    const key = n.props?.key ?? n.id, was = seen[n.type].get(key);
    if (was !== undefined) out.problems.push(`two ${n.type} nodes named "${key}": "${was}" and "${n.id}"`);
    seen[n.type].set(key, n.id);
    return key;
  };
  for (const n of nodes) {
    const p = n.props ?? {};
    if (n.type === 'GameRules') {
      if (out.rules) { out.problems.push(`a scene has one GameRules node: "${out.rules.id}" and "${n.id}"`); continue; }
      out.rules = { id: n.id, win: condition(n, 'win'), lose: condition(n, 'lose'), flags: { ...(p.flags ?? {}) }, keepOutcome: p.keepOutcome === true };
    } else if (n.type === 'GameCounter') out.counters.push({ id: n.id, key: named(n), start: p.start ?? 0, min: p.min ?? null, max: p.max ?? null, label: p.label ?? null, scope: p.scope ?? 'game' });
    else if (n.type === 'GameTimer') out.timers.push({ id: n.id, key: named(n), seconds: p.seconds ?? 0, autostart: p.autostart !== false, label: p.label ?? null, scope: p.scope ?? 'scene' });
    else if (n.type === 'GameGoal') out.goals.push({ id: n.id, key: named(n), text: p.text ?? (p.key ?? n.id), when: condition(n, 'when'), optional: p.optional === true, scope: p.scope ?? 'scene' });
    else out.checkpoints.push({ id: n.id, slot: p.slot ?? 'checkpoint', when: condition(n, 'when'), once: p.once !== false, label: p.label ?? null });
  }
  const rulesIds = new Set(nodes.filter((n) => n.type === 'GameRules').map((n) => n.id));
  const scenes = new Set();
  for (const c of doc.connections ?? []) if (rulesIds.has(c.to) && c.call === 'changeScene' && typeof c.args?.to === 'string') scenes.add(c.args.to);
  out.scenes = [...scenes].sort(); out.reads = [...reads].sort();
  return out;
}
