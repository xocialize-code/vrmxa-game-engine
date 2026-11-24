// The HUD's decisions (M5 W3): what it shows, as plain data, from the game's view (@vrmxg/game: flow.view()), the
// interaction prompts (@vrmxg/interact: interact.prompts()), the inventory and the bindings. Nothing here reads a
// clock: a HUD re-reads when the step or the game's version changes, and a notice lasts a number of steps.
import { describeBinding, timerText, isUrgent } from './format.js';

/** How long a notice ("Saved") stays, in steps. */
export const NOTICE_STEPS = 150;

/**
 * The text of a key and of a gamepad button that do an action, from its bindings: { keyboard, gamepad } (null where
 * nothing is bound). The first of each is the one shown.
 * @param {{ bindings: any[] } | undefined} action
 */
export function keysFor(action) {
  const list = action?.bindings ?? [];
  const kb = list.find((b) => b.key !== undefined) ?? list.find((b) => b.mouseButton !== undefined);
  const gp = list.find((b) => b.gamepadButton !== undefined);
  return { keyboard: kb ? describeBinding(kb) : null, gamepad: gp ? describeBinding(gp) : null };
}

/** "Press E or Gamepad X to Take Key": a prompt's accessible name. */
export function promptLabel(p) {
  const keys = [p.keys.keyboard, p.keys.gamepad].filter(Boolean);
  return `${keys.length ? `Press ${keys.join(' or ')} to ` : ''}${p.text}${p.showName ? ` ${p.name}` : ''}`;
}

/**
 * The HUD as plain data.
 * @param {any} view the game's view (flow.view()), or null before a world exists
 * @param {{ prompts?: Array<{ actor: string, item: string, verb: string, prompt: string }>, player?: string | null,
 *   names?: (item: string) => string | null, carrying?: Array<{ id: string, name: string }>, bindings?: Record<string, any>,
 *   notices?: Array<{ id: string, text: string }>, loading?: string | null, interact?: string }} [o]
 *   prompts: what interact.prompts() gives; player: whose prompt and inventory (default: the first prompt's actor);
 *   names: an item's display name; carrying: inventory.list(player); bindings: input.bindings(), for the prompt's keys;
 *   interact: the action the prompt is answered with ('interact')
 */
export function hudModel(view, { prompts = [], player = null, names = () => null, carrying = [], bindings = {}, notices = [], loading = null, interact = 'interact' } = {}) {
  const p = (player ? prompts.find((x) => x.actor === player) : prompts[0]) ?? null;
  const prompt = p ? { actor: p.actor, item: p.item, name: names(p.item) ?? p.item, verb: p.verb, text: p.prompt || p.verb, keys: keysFor(bindings[interact]) } : null;
  if (prompt) {
    prompt.showName = !!prompt.name && !prompt.text.toLowerCase().includes(String(prompt.name).toLowerCase()); // "Open door" names it already
    prompt.action = `${prompt.text}${prompt.showName ? ` ${prompt.name}` : ''}`; // what the prompt says after its keys
    prompt.label = promptLabel(prompt);
  }
  if (!view) return { ready: false, scene: null, step: 0, goal: null, objectives: [], score: null, counters: [], timers: [], carrying: [...carrying], prompt, outcome: null, loading, notices: [...notices] };
  const counters = view.counters ?? {}, labels = view.labels ?? {};
  return {
    ready: true,
    scene: view.scene, step: view.step,
    goal: view.goal ? { key: view.goal.key, text: view.goal.text ?? view.goal.key } : null,
    objectives: (view.objectives ?? []).map((o) => ({ key: o.key, text: o.text ?? o.key, done: !!o.done, optional: !!o.optional })),
    // the score shows when the game counts one; the others when this scene gives them a label
    score: Object.hasOwn(counters, 'score') ? { label: labels.score ?? 'Score', value: counters.score } : null,
    counters: Object.keys(labels).filter((k) => k !== 'score' && Object.hasOwn(counters, k)).map((k) => ({ key: k, label: labels[k], value: counters[k] })),
    timers: Object.entries(view.timers ?? {}).filter(([, t]) => t.declared && t.label).map(([key, t]) => ({ key, label: t.label, text: timerText(t), countdown: !!t.limit, running: !!t.running, done: !!t.done, urgent: isUrgent(t) })),
    carrying: carrying.map((c) => ({ id: c.id, name: c.name ?? c.id })),
    prompt,
    outcome: view.outcome ?? null,
    loading,
    notices: [...notices],
  };
}

/**
 * Notices from the session's events, each lasting NOTICE_STEPS steps of the game's clock from the step it arrived on.
 * "Saved" comes on checkpointWritten (the file exists), never on the game's `checkpoint` (only taken); it counts from
 * when the write finished, not from the checkpoint's own step, so a store that takes seconds still shows it.
 */
export class Notices {
  constructor({ steps = NOTICE_STEPS } = {}) { this.steps = steps; /** @type {Array<{ id: string, text: string, until: number }>} */ this.list = []; this._n = 0; }
  /** Take one of the session's events (flow.on). @param {any} e @param {number} [now] the game's step as it arrives */
  take(e, now) {
    let text = null;
    if (e.type === 'checkpointWritten') text = 'Saved';
    else if (e.type === 'checkpointFailed') text = 'Couldn\'t save';
    if (!text) return false;
    const step = typeof now === 'number' ? now : typeof e.step === 'number' ? e.step : 0;
    this.list.push({ id: `n${++this._n}`, text, until: step + this.steps });
    return true;
  }
  /** The notices still showing at this step. */
  at(step) { this.list = this.list.filter((n) => n.until > step); return this.list.map(({ id, text }) => ({ id, text })); }
  clear() { this.list = []; }
}

/**
 * What a HUD binds to: the session (a @vrmxg/game GameFlow), and through it the world being played. sync() gives a
 * fresh model when the step, the game's version, the conversation or the bindings changed since the last call, and
 * null otherwise: a frame loop calls it every frame and redraws only on a model.
 */
export class HudBinding {
  /** @param {any} flow a GameFlow @param {{ player?: string | null, interact?: string }} [o] */
  constructor(flow, { player = null, interact = 'interact' } = {}) {
    this.flow = flow; this.player = player; this.interact = interact;
    this.notices = new Notices();
    this._key = null;
    this._off = flow.on((e) => { if (this.notices.take(e, flow.tree?.clock.step)) this._key = null; });
  }

  /** The world's services this reads, or null. */
  get tree() { return this.flow.tree ?? null; }

  _keyNow() {
    const t = this.tree;
    return t ? `${this.flow.version}|${t.clock.step}|${t.services.get('dialogue')?.version ?? 0}|${t.services.get('input')?.map?.version ?? 0}|${this.flow.held ?? ''}` : 'none';
  }

  /** The HUD model, read now. */
  read() {
    const t = this.tree, view = this.flow.view();
    const interact = t?.services.get('interact'), inventory = t?.services.get('inventory'), input = t?.services.get('input');
    const prompts = interact?.prompts?.() ?? [];
    const player = this.player ?? prompts[0]?.actor ?? interact?.actors?.()[0]?.id ?? null;
    return hudModel(view, {
      prompts, player,
      names: (id) => t?.find(id)?.manifest?.name ?? t?.find(id)?.name ?? null,
      carrying: player && inventory ? inventory.list(player) : [],
      bindings: input?.bindings?.() ?? {},
      notices: this.notices.at(view?.step ?? 0),
      loading: this.flow.held ?? null,
      interact: this.interact,
    });
  }

  /** A model when something changed since the last sync, else null. */
  sync() {
    const k = this._keyNow();
    if (k === this._key) return null;
    this._key = k;
    return this.read();
  }

  dispose() { this._off?.(); this._off = null; }
}
