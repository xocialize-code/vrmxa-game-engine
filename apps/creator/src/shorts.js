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
      const sequence = s.sequence ?? `sequences/${s.id}.vrmxs`;
      // no coverage named: as for a discovered short, a sequence that exists keeps the cameras it was built with
      return { id: s.id, title: s.title ?? s.id, script: s.script, sequence, marks: s.marks ?? null, set: s.set ?? null, coverage: s.coverage ?? (files.includes(sequence) ? 'default' : 'rule') };
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

/** What kind of file a name is, for File › Open: 'script', 'character', 'set', 'model' (a .glb set) or null. A .vrmxs is
 * checked again once read (`sceneKind`): a sequence or a prefab isn't a set. */
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

/**
 * The project's shorts, saved and unsaved (M4 W5 review). A short made in the creator (New Short, Save As, a script
 * opened from elsewhere) is a draft until it is saved: it never goes into shorts.json, and switching away from it
 * discards it (the window asks first). A new short's id is free of every short and of every project file it would
 * write, so it can never open or overwrite a sequence or script that already exists.
 */
export class ShortList {
  /** @param {any[]} shorts readShorts' result (all saved) */
  constructor(shorts = []) { this.list = shorts.map((s) => ({ ...s, saved: true })); }
  get all() { return this.list; }
  byId(id) { return this.list.find((s) => s.id === id) ?? null; }
  /** The short whose script is this ref, if any. */
  forScript(ref) { return this.list.find((s) => s.script === ref) ?? null; }
  /** An id no short has and whose sequences/<id>.vrmxs and scripts/<id>.fountain the project doesn't hold. */
  freeId(base, files) {
    const taken = (id) => this.list.some((s) => s.id === id || s.script === `scripts/${id}.fountain` || s.sequence === `sequences/${id}.vrmxs`) || files.includes(`sequences/${id}.vrmxs`) || files.includes(`scripts/${id}.fountain`);
    let id = base || 'untitled', n = 2;
    while (taken(id)) id = `${base || 'untitled'}-${n++}`;
    return id;
  }
  /** Add an unsaved short (its id must be free: freeId). */
  addDraft(short) {
    if (this.byId(short.id)) throw new Error(`a short ${short.id} exists already`);
    const d = { ...short, saved: false };
    this.list = [...this.list, d];
    return d;
  }
  /** Replace a short's fields, keeping its place. */
  update(id, fields) { this.list = this.list.map((s) => (s.id === id ? { ...s, ...fields } : s)); return this.byId(id); }
  markSaved(id) { return this.update(id, { saved: true }); }
  /** Drop an unsaved short (a saved one stays: its files are on disk). → whether it went */
  discard(id) {
    const s = this.byId(id);
    if (!s || s.saved) return false;
    this.list = this.list.filter((x) => x !== s);
    return true;
  }
  /** shorts.json's text: saved shorts only. */
  manifest() { return shortsManifest(this.list.filter((s) => s.saved)); }
}

/** Two byte arrays the same? */
export function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A ref no project file has: characters/mira.vrmxa → characters/mira-2.vrmxa. */
export function freeRef(ref, files) {
  const i = ref.lastIndexOf('.'), base = i > ref.lastIndexOf('/') ? ref.slice(0, i) : ref, ext = i > ref.lastIndexOf('/') ? ref.slice(i) : '';
  let out = ref, n = 2;
  while (files.includes(out)) out = `${base}-${n++}${ext}`;
  return out;
}

/** What a .vrmxs is: 'sequence' (a sequence block), 'prefab' (no Environment, Camera or light: parts to instance), or 'set'. */
export function sceneKind(doc) {
  if (doc?.sequence) return 'sequence';
  const types = new Set((doc?.nodes ?? []).map((n) => n.type));
  return ['Environment', 'Camera', 'DirectionalLight', 'SpotLight', 'PointLight'].some((t) => types.has(t)) ? 'set' : 'prefab';
}

/** The asset refs a scene names that the project doesn't hold. */
export function missingRefs(doc, files) { return (doc?.assets ?? []).map((a) => a.ref).filter((r) => r && !files.includes(r)); }

/**
 * Where a file opened from elsewhere goes in the project (M4 W5 review). A new name is written; the same bytes under
 * the same name are reused; different bytes under a name the project holds ask `onClash(ref)` → 'replace' (write over
 * it), 'rename' (a free name beside it) or 'cancel' (→ null). Never a card read from one file and a render from another.
 * @param {string} ref @param {Uint8Array} bytes
 * @param {{ files: string[], read: (ref: string) => Promise<Uint8Array>, onClash?: (ref: string) => Promise<string> | string }} o
 * @returns {Promise<{ ref: string, write: boolean, same?: boolean, replaced?: boolean, renamed?: boolean } | null>}
 */
export async function placeFile(ref, bytes, { files, read, onClash = null }) {
  if (!files.includes(ref)) return { ref, write: true };
  if (sameBytes(await read(ref), bytes)) return { ref, write: false, same: true };
  const choice = (await onClash?.(ref)) ?? 'cancel';
  if (choice === 'replace') return { ref, write: true, replaced: true };
  if (choice === 'rename') return { ref: freeRef(ref, files), write: true, renamed: true };
  return null;
}
