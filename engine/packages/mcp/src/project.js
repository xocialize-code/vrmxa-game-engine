// A project on disk, as the MCP server sees it: a root folder, asset refs resolved as paths under it,
// prefab scenes loaded on demand, optional project animation sets (animations.json: a
// vrmxa-animations document whose clips' `file` paths are under the root), optional project behaviours
// (a module exporting behaviour classes under the names scenes use: `export { Wander as wander }`) and, for .vrmxa characters, vrmxa-core (injected,
// AB-D-0249).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from '@vrmxg/scene';
import { behavioursImporter } from '@vrmxg/bundle/node';

export class Project {
  /**
   * @param {string} root
   * @param {{ behaviours?: string, vrmxaCore?: string, seed?: number }} [opts] module paths are relative to root
   */
  constructor(root, { behaviours, vrmxaCore, seed = 1 } = {}) {
    this.root = path.resolve(root);
    // without --behaviours, the module the game names (game.json's "behaviours"), else behaviours.js at the root: the
    // module the editor loads, play in place runs and an export ships (M6 W8), so validate knows the project's own
    behaviours ??= this.gameBehaviours();
    this.behavioursPath = behaviours ? path.resolve(this.root, behaviours) : null;
    this.vrmxaCorePath = vrmxaCore ? path.resolve(this.root, vrmxaCore) : null;
    this.seed = seed;
    /** @type {Promise<Map<string, any>> | undefined} the behaviours, once read */ this._behaviours = undefined;
  }

  /** The behaviours module the editor would load: game.json's "behaviours" when it names a file, else behaviours.js, else null. */
  gameBehaviours() {
    try {
      const ref = JSON.parse(fs.readFileSync(path.join(this.root, 'game.json'), 'utf8'))?.behaviours;
      if (typeof ref === 'string' && fs.existsSync(this.file(ref))) return ref;
    } catch { /* no game.json, or one that doesn't parse: game op=validate says so */ }
    return fs.existsSync(path.join(this.root, 'behaviours.js')) ? 'behaviours.js' : null;
  }

  /** The behaviours module's path under the root, or null. */
  get behavioursRef() { return this.behavioursPath ? path.relative(this.root, this.behavioursPath).split(path.sep).join('/') : null; }

  /** A path under the root (refusing ones that leave it). */
  file(ref) {
    const p = path.resolve(this.root, ref);
    if (p !== this.root && !p.startsWith(this.root + path.sep)) throw new Error(`"${ref}" is outside the project`);
    return p;
  }
  exists(ref) { return fs.existsSync(this.file(ref)); }
  bytes(ref) { return new Uint8Array(fs.readFileSync(this.file(ref))); }
  json(ref) { return JSON.parse(fs.readFileSync(this.file(ref), 'utf8')); }

  /** Every prefab a scene uses, recursively, by ref. */
  prefabs(doc, map = new Map(), depth = 0) {
    for (const a of doc.assets ?? []) {
      if (a.type !== 'vrmxs' || map.has(a.ref) || depth > 16 || !this.exists(a.ref)) continue;
      const p = parse(fs.readFileSync(this.file(a.ref), 'utf8'));
      map.set(a.ref, p);
      this.prefabs(p, map, depth + 1);
    }
    return map;
  }

  /** The project's behaviours, read once (as a plain import() was: Node keeps a module it has loaded). */
  behaviours() { return (this._behaviours ??= this.loadBehaviours()); }

  async loadBehaviours() {
    if (!this.behavioursPath) return new Map();
    // a module of the project's folder is imported as an export imports it (@vrmxg/bundle/node's behavioursImporter: its
    // `@vrmxg/core` is the engine's wherever the folder is, as a project New Project made outside the repository needs);
    // one named outside the folder (--behaviours elsewhere) plainly
    const ref = this.behavioursRef;
    const mod = ref && !ref.startsWith('../') ? await behavioursImporter(this.root)(ref) : await import(pathToFileURL(this.behavioursPath).href);
    const src = mod.default ?? mod.behaviours ?? mod;
    // Exports named as scenes name behaviours; anything that isn't a behaviour class is ignored.
    return new Map(src instanceof Map ? src : Object.entries(src).filter(([, v]) => typeof v === 'function' && typeof v.prototype?.getState === 'function'));
  }

  async vrmxaCore() {
    if (!this.vrmxaCorePath) return null;
    const base = fs.statSync(this.vrmxaCorePath).isDirectory() ? this.vrmxaCorePath : path.dirname(this.vrmxaCorePath);
    const main = await import(pathToFileURL(path.join(base, 'src/index.js')).href);
    const anim = fs.existsSync(path.join(base, 'src/anim/index.js')) ? await import(pathToFileURL(path.join(base, 'src/anim/index.js')).href) : {};
    return { ...main, ...anim };
  }

  /** vrmxa-core's ./closet module (the closet at run time), or null. */
  async vrmxaCloset() {
    if (!this.vrmxaCorePath) return null;
    const base = fs.statSync(this.vrmxaCorePath).isDirectory() ? this.vrmxaCorePath : path.dirname(this.vrmxaCorePath);
    const file = path.join(base, 'src/closet/index.js');
    return fs.existsSync(file) ? import(pathToFileURL(file).href) : null;
  }

  /** Project animation sets every character falls back on, or null. */
  animations() {
    if (!this.exists('animations.json')) return null;
    const doc = this.json('animations.json');
    const clips = new Map();
    for (const c of doc.clips ?? []) if (c.file && this.exists(c.file)) clips.set(c.sha256, this.bytes(c.file));
    return { doc, clips };
  }
}
