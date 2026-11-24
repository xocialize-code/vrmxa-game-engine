// Conversations with choices (M5 W3, AB-T-0618): the "dialogue" service and the Dialogue node.
//
// A conversation is scene data: a Dialogue node whose `lines` are said in order, each one a voice line as say() takes
// it ({ text, clip }) with who says it. A line may offer choices; a choice says which line comes next, and that is the
// whole of a branch. Conditions are the game's ({ test, … }, @vrmxg/game) over the game state, and a line or a choice
// may set flags there, so a conversation reads and changes the game the way every other rule does. The scene carries
// no code.
//
//   { "id": "order", "type": "Dialogue", "props": { "lines": [
//     { "speaker": "hana", "text": "Good morning! What can I get you?", "clip": "voice/hana-order.wav", "choices": [
//       { "id": "latte", "text": "A latte, please.", "to": "latte", "set": { "order": "latte" } },
//       { "id": "tea", "text": "Just tea.", "to": "tea", "set": { "order": "tea" } } ] },
//     { "id": "latte", "speaker": "hana", "text": "One latte, coming up.", "next": "bye" },
//     { "id": "tea", "speaker": "hana", "text": "Tea it is." },
//     { "id": "bye", "speaker": "hana", "text": "Enjoy!" } ] } }
//
// All of it is simulation, on the step clock and in the snapshot:
//   a line     starts on a step (the speaker says it through the voice service: heard, lip-synced, captioned, a speech
//              bubble) and is over after its length, counted in steps;
//   a choice   is waited for after a line that offers any. It arrives as a latched, recorded input
//              (@vrmxg/input: the UI calls input.choose('dialogue.choose', id), the step reads input.choice(…)), so a
//              recording carries it and a replay takes the same branch on the same step. Nothing here hears from a UI;
//   skipping   a line is the same kind of input ('dialogue.advance').
// The UI (the box, the choices) reads view(), which is plain data, and writes nothing.
import { Node } from '@vrmxg/core';
import { holds, checkCondition } from '@vrmxg/game';
import { estimateWords } from './lipsync.js';

const DT = 1 / 60;
/** The `next` / `to` that ends the conversation. */
export const END = 'end';
/** The input choice a conversation's answer arrives under: the offered choice's id. */
export const CHOOSE = 'dialogue.choose';
/** The input choice that ends the line being said early. */
export const ADVANCE = 'dialogue.advance';

const ID = /^[A-Za-z0-9_-]+$/;
const FLAG = new Set(['boolean', 'number', 'string']);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A Dialogue node's lines as the service runs them: ids filled in (a choice without one takes its place in the list,
 * "0", "1"), and every `next` and `to` resolved to a line's index, or −1 for the end.
 * @param {any} props a Dialogue node's props
 * @returns {{ lines: Array<{ id: string | null, speaker: string | null, text: string, clip: string | null, pause: number, when: any, set: Record<string, any> | null, next: number, choices: Array<{ id: string, text: string, when: any, set: Record<string, any> | null, to: number }> }>, problems: string[] }}
 */
export function readDialogue(props) {
  const problems = [], raw = Array.isArray(props?.lines) ? props.lines : [];
  if (!Array.isArray(props?.lines) || raw.length === 0) problems.push('lines: a conversation needs at least one line');
  const index = new Map();
  raw.forEach((l, i) => {
    if (!isObject(l)) return;
    if (l.id === undefined) return;
    if (typeof l.id !== 'string' || !ID.test(l.id)) problems.push(`lines[${i}].id: an id is letters, digits, - and _`);
    else if (l.id === END) problems.push(`lines[${i}].id: "${END}" is the name of the conversation's end`);
    else if (index.has(l.id)) problems.push(`lines[${i}].id: "${l.id}" is line ${index.get(l.id)}'s id too`);
    else index.set(l.id, i);
  });
  const target = (v, at, fallback) => {
    if (v === undefined) return fallback;
    if (v === END) return -1;
    if (typeof v === 'string' && index.has(v)) return index.get(v);
    problems.push(`${at}: no line "${v}" (${[...index.keys(), END].join(', ')})`);
    return fallback;
  };
  const flags = (v, at) => {
    if (v === undefined) return null;
    if (!isObject(v)) { problems.push(`${at}: the flags to set, by name`); return null; }
    for (const [k, x] of Object.entries(v)) if (k === '' || k === '__proto__' || !FLAG.has(typeof x)) problems.push(`${at}.${k}: a flag is a boolean, a number or a string`);
    return { ...v };
  };
  const when = (v, at) => { if (v === undefined) return null; problems.push(...checkCondition(v, at)); return v; };
  const lines = raw.map((l, i) => {
    const at = `lines[${i}]`, following = i + 1 < raw.length ? i + 1 : -1;
    if (!isObject(l)) { problems.push(`${at}: a line is { text, speaker, … }`); return { id: null, speaker: null, text: '', clip: null, pause: 0, when: null, set: null, next: following, choices: [] }; }
    if (typeof l.text !== 'string' || l.text.trim() === '') problems.push(`${at}.text: a line says something`);
    if (l.speaker !== undefined && (typeof l.speaker !== 'string' || l.speaker === '')) problems.push(`${at}.speaker: the id of the node that says it`);
    if (l.clip !== undefined && typeof l.clip !== 'string') problems.push(`${at}.clip: a voice clip's path`);
    if (l.pause !== undefined && !(typeof l.pause === 'number' && l.pause >= 0 && Number.isFinite(l.pause))) problems.push(`${at}.pause: seconds, from 0`);
    if (l.choices !== undefined && (!Array.isArray(l.choices) || l.choices.length === 0)) problems.push(`${at}.choices: a list of at least one choice`);
    const seen = new Set();
    const choices = (Array.isArray(l.choices) ? l.choices : []).map((c, k) => {
      const cat = `${at}.choices[${k}]`;
      if (!isObject(c)) { problems.push(`${cat}: a choice is { text, to, … }`); return { id: String(k), text: '', when: null, set: null, to: following }; }
      if (typeof c.text !== 'string' || c.text.trim() === '') problems.push(`${cat}.text: a choice says something`);
      if (c.id !== undefined && (typeof c.id !== 'string' || !ID.test(c.id))) problems.push(`${cat}.id: an id is letters, digits, - and _`);
      const id = typeof c.id === 'string' ? c.id : String(k);
      if (seen.has(id)) problems.push(`${cat}.id: "${id}" is another of this line's choices too`);
      seen.add(id);
      return { id, text: String(c.text ?? ''), when: when(c.when, `${cat}.when`), set: flags(c.set, `${cat}.set`), to: target(c.to, `${cat}.to`, following) };
    });
    return {
      id: typeof l.id === 'string' ? l.id : null, speaker: typeof l.speaker === 'string' ? l.speaker : null, text: String(l.text ?? ''), clip: typeof l.clip === 'string' ? l.clip : null,
      pause: typeof l.pause === 'number' && l.pause >= 0 ? l.pause : 0, when: when(l.when, `${at}.when`), set: flags(l.set, `${at}.set`), next: target(l.next, `${at}.next`, following), choices,
    };
  });
  return { lines, problems };
}

/** What is wrong with a Dialogue node's props, as messages with the path of each (empty: it is fine). */
export function checkDialogue(props) { return readDialogue(props).problems; }

export class DialogueService {
  /** @param {any} tree */
  constructor(tree) {
    this.tree = tree;
    /**
     * The conversation going on, or null. `phase`: 'line' while a line is said, 'choice' while its choices wait for an
     * answer; `since`: the step the line started on; `duration`: its length in seconds; `offered`: the indices (in the
     * line's `choices`) of the choices on offer.
     * @type {null | { node: string, index: number, phase: 'line' | 'choice', since: number, duration: number, offered: number[] }}
     */
    this.active = null;
    /** Goes up whenever view() would change: a UI re-reads it when it does. */
    this.version = 0;
    this._scripts = new WeakMap(); // node → { lines: the props' list it was read from, script }
  }

  _script(node) {
    const c = this._scripts.get(node);
    if (c && c.from === node.props.lines) return c.script;
    const script = readDialogue(node.props);
    this._scripts.set(node, { from: node.props.lines, script });
    return script;
  }

  get game() { return this.tree.services.get('game') ?? null; }

  // ---------------------------------------------------------------- starting and stopping (a node's actions)

  /**
   * Start a conversation at its first line, or at the line `at` names. One conversation at a time: while another is
   * going on, nothing starts. → whether it started
   * @param {any} node a Dialogue node @param {{ at?: string }} [o]
   */
  start(node, { at } = {}) {
    if (this.active) return false;
    const { lines } = this._script(node);
    let index = 0;
    if (typeof at === 'string') { index = lines.findIndex((l) => l.id === at); if (index < 0) return false; }
    const a = this.active = { node: node.id, index: -1, phase: /** @type {'line' | 'choice'} */ ('line'), since: this.tree.clock.step, duration: 0, offered: [] };
    this.version++;
    node.emit('started', {});
    if (this.active === a) this._goto(node, index);
    return true;
  }

  /** End the conversation going on (of this node, when one is given) where it is. */
  stop(node) {
    const a = this.active;
    if (!a || (node && a.node !== node.id)) return;
    this._end(this.tree.find(a.node));
  }

  // ---------------------------------------------------------------- the step

  physicsProcess() {
    const a = this.active;
    if (!a) return;
    const node = this.tree.find(a.node), input = this.tree.services.get('input');
    if (!node) { this.active = null; this.version++; return; } // its node left the world
    const line = this._script(node).lines[a.index];
    if (!line) { this._end(node); return; }
    if (a.phase === 'line') {
      const skip = node.props.skippable !== false && input?.choice(ADVANCE) !== undefined;
      if (!skip && !((this.tree.clock.step - a.since) * DT > a.duration)) return;
      if (skip && line.speaker) this.tree.services.get('voice')?.hush(line.speaker);
      const view = this._conditions(line.choices);
      const offered = line.choices.map((c, k) => (c.when === null || holds(c.when, view) ? k : -1)).filter((k) => k >= 0);
      if (!offered.length) { this._goto(node, line.next); return; }
      a.phase = 'choice'; a.offered = offered;
      this.version++;
      node.emit('asked', { line: line.id, index: a.index, choices: offered.map((k) => line.choices[k].id) });
      return;
    }
    const picked = input?.choice(CHOOSE);
    if (picked === undefined) return;
    const k = a.offered.find((i) => line.choices[i].id === String(picked));
    if (k === undefined) return; // not one of the choices on offer: the question stands
    const c = line.choices[k];
    this._set(node, c.set);
    node.emit('chose', { line: line.id, index: a.index, choice: c.id, text: c.text });
    if (this.active === a) this._goto(node, c.to);
  }

  // The game state the conditions of these lines or choices read; read once, and only when one has a condition.
  _conditions(list) { return list.some((x) => x.when !== null) ? this.game?.view() ?? {} : {}; }

  _set(node, set) {
    if (!set) return;
    const game = this.game;
    if (!game) return;
    for (const [flag, value] of Object.entries(set)) {
      // an action never throws inside the step: a flag the game refuses is said as its `refused` event
      try { game.setFlag(flag, value); } catch (e) { game.refuse?.(node, 'set', String(e?.message ?? e)); }
    }
  }

  // Go to a line (−1: the end). A line whose condition doesn't hold is passed over, to the line after it.
  _goto(node, index) {
    const a = this.active, { lines } = this._script(node);
    let i = index;
    for (let n = 0; i >= 0 && i < lines.length; n++) {
      const l = lines[i];
      if (l.when === null || holds(l.when, this.game?.view() ?? {})) break;
      i = i + 1 < lines.length && n < lines.length ? i + 1 : -1;
    }
    if (!(i >= 0 && i < lines.length)) { this._end(node); return; }
    const line = lines[i], step = this.tree.clock.step;
    a.index = i; a.phase = 'line'; a.since = step; a.offered = [];
    a.duration = this._say(line) + line.pause;
    this.version++;
    this._set(node, line.set);
    if (this.active === a) node.emit('line', { line: line.id, index: i, speaker: line.speaker, text: line.text });
  }

  // The speaker says the line through the voice service, when there is one and the speaker is in the world. → seconds
  _say(line) {
    const voice = this.tree.services.get('voice'), actor = line.speaker ? this.tree.find(line.speaker) : null;
    if (voice && actor) {
      // a clip that wasn't prepared is said as its text: nothing here throws inside the step
      try { voice.say(actor, { text: line.text, ...(line.clip ? { clip: line.clip } : {}) }); } catch { voice.say(actor, { text: line.text }); }
      const said = voice.lines.get(actor.id);
      if (said) return said.duration;
    }
    const last = estimateWords(line.text).at(-1);
    return last ? last.start + last.duration + 0.2 : 0;
  }

  _end(node) {
    const a = this.active;
    this.active = null;
    this.version++;
    if (!a || !node) return;
    const line = this._script(node).lines[a.index] ?? null;
    if (line?.speaker && a.phase === 'line') this.tree.services.get('voice')?.hush(line.speaker);
    node.emit('ended', { line: line?.id ?? null, index: a.index });
  }

  // ---------------------------------------------------------------- what a UI reads

  /**
   * The conversation going on, as plain data, or null:
   *   { node, title, index, line, speaker, name, text, clip, phase, since, duration, skippable, choices: [{ id, text }] }
   * `name`: the speaker's name (null for a line nobody says); `choices` has entries only while phase is 'choice'.
   */
  view() {
    const a = this.active;
    if (!a) return null;
    const node = this.tree.find(a.node), line = node ? this._script(node).lines[a.index] : null;
    if (!line) return null;
    const speaker = line.speaker ? this.tree.find(line.speaker) : null;
    return {
      node: a.node, title: node.name ?? null, index: a.index, line: line.id, speaker: line.speaker, name: line.speaker ? speaker?.name ?? line.speaker : null,
      text: line.text, clip: line.clip, phase: a.phase, since: a.since, duration: a.duration, skippable: node.props.skippable !== false,
      choices: a.phase === 'choice' ? a.offered.map((k) => ({ id: line.choices[k].id, text: line.choices[k].text })) : [],
    };
  }

  // ---------------------------------------------------------------- snapshots

  getState() { return { active: this.active ? { ...this.active, offered: [...this.active.offered] } : null }; }
  setState(s) { this.active = s.active ? { ...s.active, offered: [...s.active.offered] } : null; this.version++; }
}

/** The Dialogue node: declares a conversation; its actions start and stop it. Without the service it is plain data. */
export class DialogueNode extends Node {
  /** @returns {DialogueService | null} */
  get dialogue() { return this.tree?.services.get('dialogue') ?? null; }
  // A conversation that can't be right (a `next` that names no line, a choice with no text) is refused when its node
  // enters the tree, with every problem named, and takes its node back out: a refused tree.add leaves nothing behind.
  enterTree() {
    if (!this.dialogue) return;
    const problems = checkDialogue(this.props);
    if (!problems.length) return;
    const tree = this.tree;
    if (tree?.byId.get(this.id) === this) tree.remove(this.id);
    throw new Error(`Dialogue "${this.id}": ${problems.join('; ')}`);
  }
  ready() { if (this.props.autostart) this.dialogue?.start(this); }
  exitTree() { this.dialogue?.stop(this); }
  start(args) { this.dialogue?.start(this, { at: typeof args?.at === 'string' ? args.at : undefined }); }
  stop() { this.dialogue?.stop(this); }
}

/**
 * Give a tree conversations: the Dialogue node's class and the "dialogue" service. Install after the services it
 * reads: input (the choice), voice (the lines are said through it; without it a line is only its caption) and game
 * (conditions and flags).
 * @param {any} tree a SceneTree @returns {DialogueService}
 */
export function installDialogue(tree) {
  tree.classes.set('Dialogue', DialogueNode);
  return tree.addService('dialogue', new DialogueService(tree));
}
