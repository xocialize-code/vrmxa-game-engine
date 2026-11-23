// A script → a sequence document over a set, or a re-script of one (previous), keeping hand edits (merge.js).
import { parseScript } from './parse.js';
import { layout } from './plan.js';
import { generate, numberShots, defaultCoverage } from './generate.js';
import { merge, handLengths, beatOf } from './merge.js';
import { readRow, writeRow } from './ids.js';
import { fnv, fingerprint, canonical } from './hash.js';

export const SCRIPT_RECORD_VERSION = 1;

/**
 * Build a sequence from a script, or re-script one.
 * @param {string} text the script (the Fountain subset)
 * @param {{
 *   previous?: any, set?: any, setRef?: string, id?: string, source?: string, fps?: number,
 *   vocab?: { gestures?: string[], expressions?: string[] }, marks?: Record<string, { p?: number[], q?: number[] }>,
 *   coverage?: Function, behaviours?: boolean, timing?: any, renumber?: boolean, release?: string[]
 * }} [o]
 *   previous: the sequence document now (its hand edits are kept); set: the set document it films (for the cast's
 *   names, marks and camera); setRef: the set's path (else the title page's Set, else previous.set); marks: marks to
 *   place as Marker nodes when the set and the sequence have none by that name; coverage: W8's cameras (generate.js
 *   defaultCoverage is the stand-in); behaviours: keep the cast's set behaviours (default: they stand for the camera);
 *   release: beat ids to give back to the script
 * @returns {{ ok: boolean, errors: { line: number, message: string }[], warnings: string[], doc?: any, addNodes?: any[], setNodes?: any[], removeNodes?: string[], report?: any, parsed: any, plan?: any }}
 */
export function buildSequence(text, o = {}) {
  const { previous = null, set = null, vocab, marks: markDefs = {}, coverage = defaultCoverage, behaviours = false, timing, renumber = false } = o;
  const prevSeq = previous?.sequence ?? null, S = prevSeq?.script ?? null;
  const release = new Set(o.release ?? []);
  const parsed = parseScript(text, { previous: S, vocab });
  const errors = [...parsed.errors], warnings = [];
  const err = (line, message) => errors.push({ line, message });
  const { title } = parsed;

  const setRef = o.setRef ?? title.set ?? previous?.set ?? null;
  if (!setRef) err(title.lines.set ?? 1, 'which set does this film? Add "Set: <file>.vrmxs" to the title page');
  let fps = prevSeq?.fps ?? title.fps ?? o.fps ?? 24;
  if (prevSeq?.fps && title.fps && title.fps !== prevSeq.fps) warnings.push(`the title page says ${title.fps} fps; the sequence is ${prevSeq.fps} fps and stays so`);

  // ---------------------------------------------------------------- the cast: cue → node id
  const setNodes = set?.nodes ?? [];
  const cast = new Map(), firstLine = new Map();
  const note = (cue, line) => { if (!firstLine.has(cue)) firstLine.set(cue, line); };
  for (const b of parsed.beats) {
    if (b.kind === 'line') note(b.cue, b.line);
    for (const g of b.tags ?? []) if (g.cue) note(g.cue, g.line);
  }
  for (const cue of Object.keys(title.marks)) note(cue, title.lines[`marks:${cue}`]);
  for (const cue of Object.keys(title.cast)) note(cue, title.lines[`cast:${cue}`]);
  for (const [cue, line] of firstLine) {
    let id = title.cast[cue] ?? null;
    if (!id && set) id = setNodes.find((n) => n.type === 'Character' && (String(n.name ?? '').toUpperCase() === cue || n.id.toUpperCase() === cue))?.id ?? null;
    if (!id && !set) id = cue.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!id) { err(line, `${cue}: no character in the set by this name (map it on the title page: "Cast: ${cue} = node-id")`); continue; }
    if (set && !setNodes.some((n) => n.id === id)) { err(title.lines[`cast:${cue}`] ?? line, `${cue} = ${id}: the set has no node "${id}"`); continue; }
    cast.set(cue, id);
  }

  // ---------------------------------------------------------------- marks: a Marker in the sequence or the set, or one placed here
  const markTf = new Map(), markNodes = [];
  const prevNodes = previous?.nodes ?? [];
  const markOf = (name, line) => {
    // a Marker the set or the sequence has by that very id comes first
    const exact = prevNodes.find((x) => x.id === name && !S?.nodes?.[x.id]) ?? setNodes.find((x) => x.id === name);
    if (exact) { markTf.set(exact.id, structuredClone(exact.transform ?? { p: [0, 0, 0] })); return exact.id; }
    // a mark the caller defines is the build's own Marker (mark-<name>): placed, and kept up to date while untouched;
    // a person's Marker of that id (or the build's, once they moved it) wins with its own transform
    if (markDefs[name]) {
      const id = `mark-${name}`, have = prevNodes.find((x) => x.id === id) ?? setNodes.find((x) => x.id === id);
      const theirs = have && S?.nodes?.[id] !== fingerprint(have) && !(S && !S.nodes && canonical(have.transform) === canonical(markDefs[name]));
      if (!markNodes.some((n) => n.id === id)) markNodes.push({ id, type: 'Marker', name, transform: structuredClone(markDefs[name]), props: { purpose: 'other' } });
      markTf.set(id, structuredClone(theirs ? have.transform ?? { p: [0, 0, 0] } : markDefs[name]));
      return id;
    }
    for (const id of [name, `mark-${name}`]) {
      const n = prevNodes.find((x) => x.id === id) ?? setNodes.find((x) => x.id === id);
      if (n) { markTf.set(n.id, structuredClone(n.transform ?? { p: [0, 0, 0] })); return n.id; }
    }
    err(line, `mark "${name}": no Marker by that id in the set or the sequence`);
    return null;
  };
  const initial = new Map(), titled = new Set();
  for (const [cue, name] of Object.entries(title.marks)) {
    const id = cast.get(cue), m = markOf(name, title.lines[`marks:${cue}`]);
    if (id && m) { initial.set(id, m); titled.add(id); }
  }

  // ---------------------------------------------------------------- lay out, number, generate
  const lengths = handLengths(previous);
  for (const b of release) lengths.delete(b);
  const plan = layout(parsed, { fps, cast, markOf, err, lengths, timing });
  for (const e of plan.events) if (e.type === 'mark' && !initial.has(e.char)) initial.set(e.char, e.mark);
  if (errors.length) return { ok: false, errors: errors.sort((a, b) => a.line - b.line), warnings, parsed };

  const oldRows = (S?.beats ?? []).map(readRow);
  const shotBeats = plan.beats.filter((b) => b.shot);
  const numbers = numberShots(shotBeats, new Map(oldRows.filter((r) => r.number).map((r) => [r.id, r.number])), { renumber, warn: (w) => { warnings.push(w); } });
  const setCamera = setNodes.find((n) => n.type === 'Camera')?.id ?? null;
  const G = generate(plan, { numbers, initial, titled, markTf, markNodes, setCamera, coverage, behaviours, parsed });
  const setIds = new Set(setNodes.map((n) => n.id));
  for (const n of G.nodes) if (setIds.has(n.id)) throw new Error(`the set already has a node "${n.id}", which the script's build places in the sequence`);

  const live = new Set(plan.beats.map((b) => b.id));
  const m = merge(previous, G, { oldRows, beats: plan.beats, live, duration: plan.duration, release });
  warnings.push(...m.warnings);

  // ---------------------------------------------------------------- the document
  const doc = previous ? structuredClone(previous) : { format: 'vrmxs', version: 1, id: o.id ?? slug(title.title ?? 'script'), set: setRef, assets: [], nodes: [], connections: [] };
  if (!previous) doc.set = setRef;
  doc.nodes ??= [];

  const rows = plan.beats.map((b) => { const pb = parsed.beats.find((x) => x.id === b.id); return writeRow({ id: b.id, kind: b.kind, cue: b.kind === 'line' ? b.cue : null, fp: pb.fp, start: b.start, end: b.end, number: numbers.get(b.id) ?? null, words: pb.sig }); });
  const refs = new Set();
  const see = (src) => { if (typeof src === 'string') refs.add(beatOf(src)); };
  for (const x of [...m.shots, ...m.markers, ...Object.values(m.cast)]) if (x.hand) see(x.src);
  for (const t of m.tracks) for (const c of t.clips ?? []) if (c.hand) see(c.src);
  for (const k of [...m.next.hand, ...m.next.removed]) see(k.split('|')[1]);
  const used = [...refs].filter((b) => b !== 'cast' && !live.has(b)).sort();

  const sequence = { ...(prevSeq ? structuredClone(prevSeq) : {}), fps, duration: m.duration, shots: m.shots, markers: m.markers, tracks: m.tracks };
  if (Object.keys(m.cast).length) sequence.cast = m.cast; else delete sequence.cast;
  const nodes = mergeNodes(doc, G.nodes, S, sequence);
  sequence.script = {
    version: SCRIPT_RECORD_VERSION,
    ...(o.source ?? S?.source ? { source: o.source ?? S.source } : {}),
    hash: fnv(String(text)),
    beats: rows,
    gen: { ...m.next.gen, duration: m.genDuration },
    hand: [...m.next.hand].sort(),
    removed: [...m.next.removed].sort(),
    dropped: [...m.next.dropped].sort(),
    tracks: [...new Set(m.next.tracks)].sort(),
    used,
    nodes: nodes.record,
  };
  for (const k of ['hand', 'removed', 'dropped', 'used']) if (!sequence.script[k].length) delete sequence.script[k];
  if (!Object.keys(sequence.script.nodes).length) delete sequence.script.nodes;
  doc.sequence = sequence;

  // what changed, for the editor's undo label and the creator's status line
  const oldIds = new Set(oldRows.map((r) => r.id)), oldFp = new Map(oldRows.map((r) => [r.id, r.fp]));
  const report = {
    added: plan.beats.filter((b) => !oldIds.has(b.id)).map((b) => b.id),
    removed: oldRows.filter((r) => !live.has(r.id)).map((r) => r.id),
    changed: parsed.beats.filter((b) => oldFp.has(b.id) && oldFp.get(b.id) !== b.fp).map((b) => b.id),
    hand: countHand(sequence),
    shots: sequence.shots.length,
    lines: parsed.beats.filter((b) => b.kind === 'line').length,
  };
  return { ok: true, errors: [], warnings, doc, addNodes: nodes.add, setNodes: nodes.set, removeNodes: nodes.remove, report, parsed, plan };
}

const NODE_FIELDS = ['name', 'transform', 'props'];
/**
 * The nodes the build places (brain, cameras, marks), by the rules items follow: added when missing; replaced by the
 * new build's while untouched (a mark moved on the title page moves the wide camera); kept, and the person's, once
 * edited; removed when the build no longer places them, if untouched and nothing in the sequence names them. Records
 * script.nodes { id: fingerprint, or "-" once the person's }. Changes doc.nodes; returns the edit ops' parts.
 */
function mergeNodes(doc, made, S, sequence) {
  const prev = S?.nodes, record = {}, add = [], set = [], remove = [];
  const ids = new Set(made.map((n) => n.id));
  for (const n of made) {
    const i = doc.nodes.findIndex((x) => x.id === n.id);
    if (i < 0) { const c = structuredClone(n); doc.nodes.push(c); add.push(c); record[n.id] = fingerprint(n); continue; }
    const cur = doc.nodes[i], r = prev?.[n.id];
    if (r === undefined) { if (S && !prev && fingerprint(cur) === fingerprint(n)) record[n.id] = fingerprint(n); continue; } // a person's node by that id (or one from a record without nodes, unchanged)
    if (r !== fingerprint(cur)) { record[n.id] = '-'; continue; } // edited: the person's
    for (const k of NODE_FIELDS) if (canonical(cur[k] ?? null) !== canonical(n[k] ?? null)) set.push({ id: n.id, path: k, value: structuredClone(n[k]) });
    doc.nodes[i] = structuredClone(n);
    record[n.id] = fingerprint(n);
  }
  for (const [id, r] of Object.entries(prev ?? {})) {
    if (ids.has(id)) continue;
    const i = doc.nodes.findIndex((x) => x.id === id);
    if (i < 0 || r !== fingerprint(doc.nodes[i])) continue; // gone, or the person's now
    if (named(id, doc, sequence)) { record[id] = r; continue; } // something kept still uses it
    doc.nodes.splice(i, 1); remove.push(id);
  }
  return { record, add, set, remove };
}
/** Does anything in the sequence, its connections or another node name this node? */
function named(id, doc, seq) {
  const deep = (v) => (typeof v === 'string' ? v === id : Array.isArray(v) ? v.some(deep) : v && typeof v === 'object' ? Object.values(v).some(deep) : false);
  if ((seq.tracks ?? []).some((t) => t.target === id || (t.clips ?? []).some((c) => c.camera === id || c.at === id))) return true;
  if ((seq.shots ?? []).some((x) => x.camera === id || Object.hasOwn(x.overrides ?? {}, id))) return true;
  if (Object.hasOwn(seq.cast ?? {}, id)) return true;
  if ((doc.connections ?? []).some((c) => c.from === id || c.to === id)) return true;
  return doc.nodes.some((n) => n.id !== id && deep(n.props ?? {}));
}

function countHand(seq) {
  let n = (seq.shots ?? []).filter((s) => s.hand).length + (seq.markers ?? []).filter((s) => s.hand).length + Object.values(seq.cast ?? {}).filter((c) => /** @type {any} */ (c).hand).length;
  for (const t of seq.tracks ?? []) n += (t.clips ?? []).filter((c) => c.hand).length;
  return n + (seq.script?.hand?.length ?? 0);
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'script';

/** Errors as "file:line: message" lines. */
export function formatErrors(errors, file = 'script') {
  return errors.map((e) => `${file}:${e.line}: ${e.message}`).join('\n');
}
