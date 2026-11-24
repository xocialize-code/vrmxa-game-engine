// The exporter: a project and a runtime in, a build out. It only reads, hashes and writes, through the reader and the
// writer its caller hands it, so the same code runs in Node (folders) and in the editor's page (fetch in, the Mac
// shell's bridge out) and writes the same bytes. Nothing is written until every check has passed.
import { sha256 } from './sha256.js';
import { BuildError, checkPath, caseClash, isHidden } from './paths.js';
import { GAME_FILE, checkGame } from './game.js';
import { LICENCES_FILE, parseLicences, licenceOf } from './licences.js';
import { collect } from './collect.js';
import { RUNTIME_FILE, PROJECT_DIR, checkRuntime } from './runtime.js';
import { BUILD_FILE, makeManifest, serializeManifest } from './manifest.js';

const text = (b) => new TextDecoder().decode(b);

/**
 * Export a game.
 *
 * @param {object} o
 * @param {{ files: string[], read: (ref: string) => Promise<Uint8Array> }} o.project every file of the project by ref
 *   (hidden files are ignored), and a file's bytes
 * @param {{ read: (path: string) => Promise<Uint8Array> }} o.runtime a runtime folder (vrmxg-runtime.json and its files)
 * @param {any} [o.game] the game document; without it the project's game.json is read
 * @param {((path: string, bytes: Uint8Array) => Promise<void>) | null} [o.write] writes one file of the build by its
 *   path under the build's folder; null checks and hashes everything and writes nothing
 * @param {((done: number, total: number, path: string) => void) | null} [o.onProgress]
 * @returns {Promise<{ manifest: import('./manifest.js').Manifest, text: string, sha256: string, files: number, bytes: number }>}
 *   the manifest, its file's text and that text's SHA-256 (two builds are the same bytes exactly when it matches),
 *   and how many files and bytes the build holds beside the manifest
 */
export async function exportBuild({ project, runtime, game = null, write = null, onProgress = null }) {
  const files = project.files.filter((f) => !isHidden(f));
  for (const f of files) checkPath(f, 'the project file');
  // what the game is
  if (!game) {
    if (!files.includes(GAME_FILE)) throw new BuildError('bad_game', `the project has no ${GAME_FILE}: it says which scene the game starts in`, [GAME_FILE]);
    try { game = JSON.parse(text(await project.read(GAME_FILE))); } catch (e) { throw new BuildError('bad_game', `${GAME_FILE} is not JSON: ${e.message}`, [GAME_FILE]); }
  }
  game = checkGame(game);
  // what it needs, and whether each file may ship
  if (!files.includes(LICENCES_FILE)) throw new BuildError('no_licence', `the project has no ${LICENCES_FILE}: every file in a build needs a row in it`, [LICENCES_FILE]);
  const { refs } = await collect({ game, files, read: project.read });
  const clash = caseClash(refs);
  if (clash) throw new BuildError('bad_path', `${clash[0]} and ${clash[1]} differ only by case: a Mac's disk can't hold both`, clash);
  const rows = parseLicences(text(await project.read(LICENCES_FILE)));
  const unlicensed = refs.filter((ref) => !licenceOf(rows, ref));
  if (unlicensed.length) throw new BuildError('no_licence', `no row in ${LICENCES_FILE} for ${unlicensed.join(', ')}: a file with no licence can't go into a build`, unlicensed);
  // the runtime, each file checked against its table
  let table;
  try { table = JSON.parse(text(await runtime.read(RUNTIME_FILE))); } catch (e) { throw new BuildError('bad_runtime', `the runtime has no readable ${RUNTIME_FILE} (${e.message}): build the runtime first`, [RUNTIME_FILE]); }
  const rt = checkRuntime(table);
  // every file read and hashed once; written as it is read, the manifest last
  const out = [], total = rt.files.length + refs.length;
  let done = 0;
  const put = async (path, bytes) => { if (write) await write(path, bytes); onProgress?.(++done, total, path); };
  const pending = [];
  for (const f of rt.files) {
    const bytes = await runtime.read(f.path);
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) throw new BuildError('bad_runtime', `the runtime file ${f.path} is not the one ${RUNTIME_FILE} lists: rebuild the runtime`, [f.path]);
    out.push({ path: f.path, role: /** @type {const} */ ('runtime'), bytes: f.bytes, sha256: f.sha256, licence: f.licence });
    pending.push([f.path, bytes]);
  }
  // the runtime is small and checked whole before anything is written; the project's files stream through
  for (const [path, bytes] of pending) await put(path, bytes);
  for (const ref of refs) {
    const bytes = await project.read(ref);
    out.push({ path: PROJECT_DIR + ref, role: /** @type {const} */ ('project'), bytes: bytes.length, sha256: sha256(bytes), licence: licenceOf(rows, ref).licence });
    await put(PROJECT_DIR + ref, bytes);
  }
  const manifest = makeManifest({ game, runtime: rt, files: out });
  const body = serializeManifest(manifest), bodyBytes = new TextEncoder().encode(body);
  if (write) await write(BUILD_FILE, bodyBytes);
  return { manifest, text: body, sha256: sha256(bodyBytes), files: out.length, bytes: manifest.bytes };
}
