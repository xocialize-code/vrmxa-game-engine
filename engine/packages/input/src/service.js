// The input service ("input"): once per simulation step, before any node runs, it latches one action
// frame (from the devices, or from a recording being replayed) and, when recording, appends it. Game code
// reads the frame: the same values on every run of a replay, which is what makes input deterministic.
//
// A recording is plain JSON: the action names, the step it starts at, and per step the axis values and the
// down buttons. It is also the input cursor a world snapshot needs (W6).
//
// Choices (M5 W3). What a player picks in a menu or a conversation is input too, and it has no button: a click on the
// third answer, a gamepad's accept on the focused one and a screen reader's activation are the same choice. The UI
// hands it over with choose(name, value) at any time; the next step latches it with the frame, game code reads it with
// choice(name) on that step only, and a recording carries it in that step's frame. So the simulation never hears from
// the UI directly, and a replay makes the same choice on the same step.
//
// Rebinding (M5 W3). rebind() changes what an action is bound to; the next step's frame uses it. Bindings are the
// player's settings, not simulation state: they aren't in the snapshot, and a recording names actions, not keys, so
// it replays the same whatever the bindings were or are.
import { ActionMap } from './actions.js';

/** @param {[string, any]} x @param {[string, any]} y */
const byName = (x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);

export class InputService {
  /**
   * @param {import('@vrmxg/core').SceneTree} tree
   * @param {{ actions?: Record<string, any> }} [config] vrmxg.json "input"
   */
  constructor(tree, config = {}) {
    this.tree = tree;
    this.map = new ActionMap(config.actions);
    this.devices = [];
    this.axes = new Float64Array(this.map.axes.length);
    this.down = new Uint8Array(this.map.buttons.length);
    this.prev = new Uint8Array(this.map.buttons.length);
    /** The choices latched with this step's frame: name → value. @type {Map<string, string | number | boolean>} */
    this.choices = new Map();
    /** Choices handed over since the last step: the next step latches them. @type {Map<string, string | number | boolean>} */
    this._queued = new Map();
    /**
     * Who holds the devices now (hold / release). While anyone does, the devices give nothing to the actions (an overlay
     * has the keyboard and the gamepad: a conversation's answers, the app's menu). Choices still pass. A button held when
     * the last claim goes stays up until it is let go, so the press that picked an answer isn't also a jump (an axis, a
     * held direction, reads again at once). Each holder has its own claim, so neither lets go of the other's. It gates
     * the live devices only: what is latched is recorded, and a replay never looks at it.
     * @type {Set<any>}
     */
    this.holders = new Set();
    this._held = new Uint8Array(this.map.buttons.length);
    /** @type {null | { version: 1 | 2, start: number, axes: string[], buttons: string[], frames: Array<[number[], number] | [number[], number, Record<string, string | number | boolean>]> }} */
    this.recording = null;
    /** @type {null | { rec: any, at: number }} */
    this.replaying = null;
    this._axisIndex = new Map(this.map.axes.map((n, i) => [n, i]));
    this._buttonIndex = new Map(this.map.buttons.map((n, i) => [n, i]));
  }

  addDevice(d) { this.devices.push(d); return d; }

  // Step phase 1 (services run first): latch this step's frame.
  physicsProcess() {
    this.prev.set(this.down);
    if (this.replaying) {
      const { rec } = this.replaying;
      const i = this.tree.clock.step - rec.start;
      const f = rec.frames[i];
      if (!f) { this.axes.fill(0); this.down.fill(0); this.choices = new Map(); if (i >= rec.frames.length) this.replaying = null; }
      else {
        for (let k = 0; k < this.axes.length; k++) this.axes[k] = f[0][k];
        for (let k = 0; k < this.down.length; k++) this.down[k] = (f[1] >>> k) & 1;
        this.choices = new Map(Object.entries(f[2] ?? {}));
      }
      this._queued.clear(); // a replay is the only input: what a UI handed over meanwhile isn't part of it
    } else {
      const state = { keys: new Set(), mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() }, gamepad: null };
      for (const d of this.devices) d.read(state);
      const { axes, buttons } = this.map.evaluate(state);
      for (let k = 0; k < axes.length; k++) this.axes[k] = this.muted ? 0 : axes[k]; // an axis reads again as soon as it ends
      for (let k = 0; k < buttons.length; k++) {
        const raw = buttons[k] ? 1 : 0;
        if (this.muted) { this._held[k] = raw; this.down[k] = 0; }
        else if (this._held[k]) { this._held[k] = raw; this.down[k] = 0; } // held since an overlay had it: up until let go
        else this.down[k] = raw;
      }
      this.choices = new Map([...this._queued].sort(byName)); // by name: a frame reads the same however it was filled
      this._queued = new Map();
    }
    if (this.recording) {
      let bits = 0;
      for (let k = 0; k < this.down.length; k++) bits |= this.down[k] << k;
      if (this.choices.size) { this.recording.version = 2; this.recording.frames.push([Array.from(this.axes), bits >>> 0, Object.fromEntries(this.choices)]); }
      else this.recording.frames.push([Array.from(this.axes), bits >>> 0]);
    }
  }

  // ---------------------------------------------------------------- reading actions (game code)
  /** Axis value this step. */
  axis(name) { const i = this._axisIndex.get(name); return i === undefined ? 0 : this.axes[i]; }
  /** Button held this step. */
  isDown(name) { const i = this._buttonIndex.get(name); return i !== undefined && this.down[i] === 1; }
  /** Button went down this step. */
  pressed(name) { const i = this._buttonIndex.get(name); return i !== undefined && this.down[i] === 1 && this.prev[i] === 0; }
  /** Button went up this step. */
  released(name) { const i = this._buttonIndex.get(name); return i !== undefined && this.down[i] === 0 && this.prev[i] === 1; }
  /** What was chosen under this name, latched with this step's frame; undefined when nothing was (the usual step). */
  choice(name) { return this.choices.get(name); }

  // ---------------------------------------------------------------- choices (a UI, between steps)
  /**
   * Hand a choice to the simulation: the next step latches it, for that step only, and a recording keeps it. A later
   * choice under the same name before that step replaces the earlier one. While a recording replays, nothing is taken
   * (the recording is the input). → whether it was taken
   * @param {string} name what was chosen from ("dialogue.choose", "menu") @param {string | number | boolean} [value]
   */
  choose(name, value = true) {
    if (typeof name !== 'string' || name === '' || name === '__proto__') throw new Error('choose(name, value) needs a name');
    if (!(typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) throw new Error(`choose("${name}") takes a string, a number or a boolean: a recording keeps it as JSON`);
    if (this.replaying) return false;
    this._queued.set(name, value);
    return true;
  }

  // ---------------------------------------------------------------- holding the devices (overlays, menus)
  /** Take the devices from the game for `owner` (any value: the overlay, 'pause-menu'). Idempotent. */
  hold(owner) { this.holders.add(owner); }
  /** Give back `owner`'s claim; the game has the devices again once nobody holds them. */
  release(owner) { this.holders.delete(owner); }
  /** Whether anyone holds the devices. */
  get muted() { return this.holders.size > 0; }
  /** The one-owner form: `muted = true` holds for the owner 'muted', `false` releases that claim (and only that one). */
  set muted(on) { if (on) this.hold('muted'); else this.release('muted'); }

  // ---------------------------------------------------------------- the devices outside the step (a UI)
  /**
   * What the devices hold now, without taking it from the step: { keys, mouse: { buttons }, gamepad }. For menus and
   * a settings list waiting for a key; never for game code, which reads the latched frame.
   */
  peek() {
    const state = { keys: new Set(), mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() }, gamepad: null };
    for (const d of this.devices) d.peek?.(state);
    return state;
  }

  // ---------------------------------------------------------------- rebinding (the player's settings)
  /** Every action with its bindings now, as plain data: { name: { type, bindings } }. */
  bindings() { return structuredClone(this.map.actions); }
  /** Bind an action to something else (all of its bindings): the next step's frame uses it. */
  rebind(action, bindings) { this.map.rebind(action, bindings); }
  /** One action's bindings back as the project has them, or every action's. */
  resetBindings(action) { this.map.reset(action); }
  /** What differs from the project's map, for a settings store: { action: bindings }. */
  overrides() { return this.map.overrides(); }
  /** The project's map with these overrides; what doesn't fit this game is left out and listed. */
  applyOverrides(overrides) { return this.map.applyOverrides(overrides); }

  // ---------------------------------------------------------------- recording and replay
  /** Start recording from the next step (up to 32 buttons). */
  record() {
    if (this.map.buttons.length > 32) throw new Error('recording supports up to 32 button actions');
    this.recording = { version: 1, start: this.tree.clock.step, axes: [...this.map.axes], buttons: [...this.map.buttons], frames: [] };
  }
  /** Stop recording; returns the recording (version 2 when a frame carries a choice, which a version 1 reader would drop). */
  stop() { const r = this.recording; this.recording = null; return r; }
  /** Replay a recording: from its start step on, frames come from it instead of the devices. */
  replay(rec) {
    if (rec.version !== 1 && rec.version !== 2) throw new Error(`unknown recording version ${rec.version}`);
    if (rec.axes.join('|') !== this.map.axes.join('|') || rec.buttons.join('|') !== this.map.buttons.join('|')) throw new Error('the recording was made with a different action map');
    this.replaying = { rec, at: 0 };
  }
  get isReplaying() { return this.replaying !== null; }

  /**
   * A scene change (@vrmxg/game's GameFlow, M5 W2): the next world's input service takes over where this one is. The
   * latched frame goes with it (a button held across the change isn't pressed again), and so do a recording in
   * progress and a replay: both count frames from the session's step, which carries on. So do the player's bindings,
   * a choice handed over and not yet latched, and who holds the devices (M5 W3).
   * @param {InputService} next
   */
  carryTo(next) {
    next.setState(this.getState());
    next.recording = this.recording; this.recording = null;
    next.replaying = this.replaying;
    next.map.applyOverrides(this.map.overrides());
    next._queued = this._queued; this._queued = new Map();
    next.holders = new Set(this.holders);
    if (next._held.length === this._held.length) next._held.set(this._held);
  }

  /** The input part of a world snapshot. `choices` is there only on a step that latched one. */
  getState() {
    return { axes: Array.from(this.axes), down: Array.from(this.down), prev: Array.from(this.prev), ...(this.choices.size ? { choices: Object.fromEntries(this.choices) } : {}) };
  }
  setState(s) { this.axes.set(s.axes); this.down.set(s.down); this.prev.set(s.prev); this.choices = new Map(Object.entries(s.choices ?? {})); }
}
