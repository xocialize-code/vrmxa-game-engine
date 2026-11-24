# @vrmxg/script

M4 W4 (AB-T-0576; decision AB-D-0275). Scripts for the anime creator. A Fountain subset is read by our own parser, with
a stable id for every element and errors that point at script lines. The script is built into a sequence over a set:
numbered shots, the cast on marks, a dialogue track per speaker, the speaker's look-at, a default performance, and
default cameras behind a hook for W8. Re-scripting keeps hand edits. The output is deterministic: the same script gives
the same `.vrmxs` bytes in Node, Chromium and WKWebView (`acceptance/m4/`). The package has no runtime dependencies and
sits inside the determinism boundary (`"determinism": "simulation"`).

```js
import { buildSequence, applyScript, formatErrors } from '@vrmxg/script';

const r = buildSequence(text, { set, marks, id: 'cafe-order', source: 'scripts/cafe-order.fountain' });
if (!r.ok) console.error(formatErrors(r.errors, 'cafe-order.fountain'));   // "cafe-order.fountain:17: [[hapy]]: unknown tag …"
else fs.writeFileSync('sequences/cafe-order.vrmxs', serialize(r.doc));       // @vrmxg/scene's canonical text

const again = buildSequence(edited, { set, marks, previous: r.doc });         // re-script: hand edits kept
applyScript(session, edited, { marks });                                      // in the editor: one undo step, "Re-script (1 changed)"
```

## The Fountain subset

| Element | Written as | Notes |
|---|---|---|
| Title page | `Key: value` lines at the top, indented continuation lines | Starts only on a known key (Fountain's Title, Credit, Author, Source, Draft date, Contact … or ours), so a script opening `FADE IN:` keeps that line. Our keys: `Set` (the set's file), `Cast` (`HANA = hana-1`), `Marks` (`HANA = behind-counter`), `fps`. Others are kept |
| Scene heading | `INT.` / `EXT.` / `EST.` / `INT./EXT.` / `I/E`, or forced with `.`; `#10#` scene number | A duplicate scene number is an error |
| Action | Any other paragraph; forced with `!`; `>centred<` | |
| Character cue | All capitals, then dialogue on the next line; forced with `@`; `(V.O.)`, `(O.S.)`; `^` for dual dialogue | `(CONT'D)` is ignored. A `^` line must come straight after the line it overlaps |
| Parenthetical | `(…)` inside a dialogue block | Read for performance (below) |
| Dialogue | The lines under a cue, until a blank line | A line of exactly two spaces keeps the block going |
| Transition | `… TO:` or `FADE OUT.` alone between blank lines, or forced with `>` | |
| Notes | `[[…]]` on one line | Tags when they read as one (below); otherwise a writer's note, ignored |
| Boneyard, sections, synopses, page breaks | `/* … */`, `#`, `=`, `===` | Read and ignored; a line the boneyard takes whole is gone, not blank, so it doesn't end a dialogue block |
| Not in the subset | Lyrics (`~`), notes over several lines, an unclosed boneyard | Errors at their lines |

**Tags** are notes that read as one. Typing `[[nod]]` gives a gesture (VRMXA slots: greet, nod, shrug, point, laugh,
cheer, sip, use, sit, stand), and `[[happy]]` an expression (happy, angry, sad, relaxed, surprised, neutral). Three
tags take a value: `[[look: MIRA]]` (a cast name, `camera` or a mark), `[[at: counter]]` (a mark) and `[[hold: 3]]` (an
action's seconds). In dialogue, a tag acts at its word, for the speaker. In action, it names who first
(`[[HANA happy]]`) and acts from the start of the sentence it follows. An unknown one-word tag is an error, because it
is far more likely a typo than a note. `vocab` narrows the lists, as casting (W6) will to a persona's allowed
expressions.

**Parentheticals** are read word by word:
- *smiling*, *grins* and *warmly* raise an expression;
- *nods*, *shrugs*, *waves* and *laughs* play a gesture;
- *beat* (0.5 s) and *pause* (1 s) add silence;
- *to Mira* points the speaker's look.

The full list is `PAREN_WORDS` in `src/vocab.js`. Its tables have no prototype, so a word such as `constructor` looks up nothing.

## Stable ids

The script is read into **beats**: a scene heading, an action paragraph, a line (a cue with its parentheticals and
dialogue) or a transition. Every element gets an id. A beat's id is its kind and a hash of what it says
(`ln-cd2c6011`), with a count for the same words again (`-2`). An element inside a line takes the line's id
(`ln-cd2c6011.2`). Edits elsewhere never change an id.

When re-scripting, beats are matched to the last build's beat table (`sequence.script.beats`):
- exact matches first, as a longest common subsequence;
- then, between matches, unmatched old and new beats of the same kind and speaker, paired by their words: the
  order-keeping pairing with the most words in common. A pair needs half its words shared (Dice ≥ 0.5), unless it is
  the only old and the only new beat of its kind in that gap. So a line whose words were edited keeps its id, and with
  it its hand edits and its shot number, even when a line beside it by the same speaker is cut. The beat table keeps
  each beat's first 32 words for this.

A changed speaker makes a new beat. A new beat never reuses an id that a hand edit still refers to.

## The build

| What | How |
|---|---|
| Timing | Integer frames (24 fps by default, or the title page's `fps`). A scene heading is a 2 s establishing shot. Action is read at 0.3 s a word (1.5 to 8 s), or `[[hold]]`. A line takes M3's estimate (0.4 s + 0.32 s a word, 1 to 12 s), plus pauses, then 0.25 s. Dual dialogue starts with the line before it. A line whose dialogue clip was edited by hand takes that clip's length, and everything after it moves |
| Shots | One per beat: a heading, an action paragraph or a line (a dual line shares the shot before it). Shots tile the film. Numbers 010, 020 … are kept once given; a new shot goes between (025) or takes letters in reading order (030A, 030B, 030AA between 030A and 030B). Between 030 and 030A nothing fits: the new shot is numbered out of order (030B) with a warning. `renumber: true` starts again |
| Cast | Each speaking character is cast (`sequence.cast`) on her first mark (the title page's `Marks`, else her first `[[at]]`), with no behaviours, so she stands for the camera (`behaviours: true` keeps the set's). A mark is a Marker node in the sequence or the set (`name` or `mark-name`), or one the build places from `marks` |
| Moves | A later `[[NAME at: mark]]` is a cut: a `transform` track with step keys. In-world effect not yet checked: it writes the character's object transform, as M2's transform tracks do. W9/W12 will show whether a controller-driven character takes it |
| Dialogue | A `dialogue` track per speaker (`hana-1-says`), a clip per line with its text, ready for W7's bake (`@vrmxg/voice` `bakePlan`) |
| Look-at | A `lookAt` track per character (`hana-1-eyes`). The speaker looks at the one she speaks to: `[[look]]`, then `(to …)`, then the speaker before, then the speaker after. The others look at the speaker. A voice-over line has no looks |
| Performance | An `animation` track per character on twos (`hana-1-act`): talk under every line (not off screen, not voice-over), and gestures from tags and parentheticals blending in over it (talk blends back after). An `expression` track (`hana-1-face`): a rise over 8 frames to 0.7, a hold to the end of the beat and a fall over 16 frames; overlapping runs of one expression join |
| Cameras | `coverage(ctx) → { nodes, cuts }` is the hook W8 fills: `@vrmxg/coverage`'s `coverByRule()` gives cameras by rule (its README). Since W8 the hook's `ctx` also carries `markTf` (mark id → transform, for moves), `parsed` (the parsed script) and `numbers` (beat id → shot number), beside `plan`, `shots`, `cast` and `marks`. A cut may also carry `splits: [{ frame, camera }]` to cut to another camera inside its shot (coverage by rule cuts where a move lands, since moves are step keys): each piece is a clip of its own, src `<beat>#cam:2` and on. `defaultCoverage` uses a wide (`vc-wide`, group framing, placed off the line between the first two marks) for headings, action, overlaps and voice-over, and a close-up per speaker (`vc-hana-1`, M2's closeUp rig) for lines. A CameraBrain (`brain`) drives the set's Camera. `DISSOLVE TO:` blends into the next shot's camera over 12 frames; other transitions cut (fades wait for W8/post) |
| Markers | One per scene heading |
| Nodes | The build's nodes (brain, cameras, marks it places) follow the item rules, recorded in `script.nodes`: added when missing; replaced by the new build's while untouched (a mark changed on the title page moves its Marker and the wide camera); the person's once edited (a moved camera stays where they put it); removed when no longer placed, if untouched and nothing in the sequence names them (a character whose lines are all cut loses her close-up) |

## Re-scripting keeps hand edits

The sequence carries a record of its last build in `sequence.script`:
- the beat table: id, kind, speaker, content hash, frames and shot number;
- a record of everything it generated, by `<collection>|<src>`: a fingerprint and the times it gave the item (`-` for
  the fingerprint once the item is the person's);
- the hand groups, deletions and dropped tracks.

Generated clips, shots, markers and cast entries carry `src: "<beat>#<role>"` (`ln-cd2c6011#g:greet`). On a re-script:

1. **Untouched means the script's.** A generated item that still matches its fingerprint is replaced by the new build's
   item for the same `src`, or dropped when its beat was cut.
2. **Edited means the person's.** A generated item that no longer matches is kept and marked `"hand": true`, and its
   `src` is never generated again. That covers moving, trimming, retargeting a look and changing a camera. If the
   person changed *what* it is but left its times as the script last set them (a look turned to the camera, a shot's
   camera swapped, overrides added to a shot), it still takes the script's new times. Once they retime it, its times
   are theirs too.
3. **Deleted stays deleted.** A generated item that is gone is remembered (`script.removed`) and not generated again. So
   is a generated track (`script.dropped`).
4. **Keys are marked by group.** A key in an array can't carry a mark, so keyed channels (expressions, moves) work by
   group. A group of keys a beat generated that isn't all still there as generated is the person's from then on, and
   `script.hand` lists it. Every key not generated is kept. The record of what the script generated stays with a hand
   group (`script.gen`, re-made as its keys move), so the script can still tell its own keys from yours (rule 8).
5. **Your own items are left alone.** Items a person made (no `src`) are kept as they are and not marked.
6. **Kept items move with the script.** A kept item made by a beat (and retimed by hand) shifts as that beat shifts. Any other item (a hand
   key, your own track, marker or shot) shifts with the beat it fell in, or after the last beat before it. So an event
   you keyed on a line stays on that line when lines are added above it.
7. **The words are the script's.** A hand-edited dialogue clip keeps its timing but takes its words from the script, and
   a warning says so. Its length becomes the line's length. A baked voice (`clip`, `timings` …) isn't a hand edit: it
   stays while the words are unchanged and goes when they change, so the bake picks the line up again.
8. **A cut beat takes its hand edits with it.** When a beat leaves the script, its hand-edited items go too: dialogue,
   looks, gestures, shots, cameras, and the keys it generated, whether they are still as generated or you changed them
   in place (the frame the script keyed, another value: a bigger smile, a nudged move). Its words are gone from the
   script, so its edits have no line to belong to. A warning names the beat and how many items went. Items a person
   made themselves (no `src`) are never dropped this way; they move to the beat before. That holds for keys too
   (AB-T-0588): a key at a frame the script never keyed is one you added, or one of the script's that you dragged to
   another frame, and it is kept however near the cut line it sits. A generated key is told from yours by its frame,
   not by a span around the line, so no margin in frames is involved.
9. **Overlaps give way.** Generated shots and camera clips give way to kept ones, since shots don't overlap.
10. **Duration.** A hand-set duration is kept, with a warning when the script runs longer or shorter.

`release: [beatId]` gives a beat back to the script. A beat's id is in the `src` of everything it made
(`ln-cd2c6011#say`), and `parsed.beats` from a build maps script lines to ids. Its hand-edited items, deletions and hand keys go, and it is
generated afresh. In the editor, `applyScript(session, text)` makes the new sequence block and any missing nodes one
undo step. A script with errors changes nothing, and neither does a build that gives the same document (compared canonically, so a sequence read back from its file, with its keys in the file's order, counts as the same).

## Tests and checks

`npm test` runs these:
- **parse:** element types, the subset's forms, ids across edits, and errors with line numbers;
- **build:** the sample's shots, cast, marks, dialogue, looks, performance and cameras. Its sequence is valid in the
  cafe (`checkSequence`, `composeSequence`, the scene schema), the same bytes twice and against
  `content/sample/sequences/cafe-order.vrmxs`, and the golden hash. Also the coverage hook, vocabularies, V.O., O.S.,
  dual dialogue and moves;
- **rescript:** fifteen hand-edit cases (among them a reworded line beside a cut one, a cut line's hand edits, the keys a person added near a cut line or a cut move, and the build's nodes), including the editor's one undo step with exact bytes on undo and redo.

`acceptance/m4/script-chromium.mjs` and `script-wkwebview.sh` hash the sample and a re-script after hand edits in Node,
Chromium and WKWebView (scheme and loopback). All four agree (`acceptance/results/m4-script*.json`).

The sample sequence is rebuilt with `node content/sample/tools/make-script-sequence.mjs`. Add `--check` to only compare.
