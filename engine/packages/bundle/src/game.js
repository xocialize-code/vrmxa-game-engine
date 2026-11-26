// The game document (game.json, "vrmxg-game"): what Export Game reads to know what the game is. It names the scene
// the game starts in, the scenes it can reach, the project's behaviours, animation sets and personas, the input map,
// and any file the game reads that no document names (`include`). Everything else in the build is traced from these.
//
//   { "format": "vrmxg-game", "version": 1, "id": "cafe", "title": "The cafe",
//     "entry": "cafe.vrmxs", "scenes": ["cafe.vrmxs"],
//     "behaviours": "behaviours.js", "animations": "animations.json", "personas": "personas.json",
//     "input": { "actions": { … } },            // or a ref to a JSON file holding { "actions": … }; absent: the engine's default map
//     "include": ["input/walk-in.json", "voice/*.wav"],
//     "ignore": ["report.json"],                 // strings in the game's documents that look like files and aren't
//     "physics": { "layers": ["default", "player", "trigger"], "collides": { "trigger": ["player"] } } }   // M6 W3
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
 *   input: string | { actions: Record<string, any> } | null, include: string[], ignore?: string[], release?: string,
 *   physics?: { layers: string[], collides?: Record<string, string[]> } }} Game
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
  // the game's own version, as its players see it (a Mac app's version: up to three numbers with dots, M5 W1)
  if (doc.release !== undefined && (typeof doc.release !== 'string' || !/^\d{1,9}(\.\d{1,9}){0,2}$/.test(doc.release))) throw bad(`"release" is the game's version, one to three numbers with dots such as "1.2.0" (${JSON.stringify(doc.release)})`);
  const physics = doc.physics === undefined ? undefined : checkPhysics(doc.physics);
  const known = new Set(['format', 'version', 'id', 'title', 'entry', 'scenes', 'behaviours', 'animations', 'personas', 'input', 'include', 'ignore', 'release', 'physics']);
  const unknown = Object.keys(doc).filter((k) => !known.has(k));
  if (unknown.length) throw bad(`unknown ${unknown.length > 1 ? 'keys' : 'key'} ${unknown.map((k) => `"${k}"`).join(', ')}`);
  return {
    format: GAME_FORMAT, version: GAME_VERSION, id: doc.id, title: doc.title?.trim() ?? doc.id, entry, scenes,
    behaviours: optional('behaviours'), animations: optional('animations'), personas: optional('personas'), input, include,
    ...(ignore.length ? { ignore } : {}), ...(doc.release !== undefined ? { release: doc.release } : {}), ...(physics ? { physics } : {}),
  };
}

/** The most collision layers a game names: Rapier's 16 groups, less the one ragdolls keep (@vrmxg/physics layers.js). */
export const MAX_LAYERS = 15;

/**
 * The game's collision layers (M6 W3, AB-T-0646: the editor's project settings), as `@vrmxg/physics`'s `Layers` takes
 * them: `layers`, the names a Collider's `layer` prop and a query use (the first is a collider's when it names none),
 * and `collides`, for a layer that doesn't touch every other, the layers it does. Rapier pairs two colliders only when
 * each is in the other's list, so `collides` is kept symmetric by whoever writes it (the editor's matrix).
 * @param {any} v @returns {{ layers: string[], collides?: Record<string, string[]> }}
 */
export function checkPhysics(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad('"physics" is { "layers": [names], "collides"?: { layer: [names] } }');
  const unknown = Object.keys(v).filter((k) => k !== 'layers' && k !== 'collides');
  if (unknown.length) throw bad(`"physics" has no ${unknown.map((k) => `"${k}"`).join(', ')}`);
  const layers = v.layers;
  if (!Array.isArray(layers) || !layers.length || layers.length > MAX_LAYERS) throw bad(`"physics.layers" is a list of 1 to ${MAX_LAYERS} names`);
  for (const n of layers) if (typeof n !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(n)) throw bad(`"physics.layers": ${JSON.stringify(n)} isn't a layer name (lowercase letters, digits, - and _)`);
  if (new Set(layers).size !== layers.length) throw bad('"physics.layers" names a layer twice');
  if (v.collides === undefined) return { layers: [...layers] };
  if (!v.collides || typeof v.collides !== 'object' || Array.isArray(v.collides)) throw bad('"physics.collides" is { layer: [the layers it collides with] }');
  const collides = {};
  for (const n of layers) {
    if (!Object.hasOwn(v.collides, n)) continue;
    const list = v.collides[n];
    if (!Array.isArray(list) || list.some((x) => !layers.includes(x))) throw bad(`"physics.collides.${n}" lists layers of physics.layers`);
    collides[n] = layers.filter((x) => list.includes(x));
  }
  const stray = Object.keys(v.collides).filter((k) => !layers.includes(k));
  if (stray.length) throw bad(`"physics.collides" names ${stray.map((k) => `"${k}"`).join(', ')}, not in physics.layers`);
  return Object.keys(collides).length ? { layers: [...layers], collides } : { layers: [...layers] };
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

/**
 * The collision layers a scene's nodes name (a Collider's or an Area's `layer`, a Character's capsule `layer`, and an
 * instance's overrides of them): `[{ node, layer }]`. A node with none is on the game's first layer.
 * @param {any} doc a scene document (.vrmxs)
 * @returns {{ node: string, layer: string }[]}
 */
export function layersUsed(doc) {
  const out = [];
  for (const n of Array.isArray(doc?.nodes) ? doc.nodes : []) {
    if (typeof n?.props?.layer === 'string') out.push({ node: String(n.id), layer: n.props.layer });
    for (const [inner, o] of Object.entries(n?.overrides ?? {})) if (typeof o?.props?.layer === 'string') out.push({ node: `${n.id}/${inner}`, layer: o.props.layer });
  }
  return out;
}

/**
 * The layers a game has: its physics.layers, or the one layer, "default", when it names none (@vrmxg/physics's Layers).
 * @param {{ physics?: { layers: string[] } | null } | null} game
 */
export const gameLayers = (game) => (game?.physics?.layers?.length ? [...game.physics.layers] : ['default']);

/**
 * Nodes on a layer the game doesn't have, across documents: `[{ ref, node, layer }]`. Each would stop the world it is
 * built in (Layers.bit throws), so the export refuses them and the editor's settings won't drop a layer in use.
 * @param {any} game @param {Iterable<[string, any]>} docs [ref, document]
 */
export function unknownLayers(game, docs) {
  const have = new Set(gameLayers(game)), out = [];
  for (const [ref, doc] of docs) for (const u of layersUsed(doc)) if (!have.has(u.layer)) out.push({ ref, ...u });
  return out;
}
