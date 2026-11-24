// The settings an overlay changes (M5 W3): volume per audio bus and the player's bindings. They are the player's, not
// the simulation's: never in a snapshot or a recording. They persist through a store the app supplies, so the package
// picks no storage API:
//   store = { read(): any | Promise<any>,  write(settings): void | Promise<void> }     (read: null when nothing is stored)
// A relaunch reads the store again and applies it: the bindings to the input service (the next step uses them), the
// volumes to the audio output.
import { describeBinding, keyName } from './format.js';

/** The buses a volume list shows: @vrmxg/audio's, and the master. */
export const VOLUME_BUSES = ['master', 'music', 'sfx', 'voice', 'ambience'];
const BUS_LABELS = { master: 'Master', music: 'Music', sfx: 'Effects', voice: 'Voices', ambience: 'Ambience' };
export const SETTINGS_VERSION = 1;

const clamp01 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Settings as stored, with every gap filled and every damaged value replaced: never throws, whatever the store held. */
export function readSettings(raw) {
  const r = isObject(raw) ? raw : {};
  /** @type {Record<string, any>} */ const v = isObject(r.volumes) ? r.volumes : {};
  const volumes = Object.fromEntries(VOLUME_BUSES.map((b) => [b, { volume: clamp01(v[b]?.volume ?? 1), muted: v[b]?.muted === true }]));
  const bindings = isObject(r.bindings) ? structuredClone(r.bindings) : {};
  return { version: SETTINGS_VERSION, volumes, bindings };
}

/** A store in memory (tests, a demo). An app gives its own: the shell's storage, IndexedDB, a file. */
export function memorySettingsStore(initial = null) {
  let data = initial === null ? null : JSON.stringify(initial);
  return { read: () => (data === null ? null : JSON.parse(data)), write: (s) => { data = JSON.stringify(s); }, get raw() { return data; } };
}

export class GameSettings {
  /** @param {{ store: { read: () => any, write: (s: any) => any } }} o */
  constructor({ store }) {
    if (!store || typeof store.read !== 'function' || typeof store.write !== 'function') throw new Error('GameSettings needs a store: { read(), write(settings) }');
    this.store = store;
    this.data = readSettings(null);
    /** Goes up on every change: a settings list re-reads when it does. */
    this.version = 0;
    /** What the last apply left out (stored bindings this game doesn't have, or doesn't take). */
    this.ignored = [];
    /** The last write's error, or null once a write lands. A failed write never stops the next one. */
    this.error = null;
    /** Why the last load read nothing from the store (it threw), or null. */
    this.loadError = null;
    /** @type {Promise<any>} */ this._writing = Promise.resolve();
  }

  /**
   * Read the store (a relaunch). A store that fails to read never stops the app starting: the settings are the
   * defaults, and the error is kept in `loadError` for the app to report.
   */
  async load() {
    let raw = null;
    this.loadError = null;
    try { raw = await this.store.read(); } catch (e) { this.loadError = e; }
    this.data = readSettings(raw);
    this.version++;
    return this;
  }

  /**
   * Apply the settings: the bindings to an input service (the next step uses them) and the volumes to an audio output
   * (@vrmxg/audio's AudioOutput, or anything with setBus(name, { volume, muted })).
   * @param {{ input?: any, audio?: { setBus: (name: string, o: { volume?: number, muted?: boolean }) => void } | null }} to
   */
  applyTo({ input = null, audio = null } = {}) {
    if (input) this.ignored = input.applyOverrides(this.data.bindings).ignored;
    if (audio) for (const bus of VOLUME_BUSES) audio.setBus(bus, this.data.volumes[bus]);
    return this;
  }

  /**
   * Write the settings to the store; writes land in the order they were asked for. A write that fails is remembered in
   * `error` and the next one is still made (the latest settings, whole). → resolves true when this write landed, false
   * when it failed: never rejects, so a control that doesn't wait for it leaves nothing unhandled
   */
  save() {
    const snapshot = structuredClone(this.data);
    const w = this._writing.then(() => this.store.write(snapshot)).then(() => { this.error = null; return true; }, (e) => { this.error = e; return false; });
    this._writing = w;
    return w;
  }

  /**
   * Set a bus's volume (0..1) and mute; applied at once and saved.
   * @param {string} bus @param {{ volume?: number, muted?: boolean }} [o] @param {{ setBus: (name: string, o: any) => void } | null} [audio]
   */
  setVolume(bus, { volume, muted } = {}, audio = null) {
    if (!VOLUME_BUSES.includes(bus)) throw new Error(`no bus "${bus}" (${VOLUME_BUSES.join(', ')})`);
    const v = this.data.volumes[bus];
    if (volume !== undefined) v.volume = clamp01(volume);
    if (muted !== undefined) v.muted = !!muted;
    audio?.setBus(bus, { ...v });
    this.version++;
    return this.save();
  }

  /** Rebind an action (all of its bindings) on the input service, and save the player's bindings. */
  rebind(input, action, bindings) {
    input.rebind(action, bindings);
    this.data.bindings = input.overrides();
    this.version++;
    return this.save();
  }

  /**
   * Several actions rebound at once (a rebindPlan's changes: a key moved from one action to another), one save.
   * @param {any} input @param {Record<string, any[]>} changes
   */
  rebindAll(input, changes) {
    for (const [action, bindings] of Object.entries(changes)) input.rebind(action, bindings);
    this.data.bindings = input.overrides();
    this.version++;
    return this.save();
  }

  /** One action's bindings back as the game has them, or every action's; saved. */
  resetBindings(input, action) {
    input.resetBindings(action);
    this.data.bindings = input.overrides();
    this.version++;
    return this.save();
  }

  /** Resolves when every write asked for so far has landed. */
  settle() { return this._writing; }
}

/** The volume list as plain data: [{ bus, label, volume, percent, muted }]. */
export function volumeRows(data) {
  return VOLUME_BUSES.map((bus) => ({ bus, label: BUS_LABELS[bus], volume: data.volumes[bus].volume, percent: Math.round(data.volumes[bus].volume * 100), muted: data.volumes[bus].muted }));
}

const ACTION_LABELS = { move_x: 'Move', move_y: 'Move', look_x: 'Look', look_y: 'Look', zoom: 'Zoom', jump: 'Jump', run: 'Run', interact: 'Interact', camera_next: 'Next camera' };
const DIRECTION_LABELS = { move_x: ['Move left', 'Move right'], move_y: ['Move back', 'Move forward'], look_x: ['Look left', 'Look right'], look_y: ['Look down', 'Look up'] };
const kbSlot = (b) => b.key !== undefined || b.mouseButton !== undefined;
const padSlot = (b) => b.gamepadButton !== undefined;
const sign = (b) => ((b.value ?? 1) < 0 ? -1 : 1);

/**
 * The rebinding list as plain data. A button action is one row with a keyboard slot and a gamepad slot. An axis is a
 * row per direction for its keys and d-pad buttons; what can't be rebound here (mouse movement, a stick) is listed
 * read-only on the row (`fixed`).
 * @param {Record<string, { type: 'axis' | 'button', bindings: any[] }>} actions input.bindings()
 * @param {{ labels?: Record<string, string>, hide?: string[] }} [o] labels: an action's name in the list (a game's own
 *   actions); hide: actions the list leaves out (two-player names, say)
 * @returns {Array<{ id: string, action: string, type: 'axis' | 'button', direction: 1 | -1 | 0, label: string, keyboard: string, gamepad: string, fixed: string[] }>}
 */
export function rebindRows(actions, { labels = {}, hide = [] } = {}) {
  const rows = [];
  for (const [action, a] of Object.entries(actions)) {
    if (hide.includes(action)) continue;
    const named = rowLabel(action, 0, labels);
    const text = (list) => list.map(describeBinding).join(', ') || 'Not bound';
    if (a.type === 'button') {
      rows.push({ id: action, action, type: 'button', direction: 0, label: named, keyboard: text(a.bindings.filter(kbSlot)), gamepad: text(a.bindings.filter(padSlot)), fixed: [] });
      continue;
    }
    const fixed = a.bindings.filter((b) => !kbSlot(b) && !padSlot(b)).map(describeBinding);
    const dirs = a.bindings.some((b) => kbSlot(b) || padSlot(b)) ? [-1, 1] : [];
    if (!dirs.length) { rows.push({ id: action, action, type: 'axis', direction: 0, label: named, keyboard: '—', gamepad: '—', fixed }); continue; }
    for (const d of dirs) {
      const label = rowLabel(action, d, labels);
      const mine = a.bindings.filter((b) => sign(b) === d);
      rows.push({ id: `${action}${d < 0 ? '-' : '+'}`, action, type: 'axis', direction: d, label, keyboard: text(mine.filter(kbSlot)), gamepad: text(mine.filter(padSlot)), fixed: d > 0 ? fixed : [] });
    }
  }
  return rows;
}

/** A row's name in the list: an action's ("Jump"), or one direction of an axis ("Move right"). */
export function rowLabel(action, direction = 0, labels = {}) {
  const named = labels[action] ?? ACTION_LABELS[action] ?? action;
  if (!direction) return named;
  return labels[`${action}${direction < 0 ? '-' : '+'}`] ?? DIRECTION_LABELS[action]?.[direction < 0 ? 0 : 1] ?? `${named} ${direction < 0 ? '−' : '+'}`;
}

/**
 * An action's new bindings with one slot rebound: the slot's first binding (on that row's direction, for an axis) is
 * replaced by `binding`, so a slot that reads "D, Right" rebound to L reads "L, Right"; everything else the action has
 * is kept as it was. An empty slot gets the binding added.
 * @param {any[]} bindings the action's bindings now @param {{ type: 'axis' | 'button', direction: number }} row
 * @param {'keyboard' | 'gamepad'} slot @param {any} binding { key } or { gamepadButton }
 */
export function applyCapture(bindings, row, slot, binding) {
  const inSlot = slot === 'keyboard' ? kbSlot : padSlot;
  const here = (b) => inSlot(b) && (row.type === 'button' || sign(b) === row.direction);
  const b = row.type === 'axis' ? { ...binding, value: row.direction } : { ...binding };
  const at = bindings.findIndex(here);
  const out = bindings.map((x, i) => (i === at ? b : structuredClone(x)));
  if (at < 0) out.push(b);
  return out;
}

const sameInput = (a, b) => (b.key !== undefined && a.key === b.key) || (b.gamepadButton !== undefined && a.gamepadButton === b.gamepadButton) || (b.mouseButton !== undefined && a.mouseButton === b.mouseButton);

/**
 * What rebinding one slot to `binding` changes, and where that key or button already works: in another action, or in
 * the other direction of the same axis (rebinding Move right to A, which is Move left's: A would then be +1 and −1
 * together, and holding it would move nothing). A key is never bound twice: applying the plan moves it here, out of
 * everywhere else it was, the same action included (a second copy in this slot is dropped).
 * @param {Record<string, { type: 'axis' | 'button', bindings: any[] }>} actions input.bindings()
 * @param {{ action: string, type: 'axis' | 'button', direction: number }} row @param {'keyboard' | 'gamepad'} slot
 * @param {any} binding { key } or { gamepadButton } @param {{ labels?: Record<string, string> }} [o]
 * @returns {{ changes: Record<string, any[]>, conflicts: Array<{ action: string, direction: number, label: string }> }}
 *   changes: each touched action's new bindings (GameSettings.rebindAll applies them); conflicts: where it is now,
 *   to warn about and confirm before applying
 */
export function rebindPlan(actions, row, slot, binding, { labels = {} } = {}) {
  const conflicts = [], changes = {};
  for (const [name, a] of Object.entries(actions)) {
    const hits = a.bindings.filter((b) => sameInput(b, binding));
    if (!hits.length) continue;
    if (name !== row.action) {
      const dirs = a.type === 'axis' ? [...new Set(hits.map(sign))] : [0];
      for (const d of dirs) conflicts.push({ action: name, direction: d, label: rowLabel(name, d, labels) });
      changes[name] = a.bindings.filter((b) => !sameInput(b, binding)).map((b) => structuredClone(b));
    } else if (row.type === 'axis') {
      for (const d of [...new Set(hits.map(sign))]) if (d !== row.direction) conflicts.push({ action: name, direction: d, label: rowLabel(name, d, labels) });
    }
  }
  // this action: the slot rebound, and any other place it had the same key (the other direction, a second copy) emptied
  const mine = actions[row.action].bindings, placed = applyCapture(mine, row, slot, binding);
  const at = mine.findIndex((b) => (slot === 'keyboard' ? kbSlot(b) : padSlot(b)) && (row.type === 'button' || sign(b) === row.direction));
  const keep = at >= 0 ? at : placed.length - 1;
  changes[row.action] = placed.filter((b, i) => i === keep || !sameInput(b, binding));
  return { changes, conflicts };
}

/** The binding a pressed key gives, or null for keys that leave a capture (Escape) or can't be bound. */
export function captureKey(code) {
  if (typeof code !== 'string' || code === '' || code === 'Escape') return null;
  return { key: code };
}

/** The binding a gamepad button newly pressed between two reads gives, or null. */
export function captureButton(before, now) {
  const b = before?.buttons ?? [], n = now?.buttons ?? [];
  for (let i = 0; i < n.length; i++) if (n[i] > 0.5 && !((b[i] ?? 0) > 0.5)) return { gamepadButton: i };
  return null;
}

/** The other actions a binding already does, by name (rebindPlan says it per direction, the same action's included). */
export function conflicts(actions, action, binding) {
  return Object.entries(actions).filter(([name, a]) => name !== action && a.bindings.some((b) => sameInput(b, binding))).map(([name]) => name);
}

export { keyName, describeBinding };
