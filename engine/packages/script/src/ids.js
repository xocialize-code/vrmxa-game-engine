// Stable ids for script beats. What a sequence keeps of a script hangs off these ids: the shots and clips a beat made,
// the hand edits made to them, and the shot numbers. So an id must survive edits elsewhere in the script, and an edit
// to the beat itself.
//
//   - With no history, a beat's id is its kind and a hash of what it says ("ln-3fa2c1d0"), and a count when the same
//     beat appears again ("-2"). Edits elsewhere don't change it.
//   - With the beat table of the last build (sequence.script.beats), beats are matched to it: first the beats that say
//     exactly what they said (a longest common subsequence, so moved blocks stay matched in order), then, between two
//     matched beats, unmatched old and new beats of the same kind (and, for a line, the same speaker) by what they
//     say: the order-keeping pairing with the most words in common, where a pair needs half its words shared (Dice
//     ≥ 0.5), or is the only old and the only new beat of its kind in the gap. A matched beat takes its old id: a line
//     whose words were edited keeps its id, and with it its hand edits. A line rewritten beyond recognition next to a
//     cut one is a new line (and the cut line's hand edits go with it, merge.js).
//   - What is left is new and gets a fresh id that no beat in the table, and no hand edit, has used.
import { fnv } from './hash.js';

const PREFIX = { scene: 'sc', action: 'ac', line: 'ln', transition: 'tr' };

/**
 * A beat table row: "id kind cue fp start end number words…" (cue and number "-" when none; spaces in a cue as "_";
 * words: the beat's first 32 words, lower case, for matching an edited beat to its old self).
 */
export function readRow(s) {
  const [id, kind, cue, fp, start, end, number, ...words] = s.split(' ');
  return { id, kind, cue: cue === '-' ? null : cue.replace(/_/g, ' '), fp, start: Number(start), end: Number(end), number: number === '-' ? null : number, words };
}
export function writeRow(r) { return [r.id, r.kind, r.cue ? r.cue.replace(/ /g, '_') : '-', r.fp, r.start, r.end, r.number ?? '-', ...(r.words ?? [])].join(' '); }

/** A beat's words for matching: lower case letters and digits, the first 32. */
export const signature = (text) => String(text ?? '').toLowerCase().split(/[^a-z0-9']+/).filter(Boolean).slice(0, 32);

/** Dice similarity of two word lists (as multisets). */
function dice(a, b) {
  if (!a.length || !b.length) return 0;
  const m = new Map();
  for (const w of a) m.set(w, (m.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of b) { const n = m.get(w) ?? 0; if (n > 0) { common++; m.set(w, n - 1); } }
  return (2 * common) / (a.length + b.length);
}

/**
 * Give each beat an id (b.id), and b.fp, its content hash.
 * @param {any[]} beats @param {{ beats?: string[], used?: string[] } | null} previous the last build's script record
 */
export function assignIds(beats, previous) {
  for (const b of beats) b.fp = fnv(b.key);
  const old = (previous?.beats ?? []).map(readRow);
  const used = new Set([...old.map((r) => r.id), ...(previous?.used ?? [])]);
  const taken = new Set();
  const give = (b, id) => { b.id = id; taken.add(id); };

  // 1. exact matches, in order
  const pairs = lcs(old.map((r) => r.fp), beats.map((b) => b.fp));
  for (const [oi, ni] of pairs) give(beats[ni], old[oi].id);
  // 2. edited in place: between anchors, same kind (and speaker), paired by what they say, keeping order
  const anchors = [[-1, -1], ...pairs, [old.length, beats.length]];
  const same = (r, b) => r.kind === b.kind && (b.kind !== 'line' || r.cue === b.cue);
  for (let a = 0; a + 1 < anchors.length; a++) {
    const os = old.slice(anchors[a][0] + 1, anchors[a + 1][0]);
    const ns = beats.slice(anchors[a][1] + 1, anchors[a + 1][1]);
    if (!os.length || !ns.length) continue;
    const score = (r, b) => {
      if (!same(r, b)) return -1;
      if (os.filter((x) => same(x, b)).length === 1 && ns.filter((x) => same(r, x)).length === 1) return 1 + dice(r.words, b.sig); // the only pair of its kind here
      const d = dice(r.words, b.sig);
      return d >= 0.5 ? d : -1;
    };
    // the order-keeping pairing with the highest total score (a weighted longest common subsequence)
    const n = os.length, m = ns.length;
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      const s = score(os[i], ns[j]);
      dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], s >= 0 ? s + dp[i + 1][j + 1] : -Infinity);
    }
    for (let i = 0, j = 0; i < n && j < m;) {
      const s = score(os[i], ns[j]);
      if (s >= 0 && dp[i][j] === s + dp[i + 1][j + 1]) { give(ns[j], os[i].id); i++; j++; } else if (dp[i][j] === dp[i + 1][j]) i++; else j++;
    }
  }
  // 3. new beats
  const seen = new Map();
  for (const b of beats) {
    if (b.id) continue;
    const base = `${PREFIX[b.kind]}-${b.fp}`;
    let n = (seen.get(base) ?? 0) + 1, id = n === 1 ? base : `${base}-${n}`;
    while (taken.has(id) || used.has(id)) { n++; id = `${base}-${n}`; }
    seen.set(base, n);
    give(b, id);
  }
  return beats;
}

/** Longest common subsequence of two lists: index pairs [i, j], in order. */
function lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return out;
}
