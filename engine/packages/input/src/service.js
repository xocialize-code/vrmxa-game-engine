// The input service ("input"): once per simulation step, before any node runs, it latches one action
// frame (from the devices, or from a recording being replayed) and, when recording, appends it. Game code
// reads the frame: the same values on every run of a replay, which is what makes input deterministic.
//
// A recording is plain JSON: the action names, the step it starts at, and per step the axis values and the
// down buttons. It is also the input cursor a world snapshot needs (W6).
import { ActionMap } from './actions.js';

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
    /** @type {null | { version: 1, start: number, axes: string[], buttons: string[], frames: Array<[number[], number]> }} */
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
      if (!f) { this.axes.fill(0); this.down.fill(0); if (i >= rec.frames.length) this.replaying = null; }
      else { for (let k = 0; k < this.axes.length; k++) this.axes[k] = f[0][k]; for (let k = 0; k < this.down.length; k++) this.down[k] = (f[1] >>> k) & 1; }
    } else {
      const state = { keys: new Set(), mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() }, gamepad: null };
      for (const d of this.devices) d.read(state);
      const { axes, buttons } = this.map.evaluate(state);
      for (let k = 0; k < axes.length; k++) this.axes[k] = axes[k];
      for (let k = 0; k < buttons.length; k++) this.down[k] = buttons[k] ? 1 : 0;
    }
    if (this.recording) {
      let bits = 0;
      for (let k = 0; k < this.down.length; k++) bits |= this.down[k] << k;
      this.recording.frames.push([Array.from(this.axes), bits >>> 0]);
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

  // ---------------------------------------------------------------- recording and replay
  /** Start recording from the next step (up to 32 buttons). */
  record() {
    if (this.map.buttons.length > 32) throw new Error('recording supports up to 32 button actions');
    this.recording = { version: 1, start: this.tree.clock.step, axes: [...this.map.axes], buttons: [...this.map.buttons], frames: [] };
  }
  /** Stop recording; returns the recording. */
  stop() { const r = this.recording; this.recording = null; return r; }
  /** Replay a recording: from its start step on, frames come from it instead of the devices. */
  replay(rec) {
    if (rec.version !== 1) throw new Error(`unknown recording version ${rec.version}`);
    if (rec.axes.join('|') !== this.map.axes.join('|') || rec.buttons.join('|') !== this.map.buttons.join('|')) throw new Error('the recording was made with a different action map');
    this.replaying = { rec, at: 0 };
  }
  get isReplaying() { return this.replaying !== null; }

  /** The input part of a world snapshot. */
  getState() { return { axes: Array.from(this.axes), down: Array.from(this.down), prev: Array.from(this.prev) }; }
  setState(s) { this.axes.set(s.axes); this.down.set(s.down); this.prev.set(s.prev); }
}
