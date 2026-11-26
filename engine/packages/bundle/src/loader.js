// The loader: opens a build and hands a runtime what it needs to play it. That is the game (which scene to start in,
// the scenes it has), a resolver for the project's files by ref (the `resolve` every engine service takes), the input
// map, and the project's behaviours. A ref the manifest doesn't list is refused by name, and a file whose bytes aren't
// the ones the manifest hashed is refused too: a build plays what was exported or it doesn't play.
//
//   const build = await openBuild(fetchReader('./'));                 // a runtime's page; Node: folderReader(dir).read
//   const behaviours = await build.behaviours((url) => import(new URL(url, location.href).href));
//   const scene = parse(await build.text(build.game.entry));          // then build the world with build.bytes as resolve
import { declareProjectBehaviours } from '@vrmxg/registry';
import { m0Registry } from '@vrmxg/registry/m0';
import { sha256 } from './sha256.js';
import { BuildError, normRef, resolveFrom } from './paths.js';
import { moduleImports } from './modules.js';
import { BUILD_FILE, parseManifest } from './manifest.js';
import { PROJECT_DIR } from './runtime.js';

const text = (b) => new TextDecoder().decode(b);

export class Build {
  /** @param {import('./manifest.js').Manifest} manifest @param {(path: string) => Promise<Uint8Array>} read @param {{ verify?: boolean }} [o] */
  constructor(manifest, read, { verify = true } = {}) {
    this.manifest = manifest; this.game = manifest.game; this.runtime = manifest.runtime;
    this.read = read; this.verify = verify;
    /** @type {Map<string, import('./manifest.js').BuildFile>} */ this.byPath = new Map(manifest.files.map((f) => [f.path, f]));
    this.checked = new Set();
    /** A project file by ref, for the engine's services: bound, so it can be passed as `resolve`. */
    this.bytes = this.bytes.bind(this);
  }

  /** The project's refs, in order. */
  refs() { return this.manifest.files.filter((f) => f.role === 'project').map((f) => f.path.slice(PROJECT_DIR.length)); }
  /** Whether the build holds a project file. @param {string} ref */
  has(ref) { return this.byPath.has(PROJECT_DIR + normRef(ref)); }
  /** A project file's row (size, hash, licence), or null. @param {string} ref */
  info(ref) { return this.byPath.get(PROJECT_DIR + normRef(ref)) ?? null; }
  /** A project file's path under the build's root, for a URL or an import. @param {string} ref */
  path(ref) { return this.row(ref).path; }

  /** A ref is looked up as the exporter spelled it: NFC, no leading `./` (paths.js normRef). @param {string} ref */
  row(ref) {
    const f = this.byPath.get(PROJECT_DIR + normRef(ref));
    if (!f) throw new BuildError('not_in_build', `${ref} is not in this build: a document names it that the export didn't follow, so add it to "include" in game.json and export again`, [ref]);
    return f;
  }

  /** One file of the build by its path, checked against its row the first time it is read. @param {import('./manifest.js').BuildFile} f */
  async file(f) {
    let bytes;
    // a file the manifest lists that can't be read: the folder is not the whole build (an export cut short after its
    // manifest was in place, or a folder copied in part)
    try { bytes = await this.read(f.path); } catch (e) { throw new BuildError('incomplete', `this build is incomplete: ${f.path}, which its manifest lists, is not there (${e?.message ?? e}). Its export was cut short, or the folder was copied in part: export again`, [f.path]); }
    if (this.verify && !this.checked.has(f.path)) {
      if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) throw new BuildError('changed', `${f.path} is not the file this build was exported with`, [f.path]);
      this.checked.add(f.path);
    }
    return bytes;
  }

  /** A project file's bytes by ref. @param {string} ref @returns {Promise<Uint8Array>} */
  async bytes(ref) { return this.file(this.row(ref)); }
  /** @param {string} ref */ async text(ref) { return text(await this.bytes(ref)); }
  /** @param {string} ref */ async json(ref) { return JSON.parse(await this.text(ref)); }

  /** The game's action map (@vrmxg/input's `actions`), or null for the engine's default. */
  async actions() {
    const input = this.game.input;
    if (!input) return null;
    const doc = typeof input === 'string' ? await this.json(input) : input;
    return doc.actions ?? doc.input?.actions ?? null;
  }

  /**
   * A module and every module it imports by a relative specifier, each read and checked against the manifest, in the
   * order they are found. A module that imports a file the build doesn't hold is refused before anything runs.
   * @param {string} ref @returns {Promise<string[]>}
   */
  async modules(ref) {
    const seen = [normRef(ref)];
    for (let i = 0; i < seen.length; i++) {
      for (const spec of moduleImports(await this.text(seen[i]), seen[i])) { // refuses a module it can't read for certain
        if (!/^\.{1,2}\//.test(spec)) continue; // '@vrmxg/core': the runtime's own, through its import map
        const target = resolveFrom(seen[i], spec);
        if (target === null || !this.has(target)) throw new BuildError('not_in_build', `${seen[i]} imports ${spec}, which is not in this build`, [target ?? spec]);
        if (!seen.includes(normRef(target))) seen.push(normRef(target));
      }
    }
    return seen;
  }

  /**
   * The project's behaviours, by the names its scenes use: the functions its behaviours module exports. The module is
   * imported from the build as the project wrote it; `importModule` gets its path under the build's root.
   *
   * Before the import, the module and every module it imports relatively are read and checked against the manifest
   * (`modules`), so a changed or missing module stops here, before any of them runs. What that does not give: the
   * import itself fetches the files again by URL, so the bytes that run are checked a moment before they are loaded,
   * not as they are loaded, and a module reached only by `import()` of a computed path is not checked at all.
   *
   * A behaviour that declares itself (M6 W0) carries its declaration in the module, as a static `describe` on its
   * class, so the build needs nothing beside the module to read it: `declareProjectBehaviours(registry, map)` from
   * @vrmxg/registry (the world builder does it). Each is declared here into the engine's registry, as the world builder
   * will declare it, so a declaration the registry refuses (a typo'd key, an unknown node type in `on`, a schema that
   * isn't one, a clash with an engine behaviour's name) stops the game here, by name.
   * @param {(path: string) => Promise<Record<string, any>>} importModule
   * @returns {Promise<Map<string, any>>}
   */
  async behaviours(importModule) {
    const ref = this.game.behaviours;
    if (!ref) return new Map();
    await this.modules(ref);
    const mod = await importModule(this.path(ref));
    const map = new Map(Object.entries(mod).filter(([, v]) => typeof v === 'function'));
    try { declareProjectBehaviours(m0Registry(), map); } catch (e) { throw new BuildError('bad_behaviours', `${ref}: ${e.message}`, [ref]); }
    return map;
  }

  /** Read every file of the build, the runtime's too, against the manifest. */
  async verifyAll() {
    const was = this.verify;
    this.verify = true;
    try { for (const f of this.manifest.files) await this.file(f); } finally { this.verify = was; }
    return { files: this.manifest.files.length, bytes: this.manifest.bytes, digest: this.manifest.digest };
  }
}

/**
 * Open a build.
 * @param {(path: string) => Promise<Uint8Array>} read a file of the build by its path under the build's root
 * @param {{ verify?: boolean }} [o] verify: check each file's hash the first time it is read (on by default)
 * @returns {Promise<Build>}
 */
export async function openBuild(read, o = {}) {
  let body;
  try { body = text(await read(BUILD_FILE)); } catch (e) { throw new BuildError('bad_manifest', `no ${BUILD_FILE} here (${e.message}): this isn't a build, or its export didn't finish`, [BUILD_FILE]); }
  return new Build(parseManifest(body), read, o);
}

/**
 * A reader over `fetch`, for a runtime's page: files of the build relative to `base` (the folder of the entry page).
 * @param {string} [base]
 * @returns {(path: string) => Promise<Uint8Array>}
 */
export function fetchReader(base = './') {
  return async (path) => {
    const r = await fetch(base + path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };
}
