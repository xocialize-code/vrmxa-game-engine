# @vrmxg/cast

M4 W6 (AB-T-0578; M4 done-check 2). Casting for the anime creator. A script (`@vrmxg/script`, W4) gives a sequence its
roles. Each role is cast from a `.vrmxa`: the persona gives her voice and her allowed expressions, and the closet gives
what she wears. Recasting swaps the character, keeps the role's performance byte for byte, and lists her lines to
re-bake in the new voice. W7's bake fills that list through a hook. Each cast or recast is one undoable edit, and the
same inputs give the same sequence bytes. The package sits inside the determinism boundary
(`"determinism": "simulation"`). It reads `.vrmxa` files through vrmxa-core, which is injected as the character
library takes it (AB-D-0249), so casting itself is synchronous and plain data.

```js
import * as core from '@xocialize/vrmxa-core';
import * as voice from '@xocialize/vrmxa-core/voice';
import * as persona from '@xocialize/vrmxa-core/persona';
import * as closet from '@xocialize/vrmxa-core/closet';
import { readCharacter, rolesOf, applyCast, voicesFor } from '@vrmxg/cast';

const vrmxa = { ...core, ...voice, ...persona, ...closet };
const mira = await readCharacter(bytes, { ref: 'characters/mira.vrmxa', vrmxa }); // the shell's binary open gives the bytes
rolesOf(session.doc);                         // [{ id: 'hana-1', cue: 'HANA', lines, performance: ['hana-1-act', …] }, …]
const r = await applyCast(session, 'HANA', mira, {   // one undo step: "Recast HANA: Hana → Mira", re-bake and all
  presets: { 'hana-1': 'af_heart', mira: 'af_bella' },   // for characters whose persona names no Kokoro preset
  rebake: rebakeWith({ tts, write, read }),               // W7's hook (@vrmxg/voicing): speak each line, answer its bake fields
});
```

`castRole(doc, role, card, opts)` is the pure form: it returns `{ doc, ops, label, role, rebake, warnings }`, and the
editor runs the same `ops`, so the two agree byte for byte. `withBake(r, bakes)` folds a bake into it.

## Roles

A role is a character: the set's node that the script's cue maps to (the title page's `Cast: HANA = hana-1`, else the
set's Character by name). Its id is that node id, which the script keeps stable when re-scripting. A role can also be
named by its cue. The roles are the nodes the dialogue speaks for, the ones already cast, and `sequence.cast` entries
whose node is a `Character`. Given the set (`rolesOf(doc, { set })`), a node of another type is never a role:
cafe-morning casts its music player, and `castRole(doc, 'music', …)` is refused. `composeSequence` refuses a role cast
on a node that isn't a Character too.
- **Lines:** the dialogue clips the script made for the role (`src: "<beat>#say"`).
- **Performance:** every other track aimed at the role: gestures and talk, expressions, looks, moves.

## The casting

The casting goes in `sequence.roles`:

```json
"roles": { "hana-1": { "cue": "HANA", "asset": "cast-hana",
  "character": { "ref": "characters/studio/hana.vrmxa", "sha256": "dcd2…", "vrmxaId": "…", "name": "Hana" },
  "voice": { "engine": "kokoro-82m", "preset": "af_heart", "from": "persona", "id": "65de…", "name": "Hana (Kokoro)" },
  "expressions": ["happy", "sad", "relaxed", "surprised", "neutral"], "rest": "relaxed",
  "wardrobe": { "outfit": null, "worn": ["dfe9…", "19a7…"] } } }
```

It doesn't go in `sequence.cast`. The script generates `cast` entries (marks, behaviours), and a casting written there
would count as a hand edit, so re-scripting would stop moving her to her marks. A re-script carries `roles` over as it
is.

`asset` names a `vrmxa` asset:
- the set's own, when the set already uses that file (no new asset);
- else one the cast adds to the sequence (`cast-<file name>`, with the file's `sha256`).

`composeSequence` (`@vrmxg/sequence`, an additive change here) gives the role's node that asset. So the character is
swapped while every track, camera and connection aimed at the node id keeps working, and the set's file is untouched.
A recast removes an asset that the old casting added and nothing uses any more.

| Field | From |
|---|---|
| `voice` | In order: a preset picked by hand (`voice`, from `"pick"`); the persona's voice (`voice_id`, else the voices document's default) when it names `engines["kokoro-82m"].preset` (AB-A-0323; from `"persona"`); the role → preset map (`presets`, the sample's, from `"map"`); the first of `KOKORO_PRESETS` no other role has (from `"default"`). A persona voice the shell can't speak yet (a designed or cloned voice with no Kokoro preset) falls through, with a warning. A role cast again from the same file keeps the default voice it was handed, even once another role has taken it. Whatever the source, a voice another role of the sequence already speaks in (its casting's, else the map's) is warned about: two roles may share a voice, but never silently |
| `expressions` | The persona's `allowed_expressions` in VRMXA's order, with `neutral` always added; `null` without a persona (all allowed). The performance is kept as it is, so a face it wears that the persona doesn't allow is reported, not changed |
| `rest` | The persona's `rest_expression` |
| `wardrobe` | What her closet says she has on, or one of her outfits picked by id or name (`outfit`; one she lacks is an error). At play, `dressCast(tree, doc)` asks the closet service (`@vrmxg/closet` `applyOutfit`) to put it on. That service swaps the body on a fixed later step, so a replay lands the swap on the same step |

## Recasting keeps the performance and re-bakes the lines

A recast doesn't touch:
- any track aimed at the role;
- the dialogue's words and times;
- the other role and the rest of the film (shots, markers, `cast`, the script record).

The tests compare all of this byte for byte. The only thing a recast changes in the tracks is a line's **baked voice**,
the script's `BAKE_FIELDS` (`clip`, `timings`, `visemes`, `words`, `voice`, `audio`). It goes only when the voice
changes. The line is then listed in `rebake`, and it speaks from its text, live, until W7 bakes it. The script's merge
doesn't count a missing bake as a hand edit, so a re-script after a recast still updates those lines.

Only the clip's own record says which voice a line was baked in: its `voice` field. `applyBake` (`@vrmxg/voice`),
`regenerateLine` (`@vrmxg/editor-core`) and a bake folded into a cast all write it. A guess from the map or the old
casting could keep a line in the wrong voice, so neither is used.

| Case | What happens |
|---|---|
| Baked in the new voice already (`clip.voice`) | Kept, not listed |
| Baked in another voice | The bake goes; listed with `reason: "recast"` |
| Baked in a voice nobody recorded (no `clip.voice`: an older bake) | Kept, with a warning to re-bake it if it isn't the new voice; with `unknown: 'rebake'`, the bake goes and it is listed with `reason: "unknown"` |
| Never baked | Listed with `reason: "unbaked"` |

Each listed line has `bakePlan`'s `id`, `where`, `speaker` and `text` (the test checks that `bakePlan` finds the same
lines with `voicesFor`). It also has the new `voice` and `engine`, the line's script beat, and the clip to write,
`clipFor(dir, id, voice, text, engine)`: the line, the voice and a short FNV-1a of the TTS engine, voice and words
(`voice/cafe-order-hana-1-says-1-af-bella-12d0e8ff.wav`). A line's id is `lineId(doc, track, index)`, `<sequence>-<track>-<n>`, with a short hash of the track id when two track ids slug alike. Undo puts the old bake back, so a re-bake must never write
over a file undo can bring back. That rules out `bakePlan`'s `voice/<line>.wav`, which is the same in every voice:
**a cast role is baked from this list, not from `bakePlan`'s names.** `bakePlan` stays as it is for the sample's tool.
`linesToBake(doc, { role })` lists a role's unbaked lines, with the same names, at any time.

**W7's hook** (`rebakeWith` in `@vrmxg/voicing`, M4 W7): `await applyCast(session, role, card, { rebake })` calls `rebake(lines, { role, doc, label })` before the
cast lands. The hook writes each line's audio to `line.clip` (and its timings) and answers each line with its bake
fields (`{ clip, timings?, words?, visemes?, audio? }`, the script's `BAKE_FIELDS`), or `null` to leave it speaking live.
`withBake` puts those fields, and each clip's `voice`, into the cast's own edit. **One undo takes back the recast and its
re-bake together** (M4 done-check 2), as `regenerateLine` writes its file first and then makes one step. The hook may be
async. If it fails, nothing is cast. If the document changes while it runs, the cast is refused. The result's `baked`
counts the lines baked, and `rebake` lists those still to bake. With no hook, the cast lands with its lines listed.

## One undo step; the same bytes

`applyCast` runs the cast as one `session.run(label, ops)`. The ops are `addAsset` (or `setAsset`, below) and `setDoc
sequence`, then a `removeAsset` when an old asset goes. When a file the sequence already has changed since (a new
`sha256`, or none recorded, as `addFromAsset` leaves it), its entry is updated in place with `setAsset`, an op added to
`@vrmxg/scene`'s editor for this. Nodes that use the asset keep naming it, where removing and re-adding it would be
refused. One undo takes the whole cast or recast back, and the test checks the exact bytes
on undo and redo. Casting a role exactly as she is changes nothing and adds no step. Roles are written sorted by id.
`serialize` (`@vrmxg/scene`) sorts the keys inside the block, and the golden hash in `test/cast.test.mjs` pins the
output of a cast, a cast and a recast on the sample.

## Tests and the demo

`npm test` runs these:
- **cast:** the roles of the sample sequence; a cast from a picked card; reusing the set's asset; recasting, which
  keeps the performance byte for byte and lists the lines (and their files) against `bakePlan`; same-voice and
  hand-picked voices; recorded, wrong and unknown bake voices; the editor's one undo step for a cast and its re-bake,
  with exact bytes; the hook's failures; the same bytes twice and the golden hash; re-scripting after a cast; the
  voice order and shared voices; keeping a default voice; the asset updated in place under a node; only characters as
  roles; allowed expressions; wardrobe and `dressCast`; `readCharacter` on a stand-in vrmxa-core; errors. Cards here are
  plain data, so these run in CI.
- **read:** `readCharacter` on the sample's Mira and Hana, and the studio's when they are built. A recast world loads in
  `CharacterLibrary` with the new character's persona. These need vrmxa-core beside the repository, and skip (saying so)
  without it.

```
node engine/packages/cast/demo/cast-sample.mjs            # the sample's fixtures (Minimal "Hana", the fixture Mira)
node engine/packages/cast/demo/cast-sample.mjs --studio   # the studio's Hana and Mira (af_heart, af_bella from their personas)
```

The demo builds `scripts/cafe-order.fountain` and reads the characters. It casts HANA and MIRA, recasts HANA with Mira's
file, and prints each step's label, voice, warnings and the lines its stand-in hook baked (file names only, no audio). It then undoes the recast and checks the
bytes, and loads the composed world in the character library. It writes nothing in `content/`, and `--out` writes the
sequence where you say.

## Not here yet

- **The picker:** the creator's UI for picking a role's character, voice and outfit is W5's. MCP's recast tool is W11's.
- **Narrowing the script's tags per role:** `buildSequence`'s `vocab` is one list for the whole script, so a
  persona's allowed expressions are recorded and reported here rather than enforced in the build. A per-cue `vocab`
  would be an additive change to `@vrmxg/script`.
- **Cloned voices:** a ZONOS3 voice needs the shell's clone backend (AB-A-0324). Until then, a persona voice without a
  Kokoro preset takes the role's preset.
