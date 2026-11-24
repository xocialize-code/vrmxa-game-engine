// Moving through an overlay from the keyboard and a gamepad (M5 W3), driven by input actions: the UI's own action map
// (UI_ACTIONS), read through @vrmxg/input's ActionMap. Presentation only: it moves DOM focus and clicks controls, and a
// control that changes the game does so as a recorded input. The keyboard arrives as key events (a focused button's
// Enter and Space are the browser's own click, so they aren't handled twice); the gamepad is polled once a frame from
// input.peek(), which reads the devices without taking anything from the step.
import { ActionMap } from '@vrmxg/input';

/**
 * The UI's actions. Up, down, left and right move between controls (left and right change a slider); accept clicks; back leaves.
 * @type {Record<string, { type: 'axis' | 'button', bindings: any[] }>}
 */
export const UI_ACTIONS = {
  ui_up: { type: 'button', bindings: [{ key: 'ArrowUp' }, { key: 'KeyW' }, { gamepadButton: 12 }] },
  ui_down: { type: 'button', bindings: [{ key: 'ArrowDown' }, { key: 'KeyS' }, { gamepadButton: 13 }] },
  ui_left: { type: 'button', bindings: [{ key: 'ArrowLeft' }, { key: 'KeyA' }, { gamepadButton: 14 }] },
  ui_right: { type: 'button', bindings: [{ key: 'ArrowRight' }, { key: 'KeyD' }, { gamepadButton: 15 }] },
  ui_accept: { type: 'button', bindings: [{ key: 'Enter' }, { key: 'NumpadEnter' }, { key: 'Space' }, { gamepadButton: 0 }] },
  ui_back: { type: 'button', bindings: [{ key: 'Escape' }, { key: 'Backspace' }, { gamepadButton: 1 }] },
  ui_stick_x: { type: 'axis', bindings: [{ gamepadAxis: 0, deadzone: 0.5 }] },
  ui_stick_y: { type: 'axis', bindings: [{ gamepadAxis: 1, deadzone: 0.5, scale: -1 }] },
};
const DIRS = ['ui_up', 'ui_down', 'ui_left', 'ui_right'];
const NO_KEYS = { keys: new Set(), mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() } };

/** The UI action a key does, or null. @param {ActionMap} map @param {string} code KeyboardEvent.code */
export function keyAction(map, code) {
  for (const name of map.buttons) if (map.actions[name].bindings.some((b) => b.key === code)) return name;
  return null;
}

/**
 * Gamepad edges, once a frame: an action fires on the frame its button (or the left stick, past half way) goes down,
 * and a held direction repeats, after `delay` frames, every `every` frames. Counted in frames: presentation, no clock.
 */
export class NavPad {
  constructor({ actions = UI_ACTIONS, delay = 24, every = 6 } = {}) {
    this.map = new ActionMap(actions);
    this.delay = delay; this.every = every;
    /** frames each action has been held */ this.held = new Map();
  }

  /** @param {{ gamepad: { axes: number[], buttons: number[] } | null }} state input.peek() @returns {string[]} the actions this frame */
  update(state) {
    const { axes, buttons } = this.map.evaluate({ ...NO_KEYS, gamepad: state?.gamepad ?? null }); // the keyboard comes as events
    const down = new Set(this.map.buttons.filter((_, i) => buttons[i]));
    const sx = axes[this.map.axes.indexOf('ui_stick_x')] ?? 0, sy = axes[this.map.axes.indexOf('ui_stick_y')] ?? 0;
    if (sy > 0) down.add('ui_up'); if (sy < 0) down.add('ui_down');
    if (sx > 0) down.add('ui_right'); if (sx < 0) down.add('ui_left');
    const fired = [];
    for (const name of [...DIRS, 'ui_accept', 'ui_back']) {
      if (!down.has(name)) { this.held.delete(name); continue; }
      const n = (this.held.get(name) ?? 0) + 1;
      this.held.set(name, n);
      if (n === 1 || (DIRS.includes(name) && n > this.delay && (n - this.delay) % this.every === 0)) fired.push(name);
    }
    return fired;
  }

  reset() { this.held.clear(); }
}

/**
 * What a UI action does to an overlay's controls (in DOM order).
 * @param {string} action @param {{ count: number, index: number, kind?: 'button' | 'range' | 'other' | null }} at
 *   count: how many controls; index: the focused one's (−1: none); kind: what it is
 * @returns {{ focus: number } | { step: number } | { click: true } | { back: true } | null}
 */
export function navTarget(action, { count, index, kind = null }) {
  if (action === 'ui_back') return { back: true };
  if (count <= 0) return null;
  if (action === 'ui_accept') return index >= 0 && kind !== 'range' ? { click: true } : index < 0 ? { focus: 0 } : null;
  if ((action === 'ui_left' || action === 'ui_right') && kind === 'range' && index >= 0) return { step: action === 'ui_right' ? 1 : -1 };
  if (index < 0) return { focus: action === 'ui_up' || action === 'ui_left' ? count - 1 : 0 };
  const d = action === 'ui_up' || action === 'ui_left' ? -1 : action === 'ui_down' || action === 'ui_right' ? 1 : 0;
  if (!d) return null;
  return { focus: (index + d + count) % count };
}

/** The keys that activate a focused control (Enter on its press, Space on its release). */
export const ACTIVATION_KEYS = ['Enter', 'NumpadEnter', 'Space'];

/**
 * A key held never activates something new (M5 W3 review): a repeat of Enter or Space is no activation, and a keyboard
 * activation reaches only the control the key went down on. So Enter held after Continue can't pick the first choice
 * when it appears under it, and Space pressed on Continue and let go on a choice doesn't pick it. A click with no
 * activation key down (the mouse, a gamepad's A, a script) is never stopped. Plain logic; use-nav wires it to the page.
 */
export class ActivationGuard {
  /** @param {{ later?: (fn: () => void) => void }} [o] later: runs fn after the current event's default action (setTimeout) */
  constructor({ later = (fn) => setTimeout(fn, 0) } = {}) { this.later = later; /** code → the element it went down on */ this.down = new Map(); }
  /** A key went down on `target`. → true when the event must be stopped (a repeat of an activation key) */
  keydown(code, repeat, target) {
    if (!ACTIVATION_KEYS.includes(code)) return false;
    if (repeat) return true;
    this.down.set(code, target);
    return false;
  }
  /** A key came up: forgotten once this event's default action (Space's click) has run. */
  keyup(code) {
    if (!this.down.has(code)) return;
    const was = this.down.get(code);
    this.later(() => { if (this.down.get(code) === was) this.down.delete(code); });
  }
  /** A click on `target`. → true when it must be stopped: an activation key is down that went down somewhere else */
  click(target) {
    for (const el of this.down.values()) if (el !== target) return true;
    return false;
  }
  /** Focus left the page: nothing is held any more. */
  clear() { this.down.clear(); }
}
