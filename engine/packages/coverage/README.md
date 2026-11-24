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
| 1 | establishing | a scene heading's shot | `vc-est-<heading>` (`vc-est-int-cafe-morning`): a wide of everyone on their marks, on `twoShot` with `aim.size` 0.4, further back and higher (2.2 m) than the two-shot |
| 2 | two-shot | overlapping lines (dual dialogue, `^`) | `vc-two-<a>-<b>`: the speakers together, on `twoShot` |
| 3 | close-up | a beat: a `(beat)` or `(pause)` in the line, or an expression the line or an action gives someone (`(smiling)`, `(warmly)`, `[[happy]]`, `[[HANA happy]]`) | `vc-cu-<id>-to-<other>` (`vc-cu-<id>` when she plays to nobody): a clean single on `closeUp` with a fixed body and its aim raised to the eyes (`offset` 7 cm above the head bone), about 1.5 m from her and up to 1 m down her eyeline. It stands on the scene's side of the line, and the one she plays to stays behind the camera |
| 4 | shot / reverse | a line spoken to someone on a mark | `vc-ots-<speaker>-<listener>`: over the listener's shoulder onto the speaker, placed by M2's `shotReverse()`. The speaker is framed away from the shoulder (`aim.screen[0]` ±0.2), and the reverse mirrors it |
| 5 | master | anything else (action, voice-over) | `vc-two`: the two-shot of the whole cast. A lone speaker with nobody on a mark to play to gets a frontal close-up instead |

A gesture alone (`(nods)`, `[[point]]`) isn't a beat: it plays in the shot / reverse. On the sample this gives
establishing, master, CU Hana, Mira over Hana, Hana over Mira, master, Mira over Hana, CU Hana (`(beat)`), CU Hana
(`[[HANA happy]]`), Hana over Mira, and CU Mira (`(warmly)`).

**The 180° line.** Each scene is shot from one side of its line, the line between its first two people at its first
shot. That side is `side` (`+1`: the side the line's normal `[dz, −dx]` points to), or by default the side that faces
`room` (the set's origin, which is the middle of most sets). From then on each pair's side is kept from camera to
camera: a new camera on a pair stands on the side of their line that the last camera on that pair stood on, judged
against the line as it ran just before the cut. So when a move swings the line round (Mira crosses to Hana's far side),
whoever was screen-left stays screen-left, and no cut between two of these cameras crosses a line.

**Moves.** The script's moves between marks (`[[MIRA at: window-table]]`) are step keys, cuts in the world. A move that
lands inside a shot is a cut in the film too: the shot is filmed in pieces, each with its camera placed for where people
stand in it (the hook's `splits`, a clip `<beat>#cam:2` of its own). A move on a shot's cut needs nothing more.

**Ids.** A camera's id says what it films: its kind, its people, whom a close-up plays to, and where they stand when that
isn't their first mark (`vc-ots-mira-hana-1-mira-at-window-table`). The same id is the same camera from build to build,
so a camera a person put on a shot is still the one they chose after a re-script, even when the rules stop making it
(the build keeps a node something still uses). Only two different cameras with the same description in one build (the
same people on the same marks shot from both sides, or two scenes with one heading) take `-2`, `-3` by first use.

**The set** (AB-T-0597). Give the rules the set's solid boxes and no camera stands in the set's geometry or behind it:

```js
import { coverByRule, loadSetBlockers } from '@vrmxg/coverage';
import { readGLBJson } from '@vrmxg/model';
import { readPhysics } from '@vrmxg/physics';

const blockers = await loadSetBlockers(set, { bytes: (ref) => project.bytes(ref), readColliders: (b) => readPhysics(readGLBJson(b)).colliders });
buildSequence(text, { set, marks, coverage: coverByRule({ blockers }) });
```

- **Blockers** are the set's colliders as boxes in set space (`setBlockers(set, colliders)`): its Collider nodes, and
  each Model's colliders from its asset. A sphere, capsule or cylinder counts as the box around it. Sensors, convex
  hulls and triangle meshes are left out. This package reads no files: the app or tool reads each `.glb`
  (`loadSetBlockers` does the walk with the caller's readers).
- **Clear** means the camera is outside every box by 0.25 m, and the straight line from each head it films (at eye
  height) to the camera touches no box. A camera through an open doorway is clear.
- **A group shot** (the establishing wide, a two-shot, the master) stays on the line's side while the set leaves it at
  least 0.7 of its distance there, pulled in a twentieth at a time; its lens widens to hold the group. With less room
  than that, it takes the other side when there is more room there.
- **A shot / reverse or a close-up** that isn't clear is pulled in towards the person it stands by.
- **People far apart.** A close-up of someone who plays to a person more than `far` metres away (3) must show at least
  three-quarters of her face: the camera within 45° of where she faces. People that far apart rarely face each other,
  so the line's side can leave her in profile. Then the close-up takes the other side when that shows her face. This
  rule needs no blockers.
- **A cross on purpose.** A camera that changes sides this way crosses the line. Its shot is marked
  `"crossLine": true` (the hook's cut carries `crossLine`, and `@vrmxg/script` writes it on the shot), so the lint
  lets it pass, and the pair's side is the new one from then on. A scene's first camera on a pair crosses nothing.
- **Where there was room, nothing changes.** The sample script's cameras are byte for byte the same with the cafe's
  blockers as without.

On the sample short, "The Regular": Mira moves to the window table, 4.25 m from Hana. The line's side then faces the
back wall. Before, the closing master stood beyond that wall and both close-ups were profiles. Now the first close-up
after the move takes the room's side (shot 150, marked), the others follow it, and the master stands in the cafe.

Not done: the close-ups at the counter still crop a head when people stand close (shot 040 of the short). Their
framing is as it was.

**Options** (`coverByRule(options)`): `side`, `room`, `estSize` (0.4), `otsScreen` (0.2), `blockers`, `far` (3).

**What the hook needs.** `planCoverage(ctx)` reads the build's plan (beats, events, characters) and the initial marks.
It also reads three things W8 added to the hook's `ctx` in `@vrmxg/script`: `markTf` (for moves), `parsed` (the
parentheticals) and `numbers`. These are additive: existing coverage functions see the same arguments as before.

## The 180° lint

`lintLine(doc, { set, margin })` reads the sequence document as it is, so it checks hand edits too. At every cut on a
camera track:
- **The people.** Each camera plays to its subjects (aim target or targets, body target). A lone subject's eyeline
  (her lookAt track) adds the one she looks at.
- **The cuts.** A cut is where a camera track's live clip changes (`clipAt`), so a clip laid over a longer one cuts in
  and back out.
- **The line.** The line kept is each pair both shots play to. When they share no pair, it is the line between the two
  people they show. The outgoing camera is held against the line as it ran on the frame before the cut, the incoming
  one against the line on the cut, so a move that lands on the cut is judged by what each shot shows. Where people
  stand comes from cast transforms, the live shot's overrides and transform tracks sampled as they play.
- **The cameras.** Each camera's place comes from its body: fixed (its transform, with its transform tracks and the
  shot's overrides), follow, thirdPerson, orbit, firstPerson or hardLock, from the rig preset under its props and the
  shot's prop overrides.
- **The verdict.** A cut is flagged when its two cameras are off the line (more than `margin`, 5 cm) on opposite sides.

These cuts are not flagged:
- a neutral camera standing on the line, which is the way across;
- a cut into or inside a shot with `"crossLine": true`, which crosses on purpose.

A camera whose place can't be known isn't checked: a dolly on a path, or a turntable (an orbit whose `yawSpeed` turns
it, so where it stands depends on how long it has run). `unchecked` lists those cuts.

**A camera inside geometry.** With `blockers` (`lintLine(doc, { set, blockers })`), every camera clip is also checked
where it starts, whoever placed the camera. A camera standing in one of the set's boxes, or with a box between it and
someone it films, is an issue with `kind: 'geometry'`, `what` (`inside` or `behind`) and the box's name in `blocker`:
`frame 322 (050): camera vc-ots-hana-1-mira is inside the set's geometry (set/wall-north)`. The storyboard carries it
as `inGeometry` on the shot (`storyboard(doc, { set, blockers })`), and the creator's strip shows "camera in the set".

## Replacing a shot's camera

`replaceShotCamera(session, shot, camera)` takes a shot id or number, plus an existing VirtualCamera's id or a new
VirtualCamera node (`cameraOnRig` makes one on a rig preset). It is one `session.run` step: the node is added and the
sequence is set. The shot's clips are those that start inside it (a shot cut at a move has two); when the clip live at
its start began earlier, a clip is laid over it for the shot. Undo takes both back, and the text is exact on undo and redo. The session is duck-typed like
`applyScript`'s: `doc`, `setDoc`, `run`. Unknown cameras, nodes that aren't cameras, ids already taken and no-op swaps
are refused without a step. The clip keeps its `src`, so on the next re-script the merge marks it `hand`. It stays the
person's camera and follows its shot's new timing (the script README's rule 2).

## Storyboard and thumbnails

`storyboard(doc, { set })` returns `{ fps, duration, shots }`. Each shot carries:
- its id, number, start, end and camera (the one live on its thumbnail frame), and `cameras`, every camera live in it;
- the thumbnail **frame**: the shot's middle, or after the blend into it when that runs longer;
- the camera's rig, lens and subjects;
- the script beat it came from;
- whether its camera is a hand edit;
- the lint's message when a cut into it or inside it crosses the line.

This is the data the creator's storyboard strip (W5) shows.

`renderThumbnails({ tree, host, board, width, height, order })` renders a thumbnail per shot. It puts the world on each
frame with `SequencePlayer.seek`, which restores the nearest snapshot at or before the frame and steps the rest. It then
draws with `captureStill`, on WebGL or WebGPU. Each thumbnail comes back with its RGBA and hash. With `order: 'reverse'`
every seek restores a snapshot. Rendering in film order and in reverse gives the same pixels (the playground's check
below).

## Tests and the demo

`npm test`:
- **rules:** the sample's eleven shots; one establishing wide per scene; shot / reverse on one side of the line, with
  `side` as a choice; three people; every beat kind; overlap, voice-over and a lone speaker; moves between marks; a
  move inside a shot that swings the line (cut in two, lint clean) and one on a cut. Also
  the same bytes twice, under portable maths, and against `test/golden.json`.
- **set:** boxes (a point in one, a segment through one, turned or not); the cafe's sixteen blockers and a turned
  Model's; the cafe after the move to the window table (the master outside without the set, every camera clear with
  it, the cross marked, the lint clean); close-ups of people far apart showing the face; a group shot pulled in or
  sent to the other side; the lint and the storyboard on a camera put in a wall.
- **edit:** the lint on hand-swapped, neutral, deliberate, follow and dolly cameras, shot overrides (transform and
  props), a camera's transform track, a turntable, and a clip laid over a longer one; ids that keep a person's pick
  through a re-script with three people; one-edit replacement with undo and
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
