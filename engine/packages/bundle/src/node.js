// Builds on disk, for Node: tools, tests, the MCP server, the command line. Not in a browser bundle (node:fs).
//
//   const r = await exportToFolder({ project: 'content/sample', runtime: 'engine/packages/bundle/runtime/dist', out });
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
import { BuildError, sortPaths, checkPath } from './paths.js';
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
export const STAGING = '.vrmxg-export-';

/**
 * What a folder holds, without following a link: regular files, folders, and everything else (`foreign`: symbolic
 * links, sockets, devices), as paths relative to it. `.DS_Store` files are left out. Top-level folders an interrupted
 * export left (`.vrmxg-export-*`) are listed apart, as `stale`, and not looked into.
 * @param {string} dir
 */
export function scanFolder(dir) {
  const files = [], dirs = [], foreign = [], stale = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) foreign.push(r);
      else if (e.isDirectory()) { if (!rel && e.name.startsWith(STAGING)) stale.push(r); else { dirs.push(r); walk(path.join(d, e.name), r); } }
      else if (e.isFile()) { if (e.name !== '.DS_Store') files.push(r); }
      else foreign.push(r);
    }
  };
  walk(dir, '');
  return { files: sortPaths(files), dirs: sortPaths(dirs), foreign: sortPaths(foreign), stale: sortPaths(stale) };
}

const few = (list) => `${list.slice(0, 3).join(', ')}${list.length > 3 ? `, and ${list.length - 3} more` : ''}`;

/**
 * Decide whether a folder can take a build, and change nothing. It may be absent, empty, or hold an earlier build:
 * then every file in it is one that build's manifest lists (those are `old`, to be replaced). It is refused when it
 * holds a file the manifest doesn't list, a symbolic link or special file anywhere, or a manifest this exporter
 * doesn't read: an export never deletes what a build didn't write, and never writes through a link out of the folder.
 * @param {string} dir
 * @returns {{ root: string, created: boolean, old: string[], dirs: string[], stale: string[] }}
 */
export function planFolder(dir) {
  const at = path.resolve(dir), name = path.basename(at);
  const refuse = (why, files = []) => new BuildError('not_empty', `${name} ${why}: export into an empty folder`, files);
  if (!fs.existsSync(at)) {
    if (fs.lstatSync(at, { throwIfNoEntry: false })) throw refuse('is a link that leads nowhere', [name]);
    return { root: at, created: true, old: [], dirs: [], stale: [] };
  }
  const root = fs.realpathSync(at); // the folder the person named, wherever a link to it led
  if (!fs.statSync(root).isDirectory()) throw refuse('is a file, not a folder', [name]);
  const scan = scanFolder(root);
  if (scan.foreign.length) throw refuse(`holds a link or a special file (${few(scan.foreign)})`, scan.foreign);
  // what a build wrote here: the files its manifest lists, and the ones an export that was cut short had moved in
  const listed = new Set([BUILD_FILE]);
  const manifests = [path.join(root, BUILD_FILE), ...scan.stale.map((d) => path.join(root, d, BUILD_FILE))].filter((f) => fs.lstatSync(f, { throwIfNoEntry: false })?.isFile());
  for (const f of manifests) {
    let old;
    try { old = parseManifest(fs.readFileSync(f, 'utf8')); } catch (e) { throw refuse(`has a ${BUILD_FILE} this exporter can't read (${e.message})`, [BUILD_FILE]); }
    for (const row of old.files) listed.add(row.path);
  }
  const stray = scan.files.filter((f) => !listed.has(f));
  if (stray.length) throw refuse(manifests.length ? `holds files its build doesn't list (${few(stray)})` : `holds files that aren't a build's (${few(stray)})`, stray);
  return { root, created: false, old: scan.files, dirs: scan.dirs, stale: scan.stale };
}

/**
 * Open a folder for a build. The files are written into a staging folder inside it and moved into place by
 * `commit()`, which first takes the earlier build's files away: until then the folder is as it was, so an export that
 * fails or is aborted leaves an earlier build whole and the folder free for another try.
 * @param {string} dir
 */
export function stageFolder(dir) {
  const plan = planFolder(dir), root = plan.root;
  if (plan.created) fs.mkdirSync(root, { recursive: true });
  const staging = path.join(root, STAGING + globalThis.crypto.randomUUID());
  fs.mkdirSync(staging);
  const written = new Set();
  let moving = false, closed = false;
  /** Folders from `base` down to `rel`'s folder, each made if missing; a link or a file in the way is refused. */
  const folders = (base, rel) => {
    let d = base;
    for (const seg of rel.split('/').slice(0, -1)) {
      d = path.join(d, seg);
      const st = fs.lstatSync(d, { throwIfNoEntry: false });
      if (!st) fs.mkdirSync(d);
      else if (!st.isDirectory()) throw new BuildError('bad_path', `${rel}: ${path.relative(root, d)} is not a folder of the build's`, [rel]);
    }
  };
  return {
    root,
    /** Write one file of the build, or with `append` add to one already begun. @param {string} p @param {Uint8Array} bytes @param {{ append?: boolean }} [o] */
    write: async (p, bytes, { append = false } = {}) => {
      if (closed) throw new BuildError('no_build', 'this export has ended');
      checkPath(p, 'the build file');
      const file = path.join(staging, p);
      if (append !== written.has(p)) throw new BuildError('bad_path', append ? `${p} can't be added to before it is begun` : `${p} is written twice`, [p]);
      folders(staging, p);
      if (append) fs.appendFileSync(file, bytes); else fs.writeFileSync(file, bytes, { flag: 'wx' });
      written.add(p);
    },
    /** Take the earlier build away and move this one into place, the manifest last. */
    commit: () => {
      if (closed) throw new BuildError('no_build', 'this export has ended');
      if (!written.has(BUILD_FILE)) throw new BuildError('bad_manifest', `the export wrote no ${BUILD_FILE}`, [BUILD_FILE]);
      const now = planFolder(root); // the folder as it is now: decided again before anything is removed
      moving = true;
      for (const f of now.old) fs.rmSync(path.join(root, f));
      for (const p of [...[...written].filter((x) => x !== BUILD_FILE), BUILD_FILE]) {
        folders(root, p);
        if (fs.lstatSync(path.join(root, p), { throwIfNoEntry: false })) throw new BuildError('bad_path', `${p} is in the way in ${path.basename(root)}`, [p]);
        fs.renameSync(path.join(staging, p), path.join(root, p));
      }
      for (const d of now.stale) fs.rmSync(path.join(root, d), { recursive: true, force: true }); // this export's staging, and any left by one cut short
      for (const d of [...now.dirs].sort((a, b) => b.length - a.length)) { try { fs.rmdirSync(path.join(root, d)); } catch { /* still in use by the new build */ } }
      closed = true;
      return { path: root, files: written.size - 1 };
    },
    /** Drop what this export wrote. Once `commit` has begun moving files it does nothing: the next export finishes the job. */
    abort: () => {
      if (closed || moving) return;
      closed = true;
      fs.rmSync(staging, { recursive: true, force: true });
      if (plan.created) { try { fs.rmdirSync(root); } catch { /* something else is in it now */ } }
    },
  };
}

/**
 * Export a project folder as a build folder. Every check runs before the folder is touched, and the build is staged
 * and moved in whole (`stageFolder`), so a refused or failed export leaves an earlier build as it was.
 * @param {{ project: string, runtime: string, out: string, game?: any, onProgress?: any }} o
 */
export async function exportToFolder({ project, runtime, out, game = null, onProgress = null }) {
  const src = folderReader(project);
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

/** The loader over a build folder. @param {string} dir @param {{ verify?: boolean }} [o] */
export const openFolder = (dir, o) => openBuild(folderReader(dir).read, o);

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
  return { ok: !missing.length && !changed.length && !extra.length, files: manifest.files.length, bytes: manifest.bytes, digest: manifest.digest, manifest: sha256(fs.readFileSync(path.join(root, BUILD_FILE))), missing, changed, extra };
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
