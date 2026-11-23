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
const r = applyCast(session, 'HANA', mira, {  // one undo step: "Recast HANA: Hana → Mira"
  presets: { 'hana-1': 'af_heart', mira: 'af_bella' },   // for characters whose persona names no Kokoro preset
  rebake: (lines, { role }) => bakeLines(lines),         // W7's hook: the lines to bake in the new voice
});
bakePlan(session.doc, { voices: voicesFor(session.doc) }); // @vrmxg/voice finds the same lines
```

`castRole(doc, role, card, opts)` is the pure form: it returns `{ doc, ops, label, role, rebake, warnings }`, and the
editor runs the same `ops`, so the two agree byte for byte.

## Roles

A role is a speaking character: the set's node that the script's cue maps to (the title page's `Cast: HANA = hana-1`,
else the set's Character by name). Its id is that node id, which the script keeps stable when re-scripting. A role can
also be named by its cue.
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
| `voice` | In order: a preset picked by hand (`voice`, from `"pick"`); the persona's voice (`voice_id`, else the voices document's default) when it names `engines["kokoro-82m"].preset` (AB-A-0323; from `"persona"`); the role → preset map (`presets`, the sample's, from `"map"`); the first of `KOKORO_PRESETS` no other role has (from `"default"`). A persona voice the shell can't speak yet (a designed or cloned voice with no Kokoro preset) falls through, with a warning |
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

| Case | What happens |
|---|---|
| Baked in the new voice already (`clip.voice`, else the old casting's voice, else `presets`) | Kept, not listed |
| Baked in another voice | The bake goes; listed with `reason: "recast"` |
| Baked before any casting, in a voice nobody recorded | Kept, with a warning to re-bake it if it isn't the new voice |
| Never baked | Listed with `reason: "unbaked"` |

Each listed line has `bakePlan`'s `id`, `where`, `speaker` and `text` (the test checks that `bakePlan` finds the same
lines with `voicesFor`). It also has the new `voice` and `engine`, the line's script beat, and a clip path named by
voice (`voice/cafe-order-hana-1-says-1-af-bella.wav`). Undo puts the old bake back, so a re-bake must write a new file
rather than over the old one. `linesToBake(doc, { role })` lists a role's unbaked lines at any time.

**W7's hook:** `applyCast(session, role, card, { rebake })` calls `rebake(lines, { role, doc, label })` after the cast
lands. It runs outside the cast's undo step, so the bake it starts is an undo step of its own ("regenerating every line
of one character is one undo step"). With no hook, the list is only returned.

## One undo step; the same bytes

`applyCast` runs the cast as one `session.run(label, ops)`. The ops are `addAsset` and `setDoc sequence`, then a
`removeAsset` when an old asset goes. One undo takes the whole cast or recast back, and the test checks the exact bytes
on undo and redo. Casting a role exactly as she is changes nothing and adds no step. Roles are written sorted by id.
`serialize` (`@vrmxg/scene`) sorts the keys inside the block, and the golden hash in `test/cast.test.mjs` pins the
output of a cast, a cast and a recast on the sample.

## Tests and the demo

`npm test` runs these:
- **cast:** the roles of the sample sequence; a cast from a picked card; reusing the set's asset; recasting, which
  keeps the performance byte for byte and lists the lines matching `bakePlan`; same-voice and hand-picked voices; a
  pre-cast bake; the editor's one undo step with exact bytes and the hook; the same bytes twice and the golden hash;
  re-scripting after a cast; the voice order; allowed expressions; wardrobe and `dressCast`; errors. Cards here are
  plain data, so these run in CI.
- **read:** `readCharacter` on the sample's Mira and Hana, and the studio's when they are built. A recast world loads in
  `CharacterLibrary` with the new character's persona. These need vrmxa-core beside the repository, and skip (saying so)
  without it.

```
node engine/packages/cast/demo/cast-sample.mjs            # the sample's fixtures (Minimal "Hana", the fixture Mira)
node engine/packages/cast/demo/cast-sample.mjs --studio   # the studio's Hana and Mira (af_heart, af_bella from their personas)
```

The demo builds `scripts/cafe-order.fountain` and reads the characters. It casts HANA and MIRA, recasts HANA with Mira's
file, and prints each step's label, voice, warnings and lines to re-bake. It then undoes the recast and checks the
bytes, and loads the composed world in the character library. It writes nothing in `content/`, and `--out` writes the
sequence where you say.

## Not here yet

- **The picker:** the creator's UI for picking a role's character, voice and outfit is W5's. MCP's recast tool is W11's.
- **Narrowing the script's tags per role:** `buildSequence`'s `vocab` is one list for the whole script, so a
  persona's allowed expressions are recorded and reported here rather than enforced in the build. A per-cue `vocab`
  would be an additive change to `@vrmxg/script`.
- **Cloned voices:** a ZONOS3 voice needs the shell's clone backend (AB-A-0324). Until then, a persona voice without a
  Kokoro preset takes the role's preset.
