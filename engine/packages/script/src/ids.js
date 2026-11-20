// Stable ids for script beats. What a sequence keeps of a script hangs off these ids: the shots and clips a beat made,
// the hand edits made to them, and the shot numbers. So an id must survive edits elsewhere in the script, and an edit
// to the beat itself.
//
//   - With no history, a beat's id is its kind and a hash of what it says ("ln-3fa2c1d0"), and a count when the same
//     beat appears again ("-2"). Edits elsewhere don't change it.
//   - With the beat table of the last build (sequence.script.beats), beats are matched to it: first the beats that say
//     exactly what they said (a longest common subsequence, so moved blocks stay matched in order), then, between two
//     matched beats, the unmatched old and new beats of the same kind (and, for a line, the same speaker) in order. A
//     matched beat takes its old id: a line whose words were edited keeps its id, and with it its hand edits.
//   - What is left is new and gets a fresh id that no beat in the table, and no hand edit, has used.
import { fnv } from './hash.js';

const PREFIX = { scene: 'sc', action: 'ac', line: 'ln', transition: 'tr' };

/** A beat table row: "id kind cue fp start end number" (cue and number "-" when none; spaces in a cue as "_"). */
export function readRow(s) {
  const [id, kind, cue, fp, start, end, number] = s.split(' ');
  return { id, kind, cue: cue === '-' ? null : cue.replace(/_/g, ' '), fp, start: Number(start), end: Number(end), number: number === '-' ? null : number };
}
export function writeRow(r) { return [r.id, r.kind, r.cue ? r.cue.replace(/ /g, '_') : '-', r.fp, r.start, r.end, r.number ?? '-'].join(' '); }

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
  // 2. edited in place: between anchors, same kind (and speaker), in order
  const anchors = [[-1, -1], ...pairs, [old.length, beats.length]];
  for (let a = 0; a + 1 < anchors.length; a++) {
    const os = old.slice(anchors[a][0] + 1, anchors[a + 1][0]);
    const ns = beats.slice(anchors[a][1] + 1, anchors[a + 1][1]);
    const free = [...os];
    for (const b of ns) {
      const k = free.findIndex((r) => r.kind === b.kind && (b.kind !== 'line' || r.cue === b.cue));
      if (k < 0) continue;
      give(b, free[k].id);
      free.splice(0, k + 1); // keep the order: nothing before the match can pair later
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
