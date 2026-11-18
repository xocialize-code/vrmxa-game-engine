// Input devices. They only collect state from the browser (events, the Gamepad API); the input service
// reads them once per simulation step, and from then on everything is recorded data. Nothing here reads
// a clock. A VirtualDevice stands in for all three in tests and tools.

/** Keys held, by KeyboardEvent.code. */
export class KeyboardDevice {
  constructor() { this.keys = new Set(); this._on = []; }
  /** @param {EventTarget} target window or the canvas */
  attach(target) {
    const down = (e) => { this.keys.add(e.code); };
    const up = (e) => { this.keys.delete(e.code); };
    const blur = () => this.keys.clear(); // focus lost: release everything, nothing sticks
    target.addEventListener('keydown', down); target.addEventListener('keyup', up); target.addEventListener('blur', blur);
    this._on.push(() => { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); });
    return this;
  }
  detach() { for (const off of this._on.splice(0)) off(); this.keys.clear(); }
  read(out) { out.keys = new Set(this.keys); }
}

/** Mouse movement deltas (accumulated between steps), wheel, buttons, and pointer lock. */
export class MouseDevice {
  constructor() { this.dx = 0; this.dy = 0; this.wheel = 0; this.buttons = new Set(); this._on = []; this.element = null; }
  /** @param {HTMLElement} element the canvas (pointer lock is requested on it) */
  attach(element) {
    this.element = element;
    const move = (e) => { this.dx += e.movementX ?? 0; this.dy += e.movementY ?? 0; };
    const down = (e) => { this.buttons.add(e.button); };
    const up = (e) => { this.buttons.delete(e.button); };
    const wheel = (e) => { this.wheel += e.deltaY; };
    element.addEventListener('pointermove', move); element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up); element.addEventListener('wheel', wheel, { passive: true });
    this._on.push(() => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerdown', down); element.removeEventListener('pointerup', up); element.removeEventListener('wheel', wheel); });
    return this;
  }
  detach() { for (const off of this._on.splice(0)) off(); }
  /** Ask for pointer lock (must be called from a user gesture, such as a click). */
  lock() { return this.element?.requestPointerLock?.(); }
  unlock() { if (typeof document !== 'undefined' && document.pointerLockElement === this.element) document.exitPointerLock(); }
  get locked() { return typeof document !== 'undefined' && document.pointerLockElement === this.element && !!this.element; }
  read(out) {
    out.mouse = { dx: this.dx, dy: this.dy, wheel: this.wheel, buttons: new Set(this.buttons) };
    this.dx = 0; this.dy = 0; this.wheel = 0; // deltas are per step
  }
}

/** The first connected standard-mapping gamepad, polled when read; rumble where supported. */
export class GamepadDevice {
  constructor(index = null) { this.index = index; }
  pad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.index !== null) return pads[this.index] ?? null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  read(out) {
    const p = this.pad();
    out.gamepad = p ? { axes: [...p.axes], buttons: p.buttons.map((b) => b.value) } : null;
  }
  /** Rumble (output only: never part of the simulation). */
  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    return this.pad()?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
  }
}

/** Scriptable keyboard + mouse + gamepad for tests and tools. */
export class VirtualDevice {
  constructor() { this.keys = new Set(); this.dx = 0; this.dy = 0; this.wheel = 0; this.buttons = new Set(); this.gamepad = null; }
  press(code) { this.keys.add(code); return this; }
  release(code) { this.keys.delete(code); return this; }
  moveMouse(dx, dy) { this.dx += dx; this.dy += dy; return this; }
  setGamepad(axes = [0, 0, 0, 0], buttons = new Array(17).fill(0)) { this.gamepad = { axes: [...axes], buttons: [...buttons] }; return this; }
  read(out) {
    out.keys = new Set([...(out.keys ?? []), ...this.keys]);
    out.mouse = { dx: (out.mouse?.dx ?? 0) + this.dx, dy: (out.mouse?.dy ?? 0) + this.dy, wheel: (out.mouse?.wheel ?? 0) + this.wheel, buttons: new Set([...(out.mouse?.buttons ?? []), ...this.buttons]) };
    if (this.gamepad) out.gamepad = { axes: [...this.gamepad.axes], buttons: [...this.gamepad.buttons] };
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
