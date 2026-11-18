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

const deadzone = (v, dz = 0) => (Math.abs(v) <= dz ? 0 : (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz));

export class ActionMap {
  /** @param {Record<string, { type: 'axis' | 'button', bindings: any[] }>} [actions] */
  constructor(actions = DEFAULT_ACTIONS) {
    this.actions = actions;
    this.names = Object.keys(actions);
    this.axes = this.names.filter((n) => actions[n].type === 'axis');
    this.buttons = this.names.filter((n) => actions[n].type === 'button');
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
