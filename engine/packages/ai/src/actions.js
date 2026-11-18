// The action vocabulary (M2 W7, research/npc-ai.md §1.1): one set of actions that behaviour-tree leaves, sequence cues,
// MCP's drive tools and (M3) the LLM director's tool calls all speak. Each action has a JSON Schema for its arguments
// (what the registry describes to MCP and what the director's grammar is built from) and runs in three calls:
//   start(ctx, args)          → data (plain, serialisable: it is the action's state in the snapshot)
//   update(ctx, args, data)   → 'running' | 'success' | 'failure', once per brain tick
//   cancel(ctx, args, data)   when the tree abandons it (another branch wins)
// ctx: { node (the character), tree, ai (the service), brain, bb (its blackboard), step, rng }.

const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const vec3 = (description) => ({ type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description });

/** Where a target is: a node id's position, or a point. */
export function positionOf(tree, target) {
  if (Array.isArray(target)) return target;
  const n = typeof target === 'string' ? tree.find(target) : null;
  if (!n) return null;
  n.object3d.updateWorldMatrix(true, false);
  const e = n.object3d.matrixWorld.elements;
  return [e[12], e[13], e[14]];
}
const flat = (a, b) => { const dx = a[0] - b[0], dz = a[2] - b[2]; return Math.sqrt(dx * dx + dz * dz); };
const here = (node) => { const p = node.object3d.position; return [p.x, p.y, p.z]; };

export const ACTIONS = {
  say: {
    description: 'Say a line: a voice clip (with its word timings) or text; heard by others nearby (a speech stimulus with a topic).',
    args: { type: 'object', properties: { text: str('What is said.'), clip: str('A voice clip (.wav) in the project.'), topic: str('What the line is about, for listeners (order, greet …).'), to: str('Who it is said to.') }, additionalProperties: false },
    start(ctx, a) {
      ctx.node.say?.({ text: a.text, clip: a.clip });
      ctx.ai.stimulus({ kind: 'speech', source: ctx.node.id, position: here(ctx.node), loudness: 6, topic: a.topic ?? null, to: a.to ?? null, text: a.text ?? null });
      return { at: ctx.step };
    },
    update(ctx, a, d) { return ctx.step > d.at && !ctx.node.speaking ? 'success' : 'running'; },
  },
  emote: {
    description: 'Show an expression for a moment (a VRM expression: happy, sad, surprised …).',
    args: { type: 'object', properties: { name: str('The expression.') }, required: ['name'], additionalProperties: false },
    start(ctx, a) { ctx.node.emote?.({ name: a.name }); return {}; },
    update() { return 'success'; },
  },
  gesture: {
    description: 'Play a one-shot animation slot (talk, use, greet …) when the character\'s set fills it.',
    args: { type: 'object', properties: { slot: str('The VRMXA animation slot.') }, required: ['slot'], additionalProperties: false },
    start(ctx, a) {
      const g = ctx.node.graph;
      if (!g?.has?.(a.slot) || !ctx.node.startAction) return { failed: true };
      ctx.node.startAction(a.slot);
      return { at: ctx.step };
    },
    update(ctx, a, d) { return d.failed ? 'failure' : ctx.step > d.at && !ctx.node.graph.busy ? 'success' : 'running'; },
  },
  lookAt: {
    description: 'Look at a node (eyes and head), or with no target stop.',
    args: { type: 'object', properties: { target: str('A node id.') }, additionalProperties: false },
    start(ctx, a) { ctx.node.lookAt?.({ target: a.target || undefined }); return {}; },
    update() { return 'success'; },
  },
  goTo: {
    description: 'Walk to a node or a point, along the navmesh; succeeds within `within` metres, fails after `timeout` seconds.',
    args: { type: 'object', properties: { target: str('A node id.'), point: vec3('Or a point.'), within: num('Arrival distance (m).', { default: 0.35 }), timeout: num('Give up after (s).', { default: 30 }) }, additionalProperties: false },
    start(ctx, a) {
      const goal = positionOf(ctx.tree, a.point ?? a.target);
      if (!goal) return { failed: true };
      if (flat(here(ctx.node), goal) <= (a.within ?? 0.35)) return { done: true };
      if (ctx.node.ctrl?.seat) ctx.ai.standUp(ctx.node);
      // a target node: walk to the nearest point `within` of it, on the side we come from (a seated customer, a counter)
      ctx.node.goTo({ point: approach(here(ctx.node), goal, a.target ? Math.max(0, (a.within ?? 0.35) - 0.15) : 0) });
      return { at: ctx.step, goal };
    },
    update(ctx, a, d) {
      if (d.failed) return 'failure';
      if (d.done) return 'success';
      const goal = a.target ? positionOf(ctx.tree, a.target) : d.goal;
      if (!goal) { ctx.node.goTo({}); return 'failure'; }
      const dist = flat(here(ctx.node), goal), within = a.within ?? 0.35;
      if (dist <= within) { ctx.node.goTo({}); return 'success'; }
      if (ctx.step - d.at > (a.timeout ?? 30) * 60) { ctx.node.goTo({}); return 'failure'; }
      if (!ctx.node.ctrl.goTo) {
        // arrived where the navmesh ends (a seated customer among the stools, a goal off the mesh): close enough counts;
        // otherwise try again from here, a few times
        if (dist <= within + 1) return 'success';
        d.tries = (d.tries ?? 0) + 1;
        if (d.tries > 3) return 'failure';
        ctx.node.goTo({ point: approach(here(ctx.node), goal, a.target ? Math.max(0, within - 0.15) : 0) });
      }
      return 'running';
    },
    cancel(ctx) { ctx.node.goTo?.({}); },
  },
  follow: {
    description: 'Keep within `distance` of a node, walking after it when it moves away; runs until the tree stops it.',
    args: { type: 'object', properties: { target: str('A node id.'), distance: num('How close to stay (m).', { default: 1.2 }) }, required: ['target'], additionalProperties: false },
    start() { return {}; },
    update(ctx, a) {
      const goal = positionOf(ctx.tree, a.target);
      if (!goal) return 'failure';
      const d = flat(here(ctx.node), goal), keep = a.distance ?? 1.2;
      if (d > keep + 0.4 && !ctx.node.ctrl.goTo) ctx.node.goTo({ point: approach(here(ctx.node), goal, keep) });
      else if (d <= keep && ctx.node.ctrl.goTo) ctx.node.goTo({});
      return 'running';
    },
    cancel(ctx) { ctx.node.goTo?.({}); },
  },
  interact: {
    description: 'Do a verb with an item (sit, use, open, take …), or stand up from a seat (verb stand).',
    args: { type: 'object', properties: { item: str('The item\'s id.'), verb: str('The verb.') }, required: ['verb'], additionalProperties: false },
    start(ctx, a) {
      if (a.verb === 'stand') { if (ctx.node.ctrl?.seat) ctx.ai.standUp(ctx.node); return { at: ctx.step, stand: true }; }
      const svc = ctx.tree.services.get('interact');
      const r = svc && a.item ? svc.request(ctx.node.id, a.item, a.verb) : null;
      return r ? { at: ctx.step, verb: a.verb } : { failed: true };
    },
    update(ctx, a, d) {
      if (d.failed) return 'failure';
      if (d.stand) return ctx.node.graph?.busy || ctx.node.ctrl.seat ? 'running' : 'success';
      if (d.verb === 'sit') return ctx.node.graph?.state === 'sitIdle' ? 'success' : ctx.step - d.at > 600 ? 'failure' : 'running';
      return ctx.step > d.at && !ctx.node.graph?.busy ? 'success' : 'running';
    },
  },
  setGoal: {
    description: 'Give an agent (yourself by default) a goal its brain\'s utility weighs: { name, params }.',
    args: { type: 'object', properties: { goal: str('The goal\'s name (or empty to clear it).'), params: { type: 'object', description: 'What the goal is about.' }, agent: str('Whose goal (default: yours).') }, required: ['goal'], additionalProperties: false },
    start(ctx, a) {
      const who = a.agent ? ctx.ai.brainOf(a.agent) : ctx.brain;
      if (!who) return { failed: true };
      who.bb.goal = a.goal ? { name: a.goal, params: structuredClone(a.params ?? {}), from: ctx.node.id, step: ctx.step } : null;
      return {};
    },
    update(ctx, a, d) { return d.failed ? 'failure' : 'success'; },
  },
  wait: {
    description: 'Wait for `seconds` (or a random time between `min` and `max`, from the agent\'s own stream).',
    args: { type: 'object', properties: { seconds: num('How long (s).'), min: num('Or at least (s).'), max: num('And at most (s).') }, additionalProperties: false },
    start(ctx, a) { const s = a.seconds ?? ctx.rng.range(a.min ?? 1, a.max ?? 3); return { until: ctx.step + Math.round(s * 60) }; },
    update(ctx, a, d) { return ctx.step >= d.until ? 'success' : 'running'; },
  },
};

/** A point `keep` metres short of `goal`, on the line from `from` (so an agent stops beside a target, not inside it). */
export function approach(from, goal, keep) {
  if (!keep) return [goal[0], goal[1], goal[2]];
  const dx = from[0] - goal[0], dz = from[2] - goal[2], d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-6) return [goal[0], goal[1], goal[2]];
  return [goal[0] + (dx / d) * keep, goal[1], goal[2] + (dz / d) * keep];
}

/** Every action's JSON Schema, for the registry, MCP and the director's grammar. */
export const actionSchemas = () => Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, { description: a.description, args: a.args }]));
