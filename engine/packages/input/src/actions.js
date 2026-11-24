// The action map (vrmxg.json "input.actions"): named actions bound to keys, mouse and gamepads. Game code
// reads actions, never devices, so bindings can change (and be remapped by players) without touching it.
//
//   "input": { "actions": {
//     "move_x": { "type": "axis",   "bindings": [{ "key": "KeyD", "value": 1 }, { "key": "KeyA", "value": -1 },
//                                                { "gamepadAxis": 0, "deadzone": 0.15 }] },
//     "jump":   { "type": "button", "bindings": [{ "key": "Space" }, { "gamepadButton": 0 }] },
//     "look_x": { "type": "axis",   "bindings": [{ "mouse": "dx", "scale": 0.0025 }, { "gamepadAxis": 2, "scale": 0.05 }] } } }
//
// Axis value: the sum of its bindings, clamped to [-1, 1] unless a mouse binding contributes (deltas are
// unbounded). Gamepad axes go through a radial-free per-axis deadzone, rescaled so they start from 0.
// Button: down while any binding is down; `pressed` / `released` on the step it changes.

/**
 * The default map: WASD/arrows + mouse look, Space jump, Shift run, C next camera; a standard gamepad.
 * @type {Record<string, { type: 'axis' | 'button', bindings: any[] }>}
 */
export const DEFAULT_ACTIONS = {
  move_x: { type: 'axis', bindings: [{ key: 'KeyD', value: 1 }, { key: 'KeyA', value: -1 }, { key: 'ArrowRight', value: 1 }, { key: 'ArrowLeft', value: -1 }, { gamepadAxis: 0, deadzone: 0.15 }] },
  move_y: { type: 'axis', bindings: [{ key: 'KeyW', value: 1 }, { key: 'KeyS', value: -1 }, { key: 'ArrowUp', value: 1 }, { key: 'ArrowDown', value: -1 }, { gamepadAxis: 1, deadzone: 0.15, scale: -1 }] },
  look_x: { type: 'axis', bindings: [{ mouse: 'dx', scale: 0.0025 }, { gamepadAxis: 2, deadzone: 0.1, scale: 0.05 }] },
  look_y: { type: 'axis', bindings: [{ mouse: 'dy', scale: 0.0025 }, { gamepadAxis: 3, deadzone: 0.1, scale: 0.05 }] },
  zoom: { type: 'axis', bindings: [{ mouse: 'wheel', scale: 0.002 }] },
  jump: { type: 'button', bindings: [{ key: 'Space' }, { gamepadButton: 0 }] },
  run: { type: 'button', bindings: [{ key: 'ShiftLeft' }, { key: 'ShiftRight' }, { gamepadButton: 10 }] },
  interact: { type: 'button', bindings: [{ key: 'KeyE' }, { mouseButton: 0 }, { gamepadButton: 2 }] },
  camera_next: { type: 'button', bindings: [{ key: 'KeyC' }, { gamepadButton: 3 }] },
};

/** The action-name prefix of player n: '' for player 1 (the actions as named), 'p2.' for player 2 and so on (M3 W9). */
export const playerPrefix = (n = 1) => (n > 1 ? `p${n}.` : '');

/**
 * Two players on one keyboard and one gamepad (M3 W9, split screen): player 1 keeps the default names on the keyboard's
 * left and the mouse (WASD, Space, left Shift, E, C); player 2 is `p2.` on the arrows and the keys beside them (right
 * Shift runs, Enter interacts, right Ctrl jumps, Slash cycles the camera) and on the gamepad, whose right stick looks.
 * A world installs it only for two players: one-player recordings keep their action lists.
 * @returns {Record<string, { type: 'axis' | 'button', bindings: any[] }>}
 */
export function twoPlayerActions() {
  return {
    move_x: { type: 'axis', bindings: [{ key: 'KeyD', value: 1 }, { key: 'KeyA', value: -1 }] },
    move_y: { type: 'axis', bindings: [{ key: 'KeyW', value: 1 }, { key: 'KeyS', value: -1 }] },
    look_x: { type: 'axis', bindings: [{ mouse: 'dx', scale: 0.0025 }] },
    look_y: { type: 'axis', bindings: [{ mouse: 'dy', scale: 0.0025 }] },
    zoom: { type: 'axis', bindings: [{ mouse: 'wheel', scale: 0.002 }] },
    'p2.move_x': { type: 'axis', bindings: [{ key: 'ArrowRight', value: 1 }, { key: 'ArrowLeft', value: -1 }, { gamepadAxis: 0, deadzone: 0.15 }] },
    'p2.move_y': { type: 'axis', bindings: [{ key: 'ArrowUp', value: 1 }, { key: 'ArrowDown', value: -1 }, { gamepadAxis: 1, deadzone: 0.15, scale: -1 }] },
    'p2.look_x': { type: 'axis', bindings: [{ gamepadAxis: 2, deadzone: 0.1, scale: 0.05 }] },
    'p2.look_y': { type: 'axis', bindings: [{ gamepadAxis: 3, deadzone: 0.1, scale: 0.05 }] },
    jump: { type: 'button', bindings: [{ key: 'Space' }] },
    run: { type: 'button', bindings: [{ key: 'ShiftLeft' }] },
    interact: { type: 'button', bindings: [{ key: 'KeyE' }, { mouseButton: 0 }] },
    camera_next: { type: 'button', bindings: [{ key: 'KeyC' }] },
    'p2.jump': { type: 'button', bindings: [{ key: 'ControlRight' }, { gamepadButton: 0 }] },
    'p2.run': { type: 'button', bindings: [{ key: 'ShiftRight' }, { gamepadButton: 10 }] },
    'p2.interact': { type: 'button', bindings: [{ key: 'Enter' }, { key: 'NumpadEnter' }, { gamepadButton: 2 }] },
    'p2.camera_next': { type: 'button', bindings: [{ key: 'Slash' }, { gamepadButton: 3 }] },
  };
}

const deadzone = (v, dz = 0) => (Math.abs(v) <= dz ? 0 : (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz));

/** What a binding reads, by the one key that says so. */
export const BINDING_KINDS = ['key', 'mouse', 'mouseButton', 'gamepadAxis', 'gamepadButton'];
const MOUSE_AXES = ['dx', 'dy', 'wheel'];
const KINDS_OF = { axis: ['key', 'mouse', 'gamepadAxis', 'gamepadButton'], button: ['key', 'mouseButton', 'gamepadButton'] };
const isIndex = (v) => Number.isInteger(v) && v >= 0 && v < 64;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** A binding's kind (`key`, `mouse`, `mouseButton`, `gamepadAxis`, `gamepadButton`), or null when it names none or two. */
export function bindingKind(b) {
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return null;
  const kinds = BINDING_KINDS.filter((k) => b[k] !== undefined);
  return kinds.length === 1 ? kinds[0] : null;
}

/**
 * What is wrong with a binding for an action of this type, as a message, or null when it is fine. Rebinding checks
 * with it, so a stored setting that is damaged or from another version of the game is refused, never evaluated.
 * @param {'axis' | 'button'} type @param {any} b
 */
export function checkBinding(type, b) {
  const kind = bindingKind(b);
  if (!kind) return `a binding names one of ${BINDING_KINDS.join(', ')}`;
  if (!KINDS_OF[type]?.includes(kind)) return `${type === 'button' ? 'a button' : 'an axis'} can't be bound to ${kind}`;
  if (kind === 'key' && (typeof b.key !== 'string' || b.key === '')) return 'key is a KeyboardEvent.code ("KeyE")';
  if (kind === 'mouse' && !MOUSE_AXES.includes(b.mouse)) return `mouse is one of ${MOUSE_AXES.join(', ')}`;
  if ((kind === 'mouseButton' || kind === 'gamepadAxis' || kind === 'gamepadButton') && !isIndex(b[kind])) return `${kind} is a whole number from 0`;
  for (const k of ['value', 'scale', 'deadzone']) if (b[k] !== undefined && !isNumber(b[k])) return `${k} is a number`;
  if (b.deadzone !== undefined && !(b.deadzone >= 0 && b.deadzone < 1)) return 'deadzone is from 0 to below 1';
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class ActionMap {
  /** @param {Record<string, { type: 'axis' | 'button', bindings: any[] }>} [actions] the project's map: its own copy is taken */
  constructor(actions = DEFAULT_ACTIONS) {
    /** The map as the project gave it: what a reset goes back to, and what overrides() is measured against. */
    this.defaults = structuredClone(actions);
    this.actions = structuredClone(actions);
    this.names = Object.keys(actions);
    this.axes = this.names.filter((n) => actions[n].type === 'axis');
    this.buttons = this.names.filter((n) => actions[n].type === 'button');
    /** Goes up whenever a binding changes (a settings list re-reads the map when it does). */
    this.version = 0;
  }

  // ---------------------------------------------------------------- rebinding (M5 W3)
  // The actions, their types and their order never change: only what each is bound to. So a recording, which names
  // actions and holds their values, replays the same whatever the bindings were when it was made or are now.

  /** An action's bindings now, as plain data (a copy). */
  bindingsOf(name) {
    if (!Object.hasOwn(this.actions, name)) throw new Error(`no action "${name}" (${this.names.join(', ')})`);
    return structuredClone(this.actions[name].bindings);
  }

  /**
   * Bind an action to something else: `bindings` replaces all of its bindings. The next evaluate() uses them.
   * @param {string} name @param {any[]} bindings
   */
  rebind(name, bindings) {
    if (!Object.hasOwn(this.actions, name)) throw new Error(`no action "${name}" (${this.names.join(', ')})`);
    if (!Array.isArray(bindings)) throw new Error(`rebind("${name}") takes the action's bindings as a list`);
    const type = this.actions[name].type;
    bindings.forEach((b, i) => { const why = checkBinding(type, b); if (why) throw new Error(`"${name}" binding ${i}: ${why}`); });
    this.actions[name] = { ...this.actions[name], bindings: structuredClone(bindings) };
    this.version++;
  }

  /** Put one action's bindings back as the project has them, or every action's. */
  reset(name) {
    if (name !== undefined && !Object.hasOwn(this.actions, name)) throw new Error(`no action "${name}" (${this.names.join(', ')})`);
    for (const n of name === undefined ? this.names : [name]) this.actions[n] = structuredClone(this.defaults[n]);
    this.version++;
  }

  /** What differs from the project's map: { action: bindings }, for a settings store. Empty when nothing was rebound. */
  overrides() {
    const out = {};
    for (const n of this.names) if (!same(this.actions[n].bindings, this.defaults[n].bindings)) out[n] = structuredClone(this.actions[n].bindings);
    return out;
  }

  /**
   * Make the map the project's with these overrides (as overrides() gave them, perhaps in another session or another
   * version of the game). An action this map doesn't have, or bindings that aren't valid for it, are left out and
   * listed: stored settings never stop a game starting.
   * @param {Record<string, any[]> | null | undefined} overrides
   * @returns {{ applied: string[], ignored: { action: string, reason: string }[] }}
   */
  applyOverrides(overrides) {
    const applied = [], ignored = [];
    for (const n of this.names) this.actions[n] = structuredClone(this.defaults[n]);
    const o = overrides !== null && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    for (const name of Object.keys(o)) {
      if (!Object.hasOwn(this.actions, name)) { ignored.push({ action: name, reason: 'this game has no such action' }); continue; }
      try { this.rebind(name, o[name]); applied.push(name); } catch (e) { ignored.push({ action: name, reason: String(e?.message ?? e) }); }
    }
    this.version++;
    return { applied, ignored };
  }

  /**
   * One step's values from the devices' current state.
   * @param {{ keys: Set<string>, mouse: { dx: number, dy: number, wheel: number, buttons: Set<number> }, gamepad: { axes: number[], buttons: number[] } | null }} state
   * @returns {{ axes: number[], buttons: boolean[] }} in the order of this.axes / this.buttons
   */
  evaluate(state) {
    const axes = this.axes.map((name) => {
      let v = 0, unbounded = false;
      for (const b of this.actions[name].bindings) {
        if (b.key !== undefined) { if (state.keys.has(b.key)) v += b.value ?? 1; }
        else if (b.mouse !== undefined) { v += (state.mouse[b.mouse] ?? 0) * (b.scale ?? 1); unbounded = true; }
        else if (b.gamepadAxis !== undefined && state.gamepad) v += deadzone(state.gamepad.axes[b.gamepadAxis] ?? 0, b.deadzone) * (b.scale ?? 1);
        else if (b.gamepadButton !== undefined && state.gamepad) v += (state.gamepad.buttons[b.gamepadButton] ?? 0) * (b.value ?? 1);
      }
      return unbounded ? v : Math.max(-1, Math.min(1, v));
    });
    const buttons = this.buttons.map((name) => this.actions[name].bindings.some((b) =>
      (b.key !== undefined && state.keys.has(b.key)) ||
      (b.mouseButton !== undefined && state.mouse.buttons.has(b.mouseButton)) ||
      (b.gamepadButton !== undefined && !!state.gamepad && (state.gamepad.buttons[b.gamepadButton] ?? 0) > 0.5)));
    return { axes, buttons };
  }
}
