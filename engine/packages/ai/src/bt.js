// A small behaviour tree runtime (M2 W7, research/npc-ai.md §1.3): trees are JSON documents (the node set modelled on
// mistreevous, each node type described with its arguments in behavior3's way, for the registry and MCP), ticked
// synchronously inside the step, their state plain data keyed by node index, so a brain is in the world snapshot.
//
//   { "type": "sequence" | "selector" | "parallel", "children": [...] }    memory composites (resume the running child)
//   { "type": "utility", "rate": 15, "hysteresis": 0.1, "children": [{ "name", "considerations": [...], "tree": {...} }] }
//        scores each option every `rate` ticks (and whenever the running option ends): the product of its
//        considerations ({ input, curve, weight }), the current option getting `hysteresis` on top; the best runs, ties
//        to the first. A switch abandons the running option (its actions cancelled).
//   { "type": "repeat", "times"?, "child" }  { "type": "invert" | "succeed" | "fail", "child" }
//   { "type": "guard", "test", ...args, "child" }       runs the child while the test holds; abandons it when not
//   { "type": "until", "test", ...args, "timeout"? }    running until the test holds (failure after timeout s)
//   { "type": "cooldown", "seconds", "child" }          fails for `seconds` after the child succeeds
//   { "type": "condition", "test", ...args }            success or failure now
//   { "type": "action", "do", "args" }                  one action of the vocabulary (actions.js)
//   { "type": "set", "key", "value" }                   a blackboard write
//   { "type": "choose", "pick", ..., "key" }            picks into the blackboard: a free advert (a seat), a reachable
//                                                       random point near home, a remembered agent
// Arguments may name blackboard values: "$key", "$key.path", "$self".
import { ACTIONS } from './actions.js';
import { curve } from './curves.js';

export const STATUS = { SUCCESS: 'success', FAILURE: 'failure', RUNNING: 'running' };

/** Node types and what they take (the registry and MCP describe trees from this). */
export const NODE_TYPES = {
  sequence: { description: 'Children in order until one fails (resumes the running one).', children: true },
  selector: { description: 'Children in order until one succeeds (resumes the running one).', children: true },
  parallel: { description: 'All children every tick; succeeds when all have (policy all) or one has (policy one).', children: true, args: { policy: { enum: ['all', 'one'] } } },
  utility: { description: 'Scores its options and runs the best (re-scored every `rate` ticks, with hysteresis).', children: true, args: { rate: { type: 'number' }, hysteresis: { type: 'number' } } },
  repeat: { description: 'Runs its child again after it succeeds, `times` times or for ever; fails when the child fails.', child: true, args: { times: { type: 'number' } } },
  invert: { description: 'Success ↔ failure.', child: true },
  succeed: { description: 'Always success (once the child is done).', child: true },
  fail: { description: 'Always failure (once the child is done).', child: true },
  guard: { description: 'Runs its child while a test holds.', child: true, args: { test: { type: 'string' } } },
  until: { description: 'Running until a test holds; failure after `timeout` seconds.', args: { test: { type: 'string' }, timeout: { type: 'number' } } },
  cooldown: { description: 'Fails for `seconds` after its child succeeds.', child: true, args: { seconds: { type: 'number' } } },
  condition: { description: 'A test, now.', args: { test: { type: 'string' } } },
  action: { description: 'One action of the vocabulary.', args: { do: { enum: Object.keys(ACTIONS) }, args: { type: 'object' } } },
  set: { description: 'Write a blackboard value.', args: { key: { type: 'string' }, value: {} } },
  choose: { description: 'Pick into the blackboard: an advert (a free seat), a random reachable point near home, a remembered agent.', args: { pick: { enum: ['advert', 'point', 'remembered'] }, key: { type: 'string' } } },
};

/** Resolve "$key" / "$key.path" / "$self" in action arguments from the blackboard. */
export function resolve(v, ctx) {
  if (typeof v === 'string' && v.startsWith('$')) {
    if (v === '$self') return ctx.node.id;
    return v.slice(1).split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx.bb);
  }
  if (Array.isArray(v)) return v.map((x) => resolve(x, ctx));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, ctx)]));
  return v;
}

const flat = (a, b) => { const dx = a[0] - b[0], dz = a[2] - b[2]; return Math.sqrt(dx * dx + dz * dz); };
const posOf = (ctx, t) => { if (Array.isArray(t)) return t; const n = t && ctx.tree.find(t); if (!n) return null; const p = n.object3d.position; return [p.x, p.y, p.z]; };

/** Tests (conditions, guards, until): name → (ctx, args) → boolean. */
export const TESTS = {
  /** a blackboard value: { key, op?: eq|ne|gt|lt|set|unset, value? } */
  bb: (ctx, { key, op = 'set', value }) => {
    const v = resolve(`$${key}`, ctx);
    switch (op) { case 'eq': return v === value; case 'ne': return v !== value; case 'gt': return v > value; case 'lt': return v < value; case 'unset': return v == null || v === false; default: return v != null && v !== false; }
  },
  /** the agent's goal is `name` */
  goal: (ctx, { name }) => ctx.bb.goal?.name === name,
  /** remembers a stimulus: { kind, topic?, source?, within? (s) } */
  remembers: (ctx, a) => !!ctx.brain.recall(resolve(a, ctx)),
  /** within `distance` of a target (node or point) */
  near: (ctx, { target, distance = 1 }) => { const t = posOf(ctx, resolve(target, ctx)), p = ctx.node.object3d.position; return !!t && flat([p.x, 0, p.z], t) <= distance; },
  /** seated */
  seated: (ctx) => !!ctx.node.ctrl?.seat,
  /** speaking */
  speaking: (ctx) => !!ctx.node.speaking,
  /** someone seen lately (`within` s) who isn't in the blackboard's `greeted` set yet */
  newcomer: (ctx, { within = 1, set = 'greeted' }) => Object.values(ctx.brain.memory).some((m) => m.kind === 'sight' && ctx.step - m.last <= within * 60 && !ctx.bb[set]?.[m.source]),
  /** a chance from the agent's own stream */
  chance: (ctx, { p = 0.5 }) => ctx.rng.float() < p,
};

/** Utility inputs: name → (ctx, args) → 0…1. */
export const INPUTS = {
  constant: (_ctx, { value = 1 }) => value,
  random: (ctx) => ctx.rng.float(),
  goal: (ctx, { name }) => (ctx.bb.goal?.name === name ? 1 : 0),
  bb: (ctx, { key, max = 1 }) => { const v = Number(resolve(`$${key}`, ctx)); return Number.isFinite(v) ? v / max : 0; },
  /** how strongly a stimulus is remembered */
  memory: (ctx, a) => ctx.brain.recall(resolve(a, ctx))?.strength ?? 0,
  /** 1 near a target, falling to 0 at `range` */
  closeness: (ctx, { target, range = 10 }) => { const t = posOf(ctx, resolve(target, ctx)), p = ctx.node.object3d.position; return t ? 1 - Math.min(1, flat([p.x, 0, p.z], t) / range) : 0; },
  /** a free advert of `verb` within `range` */
  advert: (ctx, { verb, range = 10 }) => (ctx.ai.adverts(ctx.node, verb, range).length ? 1 : 0),
  /** a role-profile trait, 0…1 (M3 W1: the persona service's profile for this character; 0.5 without one) */
  trait: (ctx, { name }) => ctx.ai.trait?.(ctx.node.id, name) ?? 0.5,
  /** a test as 0 or 1 */
  test: (ctx, a) => (TESTS[a.test]?.(ctx, a) ? 1 : 0),
};

/** Number every node of a tree (pre-order) into a flat list: indices are the keys of the tree's state. */
export function compile(root) {
  const nodes = [];
  const walk = (spec, parent) => {
    if (!NODE_TYPES[spec.type]) throw new Error(`unknown tree node "${spec.type}" (${Object.keys(NODE_TYPES).join(', ')})`);
    if (spec.type === 'action' && !ACTIONS[spec.do]) throw new Error(`unknown action "${spec.do}" (${Object.keys(ACTIONS).join(', ')})`);
    if ((spec.type === 'condition' || spec.type === 'guard' || spec.type === 'until') && !TESTS[spec.test]) throw new Error(`unknown test "${spec.test}" (${Object.keys(TESTS).join(', ')})`);
    const n = { i: nodes.length, spec, parent, kids: [] };
    nodes.push(n);
    if (spec.type === 'utility') for (const o of spec.children) { for (const c of o.considerations ?? []) if (!INPUTS[c.input]) throw new Error(`unknown utility input "${c.input}" (${Object.keys(INPUTS).join(', ')})`); n.kids.push(walk(o.tree, n.i)); }
    else if (spec.children) for (const c of spec.children) n.kids.push(walk(c, n.i));
    else if (spec.child) n.kids.push(walk(spec.child, n.i));
    return n;
  };
  walk(root, -1);
  return nodes;
}

/**
 * Tick a compiled tree once. `state` (plain data, per node index) is read and written; `ctx` gives the actions and tests
 * the world. → the root's status
 */
export function tick(nodes, state, ctx) {
  const st = (n) => (state[n.i] ??= {});
  const reset = (n) => {
    const s = state[n.i];
    if (s?.running && n.spec.type === 'action') ACTIONS[n.spec.do].cancel?.(ctx, resolve(n.spec.args ?? {}, ctx), s.data);
    delete state[n.i];
    for (const k of n.kids) reset(k);
  };
  const run = (n) => {
    const spec = n.spec, s = spec.type === 'condition' || spec.type === 'set' || spec.type === 'choose' ? null : st(n); // instant nodes keep no state
    switch (spec.type) {
      case 'sequence': case 'selector': {
        const want = spec.type === 'sequence' ? 'success' : 'failure';
        for (let i = s.at ?? 0; i < n.kids.length; i++) {
          const r = run(n.kids[i]);
          if (r === 'running') { s.at = i; return r; }
          if (r !== want) { reset(n); return r; }
        }
        reset(n); return want;
      }
      case 'parallel': {
        let ok = 0, bad = 0;
        s.done ??= {};
        n.kids.forEach((k, i) => { if (s.done[i]) { if (s.done[i] === 'success') ok++; else bad++; return; } const r = run(k); if (r !== 'running') { s.done[i] = r; if (r === 'success') ok++; else bad++; } });
        const one = spec.policy === 'one';
        if (one ? ok > 0 : bad > 0) { reset(n); return one ? 'success' : 'failure'; }
        if (one ? bad === n.kids.length : ok === n.kids.length) { reset(n); return one ? 'failure' : 'success'; }
        return 'running';
      }
      case 'utility': {
        const rate = spec.rate ?? 15;
        if (s.cur === undefined || s.cur === null || ctx.step - (s.scoredAt ?? -1e9) >= rate) {
          const scores = spec.children.map((o, i) => {
            // the product of the considerations, each softened by its weight (1: as scored, 0: ignored), times the option's weight
            let v = o.weight ?? 1;
            for (const c of o.considerations ?? []) { const w = c.weight ?? 1; v *= 1 - w * (1 - curve(c.curve, INPUTS[c.input](ctx, c))); }
            return v + (i === s.cur ? spec.hysteresis ?? 0.1 : 0);
          });
          let best = 0;
          for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
          s.scores = scores.map((v) => Math.round(v * 1e6) / 1e6); s.scoredAt = ctx.step;
          if (best !== s.cur) { if (s.cur !== undefined && s.cur !== null) reset(n.kids[s.cur]); s.cur = best; s.since = ctx.step; }
        }
        const r = run(n.kids[s.cur]);
        if (r !== 'running') { s.cur = null; } // re-score next tick
        return r === 'running' ? 'running' : r;
      }
      case 'repeat': {
        const r = run(n.kids[0]);
        if (r === 'failure') { reset(n); return 'failure'; }
        if (r === 'success') { s.count = (s.count ?? 0) + 1; if (spec.times !== undefined && s.count >= spec.times) { reset(n); return 'success'; } }
        return 'running';
      }
      case 'invert': { const r = run(n.kids[0]); return r === 'running' ? r : r === 'success' ? 'failure' : 'success'; }
      case 'succeed': { const r = run(n.kids[0]); return r === 'running' ? r : 'success'; }
      case 'fail': { const r = run(n.kids[0]); return r === 'running' ? r : 'failure'; }
      case 'guard': {
        if (!TESTS[spec.test](ctx, spec)) { reset(n); return 'failure'; }
        return run(n.kids[0]);
      }
      case 'until': {
        s.from ??= ctx.step;
        if (TESTS[spec.test](ctx, spec)) { reset(n); return 'success'; }
        if (spec.timeout !== undefined && ctx.step - s.from > spec.timeout * 60) { reset(n); return 'failure'; }
        return 'running';
      }
      case 'cooldown': { // its timer outlives the parent's reset: kept under "cd<index>"
        const key = `cd${n.i}`;
        if (state[key] !== undefined && ctx.step < state[key]) return 'failure';
        const r = run(n.kids[0]);
        if (r === 'success') state[key] = ctx.step + Math.round((spec.seconds ?? 1) * 60);
        return r;
      }
      case 'condition': return TESTS[spec.test](ctx, spec) ? 'success' : 'failure';
      case 'set': { // a key may be a path whose parts name blackboard values: "greeted.$newcomer"
        const ks = spec.key.split('.').map((k) => (k.startsWith('$') ? String(resolve(k, ctx)) : k));
        let o = ctx.bb;
        for (const k of ks.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
        o[ks.at(-1)] = structuredClone(resolve(spec.value, ctx) ?? null);
        return 'success';
      }
      case 'choose': {
        const v = choose(ctx, spec);
        if (v === null || v === undefined) return 'failure';
        ctx.bb[spec.key] = v; return 'success';
      }
      case 'action': {
        const act = ACTIONS[spec.do], args = resolve(spec.args ?? {}, ctx);
        if (!s.running) { s.running = true; s.data = act.start(ctx, args) ?? {}; }
        const r = act.update(ctx, args, s.data);
        if (r !== 'running') delete state[n.i];
        return r;
      }
      default: throw new Error(`tree node ${spec.type}`);
    }
  };
  return run(nodes[0]);
}

/** The `choose` picks. */
function choose(ctx, spec) {
  switch (spec.pick) {
    case 'advert': { // the nearest free item offering `verb` within `range`
      const list = ctx.ai.adverts(ctx.node, spec.verb ?? 'sit', spec.range ?? 12);
      return list[0]?.id ?? null;
    }
    case 'point': { // a reachable random point within `radius` of `around` (default: home)
      const around = resolve(spec.around ?? '$home', ctx) ?? [ctx.node.object3d.position.x, 0, ctx.node.object3d.position.z];
      const nav = ctx.tree.services.get('nav');
      for (let k = 0; k < 8; k++) {
        const a = ctx.rng.range(0, 2 * Math.PI), r = ctx.rng.range(spec.min ?? 0.5, spec.radius ?? 3);
        const p = [around[0] + Math.cos(a) * r, around[1] ?? 0, around[2] + Math.sin(a) * r];
        const q = nav ? nav.closest(p) : p;
        if (q && flat(q, p) < 0.5) return q.map((v) => Math.round(v * 1000) / 1000);
      }
      return null;
    }
    case 'remembered': { // the source of the strongest matching memory, leaving out the sources in bb[exclude] ("greeted")
      const q = resolve(spec, ctx), skip = spec.exclude ? ctx.bb[spec.exclude] ?? {} : null;
      let best = null;
      for (const m of Object.values(ctx.brain.memory)) {
        if (q.kind && m.kind !== q.kind) continue;
        if (q.within !== undefined && ctx.step - m.last > q.within * 60) continue;
        if (skip && skip[m.source]) continue;
        if (!best || m.strength > best.strength || (m.strength === best.strength && m.source < best.source)) best = m;
      }
      return best?.source ?? null;
    }
    default: throw new Error(`choose: unknown pick "${spec.pick}"`);
  }
}
