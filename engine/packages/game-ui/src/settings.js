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
  const v = isObject(r.volumes) ? r.volumes : {};
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
    this._writing = Promise.resolve();
  }

  /** Read the store (a relaunch). */
  async load() { this.data = readSettings(await this.store.read()); this.version++; return this; }

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

  /** Write the settings to the store; writes land in the order they were asked for. */
  save() {
    const snapshot = structuredClone(this.data);
    this._writing = this._writing.then(() => this.store.write(snapshot));
    return this._writing;
  }

  /** Set a bus's volume (0..1) and mute; applied at once and saved. */
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
    const named = labels[action] ?? ACTION_LABELS[action] ?? action;
    const text = (list) => list.map(describeBinding).join(', ') || 'Not bound';
    if (a.type === 'button') {
      rows.push({ id: action, action, type: 'button', direction: 0, label: named, keyboard: text(a.bindings.filter(kbSlot)), gamepad: text(a.bindings.filter(padSlot)), fixed: [] });
      continue;
    }
    const fixed = a.bindings.filter((b) => !kbSlot(b) && !padSlot(b)).map(describeBinding);
    const dirs = a.bindings.some((b) => kbSlot(b) || padSlot(b)) ? [-1, 1] : [];
    if (!dirs.length) { rows.push({ id: action, action, type: 'axis', direction: 0, label: named, keyboard: '—', gamepad: '—', fixed }); continue; }
    for (const d of dirs) {
      const label = labels[`${action}${d < 0 ? '-' : '+'}`] ?? DIRECTION_LABELS[action]?.[d < 0 ? 0 : 1] ?? `${named} ${d < 0 ? '−' : '+'}`;
      const mine = a.bindings.filter((b) => sign(b) === d);
      rows.push({ id: `${action}${d < 0 ? '-' : '+'}`, action, type: 'axis', direction: d, label, keyboard: text(mine.filter(kbSlot)), gamepad: text(mine.filter(padSlot)), fixed: d > 0 ? fixed : [] });
    }
  }
  return rows;
}

/**
 * An action's new bindings with one slot rebound: the slot's bindings (on that row's direction, for an axis) are
 * replaced by `binding`; everything else the action has is kept as it was.
 * @param {any[]} bindings the action's bindings now @param {{ type: 'axis' | 'button', direction: number }} row
 * @param {'keyboard' | 'gamepad'} slot @param {any} binding { key } or { gamepadButton }
 */
export function applyCapture(bindings, row, slot, binding) {
  const inSlot = slot === 'keyboard' ? kbSlot : padSlot;
  const here = (b) => inSlot(b) && (row.type === 'button' || sign(b) === row.direction);
  const b = row.type === 'axis' ? { ...binding, value: row.direction } : { ...binding };
  const out = [], at = bindings.findIndex(here);
  bindings.forEach((x, i) => { if (i === at) out.push(b); else if (!here(x)) out.push(structuredClone(x)); });
  if (at < 0) out.push(b);
  return out;
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

/** The other actions a binding already does (a settings list warns: "also Interact"). */
export function conflicts(actions, action, binding) {
  const same = (b) => (binding.key !== undefined && b.key === binding.key) || (binding.gamepadButton !== undefined && b.gamepadButton === binding.gamepadButton);
  return Object.entries(actions).filter(([name, a]) => name !== action && a.bindings.some(same)).map(([name]) => name);
}

export { keyName };
