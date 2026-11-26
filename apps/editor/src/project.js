// A project as the editor reads it: its files by ref, fetched from where the project is served. The editor starts on
// the sample project bundled with it (read-only); in the Mac shell, Open Project mounts a folder at /project/ and
// saves go back into it (project.write).
import { parse } from '@vrmxg/scene';
import * as core from '@vrmxg/core';
import { inShell, call } from '../../shell/js/shell.js';
import { freshBehaviours } from './reload.js';

let loads = 0; // a fallback import's own URL (see behaviours())

export class Project {
  /**
   * @param {{ base: string, files: string[], name: string, path?: string | null, writable?: boolean, truncated?: boolean, importer?: ((project: any) => (ref: string) => Promise<{ classes: Map<string, any>, sources: Map<string, string> }>) | null }} o
   *   importer: how the behaviours module is imported fresh (default reload.js freshBehaviours; tests link files)
   */
  constructor({ base, files, name, path = null, writable = false, truncated = false, importer = null }) {
    this.importer = importer ?? ((p) => freshBehaviours(p));
    this.base = base; this.files = files; this.name = name; this.path = path; this.writable = writable;
    /** The shell's listing was cut short (more files than it holds): what needs every file, an export, refuses. */
    this.truncated = truncated;
    this._behaviours = null;
    /** The behaviours module behaviours() loaded and the classes it exports: { ref, classes } (M6 W2), or undefined. */
    this.behavioursModule = undefined;
  }

  url(ref) { return this.base + ref.split('/').map(encodeURIComponent).join('/'); }
  has(ref) { return this.files.includes(ref); }
  async bytes(ref) {
    const r = await fetch(this.url(ref), { cache: 'no-store' });
    if (!r.ok) throw new Error(`${ref}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async text(ref) { return new TextDecoder().decode(await this.bytes(ref)); }

  /** The project's scenes (prefabs included: they open as scenes too). */
  scenes() { return this.files.filter((f) => f.endsWith('.vrmxs')); }

  /** Write a scene back into the project folder (the Mac shell; a bundled project is read-only). */
  async write(ref, text) {
    if (!this.writable || !inShell) throw new Error(`${this.name} is read-only here: open a project folder to save into it`);
    const r = await call('project.write', { path: ref, text });
    if (!this.files.includes(ref)) this.files = [...this.files, ref].sort();
    return r;
  }

  /** Write a binary file (a thumbnail) into the project folder. @param {string} ref @param {string} base64 */
  async writeBase64(ref, base64) {
    if (!this.writable || !inShell) throw new Error(`${this.name} is read-only here: open a project folder to write into it`);
    const r = await call('project.write', { path: ref, base64 });
    if (!this.files.includes(ref)) this.files = [...this.files, ref].sort();
    return r;
  }

  /**
   * The game's controls and collision layers as its game.json has them now (M6 W3): `actions`, the action map (inline,
   * or the JSON file `input` names; null: the engine's default), and `physics`, its collision layers (null: one layer).
   * Read each time it is asked for: the project settings write game.json while the project is open. A game.json that
   * doesn't parse gives the defaults, as a project without one does (the settings panel says what is wrong with it).
   */
  async gameSetup() {
    if (!this.has('game.json')) return { actions: null, physics: null };
    try {
      const g = JSON.parse(await this.text('game.json'));
      let actions = null;
      if (typeof g.input === 'string' && this.has(g.input)) actions = JSON.parse(await this.text(g.input)).actions ?? null;
      else if (g.input && typeof g.input === 'object') actions = g.input.actions ?? null;
      return { actions, physics: g.physics && Array.isArray(g.physics.layers) ? g.physics : null };
    } catch { return { actions: null, physics: null }; }
  }

  /** Recorded input in the project (input/*.json, takes/*.json): the takes it can export. */
  takes() { return this.files.filter((f) => /^(input|takes)\/.+\.json$/.test(f)); }

  /** Every prefab a scene uses, recursively, by ref. */
  async prefabs(doc, map = new Map(), depth = 0) {
    for (const a of doc.assets ?? []) {
      if (a.type !== 'vrmxs' || map.has(a.ref) || depth > 16 || !this.has(a.ref)) continue;
      const p = parse(await this.text(a.ref));
      map.set(a.ref, p);
      await this.prefabs(p, map, depth + 1);
    }
    return map;
  }

  /** The project's animation sets (animations.json and its clips), or null. */
  async animations() {
    if (!this.has('animations.json')) return null;
    const doc = JSON.parse(await this.text('animations.json'));
    const clips = new Map();
    for (const c of doc.clips) if (this.has(c.file)) clips.set(c.sha256, await this.bytes(c.file));
    return { doc, clips };
  }

  /**
   * The project's behaviours module: the one its game.json names (`behaviours`), as Export Game and Node's exporter read
   * it (M6 W2: what play in place runs is what ships, and what hot reload watches), else behaviours.js; null: none.
   */
  async behavioursRef() {
    if (this.has('game.json')) {
      let ref = null;
      try { ref = JSON.parse(await this.text('game.json'))?.behaviours ?? null; } catch { /* a game.json that doesn't parse: Export Game says so */ }
      if (typeof ref === 'string' && this.has(ref)) return ref;
    }
    return this.has('behaviours.js') ? 'behaviours.js' : null;
  }

  /**
   * The project's behaviours (behavioursRef's module, its exports under the names scenes use), imported fresh from the
   * bytes on disk now (M6 W2: reload.js freshBehaviours, Export Game's path), with the text of the module graph they came
   * from. Every project's module is served at the same /project/ URL, so a plain import() would hand a project reopened
   * (or another one) the first module the page loaded. A graph with an import cycle can't be linked that way: it is
   * imported by URL under a query of its own instead (its imports may then be ones the page loaded before), with no
   * sources, so hot reload can't watch it.
   */
  async behaviours() {
    if (this._behaviours) return this._behaviours;
    const ref = await this.behavioursRef();
    this.behavioursModule = { ref, classes: new Map(), sources: null };
    if (!ref) return (this._behaviours = new Map());
    let classes, sources = null;
    try { ({ classes, sources } = await this.importer(this)(ref)); } catch (e) {
      if (!/import cycle/.test(String(e?.message))) throw e;
      globalThis.VRMXG_CORE = core; // what the import map's @vrmxg/core hands project modules
      const mod = await import(/* @vite-ignore */ `${new URL(this.url(ref), location.href).href}?vrmxg-load=${++loads}`);
      classes = new Map(Object.entries(mod).filter(([, v]) => typeof v === 'function' && typeof v.prototype?.getState === 'function'));
    }
    this.behavioursModule = { ref, classes: new Map(classes), sources }; // the module's own: a world adds the engine's classes to the map it is built with
    return (this._behaviours = classes);
  }

  /** Hot reload (M6 W2, reload.js) took the module's new classes, read from `sources`: worlds built from now on run them. */
  reloadedBehaviours(classes, sources = null) {
    this.behavioursModule = { ref: this.behavioursModule?.ref ?? null, classes: new Map(classes), sources };
    this._behaviours = new Map(classes);
  }
}

/** The sample project the editor ships with. */
export async function bundledProject() {
  const files = await (await fetch('./project-files.json', { cache: 'no-store' })).json();
  return new Project({ base: './', files, name: 'Sample (bundled)', writable: false });
}

/** Open a project folder through the Mac shell (a panel, or VRMXG_SHELL_PROJECT in automation). */
export async function openProjectFolder() {
  const r = await call('project.open', { title: 'Open Project' });
  return new Project({ base: r.base, files: r.files, name: r.name, path: r.path, writable: true, truncated: r.truncated === true });
}
