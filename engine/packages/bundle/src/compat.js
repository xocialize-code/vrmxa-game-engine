// A build's save-compatibility fingerprint (M6 W5, AB-T-0631, AB-D-0297 item 3): what a save's restore depends on, and
// nothing else, so a re-export that changes only a texture, a sound or the game's `release` still loads its earlier
// saves, and one that changes what a snapshot is restored into refuses them, saying what changed.
//
// Five parts, each hashed on its own so a refusal can name it:
//   scenes      every scene document and prefab of the build (its .vrmxs files), each as canonical JSON (the same
//               document written with other spacing is the same document)
//   assets      the files whose structure a restore reads: every item (.vrmxi: its states, clips, parts and joints) and
//               character (.vrmxa: its node list, which a pose is restored onto in order, and its spring bones), whole,
//               since both are ZIP containers this package doesn't open; and every glTF model (.glb, .gltf, .vrm) by its
//               structure: its JSON without images, materials, textures, samplers, buffers and buffer views (and an
//               accessor's place in its buffer), so a re-encoded texture or a new colour loads and a node, a mesh, a
//               skin or a physics shape added, removed or resized doesn't. A model that doesn't parse counts whole.
//               And two kinds of document: every brain (`vrmxg-brain`: a brain's tree state is restored into the tree
//               its document compiles to) and the game's animation set (each clip's name, duration, looping, root
//               motion and tracks: a character's graph state names clips; not the clips' bytes or licences)
//   behaviours  every behaviour the scenes attach, by name:
//                 a project behaviour (an export of the game's behaviours module) that declares the state it keeps (its
//                 own `static describe = { state: <JSON Schema> }`, M6 W0, as the export's registry holds it) is the
//                 schema's `stateShape` (@vrmxg/registry: canonical, annotations out); one that doesn't is the code of
//                 the module and every module it imports relatively, so changing undeclared code stays strict. A
//                 schema that allows anything (shape 'true' or '{}') declares nothing
//                 an engine behaviour is the shape its registry entry declares (from the runtime's table); undeclared,
//                 the runtime's version, strict in the same way
//               Which behaviours are the project's is read from the module's exports without running it; an export
//               that didn't import the module knows no declarations, and every project behaviour counts by its code
//   input       the action map's actions by name and type, in their order (the game's own, or the engine's default map):
//               the input snapshot holds axes and buttons by that order. Bindings are a player's settings, not in the
//               snapshot (@vrmxg/input), so they don't count
//   engine      the runtime's version, its snapshot format, its @vrmxg/dmath version and its portable maths' fingerprint
//               (@vrmxg/save's), from the runtime's table. The version stays in until the engine's node types declare
//               their state: the snapshot format alone doesn't move when one of them changes what it keeps, and a
//               refused save is better than one restored wrong
//
// The whole build's digest (the manifest's) stays what a session log is checked against: a replay is exact only on the
// build it was played on. The fingerprint carries a `version`, so a later reader (or migrations declared in game.json)
// can accept fingerprints of an earlier kind without a format change here.
//
// Pure: no DOM, no Node, no clock. The same inputs give the same fingerprint in Node, Chromium and WKWebView.
import { stateShape } from '@vrmxg/registry';
import { sha256Text } from './sha256.js';

export const COMPAT_FORMAT = 'vrmxg-compat';
export const COMPAT_VERSION = 1;
/** The parts, in the order a refusal names them. */
export const COMPAT_PARTS = ['scenes', 'assets', 'behaviours', 'input', 'engine'];

const HEX = /^[0-9a-f]{64}$/;

/** JSON with every object's keys sorted: one spelling for a value, whatever order it was written in. */
export function stableJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
}
const hash = (v) => sha256Text(stableJson(v));

/**
 * The shape of the state a registry entry declares (W0's `stateShape`: canonical JSON, annotations out), or null when
 * it declares none that says anything: not declared, or a schema that allows any value (`true`, `{}`, annotations
 * only). '{"type":"null"}' (keeps nothing) is a declaration.
 * @param {{ state?: any } | null | undefined} entry a registry entry (`registry.behaviours.get(name)`) or a describe
 * @returns {string | null}
 */
export function declaredShape(entry) {
  const shape = stateShape(entry);
  return shape === null || shape === 'true' || shape === '{}' ? null : shape;
}

/**
 * An action map as what a snapshot holds of it: each action's name and type, in the map's order (@vrmxg/input's
 * ActionMap keeps axes and buttons in it, and the snapshot's arrays follow). @param {Record<string, any> | null | undefined} actions
 */
export const actionsShape = (actions) => (actions && typeof actions === 'object'
  ? Object.keys(actions).map((k) => [k, actions[k]?.type ?? null]) : null);

const GLTF_DROP = ['images', 'materials', 'textures', 'samplers', 'buffers', 'bufferViews', 'asset', 'extras'];
/**
 * A glTF model's structure (see the top): its JSON without what only draws it or says where its bytes are, as a
 * hash; null when the bytes aren't a glTF it can read (the caller counts the file whole).
 * @param {Uint8Array} bytes a .glb (or .vrm) or a .gltf's JSON
 * @returns {string | null}
 */
export function gltfStructure(bytes) {
  let json;
  try {
    if (bytes.length >= 20 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) { // 'glTF'
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), len = dv.getUint32(12, true);
      if (dv.getUint32(16, true) !== 0x4e4f534a) return null; // the first chunk is JSON
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
    } else json = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
  if (!json || typeof json !== 'object' || !json.asset) return null;
  const doc = { ...json };
  for (const k of GLTF_DROP) delete doc[k];
  if (Array.isArray(doc.accessors)) doc.accessors = doc.accessors.map(({ bufferView, byteOffset, ...a }) => ({ ...a, ...(a.sparse ? { sparse: { count: a.sparse.count } } : {}) }));
  if (Array.isArray(doc.meshes)) doc.meshes = doc.meshes.map((m) => ({ ...m, primitives: (m.primitives ?? []).map(({ material, ...p }) => p) })); // which material: how it looks
  return hash(doc);
}

/** @type {Array<[RegExp, string]>} */
const ASSET_KINDS = [[/\.vrmxi$/i, 'item'], [/\.vrmxa$/i, 'character'], [/\.(glb|gltf|vrm)$/i, 'model'], [/\.json$/i, 'document']];
/** What a project file is to the fingerprint's `assets` part ('item', 'character', 'model', 'document'), or null. @param {string} ref */
export const assetKind = (ref) => ASSET_KINDS.find(([re]) => re.test(ref))?.[1] ?? null;

/**
 * A JSON document's entry in the fingerprint, or null for one a restore doesn't read: a brain whole (canonical JSON),
 * the game's animation set by its clips' names, durations, looping, root motion and tracks.
 * @param {any} doc the parsed document @param {{ animations?: boolean }} [o] animations: it is the game's animation set
 */
export function documentEntry(doc, { animations = false } = {}) {
  if (animations) return `json:${hash((Array.isArray(doc?.clips) ? doc.clips : []).map((c) => ({ name: c?.name ?? null, duration: c?.duration ?? null, loops: c?.loops ?? null, rootMotion: c?.rootMotion ?? null, tracks: c?.tracks ?? null })))}`;
  if (doc?.format === 'vrmxg-brain') return `json:${hash(doc)}`;
  return null;
}

/**
 * An asset's entry in the fingerprint: an item or a character whole (`file:<sha256>`), a model by its structure
 * (`gltf:<sha>`, or `file:` when it doesn't parse).
 * @param {string} ref @param {Uint8Array} bytes @param {string} sha the file's SHA-256 (the manifest's)
 * @returns {string | null} null for a JSON document (documentEntry)
 */
export function assetEntry(ref, bytes, sha) {
  if (assetKind(ref) === 'document') return null; // documentEntry, from the parsed document
  if (assetKind(ref) !== 'model') return `file:${sha}`;
  const g = gltfStructure(bytes);
  return g ? `gltf:${g}` : `file:${sha}`;
}

/**
 * What a runtime's table says about the engine it was built with, for the fingerprint (the Vite plugin's `engine`).
 * @param {{ snapshot: number | string, dmath: string, maths: string, actions: Record<string, any>, registry?: { behaviours: Map<string, any> } | null }} o
 *   snapshot: @vrmxg/snapshot's SNAPSHOT_FORMAT; dmath: its package version; maths: @vrmxg/save's mathsFingerprint();
 *   actions: @vrmxg/input's DEFAULT_ACTIONS; registry: the engine's registry (its behaviours' declared state)
 * @returns {{ snapshot: number | string, dmath: string, maths: string, actions: string, behaviours: Record<string, string | null> }}
 */
export function engineCompat({ snapshot, dmath, maths, actions, registry = null }) {
  const behaviours = {};
  for (const name of [...(registry?.behaviours?.keys() ?? [])].sort()) {
    const shape = declaredShape(registry.behaviours.get(name));
    behaviours[name] = shape === null ? null : sha256Text(shape);
  }
  return { snapshot, dmath: String(dmath), maths: String(maths), actions: hash(actionsShape(actions)), behaviours };
}

/** A runtime table's `engine`, checked (null: the table has none). @param {any} e @returns {ReturnType<typeof engineCompat> | null} */
export function checkEngine(e) {
  if (e === undefined || e === null) return null;
  const ok = typeof e === 'object' && (typeof e.snapshot === 'number' || typeof e.snapshot === 'string') && typeof e.dmath === 'string' && typeof e.maths === 'string'
    && HEX.test(e.actions ?? '') && e.behaviours && typeof e.behaviours === 'object' && Object.values(e.behaviours).every((v) => v === null || HEX.test(v));
  if (!ok) throw new Error('"engine" is not what the engine says about saves (snapshot, dmath, maths, actions, behaviours)');
  return { snapshot: e.snapshot, dmath: e.dmath, maths: e.maths, actions: e.actions, behaviours: Object.fromEntries(Object.keys(e.behaviours).sort().map((k) => [k, e.behaviours[k]])) };
}

/**
 * The behaviour names a document attaches: every `behaviours: [{ use }]` list in it (nodes, and a prefab instance's
 * overrides of its inner nodes).
 * @param {any} doc @param {Set<string>} [into]
 */
export function behavioursUsed(doc, into = new Set()) {
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'behaviours' && Array.isArray(x)) for (const b of x) if (b && typeof b.use === 'string') into.add(b.use);
      walk(x);
    }
  };
  walk(doc);
  return into;
}

/**
 * A build's save-compatibility fingerprint.
 * @param {object} o
 * @param {Array<[string, any]>} o.scenes every scene document and prefab of the build: [ref, parsed document]
 * @param {Array<[string, string]>} [o.assets] every item, character and model of the build, and its brains and animation
 *   set: [ref, assetEntry or documentEntry]
 * @param {{ code: string | null, names: Set<string> | null, registry?: any }} o.behaviours the game's behaviours module:
 *   `code`, the SHA-256 of its source and its relative imports' (null: the game has none); `names`, the names it
 *   exports, read without running it (export.js behavioursCode); `registry`, the export's, where the project's
 *   declarations are (entries with `source: 'project'`) when the module was imported
 * @param {Record<string, any> | null} o.actions the game's action map (null: the engine's default)
 * @param {{ version: string, engine?: any }} o.runtime the runtime's version and its table's `engine` (checkEngine)
 * @returns {Compat}
 *
 * @typedef {{ format: 'vrmxg-compat', version: 1, digest: string, parts: { scenes: string, behaviours: string, input: string, engine: string },
 *   scenes: Record<string, string>, assets: Record<string, string>, behaviours: Record<string, string> }} Compat
 *   scenes: each document's hash by ref; assets: each item, character, model, brain and the animation set by ref
 *   (assetEntry, documentEntry); behaviours: each behaviour by name, as `state:<sha>` (declared), `code:<sha>`
 *   (the project's module, undeclared), `engine:<sha>` (the engine's declaration), `runtime:<version>` (the engine's,
 *   undeclared)
 */
export function compatFingerprint({ scenes, assets = [], behaviours, actions, runtime }) {
  const engine = checkEngine(runtime.engine);
  const docs = {};
  const byRef = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  for (const [ref, doc] of [...scenes].sort(byRef)) docs[ref] = hash(doc);
  const files = {};
  for (const [ref, entry] of [...assets].sort(byRef)) files[ref] = entry;
  const used = new Set();
  for (const [, doc] of scenes) behavioursUsed(doc, used);
  const engineTag = (name) => {
    const s = engine?.behaviours[name];
    return s ? `engine:${s}` : `runtime:${runtime.version}`;
  };
  const code = behaviours.code ? `code:${behaviours.code}` : null;
  const named = {};
  for (const name of [...used].sort()) {
    if (!code || !behaviours.names?.has(name)) { named[name] = engineTag(name); continue; } // the engine's
    const entry = behaviours.registry?.behaviours?.get(name);
    const shape = entry?.source === 'project' ? declaredShape(entry) : null; // a class without its own describe is code only
    named[name] = shape === null ? code : `state:${sha256Text(shape)}`;
  }
  const parts = {
    scenes: hash(docs),
    assets: hash(files),
    behaviours: hash(named),
    // the engine's default map is hashed as a game's own would be: a game that spells it out is the same game
    input: actions ? hash(actionsShape(actions)) : engine ? engine.actions : hash({ runtime: runtime.version }),
    // the runtime's version stays in until the engine's node types declare their state (see the top)
    engine: engine ? hash({ runtime: runtime.version, snapshot: engine.snapshot, dmath: engine.dmath, maths: engine.maths }) : hash({ runtime: runtime.version }),
  };
  return { format: COMPAT_FORMAT, version: COMPAT_VERSION, digest: hash({ version: COMPAT_VERSION, parts }), parts, scenes: docs, assets: files, behaviours: named };
}

/** A fingerprint as a manifest or a save holds it, checked. @param {any} c @returns {Compat} */
export function checkCompat(c) {
  const ok = c && typeof c === 'object' && c.format === COMPAT_FORMAT && Number.isInteger(c.version) && HEX.test(c.digest ?? '')
    && c.parts && COMPAT_PARTS.every((p) => HEX.test(c.parts[p] ?? ''))
    && c.scenes && typeof c.scenes === 'object' && Object.values(c.scenes).every((v) => HEX.test(v))
    && c.assets && typeof c.assets === 'object' && Object.values(c.assets).every((v) => /^(file|gltf|json):[0-9a-f]{64}$/.test(v))
    && c.behaviours && typeof c.behaviours === 'object' && Object.values(c.behaviours).every((v) => typeof v === 'string' && v !== '');
  if (!ok) throw new Error('not a save-compatibility fingerprint');
  return c;
}

const list = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const few = (xs, n = 4) => list(xs.length > n ? [...xs.slice(0, n), `${xs.length - n} more`] : xs);
const changedKeys = (a = {}, b = {}) => {
  const out = { changed: [], added: [], removed: [] };
  for (const k of Object.keys(a).sort()) { if (!(k in b)) out.removed.push(k); else if (a[k] !== b[k]) out.changed.push(k); }
  for (const k of Object.keys(b).sort()) if (!(k in a)) out.added.push(k);
  return out;
};

/**
 * Why a save made with one fingerprint can't be restored into a build with another: one reason per part that differs,
 * each with a sentence for a person. Empty: the save loads.
 * @param {any} saved the save's fingerprint @param {any} current this build's
 * @returns {Array<{ part: 'version' | 'scenes' | 'behaviours' | 'input' | 'engine', items: string[], text: string }>}
 */
export function compatProblems(saved, current) {
  if (saved?.digest === current?.digest && saved?.version === current?.version) return [];
  if (saved?.format !== COMPAT_FORMAT || saved?.version !== current?.version) {
    return [{ part: 'version', items: [], text: `it records what it depends on in another way (fingerprint version ${saved?.version ?? 'none'}; this version reads ${current?.version})` }];
  }
  const out = [];
  if (saved.parts?.scenes !== current.parts.scenes) {
    const d = changedKeys(saved.scenes, current.scenes), bits = [];
    if (d.changed.length) bits.push(`${d.changed.length === 1 ? 'the scene' : 'the scenes'} ${few(d.changed)} changed`);
    if (d.removed.length) bits.push(`${few(d.removed)} ${d.removed.length === 1 ? 'is' : 'are'} gone`);
    if (d.added.length) bits.push(`${few(d.added)} ${d.added.length === 1 ? 'is' : 'are'} new`);
    out.push({ part: 'scenes', items: [...d.changed, ...d.removed, ...d.added], text: bits.join('; ') || 'its scenes changed' });
  }
  if (saved.parts?.assets !== current.parts.assets) {
    const d = changedKeys(saved.assets, current.assets), bits = [];
    const named = (refs) => refs.map((r) => `the ${assetKind(r) ?? 'file'} ${r}`);
    if (d.changed.length) bits.push(`${few(named(d.changed))} changed`);
    if (d.removed.length) bits.push(`${few(named(d.removed))} ${d.removed.length === 1 ? 'is' : 'are'} gone`);
    if (d.added.length) bits.push(`${few(named(d.added))} ${d.added.length === 1 ? 'is' : 'are'} new`);
    out.push({ part: 'assets', items: [...d.changed, ...d.removed, ...d.added], text: bits.join('; ') || 'its items, characters, models, brains or animations changed' });
  }
  if (saved.parts?.behaviours !== current.parts.behaviours) {
    const d = changedKeys(saved.behaviours, current.behaviours), bits = [];
    const kind = (name) => String(current.behaviours[name] ?? saved.behaviours[name]);
    const state = d.changed.filter((n) => kind(n).startsWith('state:') || kind(n).startsWith('engine:'));
    const code = d.changed.filter((n) => !state.includes(n));
    if (state.length) bits.push(`the state ${state.length === 1 ? 'the behaviour' : 'the behaviours'} ${few(state)} ${state.length === 1 ? 'keeps' : 'keep'} changed`);
    if (code.length) bits.push(`the code of ${code.length === 1 ? 'the behaviour' : 'the behaviours'} ${few(code)} changed (${code.length === 1 ? 'it declares' : 'they declare'} no state, so any change to ${code.length === 1 ? 'its' : 'their'} code counts)`);
    if (d.removed.length) bits.push(`${d.removed.length === 1 ? 'the behaviour' : 'the behaviours'} ${few(d.removed)} ${d.removed.length === 1 ? 'is' : 'are'} no longer used`);
    if (d.added.length) bits.push(`${d.added.length === 1 ? 'the behaviour' : 'the behaviours'} ${few(d.added)} ${d.added.length === 1 ? 'is' : 'are'} new`);
    out.push({ part: 'behaviours', items: [...d.changed, ...d.removed, ...d.added], text: bits.join('; ') || 'its behaviours changed' });
  }
  if (saved.parts?.input !== current.parts.input) out.push({ part: 'input', items: [], text: 'the game\'s controls changed (its action map\'s actions or their order)' });
  if (saved.parts?.engine !== current.parts.engine) out.push({ part: 'engine', items: [], text: 'the engine changed (a new version of it)' });
  return out;
}
