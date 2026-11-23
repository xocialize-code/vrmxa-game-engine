# @vrmxg/voicing

M4 W7 (AB-T-0579; M4 done-check 3). M2's line bake, made into the creator's voicing layer. Each line is voiced in its
role's voice: the cast's (`sequence.roles`, from `@vrmxg/cast`), else a role → voice map. Its audio, words, visemes and
length go into the dialogue track. Regenerating one line, or every line of one character, is one undo step.

This package is authoring only. The runtime that plays the bake is `@vrmxg/voice`, which doesn't import this package.
The dependencies run one way: `@vrmxg/voicing` uses `@vrmxg/voice`, `@vrmxg/cast` and `@vrmxg/script`.

```js
import { shellTTS, httpTTS } from '@vrmxg/voice';
import { voiceLines, rebakeWith, fitLines, addSound } from '@vrmxg/voicing';
const tts = inShell ? shellTTS({ call }) : httpTTS('http://127.0.0.1:5190/speak');   // Kokoro through the shell, or the loopback stand-in
const io = { tts, write: (ref, bytes) => project.create(ref, bytes), read: (ref) => project.bytes(ref), remove: (ref) => project.remove(ref) };
await voiceLines(session, {}, { ...io, presets });                                  // every line still to voice: one step
await voiceLines(session, { line: 'cafe-order-mira-says-2' }, { ...io, voice: 'af_sky' }); // one line in another voice: one step
await voiceLines(session, { role: 'HANA' }, io);                                    // one character's lines: one step (none if nothing changes)
await voiceLines(session, { line: 'cafe-order-mira-says-2' }, { ...io, newTake: true }); // a new take, under its own name: one step
await applyCast(session, 'HANA', card, { rebake: rebakeWith(io) });                 // a recast and its re-bake: one step
fitLines(session, { rescript: (d) => buildSequence(text, { previous: d, set, marks }).doc }); // lines that outlast their clips: one step
addSound(session, { ref: 'sounds/music.wav', start: 0, end: 720 });                 // music on its bus: one step
```

## The pieces

| Piece | What |
|---|---|
| `voicingPlan(doc, select, o)` | The lines to voice. `select` is one of: `{ line }` (by id, or `{ track, index }`); `{ role }` (node id or cue); `{ all: true }`; or, by default, the lines not yet baked in their role's voice. A line baked in a voice nobody recorded (an older bake) is left alone, as `@vrmxg/cast` leaves it. A role with no voice is an error unless `fallback` names one; those lines are marked `fallback`. Ids come from `@vrmxg/cast`'s `lineId` (`<sequence>-<track>-<n>`, with a short hash of the track id when two track ids slug alike). Clip names come from `clipFor`, by line, engine, voice and words: `voice/cafe-order-hana-1-says-1-af-heart-b522e02b.wav` |
| `bakeLines(lines, { tts, write, read, remove })` | Speaks each line and writes `<clip>.wav` and `<clip>.timings.json`. It answers each line's bake fields (`@vrmxg/script`'s `BAKE_FIELDS`): `clip`, `timings`, `voice`, `words` (offset applied), `visemes` (`[viseme, t0, t1, t2, level]`) and `audio` (`{ duration, sampleRate }`) |
| `applyVoicing(doc, lines, bakes)` | The pure edit: one `setDoc sequence`. A clip's old bake goes first |
| `voiceLines(session, select, o)` | The editor op that W5 (the creator) and W11 (MCP) call: plan, speak, then one `session.run`. If the document comes out the same, it answers `changed: false` and adds no step. `{ line, text }` gives the line new words in the same step. `warnings` lists lines voiced in the fallback voice, and lines whose speech runs into another line |
| `rebakeWith(io)` | `applyCast`'s re-bake hook (M4 W6): the recast role's lines spoken in the new voice, inside the cast's own step. It needs `read` |
| `speechEnd(clip, fps)`, `speechOverlaps(doc)` | Where a line's speech ends: its start plus its last word's end, not counting the WAV's trailing silence. Also which lines talk over a later one, by how many frames |
| `fitToSpeech(doc, { rescript })`, `fitLines(session, o)` | Lengthens each baked line whose speech outlasts its clip, as a deliberate hand edit of its length. The script's layout takes a hand-retimed line's length as its beat's (`handLengths`), so the re-script, run in the same edit, moves every beat after it: one undo step. Later re-scripts keep the length too (the merge records the line as `-L`) |
| `placeSound`, `addSound`, `soundProblems`, `busFor` | Music, sound effects and ambience go on an audio track per bus (`music`, `sfx`, `ambience`, each with its `bus`). Never onto a muted track, which wouldn't be heard. A sound that ends past the sequence is refused unless `extend: true`. Lines are heard on the voice bus through the dialogue track, so an audio clip on `voice` is refused, and `soundProblems` lists one already there |

## Files are never written over

Undo puts the old bake back, so every file an undo or redo step points at must stay as it was.
- **A name is a take.** A clip's name is its line, engine, voice and words, so the file under a name is that line's
  take. A voicing that finds it bakes from its files: no TTS call, nothing written. This matters because **Kokoro's
  audio differs a little from run to run while its words and lengths don't** (AB-L-0375). Regenerating a line in the
  voice and words it already has therefore changes nothing and adds no undo step.
- **A new take on purpose:** `newTake: true` asks the TTS again and keeps the answer under a name of its own, `<clip>-take2.wav` (the first number free). That is one undo step, and undo goes back to the take before.
- **Exclusive creates.** `write(ref, bytes, { exclusive: true })` must refuse a name that exists. `read` is required.
  Two voicings of one clip in the same page take turns, so the second finds the first's take. A voicing that finds a
  new take under its name after speaking (from another process) keeps that take and drops its own.
- **Cleaning up.** A voicing that fails, or is refused because the document changed while it spoke (the whole document
  is compared, not only the sequence), removes the files it created, given `remove`. It never removes a take that was
  there before.

## What plays is the track

A bake never moves a clip's start or end, because the script's merge would take that as a hand edit. Fitting is the
separate, deliberate edit for that. Subtitles (`@vrmxg/sequence` `subtitles`) run to a baked line's last word when that
outlasts the clip.

`content/sample/tools/bake-lines.mjs` runs this layer from the command line:
- it has `--line`, `--role`, `--all`, `--voice`, `--new-take`, `--fallback`, and `--fit --marks` (which re-scripts from
  `sequence.script.source`);
- it starts `tools/tts-server.py` only when a line needs speaking, and takes the GPU lock while it does;
- it still bakes a scene's text-only `say` connections, as M2's tool did.

The sample's script sequence (`sequences/cafe-order.vrmxs`) was voiced with
`bake-lines.mjs sequences/cafe-order.vrmxs --fit --marks scripts/cafe-marks.json`: Hana in `af_heart`, Mira in
`af_bella`, 7 lines, each line's clip covering its speech, and nobody talking over anybody.

## Tests

`test/voicing.test.mjs` uses a stand-in TTS, so the tests run offline. They cover:
- the plan, the fallback voice, and unique ids;
- the bake's files and fields, the offsets, and reused takes;
- names that hold other words;
- in the editor: one line, one character and every line, each one undo step with exact bytes and no file written over;
- no step when nothing changes, and new takes;
- the editor op against the pure path;
- new words;
- a failing TTS and an edit made while it speaks, both of which leave no files behind;
- two voicings racing;
- a recast with `rebakeWith`;
- a re-script keeping the bake;
- overlaps, and fitting with a re-script;
- the voice service playing the track, and subtitles;
- sounds on their buses.

M4 check 3 (`acceptance/m4/voicing.mjs`, `voicing-wkwebview.sh`): the voiced sample plays from its track with the same
hashes in Node, Chromium and WKWebView (scheme and loopback), and a snapshot taken mid-line restores to the same end.
