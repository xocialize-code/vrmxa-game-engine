# @vrmxg/coverage

M4 W8 (AB-T-0580). Coverage cameras for the anime creator. Every shot of a script's build gets a camera by rule,
worked out from the script and the marks. Each camera is a VirtualCamera on one of M2's rig presets. The package also
gives the 180° rule as a lint, replacing a shot's camera as one undoable edit, and the storyboard strip's data with a
thumbnail per shot rendered from snapshots. It sits inside the determinism boundary (`"determinism": "simulation"`):
the same script and marks give the same cameras, byte for byte, under native or portable maths.

```js
import { buildSequence, applyScript } from '@vrmxg/script';
import { coverByRule, lintLine, replaceShotCamera, cameraOnRig, storyboard } from '@vrmxg/coverage';
import { renderThumbnails } from '@vrmxg/coverage/thumbnails';

const r = buildSequence(text, { set, marks, coverage: coverByRule() });     // the script's coverage hook
lintLine(r.doc, { set }).issues;                                              // [] : nothing crosses the line
replaceShotCamera(session, '030', 'vc-two');                                  // one undo step: "Shot 030: camera vc-two"
replaceShotCamera(session, '040', cameraOnRig({ id: 'vc-mira-low', rig: 'closeUp', target: 'mira', p: [-0.3, 0.9, -3.9], props: { body: { type: 'fixed' } } }));
const board = storyboard(r.doc, { set });                                     // a frame, camera, rig and people per shot
const { thumbs } = await renderThumbnails({ tree, host, board, width: 480, height: 270 });   // a render host: browser only
```

**Why a package of its own.** `@vrmxg/script` has no runtime dependencies. Coverage needs M2's rig presets
(`@vrmxg/camera/rigs`, a new subpath export that doesn't pull in three.js). Its thumbnails also need `@vrmxg/sequence`'s
player and `@vrmxg/export`'s still capture. Coverage plugs into the script through the hook W4 left for it
(`coverage(ctx) → { nodes, cuts }`), so the script package stays small, and the spokesmodel app can reuse the script
without the cameras. The script's own `defaultCoverage` is unchanged, and so is the committed `cafe-order.vrmxs`. The
creator (W5) and the MCP tools (W11) pass `coverage: coverByRule()`.

## The rules

The first rule that applies picks the shot's camera:

| # | Rule | When | Camera |
|---|---|---|---|
| 1 | establishing | a scene heading's shot | `vc-est` (then `vc-est-2` …): a wide of everyone on their marks, on `twoShot` with `aim.size` 0.4, further back and higher (2.2 m) than the two-shot |
| 2 | two-shot | overlapping lines (dual dialogue, `^`) | `vc-two-<a>-<b>`: the speakers together, on `twoShot` |
| 3 | close-up | a beat: a `(beat)` or `(pause)` in the line, or an expression the line or an action gives someone (`(smiling)`, `(warmly)`, `[[happy]]`, `[[HANA happy]]`) | `vc-cu-<id>`: a clean single on `closeUp` with a fixed body and its aim raised to the eyes (`offset` 7 cm above the head bone), about 1.5 m from her and up to 1 m down her eyeline. It stands on the scene's side of the line, and the one she plays to stays behind the camera |
| 4 | shot / reverse | a line spoken to someone on a mark | `vc-ots-<speaker>-<listener>`: over the listener's shoulder onto the speaker, placed by M2's `shotReverse()`. The speaker is framed away from the shoulder (`aim.screen[0]` ±0.2), and the reverse mirrors it |
| 5 | master | anything else (action, voice-over) | `vc-two`: the two-shot of the whole cast. A lone speaker with nobody on a mark to play to gets a frontal close-up instead |

A gesture alone (`(nods)`, `[[point]]`) isn't a beat: it plays in the shot / reverse. On the sample this gives
establishing, master, CU Hana, Mira over Hana, Hana over Mira, master, Mira over Hana, CU Hana (`(beat)`), CU Hana
(`[[HANA happy]]`), Hana over Mira, and CU Mira (`(warmly)`).

**The 180° line.** Each scene is shot from one side of its line, the line between its first two people at its first
shot. That side is `side` (`+1`: the side the line's normal `[dz, −dx]` points to), or by default the side that faces
`room` (the set's origin, which is the middle of most sets). Every other line takes the side its master camera stands
on: another pair's line, or the same pair's after a move. So no cut between two of these cameras crosses a line. People
who move between marks (`[[MIRA at: window-table]]`) get cameras placed for where they stand at the shot's middle frame.
A second placement of the same setup is suffixed `-2`.

**Options** (`coverByRule(options)`): `side`, `room`, `estSize` (0.4), `otsScreen` (0.2).

**What the hook needs.** `planCoverage(ctx)` reads the build's plan (beats, events, characters) and the initial marks.
It also reads three things W8 added to the hook's `ctx` in `@vrmxg/script`: `markTf` (for moves), `parsed` (the
parentheticals) and `numbers`. These are additive: existing coverage functions see the same arguments as before.

## The 180° lint

`lintLine(doc, { set, margin })` reads the sequence document as it is, so it checks hand edits too. At every cut on a
camera track:
- **The people.** Each camera plays to its subjects (aim target or targets, body target). A lone subject's eyeline
  (her lookAt track) adds the one she looks at.
- **The line.** The line kept is each pair both shots play to. When they share no pair, it is the line between the two
  people they show. It runs between where they stand at the cut: cast transforms, transform tracks and shot overrides.
- **The cameras.** Each camera's place comes from its body: fixed, follow, thirdPerson, orbit, firstPerson or hardLock,
  from the rig preset under its props.
- **The verdict.** A cut is flagged when its two cameras are off the line (more than `margin`, 5 cm) on opposite sides.

These cuts are not flagged:
- a neutral camera standing on the line, which is the way across;
- a shot with `"crossLine": true`, which crosses on purpose.

A camera whose place can't be known, such as a dolly on a path, isn't checked. `unchecked` lists those cuts.

## Replacing a shot's camera

`replaceShotCamera(session, shot, camera)` takes a shot id or number, plus an existing VirtualCamera's id or a new
VirtualCamera node (`cameraOnRig` makes one on a rig preset). It is one `session.run` step: the node is added and the
sequence is set. Undo takes both back, and the text is exact on undo and redo. The session is duck-typed like
`applyScript`'s: `doc`, `setDoc`, `run`. Unknown cameras, nodes that aren't cameras, ids already taken and no-op swaps
are refused without a step. The clip keeps its `src`, so on the next re-script the merge marks it `hand`. It stays the
person's camera and follows its shot's new timing (the script README's rule 2).

## Storyboard and thumbnails

`storyboard(doc, { set })` returns `{ fps, duration, shots }`. Each shot carries:
- its id, number, start, end and camera;
- the thumbnail **frame**: the shot's middle, or after the blend into it when that runs longer;
- the camera's rig, lens and subjects;
- the script beat it came from;
- whether its camera is a hand edit;
- the lint's message when the cut into it crosses the line.

This is the data the creator's storyboard strip (W5) shows.

`renderThumbnails({ tree, host, board, width, height, order })` renders a thumbnail per shot. It puts the world on each
frame with `SequencePlayer.seek`, which restores the nearest snapshot at or before the frame and steps the rest. It then
draws with `captureStill`, on WebGL or WebGPU. Each thumbnail comes back with its RGBA and hash. With `order: 'reverse'`
every seek restores a snapshot. Rendering in film order and in reverse gives the same pixels (the playground's check
below).

## Tests and the demo

`npm test`:
- **rules:** the sample's eleven shots; one establishing wide per scene; shot / reverse on one side of the line, with
  `side` as a choice; three people; every beat kind; overlap, voice-over and a lone speaker; moves between marks. Also
  the same bytes twice, under portable maths, and against `test/golden.json`.
- **edit:** the lint on hand-swapped, neutral, deliberate, follow and dolly cameras; one-edit replacement with undo and
  redo (existing and new cameras, refusals); a replaced camera kept through a re-script; the storyboard.

The playground demo, `?mode=coverage&renderer=webgl|webgpu` (`apps/playground/src/coverage-check.js`), works like this:
1. It builds the sample script with coverage by rule in the page and loads it into the cafe on an offline host.
2. It renders a 480×270 thumbnail per shot from snapshots, twice: in film order, then last shot first.
3. It draws the storyboard strip.

`apps/playground/scripts/coverage-chromium.mjs` runs it on both backends in headless Chromium, each on two loads. It
writes `apps/playground/results/coverage/<backend>-<shot>.png`, `<backend>-strip.png` and
`results/coverage-chromium.json`:

```
(cd apps/playground && npx vite build) && node apps/playground/scripts/coverage-chromium.mjs
```
