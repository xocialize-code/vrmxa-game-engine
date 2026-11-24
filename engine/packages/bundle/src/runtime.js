// A runtime: the prebuilt web app a build is played by. It is a folder with a table, vrmxg-runtime.json, that lists
// every other file in it with its size, SHA-256 and licence. The exporter copies a runtime in as it is, checking each
// file against the table; nothing is compiled when a game is exported (AB-D-0282).
//
// The contract a runtime keeps (RUNTIME_CONTRACT 1), so any build can sit around it:
//   - its `entry` (index.html) is the page a browser or the Mac shell opens, at the build's root;
//   - it reads ./vrmxg-build.json beside the entry, and the project's files from ./project/<ref> (use the loader);
//   - it imports the project's behaviour modules from ./project/ at run time, and its entry carries an import map that
//     gives them "@vrmxg/core" (the runtime's own copy of the engine's core);
//   - it has no file named vrmxg-build.json or vrmxg-runtime.json and none under project/.
import { sha256, sha256Text } from './sha256.js';
import { BuildError, pathProblem, sortPaths, caseClash } from './paths.js';

export const RUNTIME_FILE = 'vrmxg-runtime.json';
export const RUNTIME_FORMAT = 'vrmxg-runtime';
export const RUNTIME_VERSION = 1;
export const RUNTIME_CONTRACT = 1;
/** Names a runtime may not use: the build's own. */
export const RESERVED = ['vrmxg-build.json', RUNTIME_FILE];
export const PROJECT_DIR = 'project/';

const bad = (message, files = []) => new BuildError('bad_runtime', `${RUNTIME_FILE}: ${message}`, files);
const HEX = /^[0-9a-f]{64}$/;

/** The digest of a file table: the SHA-256 of a `<sha256>  <path>\n` line per file, in order (what `shasum -a 256` prints). */
export const filesDigest = (files) => sha256Text(files.map((f) => `${f.sha256}  ${f.path}\n`).join(''));

/**
 * A runtime table checked: its format and contract, every path safe and free of the build's own names, every row
 * with a size, a hash and a licence, the entry listed.
 * @param {any} doc
 */
export function checkRuntime(doc) {
  if (!doc || typeof doc !== 'object') throw bad('is not an object');
  if (doc.format !== RUNTIME_FORMAT) throw bad(`"format" is ${JSON.stringify(doc.format)}, not "${RUNTIME_FORMAT}"`);
  if (doc.version !== RUNTIME_VERSION) throw bad(`"version" is ${JSON.stringify(doc.version)}; this exporter reads version ${RUNTIME_VERSION}`);
  if (doc.contract !== RUNTIME_CONTRACT) throw bad(`the runtime keeps contract ${JSON.stringify(doc.contract)}; this exporter builds for contract ${RUNTIME_CONTRACT}`);
  for (const k of ['name', 'runtimeVersion', 'entry']) if (typeof doc[k] !== 'string' || !doc[k]) throw bad(`"${k}" is missing`);
  if (!Array.isArray(doc.files) || !doc.files.length) throw bad('"files" is empty');
  for (const f of doc.files) {
    const problem = pathProblem(f?.path);
    if (problem) throw bad(`a file's path ${JSON.stringify(f?.path)} ${problem}`);
    if (RESERVED.includes(f.path) || f.path.startsWith(PROJECT_DIR)) throw bad(`${f.path} is a name a build keeps for itself`, [f.path]);
    if (!Number.isInteger(f.bytes) || f.bytes < 0) throw bad(`${f.path} has no size`, [f.path]);
    if (!HEX.test(f.sha256 ?? '')) throw bad(`${f.path} has no SHA-256`, [f.path]);
    if (typeof f.licence !== 'string' || !f.licence.trim()) throw new BuildError('no_licence', `${RUNTIME_FILE}: the runtime file ${f.path} has no licence`, [f.path]);
  }
  const paths = doc.files.map((f) => f.path);
  if (new Set(paths).size !== paths.length) throw bad('a file is listed twice');
  const clash = caseClash(paths);
  if (clash) throw bad(`${clash[0]} and ${clash[1]} differ only by case`, clash);
  if (!paths.includes(doc.entry)) throw bad(`the entry ${doc.entry} is not among the files`, [doc.entry]);
  if (doc.digest !== undefined && doc.digest !== filesDigest(sorted(doc.files))) throw bad('"digest" is not the digest of "files"');
  return { name: doc.name, runtimeVersion: doc.runtimeVersion, entry: doc.entry, contract: doc.contract, files: sorted(doc.files).map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256, licence: f.licence.trim() })) };
}

const sorted = (files) => { const by = new Map(files.map((f) => [f.path, f])); return sortPaths(by.keys()).map((p) => by.get(p)); };

/**
 * The table of a runtime's files, as vrmxg-runtime.json holds it. Used by the Vite plugin, and by tests.
 * @param {{ name: string, runtimeVersion: string, entry?: string, files: { path: string, bytes: Uint8Array, licence: string }[] }} o
 */
export function runtimeTable({ name, runtimeVersion, entry = 'index.html', files }) {
  const rows = sorted(files).map((f) => ({ path: f.path, bytes: f.bytes.length, sha256: sha256(f.bytes), licence: f.licence }));
  const doc = { format: RUNTIME_FORMAT, version: RUNTIME_VERSION, contract: RUNTIME_CONTRACT, name, runtimeVersion, entry, digest: filesDigest(rows), files: rows };
  checkRuntime(doc);
  return doc;
}

/** A table as the bytes of its file: one spelling, so the same runtime gives the same vrmxg-runtime.json. */
export const serializeRuntime = (doc) => `${JSON.stringify(doc, null, 1)}\n`;
