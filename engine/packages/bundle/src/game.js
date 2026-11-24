// The game document (game.json, "vrmxg-game"): what Export Game reads to know what the game is. It names the scene
// the game starts in, the scenes it can reach, the project's behaviours, animation sets and personas, the input map,
// and any file the game reads that no document names (`include`). Everything else in the build is traced from these.
//
//   { "format": "vrmxg-game", "version": 1, "id": "cafe", "title": "The cafe",
//     "entry": "cafe.vrmxs", "scenes": ["cafe.vrmxs"],
//     "behaviours": "behaviours.js", "animations": "animations.json", "personas": "personas.json",
//     "input": { "actions": { … } },            // or a ref to a JSON file holding { "actions": … }; absent: the engine's default map
//     "include": ["input/walk-in.json", "voice/*.wav"],
//     "ignore": ["report.json"] }                 // strings in the game's documents that look like files and aren't
import { BuildError, pathProblem } from './paths.js';

export const GAME_FILE = 'game.json';
export const GAME_FORMAT = 'vrmxg-game';
export const GAME_VERSION = 1;

const bad = (message) => new BuildError('bad_game', `${GAME_FILE}: ${message}`, [GAME_FILE]);
const ref = (v, key, { glob = false } = {}) => {
  const problem = pathProblem(v) ?? (!glob && /\*/.test(/** @type {string} */ (v)) ? 'has a *' : null);
  if (problem) throw bad(`"${key}" ${typeof v === 'string' ? `"${v}" ` : ''}${problem}`);
  return /** @type {string} */ (v);
};

/**
 * @typedef {{ format: 'vrmxg-game', version: 1, id: string, title: string, entry: string, scenes: string[],
 *   behaviours: string | null, animations: string | null, personas: string | null,
 *   input: string | { actions: Record<string, any> } | null, include: string[], ignore?: string[] }} Game
 */

/**
 * A game document checked and with its defaults filled in, keys in one order (it goes into the manifest as it is).
 * @param {any} doc
 * @returns {Game}
 */
export function checkGame(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw bad('is not an object');
  if (doc.format !== GAME_FORMAT) throw bad(`"format" is ${JSON.stringify(doc.format)}, not "${GAME_FORMAT}"`);
  if (doc.version !== GAME_VERSION) throw bad(`"version" is ${JSON.stringify(doc.version)}; this exporter reads version ${GAME_VERSION}`);
  if (typeof doc.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(doc.id)) throw bad(`"id" is lowercase letters, digits and hyphens (${JSON.stringify(doc.id)})`);
  if (doc.title !== undefined && (typeof doc.title !== 'string' || !doc.title.trim())) throw bad('"title" is text');
  const entry = ref(doc.entry, 'entry');
  if (doc.scenes !== undefined && !Array.isArray(doc.scenes)) throw bad('"scenes" is a list of scene refs');
  const scenes = [...new Set([entry, ...(doc.scenes ?? []).map((s) => ref(s, 'scenes'))])].sort();
  for (const s of scenes) if (!s.endsWith('.vrmxs')) throw bad(`"${s}" is not a .vrmxs scene`);
  const optional = (key) => (doc[key] === undefined || doc[key] === null ? null : ref(doc[key], key));
  let input = null;
  if (typeof doc.input === 'string') input = ref(doc.input, 'input');
  else if (doc.input !== undefined && doc.input !== null) {
    if (typeof doc.input !== 'object' || !doc.input.actions || typeof doc.input.actions !== 'object') throw bad('"input" is a ref to a JSON file or { "actions": { … } }');
    input = { actions: structuredClone(doc.input.actions) };
  }
  if (doc.include !== undefined && !Array.isArray(doc.include)) throw bad('"include" is a list of refs');
  const include = [...new Set((doc.include ?? []).map((s) => ref(s, 'include', { glob: true })))].sort();
  if (doc.ignore !== undefined && (!Array.isArray(doc.ignore) || doc.ignore.some((s) => typeof s !== 'string'))) throw bad('"ignore" is a list of strings');
  const ignore = [...new Set(doc.ignore ?? [])].sort();
  const known = new Set(['format', 'version', 'id', 'title', 'entry', 'scenes', 'behaviours', 'animations', 'personas', 'input', 'include', 'ignore']);
  const unknown = Object.keys(doc).filter((k) => !known.has(k));
  if (unknown.length) throw bad(`unknown ${unknown.length > 1 ? 'keys' : 'key'} ${unknown.map((k) => `"${k}"`).join(', ')}`);
  return {
    format: GAME_FORMAT, version: GAME_VERSION, id: doc.id, title: doc.title?.trim() ?? doc.id, entry, scenes,
    behaviours: optional('behaviours'), animations: optional('animations'), personas: optional('personas'), input, include,
    ...(ignore.length ? { ignore } : {}),
  };
}

/**
 * The game a project is when it has no game.json: one scene, and the project's behaviours.js, animations.json and
 * personas.json where it has them. What the editor exports from a project nobody has described yet.
 * @param {{ files: string[], entry: string, id?: string, title?: string }} o
 * @returns {Game}
 */
export function defaultGame({ files, entry, id, title }) {
  const has = (f) => (files.includes(f) ? f : null);
  const slug = (id ?? entry.replace(/\.vrmxs$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()) || 'game';
  return checkGame({ format: GAME_FORMAT, version: GAME_VERSION, id: slug, ...(title ? { title } : {}), entry, scenes: [entry], behaviours: has('behaviours.js'), animations: has('animations.json'), personas: has('personas.json') });
}
