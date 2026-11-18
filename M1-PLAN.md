# VRMXG M1 plan: playable

*Draft, 2026-11-17. M1 as the PRD scopes it (§8): VRMXI items and interaction, the closet protocol at run time,
look-at, lip sync, audio, a minimal editor (tree, inspector, gizmos, play), MCP edit and drive, frame export. It
builds on M0 (done 2026-11-17: [acceptance/](acceptance/README.md), receipts AB-R-0946 to 0951) and four decisions
made for it: VRMXI is specified in `VRMXA_Specification` (AB-D-0251), a takeable item embeds its VRMXW (AB-D-0252), the
editor lives in `apps/editor` with one shared Mac shell for every VRMXG app (AB-D-0253), and M1's voice is clips with
lip sync, live TTS in M2 (AB-D-0254). Filed as plan AB-P-0014, one bridge task per workstream (AB-T-0512 to 0522).*

## What M1 is done looking like

M1 is finished when **you can build the cafe in the editor and play a small scene in it**:

1. **The editor builds a scene.** Open the sample project, drag the set, two characters and items in from the asset
   list, place them with gizmos (snapping), change props in the inspector, reparent and delete in the tree, undo and
   redo every step, save, reopen: the file is byte for byte what was saved, and it validates.
2. **Play in place, with items.** Press Play in the editor: Mira walks in, a prompt appears as she faces the counter's
   sword, she takes it (a pickup VRMXI: the embedded VRMXW goes into her closet and she holds it, her idle changes with
   it), opens the storeroom cupboard (a container), sits on a stool (a seat) and switches the counter lights (a
   switch). Focus, prompt, verb and the character's `take` / `use` / `sit` animation slots for each. Stop returns the
   scene to exactly how it was before Play.
3. **Hana talks.** Walking up to Hana starts a line of dialogue: her voice clip plays from where she stands, her mouth
   follows it (within ±50 ms of the audio, measured), she looks at Mira and blinks, and a caption shows it.
4. **It sounds right.** Positional sound on the doors and the switch, ambience and music on their own buses, volume and
   mute per bus; audio timing stays presentation, so replays stay bit for bit.
5. **Agents can drive it.** Through MCP an agent edits the scene open in the editor (each edit undoable there), plays,
   sends input actions, triggers an interaction, cues Hana to say a line, reads state and takes a screenshot.
6. **It exports a shot.** A 10-second take of the scene exports from the editor to H.264 1080p30 with its audio,
   frame-exact, and two exports of it are bit-identical frame for frame.
7. **M0 still holds.** The M0 acceptance re-runs green at the M1 commit, with a recorded run that now takes the sword,
   opens the cupboard and sits: identical per-step hashes in Node, Chromium and WKWebView, snapshot and restore across
   an equip.

Not in M1: the shot sequencer and timeline scrubbing UI, post stack, particles, navigation and behaviour trees,
inventory UI beyond a list, live TTS, vehicles and ladders (M2 and later).

## Shape of the code

New since M0, in the same workspace and with the same rules (JSDoc types, Node tests per package, the determinism lint
on simulation packages, Vue never holding engine objects):

```
engine/packages/
  item/          VRMXI loader, item node types (door, container, pickup, switch, seat, spawn), item states
  interact/      focus (ray / proximity), prompts as data, verbs, the interaction service, inventory service
  closet/        the closet at run time over vrmxa-core's closet/: equip, unequip, state, outfit; VRM swap with state kept
  audio/         Web Audio service: buses, 2D and positional players, voice playback (presentation)
  voice/         lip sync from word timings (ported from the AB-T-0490 spike, TalkingHead's MIT core), captions
  editor-core/   editor model without UI: selection, commands on @vrmxg/scene's editor, play-in-place snapshots
  export/        offline frame stepping, readback, the shell's export endpoint client, OfflineAudioContext mixing
apps/
  shell/         the shared Swift WKWebView shell (Swift package): scheme + loopback, native bridge, open/save,
                 frame export (AVAssetWriter), used by every VRMXG app
  editor/        the editor (Vite + Vue): tree, inspector, viewport and gizmos, asset list, play, export
  editor-mac/    the editor in the shared shell
  playground-mac/  moves onto the shared shell
content/sample/  items, voice lines and their timings, use / sit / take clips, all in LICENCES.md
```

- **Items are data plus behaviours.** A VRMXI carries its model, colliders, joints, sensors, states and verbs; the
  engine maps its `type` to node types and behaviours the registry already knows how to describe, so MCP, the inspector
  and the scene format pick them up without new code paths.
- **One command log.** The editor, MCP and undo share `@vrmxg/scene`'s edit ops (as the spike proved); MCP edits made
  while the editor is open go through the editor's log.
- **Determinism boundary unchanged** (AB-D-0248): items, interaction, the closet's effect on slots and controllers are
  simulation; audio, voice playback, captions and lip-sync presentation are not, but lip-sync *weights* that the
  snapshot records are computed from the step clock so replays match.

## Workstreams

Sizes are rough: S about a day, M a few days, L a week or more. Arrows are dependencies.

| # | Task | Workstream | Size | Needs | What |
|---|---|---|---|---|---|
| W0 | AB-T-0512 | **Shared Mac shell** | M | none | `apps/shell` as a Swift package: the spikes' scheme handler and loopback server, a native message bridge (typed requests both ways), open/save panels for project files, window state; the playground moves onto it. Frame export lands here in W8 |
| W1 | AB-T-0513 | **VRMXI specification** | M | none | Draft `VRMXI-base-draft.md` in `VRMXA_Specification` as a proposal for the spec owner's review, sharing VRMXW's conventions (licence and `meta`, `madeWith`, tags, states with `show` / `morphs`): manifest, model, colliders, joints, sensors, internal animations, `type`, verbs, states, and `takeable` items embedding their `.vrmxw` (AB-D-0252). Fixtures for each M1 type |
| W2 | AB-T-0514 | **Items** | L | W1 | `@vrmxg/item`: read `.vrmxi` (with vrmxa-core's zip and checks where they fit), item node types and behaviours for door, container, pickup, switch, seat and spawn point; item state in snapshots; the cafe's doors rebuilt as VRMXI |
| W3 | AB-T-0515 | **Interaction** | M | W2 | `@vrmxg/interact`: focus by ray and proximity, prompts as data the UI renders (HTML overlay in the apps), verbs (`open`, `take`, `use`, `sit`, `talk`), the character's `take` / `use` / `sit` slots, results as signals; an inventory service for items that aren't worn |
| W4 | AB-T-0516 | **Closet at run time** | L | W2 | `@vrmxg/closet`: equip, unequip, change state, apply outfit through `vrmxa-core/closet` on the character's bundle; pinned items (held, stowed) on bones without a bake; worn items that change the look trigger a redraw and a VRM swap that keeps the character's simulated state; `take` on a takeable pickup adds its embedded VRMXW and puts it on; slots follow (M0 already resolves them from equipped tags). Measure the hitch |
| W5 | AB-T-0517 | **Audio** | M | W0 (Mac), none (web) | `@vrmxg/audio`: an AudioPlayer and a positional AudioPlayer3D node, buses (music, SFX, voice, ambience) with volume and mute, sounds triggered by signals at step time and played as presentation; unlock on first gesture; an offline mix path for W8 |
| W6 | AB-T-0518 | **Voice, lip sync, faces** | M | W5 | `@vrmxg/voice`: VRMXA voice clips played from the character (positional), lip sync from word timings onto `aa ih ou ee oh` (the AB-T-0490 spike's core), captions; timings made offline with an aligner and stored beside the clip until VRMXA's voice format carries them (an ask to the spec); look-at targets with limits and saccades, blinks; a `say` action that plays a line |
| W7 | AB-T-0519 | **Editor** | L | W0, W2 | `apps/editor` and `@vrmxg/editor-core`: project open, tree dock (add, reparent, delete), inspector generated from the registry, viewport with TransformControls, snapping, orbit and fly, asset list with drag in (VRMXA, VRMXW, VRMXI, glTF), undo / redo, save; play in place from a snapshot and restore on stop; debug toggles; the playground's frame-time readouts |
| W8 | AB-T-0520 | **Frame export** | M | W0, W5, W7 | `@vrmxg/export` and the shell's endpoint: step the scene offline at the shot's frame rate (24, 25, 30, 60, 29.97) with interpolated presentation, render at export size, read back asynchronously, POST raw frames to the shell with backpressure, AVAssetWriter to H.264 / HEVC / ProRes 4444, audio mixed in an `OfflineAudioContext`; stills and thumbnails (`spike-frame-export/`, AB-R-0927) |
| W9 | AB-T-0521 | **MCP edit and drive, content** | M | W3, W6, W7 | MCP attached to the open editor (edits through its command log, undoable there), drive tools (play, pause, step, input actions, trigger an interaction, cue a character), a screenshot tool. Content: the sword pickup, a cupboard, stools as seats, a light switch, use / sit / take clips, Hana's voice lines with timings, sounds and music, every file in `LICENCES.md` |
| W10 | AB-T-0522 | **M1 acceptance** | S | all | The seven checks above, run and filed as receipts; the M0 acceptance re-run on the M1 commit |

```
W0 shell ─────────────┬──────────────► W7 editor ──┬──► W8 export ──┐
W1 spec ──► W2 items ─┼─► W3 interact ─────────────┤                 ├──► W10
                      └─► W4 closet ───────────────┤                 │
W5 audio ─────► W6 voice ──────────────────────────┴──► W9 MCP+content┘
```

After W1, three streams run side by side: items, interaction and closet; audio and voice; shell, editor and export.
Content (W9's half) can start with W1's fixtures.

## Decisions made for M1 (2026-11-17)

1. **VRMXI's specification lives in `VRMXA_Specification`** beside VRMXW and shares its conventions (AB-D-0251). No
   bridge area owns that repository yet, so W1 drafts it there as a proposal for the spec owner's review.
2. **A takeable item embeds its VRMXW** (AB-D-0252): an item the player may take into the closet carries the `.vrmxw`
   inside the `.vrmxi`; an item that can't be taken carries none. Taking it adds that wearable through the closet
   protocol.
3. **The editor is `apps/editor` in this repository, and every VRMXG Mac app uses one shared shell** (AB-D-0253,
   PRD Q4): a Swift package in `apps/shell`; the game UI and anime creator apps will use it too.
4. **M1's voice is clips with lip sync; live TTS through MLXEngine waits for M2** (AB-D-0254): deterministic and the
   same in Chromium and the Mac apps; word timings are made offline with an aligner.

## Open questions that don't block M1's start

- **Voice timings in VRMXA.** The voice clip format (`voices.json`, `clips/<sha12>.wav`) has no word timings; W6 keeps
  them beside the clip and asks the spec to add an optional timings file.
- **Starter animations (PRD Q9).** `take`, `use` and `sit` clips: generated (as M0's) or retargeted from mesh2motion's
  CC0 set. W9 decides on what reads best.
- **The base-Mac budget** (AB-T-0511, from M0) should be measured before M1's 20-character scenes grow.
- **Who reviews VRMXI.** The spec repository has no bridge area; until one exists the operator reviews W1's draft.

## Risks

| Risk | Effect | Handling |
|---|---|---|
| The closet's redraw is slow (a bake per look change) | Equipping hitches during play | Pinned items ride bones with no bake; look-changing items redraw off the step and swap the VRM between steps with state carried; W4 measures and sets a budget |
| A VRM swap loses state (springs, look-at, graph) | Replays break across an equip | Swap through the vendored three-vrm's state API (M0's snapshot path); the M1 recorded run equips, and check 7 compares hashes across it |
| The editor grows without end | M1 never ends | Scope is the PRD's P0 editor rows only: tree, inspector, viewport and gizmos, asset list, undo, play, debug. Profiler, project manager and asset library are P1 or later |
| VRMXI spec review stalls | Items wait | W2 builds on W1's draft and fixtures; changes from review are absorbed before M1 acceptance |
| Web Audio unlocks need a gesture | Silent first frames in tests | Audio is presentation; tests check scheduling, not sound; the apps unlock on the first click or key |
| Lip sync timings drift from audio | Visible mismatch | Timings from an aligner (the spike measured ±30 ms); acceptance measures mouth vs audio lag |

## Where things come from

| Piece | Source |
|---|---|
| Runtime, physics, characters, input, cameras, render, snapshot, MCP | M0 (`engine/packages/*`), AB-R-0935 to 0951 |
| Closet protocol and fitting | `vrmxa-avatar-studio/packages/vrmxa-core/src/closet/`, `/fit` (AB-R-0918), in place (AB-D-0249) |
| Lip sync | `mlxengine-3d/DEV/VRMLipSync/` (AB-T-0490): TalkingHead's word branch (MIT) on VRM 1.0 visemes |
| Frame export | `spike-frame-export/` (AB-R-0927) |
| Sequencer and dialogue tracks (M2) | `research/cinematics.md` |
| Shell, scheme and loopback server | `spike-physics/mac/`, `apps/playground-mac/` |
