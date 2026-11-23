// The creator's project of shorts (M4 W5), as plain data: which shorts a project holds, where each one's script,
// sequence and marks live, the beats a storyboard card points back to, and which script text goes with which state of
// the sequence (so undo and redo bring the script pane back with the document). No DOM, no engine: Node tests cover it.
//
// A project lists its shorts in shorts.json:
//   { "format": "vrmxg-shorts", "version": 1, "shorts": [
//       { "id": "cafe-order", "title": "The Order", "script": "scripts/cafe-order.fountain",
//         "sequence": "sequences/cafe-order.vrmxs", "marks": "scripts/cafe-marks.json", "coverage": "default" } ] }
// A project without one (the sample) has a short for each scripts/*.fountain; Save writes the file.
import { parseScript } from '@vrmxg/script';

export const SHORTS_FILE = 'shorts.json';
export const SHORTS_FORMAT = 'vrmxg-shorts';
/** How a short's cameras are made: by @vrmxg/coverage's rules (W8), or the script's default wide and close-ups (W4). */
export const COVERAGE = Object.freeze(['rule', 'default']);

/** A file name's slug: "Cafe Order (v2).fountain" → "cafe-order-v2". */
export function slugOf(name) {
  const base = String(name).split('/').pop().replace(/\.[^.]+$/, '');
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

/** What a script's title page says: { title, set } (either may be null). */
export function titlePage(text) {
  const t = parseScript(text).title ?? {};
  return { title: t.title ?? t.keys?.title ?? null, set: t.set ?? t.keys?.set ?? null };
}

/**
 * A short for a script in the project. The marks are `scripts/<id>-marks.json`, else the set's
 * (`scripts/<set>-marks.json`, as the sample's cafe-marks.json), else none. A short whose sequence already exists keeps
 * the cameras it was built with (`coverage: 'default'`, so opening it changes nothing); a new one is covered by rule.
 * @param {string} scriptRef @param {{ files: string[], text?: string, coverage?: string }} o
 */
export function shortFor(scriptRef, { files, text = '', coverage = undefined }) {
  const id = slugOf(scriptRef), page = text ? titlePage(text) : { title: null, set: null };
  const sequence = `sequences/${id}.vrmxs`;
  const setBase = page.set ? slugOf(page.set) : null;
  const marks = [`scripts/${id}-marks.json`, setBase && `scripts/${setBase}-marks.json`].find((m) => m && files.includes(m)) ?? null;
  return { id, title: page.title ?? id, script: scriptRef, sequence, marks, set: page.set, coverage: coverage ?? (files.includes(sequence) ? 'default' : 'rule') };
}

/**
 * The project's shorts: shorts.json's, or one per scripts/*.fountain.
 * @param {string[]} files the project's files @param {string | null} manifest shorts.json's text, if it has one
 * @param {Record<string, string>} [texts] scripts' texts by ref (titles and sets for discovered shorts)
 */
export function readShorts(files, manifest = null, texts = {}) {
  if (manifest) {
    const m = JSON.parse(manifest);
    if (m.format !== SHORTS_FORMAT) throw new Error(`${SHORTS_FILE}: not a shorts list (format ${JSON.stringify(m.format)})`);
    if (m.version !== 1) throw new Error(`${SHORTS_FILE}: version ${m.version} is newer than this creator reads (1)`);
    return (m.shorts ?? []).map((s) => {
      if (!s.id || !s.script) throw new Error(`${SHORTS_FILE}: a short needs an id and a script`);
      if (s.coverage && !COVERAGE.includes(s.coverage)) throw new Error(`${SHORTS_FILE}: ${s.id}: coverage is ${COVERAGE.join(' or ')}`);
      return { id: s.id, title: s.title ?? s.id, script: s.script, sequence: s.sequence ?? `sequences/${s.id}.vrmxs`, marks: s.marks ?? null, set: s.set ?? null, coverage: s.coverage ?? 'rule' };
    });
  }
  return files.filter((f) => /^scripts\/[^/]+\.fountain$/.test(f)).sort().map((f) => shortFor(f, { files, text: texts[f] ?? '' }));
}

/** shorts.json's text for a list of shorts (stable key order, a newline at the end). */
export function shortsManifest(shorts) {
  const keep = (s) => ({ id: s.id, title: s.title, script: s.script, sequence: s.sequence, ...(s.marks ? { marks: s.marks } : {}), ...(s.set ? { set: s.set } : {}), coverage: s.coverage });
  return `${JSON.stringify({ format: SHORTS_FORMAT, version: 1, shorts: shorts.map(keep) }, null, 2)}\n`;
}

/** Add or replace a short by id, keeping the order. */
export function upsertShort(shorts, short) {
  const i = shorts.findIndex((s) => s.id === short.id);
  return i < 0 ? [...shorts, short] : shorts.map((s, k) => (k === i ? { ...s, ...short } : s));
}

/** A script's beats by id, for the storyboard: { line, text } (a heading, an action, "HANA: words", a transition). */
export function beatIndex(parsed) {
  const out = {};
  for (const b of parsed?.beats ?? []) {
    const text = b.kind === 'scene' ? b.heading : b.kind === 'line' ? `${b.cue}: ${b.text ?? ''}` : (b.text ?? '');
    out[b.id] = { line: b.line, text };
  }
  return out;
}

/** Errors as the script pane lists them: "17: [[hapy]]: unknown tag …", in line order. */
export function errorLines(errors) { return [...(errors ?? [])].sort((a, b) => a.line - b.line).map((e) => ({ line: e.line, text: `${e.line}: ${e.message}` })); }

/**
 * Which script text goes with which state of the document. Each successful re-script records the text against the
 * document's hash; any other edit (the timeline, a cast) records the text the pane holds. Undo and redo land on a hash
 * that was recorded, so the pane shows the script that state was built from.
 */
export class ScriptHistory {
  constructor() { this.byHash = new Map(); }
  record(hash, text) { this.byHash.set(hash, text); }
  /** The text for a state, or null when it was never recorded. */
  textFor(hash) { return this.byHash.has(hash) ? this.byHash.get(hash) : null; }
  /** After any change: the text the state was recorded with, or (a new state) record the pane's and keep it. */
  follow(hash, paneText) {
    const t = this.textFor(hash);
    if (t !== null) return t;
    this.record(hash, paneText);
    return paneText;
  }
}

/** What kind of file a name is, for File › Open: 'script', 'character', 'set', 'model' (a .glb set) or null. */
export function kindOf(name) {
  const ext = String(name).toLowerCase().split('.').pop();
  return { fountain: 'script', vrmxa: 'character', vrmxs: 'set', glb: 'model' }[ext] ?? null;
}

/**
 * A set scene for a model opened as a set (a .glb): the model, an environment, a sun and a camera, so a script can
 * film it (marks come from the script's [[at]] tags or the marks file). → the .vrmxs document
 * @param {string} modelRef the .glb's ref in the project @param {string} id the set's id
 */
export function setForModel(modelRef, id) {
  return {
    format: 'vrmxs', version: 1, id,
    assets: [{ id: 'set-model', type: 'glb', ref: modelRef }],
    nodes: [
      { id: 'root', type: 'Node3D', name: id },
      { id: 'env', type: 'Environment', parent: 'root', props: { background: 'gradient' } },
      { id: 'set', type: 'Model', parent: 'root', asset: 'set-model' },
      { id: 'sun', type: 'DirectionalLight', parent: 'root', transform: { p: [4, 8, 4] } },
      { id: 'camera', type: 'Camera', parent: 'root', transform: { p: [0, 1.6, 6] } },
    ],
  };
}

/** A new short's script: a title page naming its set, and one scene to start from. */
export function scriptTemplate({ title, set }) {
  return `Title: ${title}\nSet: ${set}\n\nINT. ${String(title).toUpperCase()} - DAY\n\nThe scene starts here.\n`;
}
