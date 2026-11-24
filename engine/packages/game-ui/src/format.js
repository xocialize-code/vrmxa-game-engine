// What the overlays print: a binding as a key cap, a timer as a clock. Plain functions over plain data.

const KEYS = {
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Backspace: 'Backspace', Tab: 'Tab',
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Option', AltRight: 'Right Option',
  MetaLeft: 'Left Command', MetaRight: 'Right Command', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Slash: '/', Backslash: '\\', Comma: ',', Period: '.', Semicolon: ';', Quote: '\'', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`',
};
/** A standard-mapping gamepad's buttons (the Gamepad API's order). */
export const GAMEPAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'Left stick press', 'Right stick press', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
const GAMEPAD_AXES = ['Left stick X', 'Left stick Y', 'Right stick X', 'Right stick Y'];
const MOUSE = { dx: 'Mouse X', dy: 'Mouse Y', wheel: 'Mouse wheel' };
const MOUSE_BUTTONS = ['Left click', 'Middle click', 'Right click', 'Back button', 'Forward button'];

/** A KeyboardEvent.code as a key cap: "KeyE" → "E", "Digit1" → "1", "ShiftLeft" → "Left Shift". */
export function keyName(code) {
  if (typeof code !== 'string') return '?';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^F[0-9]{1,2}$/.test(code)) return code;
  return KEYS[code] ?? code;
}

/** One binding as text a player reads: "E", "Gamepad A", "Left click", "Left stick X". */
export function describeBinding(b) {
  if (!b || typeof b !== 'object') return '?';
  if (b.key !== undefined) return keyName(b.key);
  if (b.mouse !== undefined) return MOUSE[b.mouse] ?? `Mouse ${b.mouse}`;
  if (b.mouseButton !== undefined) return MOUSE_BUTTONS[b.mouseButton] ?? `Mouse button ${b.mouseButton}`;
  if (b.gamepadButton !== undefined) return `Gamepad ${GAMEPAD_BUTTONS[b.gamepadButton] ?? `button ${b.gamepadButton}`}`;
  if (b.gamepadAxis !== undefined) return GAMEPAD_AXES[b.gamepadAxis] ?? `Gamepad axis ${b.gamepadAxis}`;
  return '?';
}

/** Whole steps as m:ss (60 steps a second). */
export function clock(steps) {
  const s = Math.max(0, Math.trunc(steps / 60)), m = Math.trunc(s / 60), r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/**
 * A timer of the game's view as the HUD shows it: a countdown by what is left (rounded up, so it reads 0:00 only when
 * it is out), a stopwatch by what has gone. From `limit`, never from `left` alone (a stopwatch's `left` is null).
 * @param {{ limit: boolean, leftSteps: number | null, elapsedSteps: number }} t
 */
export function timerText(t) {
  if (t.limit) return clock(Math.trunc(((t.leftSteps ?? 0) + 59) / 60) * 60);
  return clock(t.elapsedSteps ?? 0);
}

/** A countdown with ten seconds or less to go (the HUD marks it). */
export const isUrgent = (t) => !!t.limit && !t.done && (t.leftSteps ?? 0) <= 600;
