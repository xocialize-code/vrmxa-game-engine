// The director (M3 W0, research/npc-ai.md §4): persona-driven decisions made outside the 60 Hz step.
//
// talk(agent, text) or consider(agent, reason) starts a request. It is logged into the step at once, through ai.inject,
// as { kind: 'request', bb: { director: { pending }, heard } }: the character's tree sees the flag on its next tick (and
// plays `think`, W2), and a replay reproduces the wait. The request goes to one shared model through a queue (the
// character being spoken to first, at most `maxInFlight` at a time). The reply is checked against the moment's tool
// schemas and the world (schema.js), then enters the step on the first tick after it arrives as
// { kind: 'decision', actions | goal | bb, meta: { source: { model, promptHash } } }. A bad reply, an error or a timeout
// enters as a decision with no calls: the pending flag clears and the tree carries on.
//
// Nothing here runs inside the step, and nothing reads a clock: timeouts and scripted latency count steps, released by
// pump(), which the host calls after each step. Everything that changes the simulation goes through ai.inject and is in
// the ai service's log, so ai.replay(ai.record()) reproduces a conversation with no model at all.
import { toolsFor, validate } from './schema.js';
import { buildMessages, describeMoment, promptHash, FRAMING } from './prompt.js';
import { lineRequest, verdictRequest, parseVerdict, cleanLine, verdictParts } from './split.js';

/** Expressions a reply may carry when the persona names none: VRM 1.0's five emotion presets (VRMXA §10.1). */
export const EMOTIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised'];
/** Animation slots that aren't gestures (locomotion and item actions). */
const NOT_GESTURES = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'land', 'hold', 'use', 'take', 'talk', 'sit', 'sitIdle', 'stand', 'crouch', 'turn', 'getUp']);

export class Director {
  /**
   * @param {any} tree
   * @param {object} o
   * @param {{ name: string, respond: (req: any, ctx?: any) => Promise<any>, replay?: boolean }} o.model
   * @param {(agent: string) => PersonaInfo | null} [o.persona] the persona in effect (core with the app's laid over)
   * @param {(agent: string) => string | null} [o.memory] what the app remembers, as text
   * @param {string} [o.framing] the app's rules
   * @param {string | null} [o.user] the node the person speaks as (the player's character), if any
   * @param {string | null} [o.userName]
   * @param {number} [o.timeout] steps before a request gives up (240 = 4 s)
   * @param {number} [o.maxInFlight] requests at the model at once (2)
   * @param {number} [o.reach] how far items count as nearby (m)
   * @param {number} [o.maxTokens]
   * @param {'split' | 'one'} [o.design] the split turn (a line call, then a JSON verdict; the default, AB-D-0265) or one call with tools
   *
   * @typedef {import('./prompt.js').Persona & { allowedExpressions?: string[], gestures?: string[],
   *   goals?: { name: string, description?: string }[], framing?: string }} PersonaInfo
   */
  constructor(tree, { model, persona = () => null, memory = () => null, framing = FRAMING, user = null, userName = null, timeout = 240, maxInFlight = 2, reach = 6, maxTokens = 160, design = 'split' }) {
    this.tree = tree; this.model = model; this.persona = persona; this.memory = memory; this.framing = framing;
    this.user = user; this.userName = userName; this.timeout = timeout; this.maxInFlight = maxInFlight; this.reach = reach; this.maxTokens = maxTokens;
    if (design !== 'split' && design !== 'one') throw new Error(`design: 'split' (a line call, then a verdict) or 'one' (one call with tools), not ${design}`);
    /** 'split' (the default, AB-D-0265): her line, then a JSON verdict; 'one': one call with tools (W0's design). */
    this.design = design;
    this.ai = tree.services.get('ai');
    if (!this.ai) throw new Error('the director needs the ai service (installAi) first');
    /** Every request: { id, agent, kind, step, priority, request, hash, moment, state, … } (a debugging record, not replay data). */
    this.requests = [];
    /** agent → the conversation so far [{ role, content }] (the prompt's history; the app may persist it as memory). */
    this.history = new Map();
    this.queue = []; this.inFlight = 0; this.n = 0;
    /** Waiters released by pump(): { step, resolve }. */ this.waiters = [];
    /** Salient events from the step, asked about in pump; agent → the step before which it isn't asked again. */
    this.salient = []; this.considered = new Map();
    this.stats = { asked: 0, answered: 0, rejected: 0, failed: 0, timedOut: 0, late: 0 };
  }

  // ---------------------------------------------------------------- asking

  /**
   * The person (or another character, `from`) says something to `agent`. Returns the request id, or null in replay.
   * @param {string} agent @param {string} text @param {{ from?: string }} [o]
   */
  talk(agent, text, { from = 'user' } = {}) {
    return this.ask(agent, { kind: 'talk', priority: 0, heard: { from, text: String(text).slice(0, 600) } });
  }

  /** Ask `agent` to choose what to do next (goal choice; `watch` asks on salient events). */
  consider(agent, reason = 'Decide what to do next.') { return this.ask(agent, { kind: 'consider', priority: 1, reason }); }

  /**
   * The person (or `from`) starts or stops speaking to `agent` (M3 W2: voice activity from the shell, W3). It enters the
   * step as bb.hearing, so the character listens (looks, nods) and holds a line until they stop; logged, so it replays.
   * @param {string} agent @param {boolean} on @param {{ from?: string }} [o]
   */
  speaking(agent, on, { from = 'user' } = {}) {
    if (this.model.replay) return;
    const step = this.tree.clock.step;
    // someone speaking to her starts (or keeps up) a conversation with them
    const bb = on ? { hearing: { from: this.who(from), step }, conversation: { with: this.who(from), last: step } } : { hearing: null };
    this.ai.inject({ step, agent, kind: 'hearing', bb });
  }

  /**
   * Ask `agent` to choose a goal when `signal` fires on node `on` (a salient event: a customer came in, the door opened).
   * The signal fires inside the step, so the question is asked after it (in pump), never more often than `cooldown` steps.
   * @param {string} agent @param {string} on a node id @param {string} signal
   * @param {{ reason?: string | ((args: any) => string), cooldown?: number }} [o]
   */
  watch(agent, on, signal, { reason = `Something happened: ${signal}.`, cooldown = 600 } = {}) {
    const node = this.tree.find(on);
    if (!node) throw new Error(`watch: no node ${on}`);
    this.tree.listen(node, signal, (args) => this.salient.push({ agent, cooldown, reason: typeof reason === 'function' ? reason(args) : reason }));
  }

  /** A person's id as the step knows them: `user` is the node they speak as. */
  who(from) { return from === 'user' ? this.user ?? 'user' : from; }

  ask(agent, { kind, priority, heard = null, reason = null }) {
    if (this.model.replay) return null;
    const brain = this.ai.brainOf(agent);
    if (!brain) throw new Error(`${agent} has no brain: the director decides through it`);
    const step = this.tree.clock.step, id = `${agent}#${++this.n}`;
    const persona = this.personaOf(agent), m = this.moment(agent, persona);
    const history = this.history.get(agent) ?? [];
    // the situation goes in the system prompt; the newest turn is the person's words alone (or why she is asked)
    const situation = describeMoment(m, { doing: doingOf(brain), userName: this.userName });
    // the split turn starts with her line (or, for a goal choice with no one speaking, is the verdict alone); one-call
    // asks for the line and the actions together, with tools
    let part = 'one', request;
    if (this.design === 'one') {
      const messages = buildMessages({ framing: persona.framing ?? this.framing, persona, memory: this.memory(agent), history, situation, moment: heard ? heard.text : reason });
      request = { messages, tools: toolsFor(m), maxTokens: this.maxTokens, priority };
    } else if (heard) {
      part = 'line';
      request = { ...lineRequest({ persona, memory: this.memory(agent), history, situation, moment: heard.text }), maxTokens: 90, priority };
    } else {
      part = 'verdict';
      request = { ...verdictRequest({ moment: m, name: persona.name, userName: this.userName ?? 'the person', heard: reason }), maxTokens: 120, priority };
    }
    const hash = promptHash({ messages: request.messages, tools: request.tools });
    const r = { id, agent, kind, part, step, priority, request, hash, moment: m, heard, reason, name: persona.name, line: null, state: 'queued', deadline: step + this.timeout };
    this.requests.push(r); this.stats.asked++;
    if (heard) history.push({ role: 'user', content: heard.text });
    this.history.set(agent, history.slice(-24));
    // into the step now: the tree sees it is waiting (and what was heard) on its next tick, and a replay reproduces it
    // (and, when someone spoke, that she is in a conversation with them: the tree stays with them while it lasts)
    const talk = heard ? { heard: { ...heard, step }, conversation: { with: this.who(heard.from), last: step } } : {};
    this.ai.inject({ step, agent, kind: 'request', bb: { director: { pending: id, since: step }, ...talk }, meta: { id, kind, hash, ...(heard ? { heard } : {}), ...(reason ? { reason } : {}) } });
    this.queue.push(r);
    this.queue.sort((a, b) => a.priority - b.priority || a.step - b.step || (a.id < b.id ? -1 : 1));
    this.dispatch();
    return id;
  }

  dispatch() {
    while (this.inFlight < this.maxInFlight && this.queue.length) {
      const r = this.queue.shift();
      if (r.state !== 'queued') continue;
      r.state = 'asking'; r.sent = this.tree.clock.step; this.inFlight++;
      Promise.resolve()
        .then(() => this.model.respond(r.request, { untilStep: (n) => this.untilStep(n) }))
        .then((reply) => this.answered(r, reply), (e) => this.failed(r, e));
    }
  }

  /** A promise released by pump() once `steps` more steps have run. */
  untilStep(steps) { return new Promise((resolve) => this.waiters.push({ step: this.tree.clock.step + steps, resolve })); }

  /** Call after each step: releases step waiters, times requests out, sends queued ones. */
  pump() {
    const step = this.tree.clock.step;
    if (this.salient.length) { // salient events from the last step: ask, at most once per cooldown per character
      const due = this.salient; this.salient = [];
      for (const s of due) if (step >= (this.considered.get(s.agent) ?? -Infinity)) { this.considered.set(s.agent, step + s.cooldown); this.consider(s.agent, s.reason); }
    }
    if (this.waiters.length) { const due = this.waiters.filter((w) => w.step <= step); this.waiters = this.waiters.filter((w) => w.step > step); for (const w of due) w.resolve(); }
    for (const r of this.requests) if ((r.state === 'queued' || r.state === 'asking') && step >= r.deadline) {
      if (r.state === 'asking') this.inFlight--;
      r.state = 'timedOut'; this.stats.timedOut++;
      if (r.part === 'verdict' && r.line !== null) this.decideVerdict(r, null, { failed: 'timeout' }); // the line stands
      else this.decide(r, { failed: 'timeout' });
    }
    this.dispatch();
  }

  // ---------------------------------------------------------------- answers

  answered(r, reply) {
    if (r.state !== 'asking') { if (r.state === 'timedOut') { r.late = true; this.stats.late++; } return; }
    this.inFlight--; r.reply = reply; r.answeredAt = this.tree.clock.step;
    const exists = (id) => !!this.tree.find(id);
    if (r.part === 'line') {
      // her line alone; it goes into the step at once (she speaks while the verdict is asked for)
      const said = cleanLine(reply.text ?? reply.toolCalls?.find((c) => c.name === 'say')?.arguments?.text ?? '', r.name);
      const v = validate({ toolCalls: [{ name: 'say', arguments: { text: said, to: 'user' } }] }, r.moment, { exists });
      if ('errors' in v) { r.state = 'rejected'; r.errors = v.errors; this.stats.rejected++; this.decide(r, { failed: 'rejected', errors: v.errors, model: reply.model }); }
      else { r.state = 'answered'; r.calls = v.calls; this.stats.answered++; this.decide(r, { calls: v.calls, model: reply.model }); this.askVerdict(r, said); }
    } else if (r.part === 'verdict') {
      r.state = 'answered'; this.decideVerdict(r, parseVerdict(reply.text), { model: reply.model });
    } else {
      const v = validate(reply, r.moment, { exists });
      if ('errors' in v) { r.state = 'rejected'; r.errors = v.errors; this.stats.rejected++; this.decide(r, { failed: 'rejected', errors: v.errors, model: reply.model }); }
      else { r.state = 'answered'; r.calls = v.calls; this.stats.answered++; this.decide(r, { calls: v.calls, model: reply.model }); }
    }
    this.dispatch();
  }

  failed(r, e) {
    if (r.state !== 'asking') return;
    this.inFlight--; r.state = 'failed'; r.error = e?.message ?? String(e); this.stats.failed++;
    if (r.part === 'verdict' && r.line !== null) this.decideVerdict(r, null, { failed: 'error', errors: [r.error] }); // the line stands
    else this.decide(r, { failed: 'error', errors: [r.error] });
    this.dispatch();
  }

  /** The split turn's second call: the verdict on her line (queued at once, with its own deadline). */
  askVerdict(r, line) {
    const step = this.tree.clock.step;
    const request = { ...verdictRequest({ moment: r.moment, name: r.name, userName: this.userName ?? 'the person', heard: r.heard.text, line }), maxTokens: 120, priority: r.priority };
    const v = { ...r, id: `${r.id}:verdict`, parent: r.id, part: 'verdict', step, request, hash: promptHash({ messages: request.messages, tools: request.tools }), line, state: 'queued', deadline: step + this.timeout, calls: undefined, reply: undefined };
    this.requests.push(v);
    this.queue.push(v);
    this.queue.sort((a, b) => a.priority - b.priority || a.step - b.step || (a.id < b.id ? -1 : 1));
  }

  /**
   * A verdict into the step: its parts that validate (her face and gesture, the action, the goal; endConversation after a
   * goodbye, by rule), as a second decision. With no verdict (it failed), only the goodbye rule. A goal choice's verdict
   * (no line) is the whole turn.
   */
  decideVerdict(r, verdict, { failed = null, errors = null, model = this.model.name } = {}) {
    const p = verdictParts(verdict ?? {}, r.moment, { heard: r.heard?.text ?? '', userName: this.userName ?? '', exists: (id) => !!this.tree.find(id), validate });
    r.dropped = p.dropped; r.verdict = verdict;
    if (!verdict) this.stats.verdictsFailed = (this.stats.verdictsFailed ?? 0) + 1;
    const calls = [...(p.face.emotion ? [{ name: 'emote', args: { name: p.face.emotion } }] : []), ...(p.face.gesture ? [{ name: 'gesture', args: { slot: p.face.gesture } }] : []), ...p.calls];
    r.calls = calls;
    if (r.line === null) this.decide(r, { calls, model, ...(failed ? { failed, errors } : {}) }); // a goal choice: the whole turn
    else this.decide(r, { calls, model, part: 'verdict', ...(failed || !verdict ? { failed: failed ?? 'unparsed', errors: errors ?? (verdict ? null : ['the verdict is not JSON']) } : {}), dropped: p.dropped });
  }

  /** The decision into the step, on the first tick from now: the calls as actions, a goal, blackboard values. */
  decide(r, { calls = [], failed = null, errors = null, model = this.model.name, part = null, dropped = null }) {
    const step = this.tree.clock.step, e = toInject(calls, this.user);
    // her reply keeps the conversation going (its quiet is counted from here), unless she ended it
    const going = r.heard && !('conversation' in e.bb) ? { conversation: { with: this.who(r.heard.from), last: step } } : {};
    const bb = { director: { pending: null, since: null, last: r.id, ...(failed ? { failed } : {}) }, ...going, ...e.bb };
    // a split turn's verdict is its second decision: what it kept, and what it dropped or why it failed (the line stands)
    const meta = { id: r.id, source: { model, promptHash: r.hash }, asked: r.step, ...(part ? { part, calls, ...(dropped?.length ? { dropped } : {}) } : {}), ...(failed ? { failed, errors } : part ? {} : { calls }) };
    // a decision that acts ends the thinking first (the tree, which would, waits behind the decision's actions)
    const actions = e.actions.length ? [{ do: 'think', args: { on: false } }, ...e.actions] : [];
    this.ai.inject({ step, agent: r.agent, kind: 'decision', bb, ...(actions.length ? { actions } : {}), ...(e.goal ? { goal: e.goal } : {}), meta });
    const said = calls.find((c) => c.name === 'say');
    if (said) { const h = this.history.get(r.agent) ?? []; h.push({ role: 'assistant', content: said.args.text }); this.history.set(r.agent, h.slice(-24)); }
  }

  // ---------------------------------------------------------------- saves (M3 W4)

  /** The conversations so far, as plain data, for a save's `extra` (the prompts need them after a load). */
  getHistory() { return Object.fromEntries([...this.history].map(([k, v]) => [k, structuredClone(v)])); }
  /** Conversations from a save's `extra`. */
  setHistory(h) { this.history = new Map(Object.entries(h ?? {}).map(([k, v]) => [k, structuredClone(v)])); }

  /**
   * After a game is loaded into a live world: a question the save caught on its way to the model never gets its answer,
   * so each character still waiting is told it was interrupted (her tree stops thinking) and the question is asked again.
   * In replay the log carries what happened instead, and nothing is asked. → the requests asked again
   */
  resume() {
    if (this.model.replay) return [];
    const step = this.tree.clock.step, asked = [];
    for (const b of this.ai.brains) {
      const d = b.bb.director;
      if (!d?.pending) continue;
      const agent = b.node.id;
      this.ai.inject({ step, agent, kind: 'decision', bb: { director: { pending: null, since: null, last: d.pending, failed: 'interrupted' } }, meta: { id: d.pending, failed: 'interrupted' } });
      const heard = b.bb.heard;
      if (heard?.text && heard.step >= d.since) asked.push(this.talk(agent, heard.text, { from: heard.from }));
      else asked.push(this.consider(agent));
    }
    return asked;
  }

  // ---------------------------------------------------------------- the moment

  personaOf(agent) {
    const n = /** @type {any} */ (this.tree.find(agent));
    return { name: n?.name ?? agent, ...(this.persona(agent) ?? {}) };
  }

  /**
   * What `agent` can act on now: people it has perceived, items within reach and their verbs, the faces and gestures it
   * has, its goals. Read between steps; never written.
   * @returns {import('./schema.js').Moment}
   */
  moment(agent, persona = this.personaOf(agent)) {
    const tree = this.tree, n = /** @type {any} */ (tree.find(agent)), brain = this.ai.brainOf(agent);
    const nameOf = (id) => { const x = /** @type {any} */ (tree.find(id)); return x?.name ?? id; };
    const seen = new Set();
    for (const m of Object.values(brain?.memory ?? {})) if (['sight', 'near', 'speech'].includes(m.kind) && m.source !== agent && m.source !== this.user && tree.find(m.source)) seen.add(m.source);
    const characters = [...seen].sort().map((id) => ({ id, name: nameOf(id) }));
    const p = n.object3d.position, items = [];
    for (const x of tree.all()) {
      if (x.type !== 'Item') continue;
      const q = x.object3d.getWorldPosition(x.object3d.position.clone()), dx = q.x - p.x, dz = q.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d <= this.reach) items.push({ id: x.id, name: x.name ?? x.id, verbs: [...new Set((x.offered?.() ?? []).map((v) => v.verb))].sort(), d });
    }
    items.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
    const has = n.vrm?.expressionManager ? new Set(n.vrm.expressionManager.expressions.map((e) => e.expressionName)) : null;
    const expressions = (persona.allowedExpressions ?? EMOTIONS).filter((e) => !has || has.has(e));
    const gestures = persona.gestures ?? Object.keys(n.graph?.slots ?? {}).filter((s) => !NOT_GESTURES.has(s) && n.graph.has(s)).sort();
    // a goal means something only if the brain's tree pursues it: its preset's goals decide (the app persona may describe
    // them better); the app persona's whole list only for a brain that declares none (a custom brain document)
    const own = brain?.preset?.goals;
    const goals = own ? own.map((g) => ({ ...g, ...(persona.goals?.find((x) => x.name === g.name) ?? {}) })) : persona.goals ?? [];
    return { agent, characters, items: items.slice(0, 8).map(({ d, ...i }) => i), expressions, gestures, goals, user: this.user && tree.find(this.user) ? this.user : null };
  }

  // ---------------------------------------------------------------- inspect

  /** What a debugger or MCP reads about one character's director. */
  inspect(agent) {
    const mine = this.requests.filter((r) => r.agent === agent);
    const pending = mine.filter((r) => r.state === 'queued' || r.state === 'asking');
    const last = mine.filter((r) => !pending.includes(r)).at(-1) ?? null;
    return {
      model: this.model.name, pending: pending.map((r) => ({ id: r.id, state: r.state, since: r.step, hash: r.hash })),
      last: last && { id: last.id, state: last.state, hash: last.hash, calls: last.calls ?? null, errors: last.errors ?? (last.error ? [last.error] : null), asked: last.step, answered: last.answeredAt ?? null },
      history: structuredClone(this.history.get(agent) ?? []),
    };
  }
}

/** What the brain is doing, in words, for the prompt. */
function doingOf(brain) {
  const g = brain?.bb?.goal;
  return g?.name ? `busy with "${g.name}"` : null;
}

/**
 * Validated calls → what ai.inject takes. `say` carries its face, gesture and look as actions started together; `user`
 * becomes the person's node; setGoal becomes the goal; endConversation clears the conversation.
 * @param {{ name: string, args: any }[]} calls @param {string | null} user
 */
export function toInject(calls, user) {
  const who = (t) => (t === 'user' ? user ?? undefined : t);
  const actions = [], bb = {};
  let goal = null;
  for (const { name, args } of calls) {
    if (name === 'say') {
      if (args.emotion) actions.push({ do: 'emote', args: { name: args.emotion } });
      actions.push({ do: 'say', args: { text: args.text, topic: 'chat', ...(who(args.to) ? { to: who(args.to) } : {}) } });
      if (args.gesture) actions.push({ do: 'gesture', args: { slot: args.gesture } });
      if (who(args.to)) actions.push({ do: 'lookAt', args: { target: who(args.to) } });
    } else if (name === 'setGoal') goal = { name: args.goal, params: Object.fromEntries(Object.entries(args.params ?? {}).map(([k, v]) => [k, v === 'user' ? who(v) ?? v : v])) };
    else if (name === 'endConversation') bb.conversation = null;
    else if (name === 'emote') actions.push({ do: 'emote', args: { name: args.name } });
    else if (name === 'gesture') actions.push({ do: 'gesture', args: { slot: args.slot } });
    else if (name === 'wait') actions.push({ do: 'wait', args: { seconds: args.seconds } });
    else if (name === 'interact') actions.push({ do: 'interact', args: { item: args.item, verb: args.verb } });
    else if (who(args.target)) actions.push({ do: name, args: { target: who(args.target) } });
  }
  return { actions, goal, bb };
}
