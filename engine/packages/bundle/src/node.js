// Builds on disk, for Node: tools, tests, the MCP server, the command line. Not in a browser bundle (node:fs).
//
//   const r = await exportToFolder({ project: 'content/sample', runtime: 'engine/packages/bundle/runtime/dist', out });
//   const build = await openFolder(out);                                  // the loader over a folder
//   const behaviours = await build.behaviours(behavioursImporter(out));   // '@vrmxg/core' handed to the project's modules
//   checkFolder(out)            the folder holds exactly what its manifest lists, each file with its hash
//   compareFolders(a, b)        two folders byte for byte
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { sha256 } from './sha256.js';
import { BuildError, sortPaths } from './paths.js';
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

/**
 * Make a folder ready to take a build: it may be absent, empty, or hold an earlier build, whose files (the ones its
 * manifest lists, and nothing else) are removed. A folder holding anything else is refused: an export never deletes
 * what it didn't write.
 * @param {string} dir
 */
export function prepareFolder(dir) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) { fs.mkdirSync(root, { recursive: true }); return root; }
  const manifest = path.join(root, BUILD_FILE);
  if (fs.existsSync(manifest)) {
    const old = parseManifest(fs.readFileSync(manifest, 'utf8'));
    for (const f of old.files) fs.rmSync(path.join(root, f.path), { force: true });
    fs.rmSync(manifest);
    const prune = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) { prune(path.join(d, e.name)); } if (d !== root && !fs.readdirSync(d).filter((n) => n !== '.DS_Store').length) fs.rmSync(d, { recursive: true }); };
    prune(root);
  }
  const left = listFolder(root, { hidden: true });
  if (left.length) throw new BuildError('not_empty', `${dir} holds files that aren't a build's (${left.slice(0, 3).join(', ')}${left.length > 3 ? `, and ${left.length - 3} more` : ''}): export into an empty folder`, left);
  return root;
}

/** Writes a build's files under a folder. @param {string} dir */
export function folderWriter(dir) {
  const root = path.resolve(dir);
  return async (p, bytes) => {
    const file = path.resolve(root, p);
    if (!file.startsWith(root + path.sep)) throw new BuildError('bad_path', `${p} is outside ${dir}`, [p]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  };
}

/**
 * Export a project folder as a build folder.
 * @param {{ project: string, runtime: string, out: string, game?: any, onProgress?: any }} o
 */
export async function exportToFolder({ project, runtime, out, game = null, onProgress = null }) {
  // every check runs before the folder is touched: a refused export leaves an earlier build as it was
  const src = folderReader(project), files = src.files, rt = folderReader(runtime);
  await exportBuild({ project: { files, read: src.read }, runtime: rt, game, write: null });
  const root = prepareFolder(out);
  const r = await exportBuild({ project: { files, read: src.read }, runtime: rt, game, write: folderWriter(root), onProgress });
  return { ...r, out: root };
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
  const there = new Set(listFolder(root, { hidden: true })), missing = [], changed = [];
  for (const f of manifest.files) {
    if (!there.delete(f.path)) { missing.push(f.path); continue; }
    const bytes = fs.readFileSync(path.join(root, f.path));
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) changed.push(f.path);
  }
  there.delete(BUILD_FILE);
  const extra = sortPaths(there);
  return { ok: !missing.length && !changed.length && !extra.length, files: manifest.files.length, bytes: manifest.bytes, digest: manifest.digest, manifest: sha256(fs.readFileSync(path.join(root, BUILD_FILE))), missing, changed, extra };
}

/** Two folders compared byte for byte, every file. @param {string} a @param {string} b */
export function compareFolders(a, b) {
  const la = listFolder(a, { hidden: true }), lb = new Set(listFolder(b, { hidden: true }));
  const onlyA = [], differ = [];
  for (const f of la) {
    if (!lb.delete(f)) { onlyA.push(f); continue; }
    if (!fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))) differ.push(f);
  }
  const onlyB = sortPaths(lb);
  return { same: !onlyA.length && !onlyB.length && !differ.length, files: la.length, onlyA, onlyB, differ };
}
