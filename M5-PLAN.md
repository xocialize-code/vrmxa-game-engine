# VRMXG M5 plan: a game you can play

*Draft, 2026-11-24 (AB-P-0019: tasks AB-T-0615 to 0623, with the editor's AB-T-0599 to 0609 and the shell's AB-T-0592 and
0593). M5 picks from the PRD's "Later" row (§8). It builds on M4 (done 2026-11-24: [acceptance/](acceptance/README.md),
receipts AB-R-1087 to 1099), which made the anime creator and put the engine on WebGPU. Game builders are the one PRD
user (§2) with no app yet: the editor builds scenes, and nothing plays them for a player.*

*Where this plan's facts come from: the PRD's feature map (§5) read row by row against the code on 2026-11-24, M4's
deferred list, and the open tasks. What the sample game is, and the two defaults under "Decisions", are proposals until
the operator says otherwise.*

## What M5 is done looking like

M5 is finished when **you can build a small game in the editor, export it, and play it in the game app: with rules, a
HUD, menus, dialogue, save and settings. A recorded play session replays exactly, on both backends.**

1. **A project exports as a game.** The editor's Export Game writes a build: the runtime, the game's scenes and
   assets, its behaviours, its input map and a manifest that lists every file with its hash and its licence.
   - The same project gives the same build, byte for byte, from the Mac editor and from Node.
   - A file with no row in the project's `LICENCES.md` stops the export, and the error names it.
2. **The game app plays it.** `apps/game` runs a build in a browser tab, and `apps/game-mac` runs it on the shell:
   a title menu, start, pause and quit. It draws on WebGPU, falls back to WebGL, and obeys the query switch, as the
   other apps do.
3. **The game has rules.** A game-state service holds the goal, the score, timers and the win and lose conditions,
   as scene data. The game moves between scenes (title, level, ending) and keeps its state across them. All of it is
   in the world snapshot.
4. **There is a HUD and there are menus.** Vue overlays over the canvas, bound to the game state and the
   interaction prompts:
   - a HUD (the goal, the score, the timer, what the player carries, the prompt for what is in reach);
   - a pause menu and a settings menu (volume per bus, key and gamepad rebinding, the backend);
   - every menu works from the keyboard and a gamepad, and the overlays are DOM, so a screen reader reads them.
5. **You talk to characters through a dialogue UI.** Dialogue boxes, choices and speech bubbles, tied to the
   character's voice, with captions. A choice the player makes is an input in the recording, so a conversation
   replays as it was played.
6. **You can save and carry on.** Save slots from the menu, and a checkpoint the game writes by itself. A loaded
   save goes on with the unbroken run's per-step hashes, across a scene change too.
7. **A play session replays exactly.** A session recorded in the game app (inputs, menu and dialogue choices)
   replays in Node, Chromium and WKWebView to the same per-step hashes, on WebGPU and on WebGL.
8. **The editor is good enough to build it.** The sample game's level is built in the Mac editor by hand, through an
   AppProbe scenario that types no JSON: inspector widgets for vectors, lists and maps, numbers you drag, several
   nodes edited at once, prefab overrides you can see and revert, a selection outline and shape handles in the
   viewport, and an assets panel you drag from.
9. **Agents can build and check a game.** Through MCP an agent reads and sets the game's rules, validates a project
   (missing colliders, files without a licence, a goal nothing can reach), and exports it. An agent session adds a
   customer and a goal to the sample game and exports the result. The repository carries an `llms.txt`-style index
   and a VRMXG skill.
10. **M0 to M4 still hold**, on both backends, at the M5 commit. The sample game holds 60 frames a second at 1080p on
    the M5 Max; the base-Mac number waits on the hardware (AB-T-0511).

**The sample game** (decided in W10: "The Morning Rush", design AB-D-0293, `content/sample/game`): one room, the sample cafe, a few minutes long. You play Mira
helping Hana through the morning rush: take each customer's order in a dialogue choice, carry what Hana makes to the
right table, and close the till before the clock runs out. It uses what the engine already has (items and verbs, the
inventory, the server and customer behaviour trees, doors, voiced lines) and needs each new piece once.

## What exists already, and what doesn't

Read from the PRD's feature map against the code. Only the rows a game needs are listed.

| PRD row | State on 2026-11-24 |
|---|---|
| Interaction: focus, prompts, verbs; the inventory (§5.13) | Built (`@vrmxg/interact`, M1). The prompts have no player-facing UI outside the playground's readouts |
| Save games (§5.15) | Built (`@vrmxg/save`, M2): slots, flags, the snapshot. No menu, no checkpoints |
| Input: action map, gamepads, recording (§5.9) | Built (`@vrmxg/input`, M0). Not built: rebinding at run time, touch |
| Autoloads: global services (§5.1) | Built as `tree.services`. There is no game-state service |
| UI toolkit: HTML/Vue overlays (§5.12, P0) | Not built as a package: each app has its own readouts |
| Dialogue: boxes, choices, speech bubbles (§5.12, P1) | Not built. Lines are spoken and captioned; nothing offers a choice |
| Export: a build of the runtime, the scene and its assets (§5.20, P1) | Not built |
| Scene changes while playing | Not built: an app loads one scene |
| Blend trees with masks (§5.4, P1, G10) | Layers exist (M2). Masked, layered blend trees are AB-T-0609 |
| Validate over MCP (§5.21, P1) | Scene documents validate. No project-level checks |
| Profiler and monitors (§5.18, P1) | The playground's budget readout only. AB-T-0610 proposes the operator's inspector as a dev dock |
| LOD, instanced meshes, touch, world-space UI, localisation | Not built, and not needed for the sample game: left out of M5 |

## Shape of the code

| Piece | Where | New or changed |
|---|---|---|
| Game state: goal, score, timers, win and lose, flags; scene flow; checkpoints | `engine/packages/game` (simulation: `vrmxg/deterministic` applies) | New, on `core`, `save`, `snapshot` |
| The build: collect a project's files, check licences, write the manifest; load a build | `engine/packages/bundle` | New, on `scene`, `registry` |
| Player-facing overlays: HUD, menus, settings, dialogue, speech bubbles, captions | `engine/packages/game-ui` (Vue; its decisions as plain functions, tested in Node, as `editor-ui` does) | New |
| Rebinding at run time; a choice as a recorded input | `engine/packages/input` | Changed |
| Dialogue choices from scripted lines and from the director | `engine/packages/voice`, `engine/packages/director` | Changed |
| Masked, layered blend trees (carry a tray while walking) | `engine/packages/character` | Changed (AB-T-0609) |
| Inspector widgets, conditional fields, multi-edit, prefab overrides, viewport tools, assets panel | `engine/packages/registry`, `editor-core`, `editor-ui`, `apps/editor` | Changed (AB-T-0599 to 0607) |
| Ask before closing; the editor's WebGPU preview memory | `apps/shell`, `apps/editor` | Changed (AB-T-0593, AB-T-0592) |
| The game app | `apps/game` (Vue), `apps/game-mac` (on `apps/shell`) | New |
| Export Game in the editor; MCP tools for rules, validation and export | `apps/editor`, `engine/packages/mcp` | Changed |
| The sample game | `content/sample/` (a `game/` project beside the shorts) | New |

## Workstreams

Sizes are rough: S about a day, M a few days, L a week or more.

| # | Workstream | Size | Needs | Task | What |
|---|---|---|---|---|---|
| W0 | **Game build** | M | none | AB-T-0615 | `@vrmxg/bundle`: a project's scenes, assets, behaviours and input map collected into a build with a manifest (every file's hash and licence); the same bytes from Node and the editor; a loader; Export Game in the editor |
| W1 | **The game app** | L | W0 | AB-T-0616 | `apps/game` and `apps/game-mac`: loads a build and runs it; title, pause and settings menus; save slots; the backend choice; an AppProbe scenario from the start |
| W2 | **Game flow** | M | none | AB-T-0617 | `@vrmxg/game`: the game-state service (goal, score, timers, win and lose) as scene data and in the snapshot; scene changes that keep the state; checkpoints on `@vrmxg/save` |
| W3 | **HUD and dialogue UI** | M | W2 | AB-T-0618 | `@vrmxg/game-ui`: the HUD, interaction prompts, dialogue boxes, choices, speech bubbles and captions; a choice is a recorded input; rebinding in settings |
| W4 | **Inspector widgets** | L | none | AB-T-0599 to 0602 | Real widgets in place of JSON text boxes, a number field you drag, several nodes edited at once, conditional fields in the prop schema |
| W5 | **Viewport and handles** | M | none | AB-T-0604, 0605 | Selection outline, view cube, camera preview, rectangle select, duplicate and copy and paste; shape handles for colliders, sensors and lights |
| W6 | **Prefabs and assets** | M | W4 | AB-T-0603, 0606, 0607 | Prefab overrides you can see, revert and apply; an assets panel with thumbnails, filters and drops onto slots; the small polish list |
| W7 | **Blend trees** | M | none | AB-T-0609 | Masked, layered blend trees, so a character carries something while she walks |
| W8 | **Safe to close** | S | none | AB-T-0593, 0592 | The shell asks the page before closing with unsaved changes; the editor's Play on WebGPU stops growing the web process |
| W9 | **Agents** | S | W0, W2 | AB-T-0619, AB-T-0608 | MCP: read and set the rules, validate a project, export a game; the `llms.txt`-style index and the VRMXG skill |
| W10 | **The sample game** | M | W1–W3, W7 | AB-T-0620 | The morning rush in the cafe: its level, rules, dialogue, customers and endings; every file in `LICENCES.md`; a recorded play session |
| W11 | **M5 acceptance** | S | all | AB-T-0621 | The ten checks above, run and filed as receipts; M0 to M4's re-run at the M5 commit on both backends |

```
W0 game build ────► W1 game app ──────────────┐
W2 game flow ─────► W3 HUD and dialogue ──────┼─► W10 sample game ─┐
W7 blend trees ───────────────────────────────┘                    │
W4 inspector ─────► W6 prefabs and assets ─────────────────────────┼─► W11
W5 viewport and handles ───────────────────────────────────────────┤
W8 safe to close ──────────────────────────────────────────────────┤
W0, W2 ───────────► W9 agents ─────────────────────────────────────┘
```

**Progress (2026-11-24):** W0, W2 and W8 are done and merged (PRs #31 to #34; tasks AB-T-0615, 0617, 0592 and 0593),
then W1, W3 and W9 (PRs #36 to #38; tasks AB-T-0616, 0618, 0619 and 0608; shell 0.11.0). The game app plays an exported
build with the HUD and dialogue UI wired in. Then W4, W5 and W7 (PRs #40 to #42; tasks AB-T-0599 to 0602, 0604, 0605
and 0609; shell 0.12.0): the inspector's widgets, the viewport's aids and handles, and masked character layers (carry
while walking). Left: W6 (prefabs and assets), W10 (the sample game) and W11 (acceptance). Left from the reviews:
AB-T-0624, AB-T-0626 to 0632, 0634 and 0635 (AB-T-0631, saves across re-exports, is the operator's decision).

**W10 (2026-11-25, AB-T-0620):** "The Morning Rush" is `content/sample/game` (its own `game.json`; `vrmxg-export
--game game/game.json`): title, level, won and lost scenes; three regulars ordered by dialogue choice, trays carried on
the upper-body layer, the till closed before a 240 s clock; lost on time or on two wrong orders. A scripted player wins
and loses it through the game app in Chromium; both recorded sessions replay to the same per-step hashes in Node,
Chromium and WKWebView (scheme and loopback), on WebGPU and WebGL (`acceptance/m5/rush.mjs`, `rush-wkwebview.sh`). The
Mac game app goes from its title to each ending (`apps/game-mac/docs/HAND-TEST-M5-RUSH.md`) and plays 12 minutes at
1080p at 60.1 fps in steady play, web process at most 2.25 GB (AB-R-1137; a lost WebGPU device stops the game:
AB-T-0639). The editor builds the level's game layer by hand with no JSON typed (`apps/editor-mac/docs/HAND-TEST-M5-LEVEL.md`,
22 of 22 nodes as committed, W6's assets panel and prefab override included, on WebGPU and WebGL); it can't attach
behaviours or wire connections (AB-T-0638), the one part of check 8 left.

Five streams can start at once: W0, W2, W4, W5 and W7. W4 and W5 both change `apps/editor`, so they run one after
the other unless their files are kept apart. W8 is small and can go first.

## Running alongside M5

- **Networking spike** (AB-T-0622; planned for M4, not run): lockstep against rollback on our deterministic 60 Hz
  step, over WebSocket and WebRTC, with two game windows and one simulated network (latency, loss, jitter). It
  measures the input delay, how deep a rollback goes and its cost per step, and the snapshot size. Verdict, run
  instructions and raw JSON in `spike-networking/`. M5's game app gives it a real client to test with.
- **WebXR spike** (AB-T-0623; planned for M4, not run): WebXR in WKWebView (does the shell expose it?) and in Safari on
  visionOS through loopback; MToon in stereo on WebGPU; 90 Hz presentation over the 60 Hz step; hands and gaze as
  input. Verdict in `spike-webxr/`.
- **Our own text renderer** (AB-T-0556): the HUD's and the title cards' text. troika stays the default until it lands.
- **The dev inspector dock** (AB-T-0610): the operator's vue-three-inspector as a dev-only live inspector and
  performance readout. It would serve check 10's budget and the PRD's profiler row.
- **The documentation site's phase 2**: the editor's guide waits on W4 to W6, and a game builder's guide on W10.
  Deploying the site stays the operator's step.
- **Carried over:**
  - AB-T-0557: a face take from a real camera;
  - AB-A-0329: the companion takes the WebGPU default, in its own repository;
  - AB-T-0511: the base-Mac budget, now with the sample game;
  - AB-T-0591: the odd WebGPU frame, tested again on the release macOS (Apple's FB25710847);
  - AB-T-0596: a fresh WebGPU offline host's first frame through the TSL post stack under load;
  - AB-T-0513: the VRMXI review, still with the operator.

## Decisions made for M5 (2026-11-24)

1. **M5 centres on a playable game** (the operator, 2026-11-24). The spokesmodel app, which M4 put "after M4", moves
   to M6 or runs beside M5 if someone wants it sooner: it reuses the creator's script, casting and voicing.

Taken as defaults (say so if any should change):
2. **One game is one build.** Export Game writes the game's own web folder (the runtime and its behaviours built in),
   and `apps/game-mac` wraps that folder on the shell. It is not a general player that opens other people's builds:
   the PRD's rule that scenes from others are data only (§5.2) stays whole, because a build's code is the project's
   own. A build is signed ad hoc; notarising a game for other Macs is not in M5.
3. **The HUD and menus are HTML and Vue over the canvas**, as the PRD chose (§5.12). Nothing is drawn as UI inside
   the canvas except speech bubbles and name tags (`@vrmxg/text`).
4. **The sample game's conversations are scripted lines with choices.** The LLM director stays optional in a game:
   where it is on, its replies are logged as inputs and replay, as M3 showed.
5. **Networking and WebXR stay spikes in M5.** They become workstreams in M6 on their verdicts.
6. **Episodes** (M4's open question: do shorts chain into episodes?) are not in M5. They belong with the creator's
   next milestone.

## Open questions that don't block M5's start

- **Touch and the iPhone.** The PRD has touch at P1 and the iPhone "later via the same pattern". The game app is the
  first place it would matter. Not in M5 unless asked.
- **Localisation** (P2): the dialogue UI keeps its strings in the project, so string tables can come later without a
  format change. Is that enough for now?
- **How a game is shared.** A web folder can be served anywhere; a Mac app for other people needs a Developer ID and
  notarisation, which are the operator's.
- **Starter content (PRD question 9)** is still open beyond the samples.

## Risks

| Risk | Effect | Handling |
|---|---|---|
| The editor work (W4 to W6) has no natural end | M5 becomes an editor rewrite | Check 8 is the limit: what the sample level's scenario needs, and the filed tasks' own acceptance. The rest stays filed |
| UI choices sit outside the 60 Hz step | A replay diverges at a menu or a dialogue choice | A choice reaches the simulation only as a latched, recorded input (`@vrmxg/input`); check 7 replays a session with choices in three runtimes |
| A scene change loses or doubles state | Saves and replays break across scenes | The game state lives in a service that the snapshot holds; check 6 loads a save taken before a scene change |
| Two apps change `apps/editor` at once (W4, W5, W6, W8) | Merge conflicts, a broken editor | One writer per set of files; W6 waits for W4; the editor's AppProbe scenarios run on every merge |
| A build ships a file nobody may ship | A licence problem in something handed to others | The export refuses a file with no `LICENCES.md` row; the manifest carries each file's licence |
| WebKit's web process memory in long play (AB-T-0592) | The game app is killed after minutes of play | W8 fixes the editor's case first; check 10 plays the sample game for ten minutes and records the web process's memory |
| AppProbe drops typed text when another app is in front (AB-T-0612) | Hand-test rows fail for no reason of ours | Scenarios check and retry typed values; runs keep the launched app in front |

## Where things come from

| Piece | Source |
|---|---|
| Items, verbs, prompts and the inventory | M1 (`engine/packages/interact`, `item`), receipts AB-R-0967 to 0973 |
| Save and the snapshot | M2 (`engine/packages/save`, `snapshot`), AB-R-1001 |
| The server and customer behaviour trees, navigation | M2 (`engine/packages/ai`, `nav`) |
| Voiced lines, the director and its logged replies | M3 (`engine/packages/voice`, `director`), AB-R-1038 to 1046 |
| The renderer on both backends, and the acceptance matrix | M4 (`engine/packages/render`, `acceptance/matrix.mjs`), AB-R-1087 |
| What an editor should have, and why not PlayCanvas's own | `research/playcanvas-comparison.md` (AB-T-0599 to 0609) |
| The Mac shell every app sits on | `apps/shell` (AB-D-0253) |
