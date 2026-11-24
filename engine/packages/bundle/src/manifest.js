// A build's manifest, vrmxg-build.json: the game, the runtime it was built with, and every file of the build with its
// role, size, SHA-256 and licence. It is written last, so a folder without it is an unfinished build, and it lists
// everything but itself. There is no clock, path of the machine or user name in it: the same project and runtime give
// the same bytes wherever the export runs.
import { BuildError, pathProblem, sortPaths } from './paths.js';
import { PROJECT_DIR, filesDigest } from './runtime.js';

export const BUILD_FILE = 'vrmxg-build.json';
export const BUILD_FORMAT = 'vrmxg-build';
export const BUILD_VERSION = 1;
export const HASH = 'sha256';

const bad = (message, files = []) => new BuildError('bad_manifest', `${BUILD_FILE}: ${message}`, files);
const HEX = /^[0-9a-f]{64}$/;

/**
 * @typedef {{ path: string, role: 'runtime' | 'project', bytes: number, sha256: string, licence: string }} BuildFile
 * @typedef {{ format: 'vrmxg-build', version: 1, game: import('./game.js').Game,
 *   runtime: { name: string, version: string, contract: number, entry: string, digest: string },
 *   hash: 'sha256', project: string, bytes: number, digest: string, files: BuildFile[] }} Manifest
 */

/**
 * The manifest of a build, keys in their one order.
 * @param {{ game: import('./game.js').Game, runtime: { name: string, runtimeVersion: string, contract: number, entry: string, files: any[] }, files: BuildFile[] }} o
 *   files: every file of the build, the runtime's and the project's (under project/)
 * @returns {Manifest}
 */
export function makeManifest({ game, runtime, files }) {
  const by = new Map(files.map((f) => [f.path, f]));
  if (by.size !== files.length) throw bad('a file is listed twice');
  const rows = sortPaths(by.keys()).map((p) => { const f = by.get(p); return { path: f.path, role: f.role, bytes: f.bytes, sha256: f.sha256, licence: f.licence }; });
  return {
    format: BUILD_FORMAT, version: BUILD_VERSION, game,
    runtime: { name: runtime.name, version: runtime.runtimeVersion, contract: runtime.contract, entry: runtime.entry, digest: filesDigest(runtime.files) },
    hash: HASH, project: PROJECT_DIR, bytes: rows.reduce((n, f) => n + f.bytes, 0), digest: filesDigest(rows), files: rows,
  };
}

/** A manifest as the bytes of its file. @param {Manifest} m */
export const serializeManifest = (m) => `${JSON.stringify(m, null, 1)}\n`;

/**
 * A manifest read and checked: its format and version, every row whole, in order and under the right folder for its
 * role, the entry and the game's files present, and the digest the digest of its rows.
 * @param {string} text
 * @returns {Manifest}
 */
export function parseManifest(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { throw bad(`is not JSON: ${e.message}`); }
  if (m?.format !== BUILD_FORMAT) throw bad(`"format" is ${JSON.stringify(m?.format)}, not "${BUILD_FORMAT}"`);
  if (m.version !== BUILD_VERSION) throw bad(`"version" is ${JSON.stringify(m.version)}; this loader reads version ${BUILD_VERSION}`);
  if (m.hash !== HASH) throw bad(`"hash" is ${JSON.stringify(m.hash)}; this loader reads ${HASH}`);
  if (m.project !== PROJECT_DIR) throw bad(`"project" is ${JSON.stringify(m.project)}, not "${PROJECT_DIR}"`);
  if (!m.game || typeof m.game.entry !== 'string') throw bad('"game" has no entry scene');
  if (!m.runtime || typeof m.runtime.entry !== 'string') throw bad('"runtime" has no entry');
  if (!Array.isArray(m.files)) throw bad('"files" is missing');
  let last = null;
  for (const f of m.files) {
    const problem = pathProblem(f?.path);
    if (problem) throw bad(`a file's path ${JSON.stringify(f?.path)} ${problem}`);
    if (last !== null && !(last < f.path)) throw bad(`${f.path} is out of order`, [f.path]);
    last = f.path;
    if (f.role !== 'runtime' && f.role !== 'project') throw bad(`${f.path} has the role ${JSON.stringify(f.role)}`, [f.path]);
    if ((f.role === 'project') !== f.path.startsWith(PROJECT_DIR)) throw bad(`${f.path} is a ${f.role} file in the wrong place`, [f.path]);
    if (!Number.isInteger(f.bytes) || f.bytes < 0 || !HEX.test(f.sha256 ?? '')) throw bad(`${f.path} has no size or no SHA-256`, [f.path]);
    if (typeof f.licence !== 'string' || !f.licence) throw bad(`${f.path} has no licence`, [f.path]);
  }
  if (m.digest !== filesDigest(m.files)) throw bad('"digest" is not the digest of "files"');
  const have = new Set(m.files.map((f) => f.path));
  if (!have.has(m.runtime.entry)) throw bad(`the runtime's entry ${m.runtime.entry} is not among the files`, [m.runtime.entry]);
  for (const s of [m.game.entry, ...(m.game.scenes ?? [])]) if (!have.has(PROJECT_DIR + s)) throw bad(`the scene ${s} is not among the files`, [s]);
  return m;
}
