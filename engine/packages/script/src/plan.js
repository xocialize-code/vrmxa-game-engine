// A parsed script laid out in time: each beat's frames, and the performance it asks for (lines said, talk, gestures,
// expressions, looks, marks). Integer frames throughout; the same script lays out the same everywhere.
//
// Timing, before any line is baked (the defaults in vocab.js TIMING):
//   - a scene heading is a 2 s establishing shot;
//   - action is read at 0.3 s a word (1.5 s to 8 s), or held for [[hold: s]];
//   - a line takes M3's estimate (0.4 s + 0.32 s a word, 1 s to 12 s), plus (beat) and (pause) silences, then 0.25 s;
//   - a line whose dialogue clip was edited by hand takes that clip's length instead (lengths), so a trimmed or
//     retimed line moves everything after it;
//   - dual dialogue (^) starts with the line before it;
//   - transitions take no time: DISSOLVE blends into the next shot's camera, the others cut.
import { PAREN_WORDS, TIMING } from './vocab.js';

/**
 * @param {{ beats: any[] }} parsed
 * @param {{ fps: number, cast: Map<string, string>, markOf: (name: string, line: number) => string | null, err: (line: number, message: string) => void, lengths?: Map<string, number>, timing?: any }} o
 *   cast: cue → node id; markOf: a mark's name → its node id (null after reporting an error)
 */
export function layout(parsed, { fps, cast, markOf, err, lengths = new Map(), timing = {} }) {
  const T = { ...TIMING, ...timing };
  const F = (s) => Math.round(s * fps);
  const who = (cue) => cast.get(cue) ?? null; // an unknown cue is reported by the build
  const beats = [], events = [];
  const ev = (e) => events.push(e);
  let c = 0, pending = null, prevLine = null;
  const lineBeats = parsed.beats.filter((b) => b.kind === 'line');
  const characters = [...new Set(lineBeats.map((b) => cast.get(b.cue)).filter(Boolean))];

  // a look's target: a character by cue, the camera, or a mark
  const lookAt = (arg, line) => {
    const cue = arg.toUpperCase().trim();
    if (cast.has(cue)) return cast.get(cue);
    if (arg.trim().toLowerCase() === 'camera') return 'camera';
    return markOf(arg.trim(), line);
  };

  for (const b of parsed.beats) {
    const at = { id: b.id, kind: b.kind, line: b.line, start: c, end: c, shot: false };
    if (b.kind === 'transition') { pending = /DISSOLVE/.test(b.text) ? 'dissolve' : /FADE/.test(b.text) ? 'fade' : 'cut'; beats.push(at); continue; }
    if (b.kind === 'scene') {
      const len = F(T.establish);
      Object.assign(at, { end: c + len, shot: len > 0, heading: b.heading, ...(b.number ? { number: b.number } : {}) });
      c += len;
    } else if (b.kind === 'action') {
      const hold = b.tags.find((g) => g.kind === 'hold');
      const len = hold ? F(Number(hold.arg)) : b.words ? Math.min(F(T.actionMax), Math.max(F(T.actionMin), F(b.words * T.actionPerWord))) : 0;
      Object.assign(at, { end: c + len, shot: len > 0 });
      for (const g of b.tags) {
        if (g.kind === 'hold') continue;
        if (!g.cue) { err(g.line, `[[${g.name}${g.arg ? `: ${g.arg}` : ''}]]: in action, a tag says who ([[NAME ${g.name}${g.arg ? `: ${g.arg}` : ''}]])`); continue; }
        const id = who(g.cue);
        if (!id) continue;
        const t = c + (b.words ? Math.round((len * g.from) / b.words) : 0);
        tag(id, g, t, c + len, b.id);
      }
      c += len;
    } else if (b.kind === 'line') {
      const id = who(b.cue);
      const start = b.dual && prevLine ? prevLine.start : c;
      const pauses = b.parts.map((p) => (p.kind === 'paren' ? pauseOf(p.text) : 0));
      const firstText = b.parts.findIndex((p) => p.kind === 'text');
      const lead = pauses.slice(0, Math.max(0, firstText)).reduce((a, x) => a + F(x), 0);
      const mid = pauses.slice(Math.max(0, firstText)).reduce((a, x) => a + F(x), 0);
      const est = Math.min(F(T.speechMax), Math.max(F(T.speechMin), F(T.speechLead + T.speechPerWord * b.words)));
      const speech = lengths.has(b.id) ? Math.max(1, lengths.get(b.id) - mid) : est;
      const sayStart = start + lead;
      let t = start, spoken = 0, wordsSoFar = 0, look = null;
      const voiced = b.ext !== 'V.O.', seen = !b.ext;
      for (const p of b.parts) {
        if (p.kind === 'paren') {
          t += F(pauseOf(p.text)); // before the first words, these add up to the lead
          for (const w of p.text.toLowerCase().split(/[^a-z']+/).filter(Boolean)) {
            const x = PAREN_WORDS.expression[w], g = PAREN_WORDS.gesture[w];
            if (id && x) ev({ type: 'expression', char: id, name: x, start: Math.max(t, sayStart), end: null, beat: b.id });
            if (id && g && seen) ev({ type: 'gesture', char: id, name: g, start: Math.max(t, sayStart), beat: b.id });
          }
          const to = /^to\s+(.+)$/i.exec(p.text.trim());
          if (to && cast.has(to[1].toUpperCase().trim())) look = cast.get(to[1].toUpperCase().trim());
          continue;
        }
        // this part's share of the speech, by its words (the last part takes what's left)
        wordsSoFar += words(p.text);
        const until = wordsSoFar >= b.words ? speech : Math.round((speech * wordsSoFar) / Math.max(1, b.words));
        const seg = until - spoken;
        for (const g of p.tags) {
          const gt = t + Math.round((seg * g.word) / Math.max(1, words(p.text)));
          if (g.cue) { err(g.line, `[[${g.cue} ${g.name}]]: in dialogue, tags are the speaker's (drop the name)`); continue; }
          if (g.kind === 'look') { const l = lookAt(g.arg, g.line); if (l) look = l; continue; }
          if (g.kind === 'hold') { err(g.line, '[[hold]] is for action; a line takes its own length'); continue; }
          if (id) tag(id, g, gt, null, b.id);
        }
        t += seg; spoken = until;
      }
      const sayEnd = t;
      Object.assign(at, { start, end: sayEnd, shot: !(b.dual && prevLine), speaker: id, cue: b.cue, sayStart, sayEnd, ...(b.ext ? { ext: b.ext } : {}), ...(b.dual ? { dual: true } : {}) });
      if (id) {
        ev({ type: 'say', char: id, start: sayStart, end: Math.max(sayEnd, sayStart + 1), text: b.text, beat: b.id });
        if (seen) ev({ type: 'talk', char: id, start: sayStart, end: Math.max(sayEnd, sayStart + 1), beat: b.id });
        // the one spoken to: named, or the speaker before, or the speaker after
        const k = lineBeats.indexOf(b);
        const other = (list) => list.map((x) => cast.get(x.cue)).find((x) => x && x !== id) ?? null;
        const to = look ?? other(lineBeats.slice(0, k).reverse()) ?? other(lineBeats.slice(k + 1));
        if (seen && to) ev({ type: 'look', char: id, at: to, start: sayStart, end: sayEnd, beat: b.id });
        if (voiced) for (const l of characters) if (l !== id) ev({ type: 'look', char: l, at: id, start: sayStart, end: sayEnd, beat: b.id });
      }
      if (b.dual && prevLine) { prevLine.end = Math.max(prevLine.end, sayEnd); prevLine.overlap = true; }
      c = Math.max(c, sayEnd + F(T.gap));
      prevLine = at;
    }
    if (pending && at.shot) { at.transition = pending; pending = null; }
    beats.push(at);
  }
  for (const e of events) if (e.type === 'expression' && e.end === null) e.end = beats.find((x) => x.id === e.beat).end;
  // the film runs past the last line by the tail, and past anything the performance does after it
  let last = c;
  for (const e of events) last = Math.max(last, e.type === 'gesture' ? e.start + F(T.gesture) : e.type === 'expression' ? e.end + T.fall : e.end ?? e.frame ?? 0);
  const duration = Math.max(1, last + F(T.tail));

  function tag(id, g, t, end, beat) {
    if (g.kind === 'gesture') ev({ type: 'gesture', char: id, name: g.name, start: t, beat });
    else if (g.kind === 'expression') ev({ type: 'expression', char: id, name: g.name, start: t, end, beat });
    else if (g.kind === 'look') { const l = lookAt(g.arg, g.line); if (l) ev({ type: 'look', char: id, at: l, start: t, end: end ?? t, beat }); }
    else if (g.kind === 'at') { const m = markOf(g.arg, g.line); if (m) ev({ type: 'mark', char: id, mark: m, frame: t, beat }); }
  }
  // a look from an action tag lasts to the end of its beat
  for (const e of events) if (e.type === 'look' && e.end <= e.start) e.end = beats.find((x) => x.id === e.beat).end;
  return { fps, duration, beats, events: events.filter((e) => e.type !== 'look' || e.end > e.start), characters, timing: T, F };
}

const words = (s) => (s ? s.split(' ').filter(Boolean).length : 0);
function pauseOf(text) {
  let s = 0;
  for (const w of text.toLowerCase().split(/[^a-z]+/)) s += PAREN_WORDS.pause[w] ?? 0;
  return s;
}
