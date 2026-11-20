// M4 W4 (AB-T-0576) in every runtime: the same script must give the same sequence, byte for byte. Two builds, run
// identically in Node, Chromium and WKWebView (scheme and loopback):
//   sample    the sample script (content/sample/scripts/cafe-order.fountain) built over the cafe;
//   rescript  a small script built, then edited by hand the way the timeline would (a gesture moved, a smile keyed
//             bigger, a look turned to camera, a track deleted), then re-scripted from an edited script (a line added
//             above, words changed) — the merge that keeps hand edits.
// Each runtime hashes the canonical .vrmxs text (@vrmxg/scene serialize).
import { buildSequence } from '@vrmxg/script';
import { serialize } from '@vrmxg/scene';

export const SMALL = `Title: Small
Set: cafe.vrmxs
Marks:
    HANA = behind-counter
    MIRA = counter-front

INT. CAFE - MORNING

Hana wipes the counter.

HANA
(smiling)
Good morning! [[greet]] What can I get you?

MIRA
A latte, please.

HANA
(nods)
Coming right up!
`;

/** @param {{ script: string, set: any, marks: any }} input @returns {{ sample: string, rescript: string }} canonical texts */
export function runScenario({ script, set, marks }) {
  const sample = buildSequence(script, { set, marks, id: 'cafe-order', source: 'scripts/cafe-order.fountain' });
  if (!sample.ok) throw new Error(JSON.stringify(sample.errors));
  const first = buildSequence(SMALL, { set, marks, id: 'small' });
  const doc = structuredClone(first.doc);
  const t = (id) => doc.sequence.tracks.find((x) => x.id === id);
  const greet = t('hana-1-act').clips.find((c) => c.slot === 'greet'); greet.start += 5; greet.end += 5;
  const happy = t('hana-1-face').keys.happy; happy[1] = [happy[1][0], 1, 'easeOut'];
  t('hana-1-eyes').clips.at(-1).at = 'camera';
  doc.sequence.tracks = doc.sequence.tracks.filter((x) => x.id !== 'mira-eyes');
  const edited = SMALL.replace('Hana wipes the counter.\n', 'Hana wipes the counter.\n\nMIRA\nExcuse me?\n').replace('A latte, please.', 'A latte, please. To go.');
  const again = buildSequence(edited, { set, marks, previous: doc });
  if (!again.ok) throw new Error(JSON.stringify(again.errors));
  return { sample: serialize(sample.doc), rescript: serialize(again.doc) };
}
