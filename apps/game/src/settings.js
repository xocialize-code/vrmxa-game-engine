// The game app's settings (M5 W1, AB-D-0286): one small document, kept per game.
//
//   { "format": "vrmxg-game-settings", "version": 1, "backend": "auto", "volume": { "master": 1, … }, "bindings": null }
//
//   backend   'auto' (WebGPU where the page has it, else WebGL), 'webgpu' or 'webgl'. The page's `renderer=` query wins
//             over it (the switch every VRMXG app obeys); a change takes effect when the page is loaded again
//   volume    0 to 1 per bus: master, music, sfx, voice, ambience (@vrmxg/audio's buses). Presentation only
//   bindings  the player's own key and gamepad bindings: a place kept for @vrmxg/game-ui's rebinding controls (M5 W3).
//             Nothing here reads it yet; what is stored is kept as it is
//
// Where it is kept: in a browser tab, localStorage under the game's id; in the Mac app, a file in the game's own
// container, through the shell's settings.read and settings.write (the Mac app's loopback origin has another port on
// every launch, so the page's own storage wouldn't be there next time).
//
// A change applies at once and is then written. `saved` says whether the store has it: a write that fails leaves
// `saved` false and `error` set, and the settings menu says so; it is never reported as kept before it is.

export const SETTINGS_FORMAT = 'vrmxg-game-settings';
export const SETTINGS_VERSION = 1;
export const BACKENDS = ['auto', 'webgpu', 'webgl'];
export const VOLUME_BUSES = ['master', 'music', 'sfx', 'voice', 'ambience'];

export function defaultSettings() {
  return { format: SETTINGS_FORMAT, version: SETTINGS_VERSION, backend: 'auto', volume: Object.fromEntries(VOLUME_BUSES.map((b) => [b, 1])), bindings: null };
}

const unit = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/**
 * Settings from whatever was stored: every field checked on its own, so one bad value costs only itself. A document of
 * a later version is read for the fields this version knows. Never throws.
 * @param {any} stored the parsed document, or anything else → { settings, problems }
 */
export function readSettings(stored) {
  const settings = defaultSettings(), problems = [];
  if (stored === null || stored === undefined) return { settings, problems };
  if (typeof stored !== 'object' || Array.isArray(stored) || stored.format !== SETTINGS_FORMAT) return { settings, problems: ['not a settings document: the defaults are used'] };
  if (stored.backend !== undefined) { if (BACKENDS.includes(stored.backend)) settings.backend = stored.backend; else problems.push(`backend "${stored.backend}" isn't one of ${BACKENDS.join(', ')}`); }
  if (stored.volume !== undefined) {
    if (stored.volume && typeof stored.volume === 'object') for (const b of VOLUME_BUSES) { if (Object.hasOwn(stored.volume, b)) settings.volume[b] = unit(stored.volume[b], settings.volume[b]); }
    else problems.push('volume isn\'t a table of buses');
  }
  if (stored.bindings !== undefined && stored.bindings !== null) { if (typeof stored.bindings === 'object') settings.bindings = structuredClone(stored.bindings); else problems.push('bindings isn\'t a table'); }
  return { settings, problems };
}

/** The settings document's text, as it is stored. */
export const serializeSettings = (s) => `${JSON.stringify({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION, backend: s.backend, volume: s.volume, bindings: s.bindings ?? null }, null, 1)}\n`;

/**
 * The backend a page draws on: the `renderer=` query when it names one, else the stored setting.
 * @param {string | URLSearchParams | null} search @param {{ backend: string }} settings
 * @returns {{ backend: 'auto' | 'webgpu' | 'webgl', from: 'query' | 'settings' }}
 */
export function chosenBackend(search, settings) {
  const q = typeof search === 'string' || search == null ? new URLSearchParams(search ?? '') : search;
  const v = q.get('renderer');
  if (v === 'webgpu' || v === 'webgl' || v === 'auto') return { backend: v, from: 'query' };
  return { backend: /** @type {any} */ (BACKENDS.includes(settings?.backend) ? settings.backend : 'auto'), from: 'settings' };
}

export class SettingsStore {
  /**
   * @param {{ read: () => Promise<string | null>, write: (text: string) => Promise<any> }} storage where the document is
   *   kept (below: localStorage, the Mac shell, or memory)
   */
  constructor(storage) {
    this.storage = storage;
    this.value = defaultSettings();
    /** Does the store hold `value`? False from a change until its write has succeeded, and after one that failed. */
    this.saved = true;
    /** Why the last read or write failed, or null. */ this.error = /** @type {string | null} */ (null);
    /** What was wrong with the stored document when it was read. @type {string[]} */ this.problems = [];
    /** @type {Set<(value: any, store: SettingsStore) => void>} */ this._listeners = new Set();
    this._writes = Promise.resolve(); this._seq = 0;
  }

  /** Read the stored document. A store that can't be read leaves the defaults, and says why in `error`. */
  async load() {
    try {
      const text = await this.storage.read();
      const { settings, problems } = readSettings(text ? JSON.parse(text) : null);
      this.value = settings; this.problems = problems; this.error = null;
    } catch (e) { this.value = defaultSettings(); this.error = `the settings couldn't be read: ${e?.message ?? e}`; }
    this.saved = true;
    this._tell();
    return this.value;
  }

  /**
   * Change settings: applied now (listeners hear it at once), then written. Resolves to whether the store has it.
   * Writes go one at a time and in order, so the store ends with the last change whatever each write took.
   * @param {{ backend?: string, volume?: Record<string, number>, bindings?: any }} patch
   */
  set(patch) {
    const next = readSettings({ ...this.value, ...patch, volume: { ...this.value.volume, ...(patch.volume ?? {}) }, format: SETTINGS_FORMAT }).settings;
    this.value = next; this.saved = false;
    const seq = ++this._seq, text = serializeSettings(next);
    this._tell();
    const done = this._writes.then(() => this.storage.write(text)).then(
      () => { if (seq === this._seq) { this.saved = true; this.error = null; this._tell(); } return true; },
      (e) => { if (seq === this._seq) { this.error = `the settings couldn't be saved: ${e?.message ?? e}`; this._tell(); } return false; },
    );
    this._writes = done;
    return done;
  }

  /** Hear every change (and every change of `saved` and `error`). → a function that stops it */
  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _tell() { for (const fn of [...this._listeners]) fn(this.value, this); }
}

/** Settings in memory (tests; a page with no storage it may use). */
export function memoryStorage(initial = null) {
  let text = initial;
  return { read: async () => text, write: async (t) => { text = t; }, get text() { return text; } };
}

/** Settings in a browser's localStorage, under the game's id. */
export function localStorageFor(gameId, storage = globalThis.localStorage) {
  const key = `vrmxg.game.${gameId}.settings`;
  return { read: async () => storage.getItem(key), write: async (text) => { storage.setItem(key, text); } };
}

/** Settings in the Mac app's own folder, through the shell (shell 0.11.0: settings.read, settings.write). */
export function shellStorage(call) {
  return { read: async () => (await call('settings.read')).text ?? null, write: async (text) => { await call('settings.write', { text }); } };
}
