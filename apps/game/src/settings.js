// The game app's settings (M5 W1, AB-D-0286): one small document, kept per game.
//
//   { "format": "vrmxg-game-settings", "version": 1, "backend": "auto", "ui": { …@vrmxg/game-ui's GameSettings… } }
//
//   backend   'auto' (WebGPU where the page has it, else WebGL), 'webgpu' or 'webgl'. The page's `renderer=` query wins
//             over it (the switch every VRMXG app obeys); a change takes effect when the page is loaded again
//   ui        @vrmxg/game-ui's GameSettings document (volume per bus, the player's key and gamepad bindings), kept here as
//             it is: that package reads and checks it (gameUiStore below hands it the field). The player's, never the
//             simulation's
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

export function defaultSettings() {
  return { format: SETTINGS_FORMAT, version: SETTINGS_VERSION, backend: 'auto', ui: null };
}

/** The volume buses the first form of this document kept (`volume`: 0 to 1 per bus), for the migration below. */
const OLD_BUSES = ['master', 'music', 'sfx', 'voice', 'ambience'];

/**
 * The first form of this document (before @vrmxg/game-ui was wired in) kept `volume` (0 to 1 per bus) and `bindings`
 * (the player's overrides) at the top. They become the `ui` document game-ui's GameSettings reads, once: a document that
 * already has `ui` keeps it, and the old fields are dropped when it is written back. → the `ui` document, or null
 * @param {any} stored
 */
export function migrateUi(stored) {
  const vol = stored?.volume && typeof stored.volume === 'object' ? stored.volume : null;
  const bind = stored?.bindings && typeof stored.bindings === 'object' && !Array.isArray(stored.bindings) ? stored.bindings : null;
  if (!vol && !bind) return null;
  const volumes = {};
  for (const b of OLD_BUSES) if (vol && typeof vol[b] === 'number' && Number.isFinite(vol[b])) volumes[b] = { volume: Math.min(1, Math.max(0, vol[b])), muted: false };
  return { version: 1, volumes, bindings: bind ? structuredClone(bind) : {} };
}

/**
 * Settings from whatever was stored: every field checked on its own, so one bad value costs only itself. A document of
 * a later version is read for the fields this version knows. Never throws.
 * @param {any} stored the parsed document, or anything else → { settings, problems, migrated } (migrated: the first
 *   form's volume and bindings moved into `ui`: write the document back)
 */
export function readSettings(stored) {
  const settings = defaultSettings(), problems = [];
  if (stored === null || stored === undefined) return { settings, problems };
  if (typeof stored !== 'object' || Array.isArray(stored) || stored.format !== SETTINGS_FORMAT) return { settings, problems: ['not a settings document: the defaults are used'] };
  if (stored.backend !== undefined) { if (BACKENDS.includes(stored.backend)) settings.backend = stored.backend; else problems.push(`backend "${stored.backend}" isn't one of ${BACKENDS.join(', ')}`); }
  if (stored.ui !== undefined && stored.ui !== null) { if (typeof stored.ui === 'object' && !Array.isArray(stored.ui)) settings.ui = structuredClone(stored.ui); else problems.push('ui isn\'t a table'); }
  let migrated = false;
  if (settings.ui === null) { const ui = migrateUi(stored); if (ui) { settings.ui = ui; migrated = true; } }
  return { settings, problems, migrated };
}

/** The settings document's text, as it is stored. */
export const serializeSettings = (s) => `${JSON.stringify({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION, backend: s.backend, ui: s.ui ?? null }, null, 1)}\n`;

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
      const { settings, problems, migrated } = readSettings(text ? JSON.parse(text) : null);
      this.value = settings; this.problems = problems; this.error = null;
      this.saved = true;
      // the first form's volume and bindings, moved into `ui`: written back once, so the next read finds the new form
      if (migrated) { this.saved = false; await this.storage.write(serializeSettings(settings)).then(() => { this.saved = true; }, (e) => { this.error = `the settings couldn't be saved: ${e?.message ?? e}`; }); }
    } catch (e) { this.value = defaultSettings(); this.error = `the settings couldn't be read: ${e?.message ?? e}`; this.saved = true; }
    this._tell();
    return this.value;
  }

  /**
   * Change settings: applied now (listeners hear it at once), then written. Resolves to whether the store has it.
   * Writes go one at a time and in order, so the store ends with the last change whatever each write took.
   * @param {{ backend?: string, ui?: any }} patch
   */
  set(patch) {
    const next = readSettings({ ...this.value, ...patch, format: SETTINGS_FORMAT }).settings;
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

/**
 * What the settings menu's status line says after a change: why a write failed (the backend's, or a volume's or a
 * rebinding's, which GameSettings writes through gameUiStore), else whether it is kept yet.
 * @param {SettingsStore} store @param {{ error?: any } | null} [player] the player's GameSettings
 */
export function settingsNote(store, player = null) {
  if (store?.error) return store.error;
  if (player?.error) return `the volumes and controls couldn't be saved: ${player.error?.message ?? player.error}`;
  return store?.saved ? 'Settings saved.' : 'Saving…';
}

/**
 * The store @vrmxg/game-ui's GameSettings reads and writes (`{ read(), write(s) }`): the `ui` field of these settings,
 * so the backend and the player's volumes and bindings are one document in one place. A write that doesn't reach the
 * store throws, so GameSettings knows it wasn't kept.
 * @param {SettingsStore} store
 */
export function gameUiStore(store) {
  return {
    read: () => store.value.ui ?? null,
    write: async (s) => { if (!(await store.set({ ui: s }))) throw new Error(store.error ?? 'the settings could not be saved'); },
  };
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
