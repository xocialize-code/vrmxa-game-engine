// The Fountain subset (AB-D-0275): our own small parser, no dependency. Fountain is the open plain-text screenplay
// format (fountain.io); the subset keeps what a one-set short needs and says so when a script uses more.
//
// Kept:     a title page (Key: value, indented continuation lines), scene headings (INT. / EXT. / EST. / INT./EXT. /
//           I/E, or forced with "."; an optional scene number #10#), action (forced with "!"), character cues (all
//           capitals, forced with "@", an extension like (V.O.) or (O.S.), "^" for dual dialogue), dialogue,
//           parentheticals, transitions (… TO:, FADE OUT., or forced with ">"), notes [[…]] on one line, boneyard
//           /* … */, sections (#) and synopses (=) and page breaks (===), which are read and ignored.
// Refused:  lyrics (~) and notes that span lines, with an error at the line.
//
// Notes are tags when they read as one: [[nod]], [[happy]], [[look: MIRA]], [[hold: 3]], [[HANA at: counter]] (a cue
// first, in action). Any other note ("[[fix this later]]") is a writer's note and is ignored. An unknown one-word tag
// is an error, since it is far more likely a typo than a note.
//
// The script is read into beats: a scene heading, an action paragraph, a line (a cue with its parentheticals and
// dialogue) or a transition. Each beat has a stable id (ids.js), and each element in it one derived from the beat's.
import { GESTURES, EXPRESSIONS, KEYED_TAGS } from './vocab.js';
import { assignIds, signature } from './ids.js';

/** Keys that start a title page (Fountain's, and ours: Set, Cast, Marks, fps); others may follow once it has started. */
const TITLE_KEYS = ['title', 'credit', 'author', 'authors', 'source', 'draft date', 'date', 'contact', 'copyright', 'notes', 'revision', 'set', 'cast', 'marks', 'fps'];
const SCENE = /^(?:int\.?\/ext|i\/e|int|ext|est)[. ]/i;
const TRANSITION = /^(?:[A-Z0-9 .'-]+ TO:|FADE (?:OUT|IN|TO BLACK)[.:]?|CUT TO BLACK\.?)$/;
const TAG = /^(?:([A-Z][A-Z0-9'.-]*(?: [A-Z][A-Z0-9'.-]*)*)\s+)?([a-z][a-z0-9-]*)(?::\s*(\S.*?))?\s*$/;

/** Collapse whitespace. */
const squash = (s) => s.replace(/\s+/g, ' ').trim();
/** Text a viewer reads: notes, emphasis markers and escapes removed. */
export const plain = (s) => squash(s.replace(/\s*\[\[[^\]]*\]\](?=[.,!?;:…])/g, '').replace(/\[\[[^\]]*\]\]/g, ' ').replace(/\\(.)/g, '$1').replace(/(^|[^\\])[*_]+/g, '$1'));
const words = (s) => (s ? s.split(' ').filter(Boolean).length : 0);

/** Is this a character cue's text (all capitals outside an extension, with at least one letter)? */
function cueLike(t) {
  const bare = t.replace(/\^$/, '').replace(/\([^)]*\)/g, '').trim();
  return bare.length > 0 && /[A-Z]/.test(bare) && !/[a-z]/.test(bare) && !/[.:]$/.test(bare) || false;
}

/**
 * Parse a script.
 * @param {string} text
 * @param {{ previous?: any, vocab?: { gestures?: string[], expressions?: string[] } }} [o] previous: the script record of
 *   the sequence last built from this script (its beat table), so edited beats keep their ids
 * @returns {{ title: any, beats: any[], elements: any[], errors: { line: number, message: string }[] }}
 */
export function parseScript(text, { previous = null, vocab = {} } = {}) {
  const gestures = new Set(vocab.gestures ?? GESTURES), expressions = new Set(vocab.expressions ?? EXPRESSIONS);
  const errors = [];
  const err = (line, message) => errors.push({ line, message });
  const lines = stripBoneyard(String(text ?? '').split(/\r\n|\r|\n/), err);

  // ---------------------------------------------------------------- the title page
  const title = { cast: {}, marks: {}, keys: {}, lines: {} };
  let i = 0;
  const firstText = lines.find((l) => l !== null) ?? '';
  if (TITLE_KEYS.includes((/^([A-Za-z][A-Za-z ]*):/.exec(firstText)?.[1] ?? '').trim().toLowerCase())) {
    let key = null;
    for (; i < lines.length && (lines[i] === null || lines[i].trim() !== ''); i++) {
      if (lines[i] === null) continue;
      const l = lines[i], m = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(l);
      if (m && !/^\s/.test(l)) { key = m[1].trim().toLowerCase(); title.keys[key] = m[2].trim(); title.lines[key] = i + 1; if (m[2].trim()) titleValue(title, key, m[2].trim(), i + 1, err); }
      else if (key && /^\s/.test(l)) { title.keys[key] = squash(`${title.keys[key]}\n${l.trim()}`); titleValue(title, key, l.trim(), i + 1, err); }
      else err(i + 1, `the title page reads "Key: value" lines (and indented values) until a blank line`);
    }
    if (title.keys.title) title.title = title.keys.title;
    if (title.keys.set) title.set = title.keys.set;
    if (title.keys.fps) { const f = Number(title.keys.fps); if (Number.isInteger(f) && f > 0 && f <= 120) title.fps = f; else err(title.lines.fps, `fps is a whole number of frames a second (1 to 120), not "${title.keys.fps}"`); }
  }

  // ---------------------------------------------------------------- the body
  const beats = [];
  let cur = null; // the open beat (an action paragraph or a line), closed by a blank line
  let blank = true;
  const sceneNumbers = new Map();
  const tagsOf = (raw, line, { cue = false } = {}) => {
    const out = [], notes = [];
    const re = /\[\[([^\]]*)\]\]/g;
    let m;
    while ((m = re.exec(raw))) {
      const body = m[1].trim(), t = TAG.exec(body);
      const before = plain(raw.slice(0, m.index));
      const at = words(before);
      // in action, a tag acts from the start of the sentence it follows ("Steam hisses. [[MIRA look: HANA]]")
      const ends = [...before.replace(/[.!?]+\s*$/, '').matchAll(/[.!?]+(?=\s)/g)];
      const from = ends.length ? words(before.slice(0, ends.at(-1).index + 1)) : 0;
      if (!t || (t[1] && !cue)) { notes.push(body); continue; }
      const [, who, name, arg] = t;
      if (KEYED_TAGS.includes(name)) {
        if (!arg) { err(line, `[[${body}]]: "${name}" takes a value ([[${name}: …]])`); continue; }
        if (name === 'hold' && !(Number(arg) > 0)) { err(line, `[[${body}]]: hold is a number of seconds`); continue; }
      } else if (!gestures.has(name) && !expressions.has(name)) {
        if (/\s/.test(body) && !who) { notes.push(body); continue; }
        err(line, `[[${body}]]: unknown tag "${name}" (gestures: ${[...gestures].join(', ')}; expressions: ${[...expressions].join(', ')}; or look, at, hold)`);
        continue;
      } else if (arg) { err(line, `[[${body}]]: "${name}" takes no value`); continue; }
      out.push({ kind: KEYED_TAGS.includes(name) ? name : gestures.has(name) ? 'gesture' : 'expression', name, ...(arg ? { arg: arg.trim() } : {}), ...(who ? { cue: who } : {}), word: at, from, line });
    }
    if (/\[\[(?![^\]]*\]\])/.test(raw)) err(line, 'a note opens here but doesn\'t close on this line (notes over several lines aren\'t in the subset)');
    return { tags: out, notes };
  };
  const close = () => { cur = null; };

  for (; i < lines.length; i++) {
    if (lines[i] === null) continue; // a line the boneyard took: gone, not blank
    const n = i + 1, raw = lines[i], t = raw.trim();
    if (raw === '  ' && cur?.kind === 'line') { cur.endLine = n; continue; } // two spaces keep a dialogue block going
    if (t === '') { if (cur?.kind === 'line' && !cur.parts.some((p) => p.kind === 'text' && p.text)) err(cur.line, `${cur.cue}: a cue needs dialogue under it`); close(); blank = true; continue; }
    const wasBlank = blank; blank = false;

    // inside a line: parentheticals and dialogue until a blank line
    if (cur?.kind === 'line') {
      if (/^\(.*\)$/.test(t)) cur.parts.push({ kind: 'paren', text: t.slice(1, -1).trim(), line: n, raw: t });
      else {
        if (t.startsWith('~')) { err(n, 'lyrics (~) aren\'t in the subset'); continue; }
        const { tags, notes } = tagsOf(t, n);
        const last = cur.parts.at(-1);
        if (last?.kind === 'text') { last.base += ` ${plain(t)}`; last.raw += `\n${t}`; last.tags.push(...tags.map((g) => ({ ...g, word: g.word + words(last.text) }))); last.text = squash(last.base); last.notes.push(...notes); last.endLine = n; }
        else cur.parts.push({ kind: 'text', base: plain(t), text: plain(t), raw: t, tags, notes, line: n, endLine: n });
      }
      cur.endLine = n;
      continue;
    }
    // an action paragraph goes on until a blank line
    if (cur?.kind === 'action' && !wasBlank) {
      const { tags, notes } = tagsOf(t, n, { cue: true });
      cur.raw += `\n${t}`; cur.tags.push(...tags.map((g) => ({ ...g, word: g.word + words(cur.text), from: g.from + words(cur.text) }))); cur.text = squash(`${cur.text} ${plain(t)}`); cur.notes.push(...notes); cur.endLine = n;
      continue;
    }
    if (!wasBlank) { // text straight after a heading or a transition: Fountain wants a blank line; read it as action
      cur = action(t, n); continue;
    }

    if (/^={3,}$/.test(t) || t.startsWith('#') || (t.startsWith('=') && !t.startsWith('=='))) { blank = true; continue; } // page break, section, synopsis
    if (t.startsWith('~')) { err(n, 'lyrics (~) aren\'t in the subset'); continue; }
    if (t.startsWith('!')) { cur = action(t.slice(1), n); continue; }
    if ((t.startsWith('.') && !t.startsWith('..')) || SCENE.test(t)) {
      let heading = t.startsWith('.') && !SCENE.test(t) ? t.slice(1).trim() : t;
      let number;
      const m = /\s*#([\w.-]+)#$/.exec(heading);
      if (m) {
        number = m[1]; heading = heading.slice(0, m.index).trim();
        if (sceneNumbers.has(number)) err(n, `scene number #${number}# is also on line ${sceneNumbers.get(number)}`); else sceneNumbers.set(number, n);
      }
      beats.push({ kind: 'scene', heading: plain(heading), raw: t, line: n, endLine: n, ...(number ? { number } : {}) });
      blank = true; // a heading stands alone
      continue;
    }
    if (t.startsWith('>') && !t.endsWith('<')) { beats.push({ kind: 'transition', text: t.slice(1).trim().toUpperCase(), raw: t, line: n, endLine: n }); blank = true; continue; }
    if (t.startsWith('>') && t.endsWith('<')) { cur = action(t.slice(1, -1), n); continue; } // centred text is action
    const next = (lines.slice(i + 1).find((l) => l !== null) ?? '').trim();
    if (TRANSITION.test(t) && next === '') { beats.push({ kind: 'transition', text: t, raw: t, line: n, endLine: n }); continue; }
    if (t.startsWith('@') || (cueLike(t) && next !== '')) {
      const body = t.startsWith('@') ? t.slice(1).trim() : t;
      const dual = body.endsWith('^');
      const noCaret = dual ? body.slice(0, -1).trim() : body;
      const ext = /\(([^)]*)\)\s*$/.exec(noCaret);
      const cue = squash((ext ? noCaret.slice(0, ext.index) : noCaret).toUpperCase());
      if (!cue) { err(n, 'a character cue needs a name'); continue; }
      const extension = ext ? ext[1].trim().toUpperCase() : null;
      if (dual && beats.at(-1)?.kind !== 'line') err(n, `${cue} ^: dual dialogue goes straight after the line it overlaps`);
      cur = { kind: 'line', cue, ...(extension && !/^CONT/.test(extension) ? { ext: extension } : {}), ...(dual ? { dual: true } : {}), parts: [], raw: t, line: n, endLine: n };
      beats.push(cur);
      continue;
    }
    cur = action(t, n);
  }
  if (cur?.kind === 'line' && !cur.parts.some((p) => p.kind === 'text' && p.text)) err(cur.line, `${cur.cue}: a cue needs dialogue under it`);

  function action(t, n) {
    const { tags, notes } = tagsOf(t, n, { cue: true });
    const b = { kind: 'action', text: plain(t), raw: t, tags, notes, line: n, endLine: n };
    beats.push(b);
    return b;
  }

  // keys for matching beats across edits: what the beat says, whitespace aside
  for (const b of beats) {
    if (b.kind === 'line') b.raw = [b.raw, ...b.parts.map((p) => p.raw)].join('\n');
    b.key = `${b.kind}|${b.kind === 'line' ? b.cue : ''}|${squash(b.raw)}`;
    if (b.kind === 'line') { b.text = b.parts.filter((p) => p.kind === 'text').map((p) => p.text).join(' '); b.words = words(b.text); }
    if (b.kind === 'action') b.words = words(b.text);
    b.sig = signature(b.kind === 'scene' ? b.heading : b.text);
  }
  if (!beats.some((b) => b.kind !== 'transition')) err(Math.max(1, i), 'the script has no scenes, action or dialogue');

  assignIds(beats, previous);
  const elements = [];
  for (const b of beats) {
    if (b.kind === 'line') {
      elements.push({ id: b.id, type: 'character', name: b.cue, ...(b.ext ? { ext: b.ext } : {}), ...(b.dual ? { dual: true } : {}), line: b.line, beat: b.id });
      b.parts.forEach((p, k) => { p.id = `${b.id}.${k + 1}`; elements.push({ id: p.id, type: p.kind === 'paren' ? 'parenthetical' : 'dialogue', text: p.text, line: p.line, beat: b.id }); });
    } else elements.push({ id: b.id, type: b.kind === 'scene' ? 'scene' : b.kind, text: b.kind === 'scene' ? b.heading : b.text, line: b.line, beat: b.id });
  }
  errors.sort((a, b) => a.line - b.line);
  return { title, beats, elements, errors };
}

/** The title page's own keys: Cast (CUE = node id) and Marks (CUE = mark), one per line or separated by ";" or ",". */
function titleValue(title, key, value, line, err) {
  if (key !== 'cast' && key !== 'marks') return;
  for (const part of value.split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*=\s*(\S+)$/.exec(part);
    if (!m) { err(line, `${key === 'cast' ? 'Cast' : 'Marks'}: write "NAME = ${key === 'cast' ? 'node-id' : 'mark'}", not "${part}"`); continue; }
    const cue = squash(m[1].toUpperCase());
    title[key][cue] = m[2];
    (title.lines[`${key}:${cue}`] = line);
  }
}

/**
 * Take out /* boneyard *\/: a line the boneyard takes whole becomes null (skipped, so a cut line inside a dialogue
 * block doesn't end it), and the line count is kept, so errors point at the right lines.
 */
function stripBoneyard(lines, err) {
  const out = [];
  let open = 0;
  for (let k = 0; k < lines.length; k++) {
    let l = lines[k], s = '';
    let at = 0, touched = !!open || l.includes('/*');
    while (at < l.length) {
      if (open) { const e = l.indexOf('*/', at); if (e < 0) { at = l.length; break; } open = 0; at = e + 2; continue; }
      const b = l.indexOf('/*', at);
      if (b < 0) { s += l.slice(at); break; }
      s += l.slice(at, b); open = k + 1; at = b + 2;
    }
    out.push(touched && !s.trim() ? null : s);
  }
  if (open) err(open, 'a boneyard /* opens here and never closes');
  return out;
}
