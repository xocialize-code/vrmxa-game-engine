// Builds on disk, for Node: tools, tests, the MCP server, the command line. Not in a browser bundle (node:fs).
//
//   const r = await exportToFolder({ project: 'content/sample', runtime: 'apps/game/dist', out });   // the game app (M5 W1)
//   const build = await openFolder(out);                                  // the loader over a folder
//   const behaviours = await build.behaviours(behavioursImporter(out));   // '@vrmxg/core' handed to the project's modules
//   checkFolder(out)            the folder holds exactly what its manifest lists, each file with its hash
//   stageFolder(out)            where an export writes: staged, then moved in whole (planFolder decides, deleting nothing)
//   compareFolders(a, b)        two folders byte for byte
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { sha256 } from './sha256.js';
import { BuildError, sortPaths, checkPath, RESERVED_PREFIX } from './paths.js';
import { exportBuild } from './export.js';
import { openBuild } from './loader.js';
import { BUILD_FILE, parseManifest } from './manifest.js';

/**
 * Every file under a folder as a sorted list of paths relative to it. Hidden files and folders are skipped, as the
 * editor's project listing and the Mac shell's skip them.
 * @param {string} dir @param {{ hidden?: boolean }} [o] hidden: list hidden files too (a build is compared whole)
 */
export function listFolder(dir, { hidden = false } = {}) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!hidden && e.name.startsWith('.')) continue;
      if (e.name === '.DS_Store') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '');
  return sortPaths(out);
}

/** A folder as the exporter and the loader read one. @param {string} dir */
export function folderReader(dir) {
  const root = path.resolve(dir);
  return {
    get files() { return listFolder(root); },
    /** @param {string} p @returns {Promise<Uint8Array>} */
    read: async (p) => {
      const file = path.resolve(root, p);
      if (file !== root && !file.startsWith(root + path.sep)) throw new BuildError('bad_path', `${p} is outside ${dir}`, [p]);
      return new Uint8Array(fs.readFileSync(file));
    },
  };
}

/** The folder inside a build's folder that an export writes into until it is whole (`.vrmxg-export-<id>`). */
export const STAGING = `${RESERVED_PREFIX}-`;
/** Inside a staging folder: where the earlier build's files wait while the new one moves in, to be put back if it can't. */
const HELD = '.held';

/**
 * What a folder holds, without following a link: regular files, folders, and everything else (`foreign`: symbolic
 * links, sockets, devices), as paths relative to it. `.DS_Store` files are apart, as `junk`: the Finder's, never a
 * build's and never in the way. Top-level folders an export left (`.vrmxg-export-*`) are `stale`, and not looked into.
 * @param {string} dir
 */
export function scanFolder(dir) {
  const files = [], dirs = [], foreign = [], stale = [], junk = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) foreign.push(r);
      else if (e.isDirectory()) { if (!rel && e.name.startsWith(RESERVED_PREFIX)) stale.push(r); else { dirs.push(r); walk(path.join(d, e.name), r); } }
      else if (e.isFile()) (e.name === '.DS_Store' ? junk : files).push(r);
      else foreign.push(r);
    }
  };
  walk(dir, '');
  return { files: sortPaths(files), dirs: sortPaths(dirs), foreign: sortPaths(foreign), stale: sortPaths(stale), junk: sortPaths(junk) };
}

const few = (list) => `${list.slice(0, 3).join(', ')}${list.length > 3 ? `, and ${list.length - 3} more` : ''}`;
// what is at a path, a link not followed; undefined when nothing is, or when a file stands where a folder of the path would be
const lstat = (f) => { try { return fs.lstatSync(f, { throwIfNoEntry: false }); } catch (e) { if (e?.code === 'ENOTDIR') return undefined; throw e; } };

/**
 * Decide whether a folder can take a build, and change nothing. It may be absent, empty, or hold an earlier build:
 * then every file in it is one that build's manifest lists (those are `old`, to be replaced). It is refused when it
 * holds a file the manifest doesn't list, a symbolic link or special file anywhere, or a manifest this exporter
 * doesn't read: an export never deletes what a build didn't write, and never writes through a link out of the folder.
 * Only the folder's own vrmxg-build.json says what a build wrote: nothing in a staging folder does.
 * @param {string} dir
 * @returns {{ root: string, created: boolean, old: string[], dirs: string[], junk: string[], stale: string[], manifest: import('./manifest.js').Manifest | null }}
 */
export function planFolder(dir) {
  const at = path.resolve(dir), name = path.basename(at);
  const refuse = (why, files = []) => new BuildError('not_empty', `${name} ${why}: export into an empty folder`, files);
  if (!fs.existsSync(at)) {
    if (lstat(at)) throw refuse('is a link that leads nowhere', [name]);
    return { root: at, created: true, old: [], dirs: [], junk: [], stale: [], manifest: null };
  }
  const root = fs.realpathSync(at); // the folder the person named, wherever a link to it led
  if (!fs.statSync(root).isDirectory()) throw refuse('is a file, not a folder', [name]);
  const scan = scanFolder(root);
  if (scan.foreign.length) throw refuse(`holds a link or a special file (${few(scan.foreign)})`, scan.foreign);
  let manifest = null;
  if (scan.files.includes(BUILD_FILE)) {
    try { manifest = parseManifest(fs.readFileSync(path.join(root, BUILD_FILE), 'utf8')); } catch (e) { throw refuse(`has a ${BUILD_FILE} this exporter can't read (${e.message})`, [BUILD_FILE]); }
  }
  const listed = new Set([BUILD_FILE, ...(manifest?.files.map((f) => f.path) ?? [])]);
  const stray = scan.files.filter((f) => !listed.has(f));
  if (stray.length) throw refuse(manifest ? `holds files its build doesn't list (${few(stray)})` : `holds files that aren't a build's (${few(stray)})`, stray);
  return { root, created: false, old: scan.files, dirs: scan.dirs, junk: scan.junk, stale: scan.stale, manifest };
}

/** Folders from `base` down to `rel`'s folder, each made if missing; a link or a file in the way is refused. */
function folders(base, rel) {
  let d = base;
  for (const seg of rel.split('/').slice(0, -1)) {
    d = path.join(d, seg);
    const st = lstat(d);
    if (!st) fs.mkdirSync(d);
    else if (!st.isDirectory()) throw new BuildError('bad_path', `${rel}: ${seg} is in the way, and is not a folder`, [rel]);
  }
}

/**
 * Clear away the staging folders earlier exports left in a build's folder (one that was killed, or lost its page).
 * Nothing in them is licence to delete or overwrite anything outside them. The one thing taken from them: a file the
 * folder's own manifest lists, with the size and SHA-256 it lists, that is missing from the folder, is moved in. That
 * finishes a build whose files were on their way in, or puts back an earlier one whose files were on their way out,
 * whichever the committed manifest describes. Then each staging folder is removed.
 * @param {string} root the build's folder (resolved)
 */
export function recoverFolder(root) {
  const scan = scanFolder(root);
  if (!scan.stale.length) return { moved: [], removed: [] };
  let rows = new Map();
  try { rows = new Map(parseManifest(fs.readFileSync(path.join(root, BUILD_FILE), 'utf8')).files.map((f) => [f.path, f])); } catch { /* no manifest the folder vouches for: nothing is moved in */ }
  const moved = [];
  for (const s of scan.stale) {
    const inside = scanFolder(path.join(root, s));
    for (const f of inside.files) {
      const rel = f.startsWith(`${HELD}/`) ? f.slice(HELD.length + 1) : f, row = rows.get(rel), from = path.join(root, s, f);
      if (!row || rel === BUILD_FILE || lstat(path.join(root, rel))) continue;
      const bytes = fs.readFileSync(from);
      if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) continue;
      try { folders(root, rel); fs.renameSync(from, path.join(root, rel)); moved.push(rel); } catch { /* something is in the way: the folder stays as it is */ }
    }
    fs.rmSync(path.join(root, s), { recursive: true, force: true }); // links in it are unlinked, never followed
  }
  return { moved, removed: scan.stale };
}

/**
 * Open a folder for a build. The files are written into a staging folder inside it and moved into place by
 * `commit()`: until then the folder is as it was, so an export that fails or is aborted leaves an earlier build whole
 * and the folder free for another try. `commit()` leaves either the earlier build or the new one, never neither.
 * @param {string} dir
 */
export function stageFolder(dir) {
  const first = planFolder(dir), root = first.root;
  if (first.created) fs.mkdirSync(root, { recursive: true });
  else if (first.stale.length) recoverFolder(root);
  planFolder(root); // as it is now, after anything a cut-short export left was put right
  const staging = path.join(root, STAGING + globalThis.crypto.randomUUID());
  fs.mkdirSync(staging);
  /** @type {Map<string, number>} what this export has written, and how many bytes of each */
  const written = new Map();
  let closed = false;
  const drop = () => { closed = true; fs.rmSync(staging, { recursive: true, force: true }); };
  return {
    root,
    /**
     * Write one file of the build, or the next piece of one: `offset` is where the piece begins, 0 for a file's first.
     * A piece that leaves a gap, or lands on bytes already written (one sent twice), is refused.
     * @param {string} p @param {Uint8Array} bytes @param {{ offset?: number }} [o]
     */
    write: async (p, bytes, { offset = 0 } = {}) => {
      if (closed) throw new BuildError('no_build', 'this export has ended');
      checkPath(p, 'the build file');
      const have = written.get(p);
      if (offset === 0 && have !== undefined) throw new BuildError('bad_path', `${p} is written twice`, [p]);
      if (offset !== 0 && offset !== have) throw new BuildError('bad_path', `${p}: a piece at ${offset}, and ${have === undefined ? 'the file is not begun' : `the file has ${have} bytes`}`, [p]);
      folders(staging, p);
      if (offset === 0) fs.writeFileSync(path.join(staging, p), bytes, { flag: 'wx' }); else fs.appendFileSync(path.join(staging, p), bytes);
      written.set(p, (have ?? 0) + bytes.length);
    },
    /**
     * Check the staged files against the manifest they came with, then replace the earlier build with them. Nothing of
     * the earlier build is touched until every check has passed; its files are then held aside, not deleted, and put
     * back if any step fails.
     */
    commit: () => {
      if (closed) throw new BuildError('no_build', 'this export has ended');
      let now;
      try {
        // 1: what was staged is what its manifest lists, file for file, size for size, hash for hash
        if (!written.has(BUILD_FILE)) throw new BuildError('bad_manifest', `the export wrote no ${BUILD_FILE}`, [BUILD_FILE]);
        const manifest = parseManifest(fs.readFileSync(path.join(staging, BUILD_FILE), 'utf8'));
        const want = new Map(manifest.files.map((f) => [f.path, f]));
        const extra = [...written.keys()].filter((p) => p !== BUILD_FILE && !want.has(p)), missing = [...want.keys()].filter((p) => !written.has(p));
        if (extra.length || missing.length) throw new BuildError('bad_manifest', `the export's files are not the ones its manifest lists (${missing.length} missing${missing.length ? `: ${few(missing)}` : ''}; ${extra.length} not listed${extra.length ? `: ${few(extra)}` : ''})`, [...missing, ...extra]);
        for (const [p, row] of want) {
          const bytes = fs.readFileSync(path.join(staging, p));
          if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new BuildError('changed', `${p} was not written whole: it is not the file the manifest lists`, [p]);
        }
        // 2: the folder as it is now, decided again before anything of it is touched
        now = planFolder(root);
      } catch (e) { drop(); if (first.created) { try { fs.rmdirSync(root); } catch { /* not empty */ } } throw e; }
      const held = path.join(staging, HELD), away = [], madeDirs = [], arrived = [];
      let replacedManifest = false;
      try {
        // 3: the earlier build's files out of the way (its manifest stays: it still says what the folder holds), then
        //    its folders, so a path that was a folder can be a file now, and a folder's name can change its case
        fs.mkdirSync(held);
        for (const f of now.old) {
          if (f === BUILD_FILE) { fs.copyFileSync(path.join(root, f), path.join(held, f)); continue; }
          folders(held, f); fs.renameSync(path.join(root, f), path.join(held, f)); away.push(f);
        }
        for (const f of now.junk) if (f.includes('/')) fs.rmSync(path.join(root, f)); // a .DS_Store in a folder of the build's
        for (const d of [...now.dirs].sort((a, b) => b.length - a.length)) fs.rmdirSync(path.join(root, d));
        // 4: the new manifest over the old in one step, then the files it lists. From here the folder's manifest is the
        //    new build's, and every file in the folder is one it lists
        fs.renameSync(path.join(staging, BUILD_FILE), path.join(root, BUILD_FILE)); replacedManifest = true;
        for (const p of written.keys()) {
          if (p === BUILD_FILE) continue;
          let d = root;
          for (const seg of p.split('/').slice(0, -1)) { d = path.join(d, seg); if (!lstat(d)) { fs.mkdirSync(d); madeDirs.push(d); } else if (!lstat(d).isDirectory()) throw new BuildError('bad_path', `${p}: ${seg} is in the way`, [p]); }
          if (lstat(path.join(root, p))) throw new BuildError('bad_path', `${p} is in the way in ${path.basename(root)}`, [p]);
          fs.renameSync(path.join(staging, p), path.join(root, p)); arrived.push(p);
        }
      } catch (e) {
        // Undo it. The manifest first, because it decides which build the folder is: if the earlier one can't be put
        // back over the new, the folder stays the new build's, half moved in, with the rest of its files (and the
        // earlier build's, held) left in the staging folder, and the next export into it finishes the new build
        if (replacedManifest && now.old.includes(BUILD_FILE)) {
          try { fs.renameSync(path.join(held, BUILD_FILE), path.join(root, BUILD_FILE)); } catch {
            closed = true;
            throw new BuildError('failed', `${e.message}; and the earlier build's manifest could not be put back, so the folder is the new build's, incomplete: the rest of it is kept in ${path.basename(staging)}, and the next export into this folder finishes it`, [BUILD_FILE]);
          }
        } else if (replacedManifest) fs.rmSync(path.join(root, BUILD_FILE), { force: true });
        // then the earlier build's files, as they were
        for (const p of arrived) fs.rmSync(path.join(root, p), { force: true });
        for (const d of madeDirs.reverse()) { try { fs.rmdirSync(d); } catch { /* not empty */ } }
        const kept = []; // what of the earlier build could not be put back
        for (const f of away) { try { folders(root, f); fs.renameSync(path.join(held, f), path.join(root, f)); } catch { kept.push(f); } }
        if (!kept.length) { drop(); throw e; }
        // what couldn't be put back stays where it is held: dropping the staging folder now would delete it. The next
        // export into this folder moves in whatever the folder's manifest vouches for (recoverFolder)
        closed = true;
        throw new BuildError('failed', `${e.message}; and ${kept.length} file${kept.length === 1 ? '' : 's'} of the earlier build could not be put back (${few(kept)}): kept in ${path.basename(staging)}, and restored by the next export into this folder`, kept);
      }
      drop();
      return { path: root, files: written.size - 1 };
    },
    /** Drop what this export wrote: the folder is as it was. */
    abort: () => {
      if (closed) return;
      drop();
      if (first.created) { try { fs.rmdirSync(root); } catch { /* something else is in it now */ } }
    },
  };
}

/**
 * A project folder exported as one of the games it holds (M5 W10): `gameFile` is a game document in the project
 * (`game/game.json`), read as the project's game.json, so the build's own game.json is that document. Nothing is
 * copied on disk.
 * @param {string} dir @param {string} gameFile a project ref
 * @returns {{ files: string[], read: (ref: string) => Promise<Uint8Array>, game: any }}
 */
export function projectWithGame(dir, gameFile) {
  const src = folderReader(dir);
  if (!src.files.includes(gameFile)) throw new BuildError('bad_game', `the project has no ${gameFile}`, [gameFile]);
  const bytes = new Uint8Array(fs.readFileSync(path.join(path.resolve(dir), gameFile)));
  let game;
  try { game = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new BuildError('bad_game', `${gameFile} is not JSON: ${e.message}`, [gameFile]); }
  const files = src.files.includes('game.json') ? src.files : [...src.files, 'game.json'].sort();
  return { files, read: async (ref) => (ref === 'game.json' ? bytes : src.read(ref)), game };
}

/**
 * Export a project folder as a build folder. Every check runs before the folder is touched, and the build is staged
 * and moved in whole (`stageFolder`), so a refused or failed export leaves an earlier build as it was.
 * @param {{ project: string, runtime: string, out: string, game?: any, gameFile?: string | null, onProgress?: any }} o gameFile: a game document in the project to export (M5 W10, `--game`), read as its game.json
 */
export async function exportToFolder({ project, runtime, out, game = null, gameFile = null, onProgress = null }) {
  const src = gameFile ? projectWithGame(project, gameFile) : folderReader(project);
  game ??= /** @type {any} */ (src).game ?? null;
  let stage = null;
  try {
    const r = await exportBuild({
      project: { files: src.files, read: src.read }, runtime: folderReader(runtime), game, onProgress,
      ready: () => { stage = stageFolder(out); }, write: (p, bytes) => stage.write(p, bytes),
    });
    stage.commit();
    return { ...r, out: stage.root };
  } catch (e) { stage?.abort(); throw e; }
}

/**
 * The loader over a build folder. A folder whose manifest lists files that are not there is refused as incomplete,
 * naming them: an export cut short after its manifest was put in place must not pass for a build.
 * @param {string} dir @param {{ verify?: boolean }} [o]
 */
export async function openFolder(dir, o) {
  const root = path.resolve(dir), build = await openBuild(folderReader(root).read, o);
  const missing = build.manifest.files.filter((f) => !lstat(path.join(root, f.path))?.isFile()).map((f) => f.path);
  if (missing.length) throw new BuildError('incomplete', `this build is incomplete: ${missing.length} of the ${build.manifest.files.length} files its manifest lists ${missing.length === 1 ? 'is' : 'are'} not there (${few(missing)}). Its export was cut short, or the folder was copied in part: export again`, missing);
  return build;
}

const hooked = new Map();
/**
 * What a runtime's import map does, for Node: an importer for a build's modules that hands them `@vrmxg/core`. A
 * project's behaviours import the engine's core by name, and the copy they get has to be the one the world runs on.
 * @param {string} dir the build's folder @param {{ core?: string }} [o] core: the URL of the engine's core (default: the
 *   one this package resolves)
 * @returns {(p: string) => Promise<Record<string, any>>}
 */
export function behavioursImporter(dir, { core } = {}) {
  const base = pathToFileURL(fs.realpathSync(path.resolve(dir)) + path.sep).href; // the real path: Node resolves a module's own URL through symlinks (/var → /private/var)
  const url = core ?? import.meta.resolve('@vrmxg/core');
  if (!hooked.has(base)) {
    registerHooks({ resolve(specifier, context, next) { return specifier === '@vrmxg/core' && context.parentURL?.startsWith(base) ? { url: hooked.get(base), shortCircuit: true } : next(specifier, context); } });
  }
  hooked.set(base, url);
  return (p) => import(new URL(p.split('/').map(encodeURIComponent).join('/'), base).href);
}

/**
 * Whether a folder is the build its manifest describes: every listed file there with its size and hash, and nothing
 * else beside them.
 * @param {string} dir
 */
export function checkFolder(dir) {
  const root = path.resolve(dir);
  const manifest = parseManifest(fs.readFileSync(path.join(root, BUILD_FILE), 'utf8'));
  const scan = scanFolder(root), there = new Set(scan.files), missing = [], changed = [];
  for (const f of manifest.files) {
    if (!there.delete(f.path)) { missing.push(f.path); continue; }
    const bytes = fs.readFileSync(path.join(root, f.path));
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) changed.push(f.path);
  }
  there.delete(BUILD_FILE);
  const extra = sortPaths([...there, ...scan.foreign, ...scan.stale]); // a link is never a build's file, whatever it points at
  // `state`: 'whole'; 'incomplete' when files the manifest lists are not there (an export cut short while its files were
  // moving in, or a folder copied in part: the next export into it finishes or replaces it); else 'different'
  const ok = !missing.length && !changed.length && !extra.length, state = ok ? 'whole' : missing.length ? 'incomplete' : 'different';
  return { ok, state, files: manifest.files.length, bytes: manifest.bytes, digest: manifest.digest, manifest: sha256(fs.readFileSync(path.join(root, BUILD_FILE))), missing, changed, extra };
}

/** Two folders compared byte for byte, every file. @param {string} a @param {string} b */
export function compareFolders(a, b) {
  const sa = scanFolder(a), sb = scanFolder(b);
  const la = [...sa.files, ...sa.foreign, ...sa.stale], lb = new Set([...sb.files, ...sb.foreign, ...sb.stale]);
  const fa = new Set(sa.files), fb = new Set(sb.files), onlyA = [], differ = [];
  for (const f of la) {
    if (!lb.delete(f)) { onlyA.push(f); continue; }
    // a link, or a folder left by an export cut short, is a difference, whatever is behind it
    if (!fa.has(f) || !fb.has(f) || !fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))) differ.push(f);
  }
  const onlyB = sortPaths(lb);
  return { same: !onlyA.length && !onlyB.length && !differ.length, files: la.length, onlyA: sortPaths(onlyA), onlyB, differ: sortPaths(differ) };
}

export const SOURCES_FORMAT = 'vrmxg-runtime-sources';

/**
 * A runtime's source stamp (M5 W1): every source file its bundle was built from, with its SHA-256, so a tool can tell a
 * runtime folder built from older sources than the checkout's. The runtime's own version is a manifest field anyone can
 * keep the same; this changes whenever a bundled file does. Paths are relative to `base` (the stamp file's folder).
 * @param {{ files: string[], base: string, runtime?: string }} o files: absolute paths → { format, version, digest, runtime, files }
 */
export function runtimeSources({ files, base, runtime = null }) {
  const rows = [...new Set(files)].map((f) => ({ path: path.relative(base, f).split(path.sep).join('/'), sha256: sha256(new Uint8Array(fs.readFileSync(f))) }));
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  // of the contents only, sorted: the same sources give the same digest wherever the checkout is (the paths to a package
  // beside the repository differ between a worktree and the main checkout)
  const digest = sha256(new TextEncoder().encode(rows.map((r) => r.sha256).sort().join('\n')));
  return { format: SOURCES_FORMAT, version: 1, digest, runtime, files: rows };
}

/**
 * Is a runtime still the build of the sources beside it? Reads a stamp file (runtimeSources' document) and hashes each
 * file again. → { ok, digest, runtime, changed, missing } (paths as the stamp spells them); `missing: ['<stamp file>']`
 * with ok false when there is no stamp to check.
 * @param {string} file the stamp file
 */
export function checkRuntimeSources(file) {
  if (!fs.existsSync(file)) return { ok: false, digest: null, runtime: null, changed: [], missing: [path.basename(file)] };
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (doc?.format !== SOURCES_FORMAT || doc.version !== 1 || !Array.isArray(doc.files)) throw new Error(`${file} is not a runtime's source stamp`);
  const base = path.dirname(file), changed = [], missing = [];
  for (const r of doc.files) {
    const f = path.resolve(base, r.path);
    if (!fs.existsSync(f)) missing.push(r.path);
    else if (sha256(new Uint8Array(fs.readFileSync(f))) !== r.sha256) changed.push(r.path);
  }
  return { ok: !changed.length && !missing.length, digest: doc.digest, runtime: doc.runtime ?? null, changed, missing };
}
