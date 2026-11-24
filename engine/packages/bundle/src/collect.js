// Which of a project's files a game needs, traced from its documents. The roots are what the game document names. From
// there one rule does most of the work: a file is collected when a collected JSON document (.vrmxs, .json) holds its
// path as a string value. That covers a scene's assets and prefabs, a sequence's set, brain and effect documents,
// voice clips in connections and tracks, persona cores, animation clips and looks, without this package knowing any of
// those formats. Two more: a .wav brings the .timings.json beside it, and a module brings its relative imports.
//
// A reference that names no file stops the export, and the error names the document and the reference.
//
//   - In a scene, what the schema types as a file is taken exactly, spaces and all: the asset table's `ref`s, a
//     sequence's `set`, and any prop, behaviour parameter or action argument the registry declares as an asset
//     reference (P.assetRef). Such a reference must name a file of the project, in the file's own case.
//   - Any other string (a scene's untyped props, such as a line's `clip` or an emitter's `effect`, which the registry
//     declares as plain strings; and every string of a JSON document that has no schema) is taken for a reference
//     when it reads as a path: it ends in an extension the project's files have, and is one word, or names a folder
//     the project has. It is looked up from the project's root and beside the document. One that matches no file, or
//     matches one only when case is ignored (a Mac's disk opens `Props/Door.glb` for `props/door.glb`; a build, served
//     from anywhere, would not), stops the export. A string that only looks like a file goes in the game's `ignore`.
//   - `./x` and the Unicode form of a name are normalised first, as the loader normalises what the engine asks for.
//
// What no document names (a file read from a path a behaviour builds at run time) goes in the game's `include`. The
// loader refuses a ref the manifest doesn't list, by name, so a missed file fails on the first play, never silently.
import { GAME_FILE } from './game.js';
import { LICENCES_FILE } from './licences.js';
import { BuildError, globRe, resolveFrom, sortPaths, normRef, moduleImports, dirOf } from './paths.js';

const text = (b) => new TextDecoder().decode(b);
const isJson = (p) => /\.(vrmxs|json)$/i.test(p);
const isModule = (p) => /\.m?js$/i.test(p);
const extOf = (p) => /\.([A-Za-z0-9]{1,8})$/.exec(p)?.[1].toLowerCase() ?? null;
/** What a project's behaviours may import by name: the engine's core, which the runtime's import map provides. */
export const CORE = '@vrmxg/core';

function strings(v, out) {
  if (typeof v === 'string') out.add(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
}

const isRef = (def) => !!def && (Array.isArray(def.assetTypes) || def.meta?.widget === 'asset');
// a prop the registry types as something that is never a file: a choice, a colour, another node, a number
const isNotRef = (def) => !!def && (def.schema?.enum !== undefined || def.nodeRef === true || def.meta?.widget === 'color' || def.meta?.widget === 'node' || ['number', 'integer', 'boolean'].includes(def.schema?.type));

/**
 * A scene's references by what the schema says of them: `typed` are files for certain (the asset table, a sequence's
 * set, props the registry declares as asset references), each with where it stands; `loose` is every other string that
 * could be one. Ids, names, types and the values of props typed as choices, colours or node references are neither.
 * @param {any} doc @param {any} registry @vrmxg/registry's registry, or null (then only the asset table and the set are typed)
 */
export function sceneRefs(doc, registry) {
  const typed = [], loose = new Set();
  const put = (def, value, where) => {
    if (isRef(def)) { for (const v of Array.isArray(value) ? value : [value]) if (typeof v === 'string' && v) typed.push({ ref: v, where }); }
    else if (!isNotRef(def)) strings(value, loose);
  };
  (doc.assets ?? []).forEach((a, k) => { if (typeof a?.ref === 'string') typed.push({ ref: a.ref, where: `asset "${a.id ?? k}"` }); });
  if (typeof doc.set === 'string') typed.push({ ref: doc.set, where: 'its set' });
  const nodes = new Map();
  for (const n of Array.isArray(doc.nodes) ? doc.nodes : []) {
    if (!n || typeof n !== 'object') continue;
    nodes.set(n.id, n);
    const type = registry?.types.get(n.type);
    for (const [k, v] of Object.entries(n.props ?? {})) put(type?.props[k], v, `${n.id}'s ${k}`);
    for (const b of Array.isArray(n.behaviours) ? n.behaviours : []) {
      const def = registry?.behaviours.get(b?.use);
      for (const [k, v] of Object.entries(b ?? {})) if (k !== 'use') put(def?.params[k], v, `${n.id}'s ${b.use} (${k})`);
    }
    for (const [k, v] of Object.entries(n)) if (!['id', 'type', 'name', 'parent', 'asset', 'props', 'behaviours'].includes(k)) strings(v, loose);
  }
  for (const c of Array.isArray(doc.connections) ? doc.connections : []) {
    const to = nodes.get(c?.to), action = to && registry ? registry.surface(to).actions[c.call] : null;
    for (const [k, v] of Object.entries(c?.args ?? {})) put(action?.args?.[k], v, `the connection ${c.from}.${c.signal} → ${c.to}.${c.call} (${k})`);
  }
  for (const [k, v] of Object.entries(doc)) if (!['format', 'version', 'id', 'set', 'assets', 'nodes', 'connections'].includes(k)) strings(v, loose);
  return { typed, loose };
}

/**
 * The files a game needs. `refs` are the paths a build gives them (normalised: NFC, in manifest order); `source` maps
 * each to the project's own file to read; `why` to the document that named it.
 * @param {{ game: import('./game.js').Game, files: string[], read: (ref: string) => Promise<Uint8Array>, registry?: any }} o
 *   files: every file of the project by ref; read: a file's bytes; registry: the node registry, which says which of a
 *   scene's props are asset references (without it only the asset table and a sequence's set are typed)
 * @returns {Promise<{ refs: string[], source: Map<string, string>, why: Map<string, string> }>}
 */
export async function collect({ game, files, read, registry = null }) {
  // the listing by the spelling a build uses, and with case folded (to tell a wrong case from a missing file)
  const byRef = new Map(), byFold = new Map(), exts = new Set(), folders = new Set();
  for (const f of files) {
    const r = normRef(f);
    if (byRef.has(r) && byRef.get(r) !== f) throw new BuildError('bad_path', `the project has ${JSON.stringify(byRef.get(r))} and ${JSON.stringify(f)}, the same name in two Unicode forms: a build can hold one`, [byRef.get(r), f]);
    byRef.set(r, f);
    if (!byFold.has(r.toLowerCase())) byFold.set(r.toLowerCase(), r);
    const e = extOf(r); if (e) exts.add(e);
    for (let d = dirOf(r); d; d = dirOf(d)) folders.add(d.toLowerCase());
  }
  const ignore = new Set(game.ignore ?? []);
  const why = new Map(), queue = [];
  const add = (ref, by) => { if (!why.has(ref)) { why.set(ref, by); queue.push(ref); } };
  /** The file a reference means, or null when it is none; throws when it means one in another case. */
  // a string that reads as a path to one of the project's kinds of file: no URL scheme, an extension the project's
  // files have, and either one word ("generated by tools/make.mjs" is a sentence) or a path into a folder the project
  // has ("props/Door Panel.glb"), whatever its case
  const plain = (s) => s.length <= 512 && !/[\u0000-\u001f]|:\/\/|^(data|blob|mailto):|^#/.test(s);
  const looksLikeRef = (s) => plain(s) && exts.has(extOf(s) ?? '') && (!/\s/.test(s) || folders.has(dirOf(normRef(s)).toLowerCase()));
  const hint = (s) => `if it isn't a file, add it to "ignore" in ${GAME_FILE}: "ignore": [${JSON.stringify(s)}]`;
  /**
   * The file a reference means, or null when it is none; throws when it means one in another case. `sure`: the string
   * is known to be a reference (the game document's, an import); otherwise only a string that reads as a path is held
   * to its case.
   */
  const find = (s, by, verb, sure) => {
    const r = normRef(s);
    if (byRef.has(r)) return r;
    const other = byFold.get(r.toLowerCase());
    if (other !== undefined && (sure || looksLikeRef(s) || (plain(s) && !/\s/.test(s) && s.includes('/')))) throw new BuildError('missing_file', `${by} ${verb} ${s}, and the project's file is ${other}: the case differs, and a build's files are found by their exact names${sure ? '' : ` (${hint(s)})`}`, [s, other]);
    return null;
  };
  const need = (s, by, verb = 'names') => {
    const r = find(s, by, verb, true);
    if (r === null) throw new BuildError('missing_file', `${by} ${verb} ${s}, which the project doesn't have`, [s]);
    add(r, by);
  };
  // the roots
  need(LICENCES_FILE, 'a build');
  if (byRef.has(GAME_FILE)) add(GAME_FILE, 'a build');
  for (const s of game.scenes) need(s, GAME_FILE);
  for (const key of ['behaviours', 'animations', 'personas']) if (game[key]) need(game[key], GAME_FILE);
  if (typeof game.input === 'string') need(game.input, GAME_FILE);
  for (const pattern of game.include) {
    const re = globRe(normRef(pattern)), hits = [...byRef.keys()].filter((f) => re.test(f));
    if (!hits.length) throw new BuildError('missing_file', `${GAME_FILE} includes ${pattern}, which matches no file of the project`, [pattern]);
    for (const f of hits) add(f, GAME_FILE);
  }
  // the trace
  while (queue.length) {
    const ref = queue.shift();
    if (isJson(ref)) {
      let doc;
      try { doc = JSON.parse(text(await read(byRef.get(ref)))); } catch (e) { throw new BuildError('bad_file', `${ref} (named by ${why.get(ref)}) is not JSON: ${e.message}`, [ref]); }
      if (ref === GAME_FILE) continue; // its refs are the roots above, and its `ignore` and `include` are not references
      // a scene's typed references, exactly; then every other string that reads as a path
      let found = new Set();
      if (/\.vrmxs$/i.test(ref) && doc && typeof doc === 'object' && !Array.isArray(doc)) {
        const { typed, loose } = sceneRefs(doc, registry);
        for (const t of typed) {
          const r = find(t.ref, ref, 'names', true);
          if (r === null) throw new BuildError('missing_file', `${ref} names ${t.ref} (${t.where}), which the project doesn't have`, [t.ref]);
          if (r !== ref) add(r, ref);
        }
        found = loose;
      } else strings(doc, found);
      for (const s of sortPaths(found)) {
        if (ignore.has(s)) continue;
        // from the project's root, as the engine's services read a ref; or beside the document (a line's timings name
        // their clip by its file name alone)
        const r = find(s, ref, 'names', false) ?? (dirOf(ref) && !s.startsWith('/') ? find(`${dirOf(ref)}/${s}`, ref, 'names', false) : null);
        if (r !== null) { if (r !== ref) add(r, ref); continue; }
        if (looksLikeRef(s)) throw new BuildError('missing_file', `${ref} names ${s}, which the project doesn't have (${hint(s)})`, [s]);
      }
    } else if (/\.wav$/i.test(ref)) {
      const timings = ref.replace(/\.wav$/i, '.timings.json');
      if (byRef.has(timings)) add(timings, ref);
    } else if (isModule(ref)) {
      for (const spec of moduleImports(text(await read(byRef.get(ref))), ref)) {
        if (spec === CORE) continue;
        if (!/^\.{1,2}\//.test(spec)) throw new BuildError('bad_file', `${ref} imports ${spec}: a build gives a project's modules ${CORE} and their own relative imports, nothing else`, [ref]);
        const target = resolveFrom(ref, spec);
        if (target === null) throw new BuildError('missing_file', `${ref} imports ${spec}, which is outside the project`, [spec]);
        const r = find(target, ref, 'imports', true);
        if (r === null) throw new BuildError('missing_file', `${ref} imports ${spec}, which the project doesn't have`, [target]);
        add(r, ref);
      }
    }
  }
  const refs = sortPaths(why.keys());
  return { refs, source: new Map(refs.map((r) => [r, byRef.get(r)])), why };
}
