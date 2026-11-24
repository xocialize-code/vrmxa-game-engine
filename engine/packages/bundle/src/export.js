// The exporter: a project and a runtime in, a build out. It only reads, hashes and writes, through the reader and the
// writer its caller hands it, so the same code runs in Node (folders) and in the editor's page (fetch in, the Mac
// shell's bridge out) and writes the same bytes. Every check passes before `ready` is called and before the first
// write, and each of the project's files is read and hashed once, as it is written.
import { sha256 } from './sha256.js';
import { BuildError, checkPath, caseClash, isHidden } from './paths.js';
import { GAME_FILE, checkGame } from './game.js';
import { LICENCES_FILE, parseLicences, licenceOf } from './licences.js';
import { m0Registry } from '@vrmxg/registry/m0';
import { collect } from './collect.js';
import { RUNTIME_FILE, PROJECT_DIR, checkRuntime } from './runtime.js';
import { BUILD_FILE, makeManifest, serializeManifest } from './manifest.js';

const text = (b) => new TextDecoder().decode(b);

/**
 * What a build of a project would hold, and whether it may be made: the game document checked, every file the game
 * needs traced from its documents (a reference to no file stops here), and each of them found a row in LICENCES.md.
 * It reads the project and nothing else: no runtime, no folder. `exportBuild` starts with it, and a tool that only
 * checks a project (MCP's validate) calls it alone, so the two can never disagree about what an export refuses.
 * @param {object} o
 * @param {{ files: string[], read: (ref: string) => Promise<Uint8Array>, truncated?: boolean }} o.project as exportBuild takes it
 * @param {any} [o.game] the game document; without it the project's game.json is read
 * @param {any} [o.registry] as exportBuild takes it
 * @returns {Promise<{ game: import('./game.js').Game, refs: string[], source: Map<string, string>, why: Map<string, string>,
 *   licence: Map<string, { pattern: string, licence: string }> }>} refs: the files in manifest order; source: each one's
 *   own file in the project; why: the document that named it; licence: each one's row
 */
export async function planBuild({ project, game = null, registry = undefined }) {
  if (project.truncated) throw new BuildError('too_many_files', `the project's listing was cut short at ${project.files.length} files: an export needs every file's name, so nothing was exported`);
  const files = project.files.filter((f) => !isHidden(f));
  // what the game is
  if (!game) {
    if (!files.includes(GAME_FILE)) throw new BuildError('bad_game', `the project has no ${GAME_FILE}: it says which scene the game starts in`, [GAME_FILE]);
    try { game = JSON.parse(text(await project.read(GAME_FILE))); } catch (e) { throw new BuildError('bad_game', `${GAME_FILE} is not JSON: ${e.message}`, [GAME_FILE]); }
  }
  game = checkGame(game);
  // what it needs, and whether each file may ship. Only the files the game uses are held to a build's rules for
  // paths: a file it doesn't use can be named anything
  if (!files.includes(LICENCES_FILE)) throw new BuildError('no_licence', `the project has no ${LICENCES_FILE}: every file in a build needs a row in it`, [LICENCES_FILE]);
  const { refs, source, why } = await collect({ game, files, read: project.read, registry: registry === undefined ? m0Registry() : registry });
  for (const ref of refs) checkPath(ref, 'the project file');
  const clash = caseClash(refs);
  if (clash) throw new BuildError('bad_path', `${clash[0]} and ${clash[1]} differ only by case: a Mac's disk can't hold both`, clash);
  const rows = parseLicences(text(await project.read(LICENCES_FILE)));
  const licence = new Map(refs.map((ref) => [ref, licenceOf(rows, ref)]));
  const unlicensed = refs.filter((ref) => !licence.get(ref));
  if (unlicensed.length) throw new BuildError('no_licence', `no row in ${LICENCES_FILE} for ${unlicensed.join(', ')}: a file with no licence can't go into a build`, unlicensed);
  return { game, refs, source, why, licence: /** @type {any} */ (licence) };
}

/**
 * Export a game.
 *
 * @param {object} o
 * @param {{ files: string[], read: (ref: string) => Promise<Uint8Array>, truncated?: boolean }} o.project every file of the
 *   project by ref (hidden files are ignored), and a file's bytes; truncated: the listing was cut short, and the export is
 *   refused rather than made from part of a project
 * @param {{ read: (path: string) => Promise<Uint8Array> }} o.runtime a runtime folder (vrmxg-runtime.json and its files)
 * @param {any} [o.game] the game document; without it the project's game.json is read
 * @param {((path: string, bytes: Uint8Array) => Promise<void>) | null} [o.write] writes one file of the build by its
 *   path under the build's folder; null checks and hashes everything and writes nothing
 * @param {((plan: { game: import('./game.js').Game, files: number, runtime: string }) => Promise<void> | void) | null} [o.ready]
 *   called once every check has passed, before the first write: where a caller asks for the folder, so a refused
 *   export asks for none
 * @param {((done: number, total: number, path: string) => void) | null} [o.onProgress]
 * @param {any} [o.registry] the node registry, which says which of a scene's props are asset references (default: the
 *   engine's own, @vrmxg/registry/m0; null: only a scene's asset table and a sequence's set are taken as typed)
 * @returns {Promise<{ manifest: import('./manifest.js').Manifest, text: string, sha256: string, files: number, bytes: number, byPattern: string[] }>}
 *   the manifest, its file's text and that text's SHA-256 (two builds are the same bytes exactly when it matches), how
 *   many files and bytes the build holds beside the manifest, and the project's files that no row of LICENCES.md names
 *   one by one (a pattern row licensed them)
 */
export async function exportBuild({ project, runtime, game = null, write = null, ready = null, onProgress = null, registry = undefined }) {
  const plan = await planBuild({ project, game, registry });
  const { refs, source, licence } = plan;
  game = plan.game;
  // the runtime, each file checked against its table
  let table;
  try { table = JSON.parse(text(await runtime.read(RUNTIME_FILE))); } catch (e) { throw new BuildError('bad_runtime', `the runtime has no readable ${RUNTIME_FILE} (${e.message}): build the runtime first`, [RUNTIME_FILE]); }
  const rt = checkRuntime(table);
  const out = [], pending = [], total = rt.files.length + refs.length;
  for (const f of rt.files) {
    const bytes = await runtime.read(f.path);
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) throw new BuildError('bad_runtime', `the runtime file ${f.path} is not the one ${RUNTIME_FILE} lists: rebuild the runtime`, [f.path]);
    out.push({ path: f.path, role: /** @type {const} */ ('runtime'), bytes: f.bytes, sha256: f.sha256, licence: f.licence });
    pending.push([f.path, bytes]);
  }
  // every check has passed
  await ready?.({ game, files: total, runtime: `${rt.name} ${rt.runtimeVersion}` });
  let done = 0;
  const put = async (path, bytes) => { if (write) await write(path, bytes); onProgress?.(++done, total, path); };
  for (const [path, bytes] of pending) await put(path, bytes);
  const byPattern = [];
  for (const ref of refs) {
    const bytes = await project.read(source.get(ref)), row = licence.get(ref);
    // a file licensed by a pattern row (`voice/*.wav`) says so: nobody listed it by name
    const from = row.pattern === ref ? {} : { licenceFrom: row.pattern };
    if (row.pattern !== ref) byPattern.push(ref);
    out.push({ path: PROJECT_DIR + ref, role: /** @type {const} */ ('project'), bytes: bytes.length, sha256: sha256(bytes), licence: row.licence, ...from });
    await put(PROJECT_DIR + ref, bytes);
  }
  const manifest = makeManifest({ game, runtime: rt, files: out });
  const body = serializeManifest(manifest), bodyBytes = new TextEncoder().encode(body);
  if (write) await write(BUILD_FILE, bodyBytes);
  return { manifest, text: body, sha256: sha256(bodyBytes), files: out.length, bytes: manifest.bytes, byPattern };
}
