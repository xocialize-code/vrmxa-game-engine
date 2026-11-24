// Which of a project's files a game needs, traced from its documents. The roots are what the game document names. From
// there one rule does most of the work: a file is collected when a collected JSON document (.vrmxs, .json) holds its
// path as a string value. That covers a scene's assets and prefabs, a sequence's set, brain and effect documents,
// voice clips in connections and tracks, persona cores, animation clips and looks, without this package knowing any of
// those formats. Two more: a .wav brings the .timings.json beside it, and a module brings its relative imports.
//
// What no document names (a file read from a path a behaviour builds at run time) goes in the game's `include`. The
// loader refuses a ref the manifest doesn't list, by name, so a missed file fails on the first play, never silently.
import { GAME_FILE } from './game.js';
import { LICENCES_FILE } from './licences.js';
import { BuildError, globRe, resolveFrom, sortPaths } from './paths.js';

const text = (b) => new TextDecoder().decode(b);
const isJson = (p) => /\.(vrmxs|json)$/i.test(p);
const isModule = (p) => /\.m?js$/i.test(p);
// import … from './x.js', export … from './x.js', import('./x.js'), import './x.js'
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\1/g;

function strings(v, out) {
  if (typeof v === 'string') out.add(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
}

/**
 * The files a game needs, in manifest order, and for each the file that named it.
 * @param {{ game: import('./game.js').Game, files: string[], read: (ref: string) => Promise<Uint8Array> }} o
 *   files: every file of the project by ref; read: a file's bytes
 * @returns {Promise<{ refs: string[], why: Map<string, string> }>}
 */
export async function collect({ game, files, read }) {
  const have = new Set(files), why = new Map(), queue = [];
  const add = (ref, by) => { if (!why.has(ref)) { why.set(ref, by); queue.push(ref); } };
  const need = (ref, by) => {
    if (!have.has(ref)) throw new BuildError('missing_file', `${by} names ${ref}, which the project doesn't have`, [ref]);
    add(ref, by);
  };
  // the roots
  need(LICENCES_FILE, 'a build');
  if (have.has(GAME_FILE)) add(GAME_FILE, 'a build');
  for (const s of game.scenes) need(s, GAME_FILE);
  for (const key of ['behaviours', 'animations', 'personas']) if (game[key]) need(game[key], GAME_FILE);
  if (typeof game.input === 'string') need(game.input, GAME_FILE);
  for (const pattern of game.include) {
    const re = globRe(pattern), hits = files.filter((f) => re.test(f));
    if (!hits.length) throw new BuildError('missing_file', `${GAME_FILE} includes ${pattern}, which matches no file of the project`, [pattern]);
    for (const f of hits) add(f, GAME_FILE);
  }
  // the trace
  while (queue.length) {
    const ref = queue.shift();
    if (isJson(ref)) {
      let doc;
      try { doc = JSON.parse(text(await read(ref))); } catch (e) { throw new BuildError('bad_file', `${ref} (named by ${why.get(ref)}) is not JSON: ${e.message}`, [ref]); }
      const found = new Set();
      strings(doc, found);
      for (const s of sortPaths(found)) if (s !== ref && have.has(s)) add(s, ref);
    } else if (/\.wav$/i.test(ref)) {
      const timings = ref.replace(/\.wav$/i, '.timings.json');
      if (have.has(timings)) add(timings, ref);
    } else if (isModule(ref)) {
      for (const m of text(await read(ref)).matchAll(IMPORT)) {
        const target = resolveFrom(ref, m[2]);
        if (target === null || !have.has(target)) throw new BuildError('missing_file', `${ref} imports ${m[2]}, which the project doesn't have`, [target ?? m[2]]);
        add(target, ref);
      }
    }
  }
  return { refs: sortPaths(why.keys()), why };
}
