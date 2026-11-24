// Menus from a gamepad and the keyboard (M5 W1), and the input the game sees after a menu closes. Plain functions and
// small classes, so they are tested in Node; the DOM side (which element is focused) is in menus.js.
//
// A menu is DOM: real buttons, focus, accessible names. The keyboard needs nothing more than the browser gives (Tab,
// the arrows through menus.js, Enter and Space on a button). A gamepad has no browser support for that, so the app
// polls it once a frame and turns its buttons into the same commands: the d-pad and the left stick move, A confirms,
// B goes back, Start pauses. A held direction repeats, timed by the frame's own clock (passed in, never read here).
//
// The game's own input (@vrmxg/input) reads the same keyboard and gamepad. When a menu closes, the key or button that
// closed it may still be down: Space on Resume is the sample's jump, and A on a gamepad too. HeldGate hides whatever
// was held when the game took over again until it is let go, so a menu's button never reaches the simulation.

/** The standard mapping's buttons the menus use. */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const STICK = 0.5; // how far the left stick goes before it counts as a direction

/** Directions a pad's state points in now: the d-pad, or the left stick past half-way. */
export function padDirections(pad) {
  if (!pad) return new Set();
  const b = (i) => (pad.buttons[i] ?? 0) > 0.5, x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0, out = new Set();
  if (b(PAD.UP) || y < -STICK) out.add('up');
  if (b(PAD.DOWN) || y > STICK) out.add('down');
  if (b(PAD.LEFT) || x < -STICK) out.add('left');
  if (b(PAD.RIGHT) || x > STICK) out.add('right');
  return out;
}

/**
 * Turns a gamepad's state, read once a frame, into menu commands: 'up', 'down', 'left', 'right' (pressed, then
 * repeated while held), 'confirm' (A), 'back' (B), 'start' (Start). Only a change counts: a button already down when
 * the poller first sees the pad does nothing until it is let go and pressed again.
 */
export class PadNavigator {
  /** @param {{ delay?: number, every?: number }} [o] repeat: after `delay` seconds held, every `every` seconds */
  constructor({ delay = 0.4, every = 0.12 } = {}) {
    this.delay = delay; this.every = every;
    this.prev = null; // the buttons and directions last seen; null: nothing seen yet
    /** @type {Map<string, number>} direction → when it repeats next */ this.next = new Map();
  }

  /**
   * @param {{ axes: number[], buttons: number[] } | null} pad the pad's state (GamepadDevice.read's), or null for none
   * @param {number} now seconds, from the frame loop's clock
   * @returns {string[]} commands, in a fixed order
   */
  poll(pad, now) {
    const dirs = padDirections(pad), down = (i) => !!pad && (pad.buttons[i] ?? 0) > 0.5;
    const buttons = { confirm: down(PAD.A), back: down(PAD.B), start: down(PAD.START) };
    const first = this.prev === null;
    const was = this.prev ?? { dirs, buttons };
    this.prev = { dirs, buttons };
    const out = [];
    for (const d of ['up', 'down', 'left', 'right']) {
      if (!dirs.has(d)) { this.next.delete(d); continue; }
      if (first) { this.next.set(d, Infinity); continue; } // held when first seen: let go first
      if (!was.dirs.has(d)) { out.push(d); this.next.set(d, now + this.delay); continue; }
      const at = this.next.get(d) ?? Infinity;
      if (now >= at) { out.push(d); this.next.set(d, at + this.every > now ? at + this.every : now + this.every); } // after a stalled frame, once
    }
    for (const k of ['confirm', 'back', 'start']) if (buttons[k] && !was.buttons[k] && !first) out.push(k);
    return out;
  }
}

/** What a key does in a menu: the arrows move, Escape goes back; Enter and Space are the buttons' own. */
export function keyCommand(e) {
  switch (e.key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'Escape': return 'back';
    case 'Home': return 'first';
    case 'End': return 'last';
    default: return null;
  }
}

/** The index focus moves to among `n` items from `i`: wraps round, and starts at an end when nothing has focus. */
export function nextIndex(i, n, step) {
  if (n <= 0) return -1;
  if (i < 0 || i >= n) return step > 0 ? 0 : n - 1;
  return (((i + step) % n) + n) % n;
}

/**
 * Hides from the game the keys and buttons that were held when it took over from a menu, until each is let go.
 * Wraps one of @vrmxg/input's devices (anything with `read(out)`); the input service reads the gate in its place.
 */
export class HeldGate {
  /** @param {{ read: (out: any) => void }} device */
  constructor(device) {
    this.device = device;
    /** @type {Set<string>} */ this.keys = new Set();
    /** @type {Set<number>} */ this.mouse = new Set();
    /** @type {Set<number>} */ this.buttons = new Set();
    /** A stick was tilted when the game took over: the pad's axes read 0 until every one is back near the middle. */
    this.sticks = false;
    this._arm = false;
  }

  /** The game takes over now: whatever is down at the next read stays hidden until it comes up. */
  arm() { this._arm = true; }

  read(out) {
    this.device.read(out);
    if (this._arm) {
      this._arm = false;
      this.keys = new Set(out.keys ?? []);
      this.mouse = new Set(out.mouse?.buttons ?? []);
      this.buttons = new Set((out.gamepad?.buttons ?? []).flatMap((v, i) => (v > 0.5 ? [i] : [])));
      this.sticks = (out.gamepad?.axes ?? []).some((v) => Math.abs(v) > 0.5); // a stick moves through menus too
    }
    if (this.sticks) {
      if (!out.gamepad || out.gamepad.axes.every((v) => Math.abs(v) < 0.25)) this.sticks = false;
      else out.gamepad = { ...out.gamepad, axes: out.gamepad.axes.map(() => 0) };
    }
    if (this.keys.size && out.keys) {
      for (const k of [...this.keys]) if (!out.keys.has(k)) this.keys.delete(k);
      out.keys = new Set([...out.keys].filter((k) => !this.keys.has(k)));
    }
    if (this.mouse.size && out.mouse?.buttons) {
      for (const b of [...this.mouse]) if (!out.mouse.buttons.has(b)) this.mouse.delete(b);
      out.mouse = { ...out.mouse, buttons: new Set([...out.mouse.buttons].filter((b) => !this.mouse.has(b))) };
    }
    if (this.buttons.size && out.gamepad) {
      for (const b of [...this.buttons]) if (!((out.gamepad.buttons[b] ?? 0) > 0.5)) this.buttons.delete(b);
      out.gamepad = { ...out.gamepad, buttons: out.gamepad.buttons.map((v, i) => (this.buttons.has(i) ? 0 : v)) };
    } else if (out.gamepad === null || out.gamepad === undefined) this.buttons.clear();
  }
}
