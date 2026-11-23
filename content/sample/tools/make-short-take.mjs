// "The Regular"'s performance take (M4 W12): a take keyed by hand, on top of what the script generates. W9's take
// tooling (puppet, director and face takes) isn't built yet, so this is the hand-keyed kind: gesture clips in each
// character's animation track and expression keys in her face track, each placed against a line or an action of the
// script (never at a fixed frame), so the take follows the film when it is re-scripted.
//
// A take's items carry no `src`: the script treats them as the person's own (engine/packages/script/README.md, rules 5
// and 6: kept as they are, moving with the beat they fall in). Clips are marked `take: "hand-1"`; keys can't carry a
// mark, so this tool only adds keys that aren't there. Re-running it changes nothing; `--remove` takes it out again.
//   node content/sample/tools/make-short-take.mjs [sequences/the-regular.vrmxs] [--remove] [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from '@vrmxg/scene';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const ref = argv.find((a) => !a.startsWith('--')) ?? 'sequences/the-regular.vrmxs';
export const TAKE = 'hand-1';

/**
 * The take, as places in the film: `line` is a speaker's dialogue track and the start of her words, `action` the n-th
 * action paragraph's shot (0-based). `from` and `to` are frames from that place's start (negative `to`: from its end).
 */
export const TAKE_ITEMS = [
  // Hana wipes the counter as the film opens, and again as it closes (the script's first and last action)
  { kind: 'clip', track: 'hana-1-act', slot: 'use', at: { action: 0 }, from: 12, to: -10, blendIn: 10, blendOut: 10 },
  { kind: 'clip', track: 'hana-1-act', slot: 'use', at: { action: 3 }, from: 30, to: -18, blendIn: 10, blendOut: 12 },
  // she tilts her head, listening, as Mira says she has news; and looks round the room as Mira says it's across town
  { kind: 'clip', track: 'hana-1-act', slot: 'x-headTilt', at: { line: ['mira-says', 'I have news'] }, from: 6, to: 44, blendIn: 8, blendOut: 8 },
  { kind: 'clip', track: 'hana-1-act', slot: 'x-lookAround', at: { line: ['mira-says', 'I start on Monday'] }, from: 30, to: -2, blendIn: 8, blendOut: 8 },
  // Mira shrugs at being read so easily, and looks out at the rain from the window table
  { kind: 'clip', track: 'mira-act', slot: 'shrug', at: { line: ['mira-says', 'Am I that easy'] }, from: 20, to: 46, blendIn: 4, blendOut: 6 },
  { kind: 'clip', track: 'mira-act', slot: 'x-lookAround', at: { action: 2 }, from: 4, to: 60, blendIn: 8, blendOut: 10 },
  // Mira beams as she gives her news; Hana softens as Mira promises to come back
  { kind: 'face', track: 'mira-face', name: 'happy', at: { line: ['mira-says', 'I have news'] }, keys: [[34, 0], [42, 0.6, 'easeOut'], [70, 0.6], [86, 0, 'easeIn']] },
  { kind: 'face', track: 'hana-1-face', name: 'relaxed', at: { line: ['mira-says', 'Are you kidding'] }, keys: [[30, 0], [40, 0.5, 'easeOut'], [70, 0.5], [86, 0, 'easeIn']] },
];

/** Where an item's place starts and ends in this build: { start, end } in frames. */
function placeOf(seq, at) {
  if (at.line) {
    const [trackId, words] = at.line;
    const c = seq.tracks.find((t) => t.id === trackId)?.clips.find((x) => x.text.startsWith(words));
    if (!c) throw new Error(`no line "${words}" in ${trackId}`);
    return { start: c.start, end: c.end };
  }
  const shots = seq.shots.filter((s) => String(s.src ?? '').startsWith('ac-'));
  const s = shots[at.action];
  if (!s) throw new Error(`no action ${at.action} (the script has ${shots.length})`);
  return { start: s.start, end: s.end };
}

/** The sequence with the take in it (or, `remove`, without its clips and keys). Pure. */
export function withTake(doc, { remove = false } = {}) {
  const out = structuredClone(doc), seq = out.sequence;
  for (const t of seq.tracks) if (t.clips) t.clips = t.clips.filter((c) => c.take !== TAKE);
  for (const item of TAKE_ITEMS) {
    const t = seq.tracks.find((x) => x.id === item.track);
    if (!t) throw new Error(`no track ${item.track}`);
    const p = placeOf(seq, item.at);
    if (item.kind === 'clip') {
      if (remove) continue;
      const clip = { blendIn: item.blendIn, blendOut: item.blendOut, end: item.to < 0 ? p.end + item.to : p.start + item.to, slot: item.slot, start: p.start + item.from, take: TAKE };
      t.clips.push(clip);
      t.clips.sort((a, b) => a.start - b.start); // stable: clips starting together keep their order (it sets the blend)
    } else {
      const want = item.keys.map(([f, v, e]) => (e ? [p.start + f, v, e] : [p.start + f, v]));
      const has = (t.keys ??= {})[item.name] ?? [];
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const kept = has.filter((k) => !want.some((w) => same(w, k)));
      t.keys[item.name] = remove ? kept : [...kept, ...want].sort((a, b) => a[0] - b[0]);
      if (!t.keys[item.name].length) delete t.keys[item.name];
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = path.join(root, ref), before = fs.readFileSync(file, 'utf8');
  const bytes = serialize(withTake(parse(before), { remove: argv.includes('--remove') }));
  if (argv.includes('--check')) { console.log(bytes === before ? `${ref}: the take is in` : `${ref}: the take isn't in, or differs`); process.exit(bytes === before ? 0 : 1); }
  if (bytes !== before) fs.writeFileSync(file, bytes);
  console.log(`${ref}: ${argv.includes('--remove') ? 'take removed' : `take ${TAKE} in (${TAKE_ITEMS.length} items)`}${bytes === before ? ', unchanged' : ''}`);
}
