# VRMXG M6 plan: games others can build

*Approved by the operator 2026-11-26 (AB-P-0020: tasks AB-T-0644 to 0652 with AB-T-0638, 0631, 0639, 0624, 0630, 0627, 0629 and 0626; decision AB-D-0297). M6 builds on M5 (done 2026-11-26 by the
operator's call: [acceptance/](acceptance/README.md), "Result: M5's acceptance", receipts AB-R-1143 to 1154), which made
a game you can play. We built that game, but nobody else could: the editor can't attach behaviours or wire connections
(AB-T-0638), a project's own behaviours can't describe themselves, there is no new-project path, and the guide stops
before games. M6 closes that gap, so a game builder who isn't us can make, test and share a small game.*

*Where this plan's facts come from: the PRD's feature map (§5) and phasing (§8), M5's carried checks and the 28 open
tasks on 2026-11-26, and M5's open questions. The theme and the spikes are the operator's choices, and the defaults were
approved with the plan (2026-11-26, AB-D-0297).*

**Status (2026-11-26):** the first wave is done. Each PR was reviewed by an independent reviewer and re-checked after its fixes.
- **W0 behaviours that describe themselves** (PR #50, AB-T-0644): `stateShape(behaviour)` in `@vrmxg/registry` is the one state-shape contract W2 and W5 compare.
- **W3 new project and settings** (PR #52, AB-T-0646): a layer that's in use can't be renamed or removed rather than carried into the scenes; an unknown layer is refused by `planBuild` (`unknown_layer`); the Collider's layer field stays free text until W1's inspector.
- **W4 starter content** (PR #53, AB-T-0647): 37 CC0 clips and 17 VRMXI items in `content/starter/`. 11 clips rest on mesh2motion's blanket CC0 statement with no recorded author, and asking its maintainer to confirm is the operator's step. Merging starter rows into a project is AB-T-0653.
- **W5 saves across updates** (PR #51, AB-T-0631): the fingerprint also counts an `assets` part (items, characters, glTF structure, brains, the animation set). That is stricter than decision 3's list. The editor and Node write the same manifest bytes. The editor refuses a behaviours module graph with an import cycle, which Node loads.
- **W6 a game that keeps running** (PR #54, AB-T-0639, 0630, 0627, 0629): device-loss recovery, with automatic retries while WebKit's GPU process comes back.

Carried:
- AB-T-0626's 20-times Play loop in the Mac editor.
- The canonical matrix after W6, never run because the GPU stayed busy: AB-T-0656, which blocks W11.
- Project-module import follow-ups: AB-T-0654 items 2, 3, 5 and 6.
- `tree.detached` growth: AB-T-0655.
- MCP's tool list is at about 1,986 of its 2,000 tokens, which W1 and W8 have to make room in.

**Status (2026-11-26, second wave):** done. Each PR was reviewed by an independent reviewer and re-checked after its fixes.
- **W1 behaviours and connections in the inspector** (PR #60, AB-T-0638): Behaviours and Connections panels with fields from each schema, a node's id field, and ids referenced in other scenes refused with the files named. The whole sample level is built in the editor and saved byte-identical to `content/sample/game/level.vrmxs`, on WebGPU and WebGL (AB-R-1183, AB-R-1184). That is exit checks 2 and 5, and M5's check 8.
- **W2 hot reload** (PR #56, AB-T-0645, shell 0.15.0): the editor's play in place swaps a project's behaviours on a step boundary, keeping state when `stateShape` is unchanged and restarting the behaviour when it isn't. A throwing reload keeps the old code. A reloaded session is refused for replay (`reloaded`).
- **W7 sharing** (PR #58, AB-T-0648 with AB-T-0624, shell 0.16.0): a web build plays from a static host under a CSP with no `'unsafe-eval'` (Ajv precompiled), `vrmxg-export --worker` writes a Worker folder (nothing deployed), the Mac game app is hardened and ad-hoc signed, and every app carries THIRD-PARTY-LICENCES. Signing, notarising and hosting are the operator's steps (`RELEASE.md`, `apps/game/HOSTING.md`).
- **Networking spike** (PR #57, AB-T-0622): lockstep now, over a WebRTC data channel. Rollback is exact once the engine gaps AB-T-0657 to 0659 close.
- **WebXR spike** (PR #59, AB-T-0623): no WebXR in WKWebView on the Mac. Safari in the visionOS 27.2 simulator has immersive-vr and `XRGPUBinding` but no WebGPU adapter, and its WebGL 90 Hz run is hash-exact (AB-R-1175). Findings AB-T-0660 to 0662.

Carried from the second wave:
- Renaming a keyed game node with no `key` renames it in the game state, and conditions that name it don't follow (W1's PR notes it).
- AB-T-0654 items 2 and 3, the cycle-fallback nits, and a top-level `$async` schema gap.
- The hardened Mac app's AppProbe scenario on the merged build (last pass AB-R-1181 on 41b7e712).
- Still carried from the first wave: AB-T-0626, AB-T-0656 (blocks W11), AB-T-0655, and MCP's token budget.

W8, W9, W10 and W11 wait on the operator's word.

## What M6 is done looking like

M6 is finished when **someone who isn't us can start a project in the editor, build a small game in it (its levels,
its behaviours and its wiring) without typing JSON, write a behaviour of their own and see it reload while they play,
and hand the game to someone else, with a guide that takes them there.**

1. **A project starts in the editor.** New Project makes a game project from a template (an empty game, and one
   level with a player, a goal and an ending), with the starter content in it and every file in its `LICENCES.md`.
   Open Recent and the project's settings (entry scene, input map, physics layers) work from the editor.
2. **Behaviours and connections are authored in the inspector.** A node's behaviours are added, removed and edited by
   their schema; its outgoing connections (signal, target, action, arguments) are wired from lists. Each edit is one
   undo step and nothing is typed as JSON. A node's id can be set.
3. **A project's own behaviours describe themselves.** A behaviour in a project's module declares its params and
   signals the way the registry's do, so the inspector edits it, validation knows its signals, and a scene connection
   from its signal is valid. The sample game's behaviours declare theirs.
4. **A behaviour reloads while you play.** Saving the project's behaviours module in a text editor reloads it in the
   editor's play in place, without restarting the scene. A reload that throws keeps the old code running and shows
   the error. An exported build never reloads.
5. **The level is built by hand, all of it.** M5's check 8 completes: an AppProbe scenario builds the Morning Rush's
   level in the Mac editor, behaviours and connections included, and the saved level equals the committed one,
   ids included, on WebGPU and on WebGL.
6. **A second game is built in the editor.** A different game from the Morning Rush (proposed below) is built by an
   AppProbe scenario from New Project to Export Game: every scene, behaviour attachment and connection made through
   the editor, one behaviour of its own written as a file. It plays in the game app, and a recorded session replays
   exactly in Node, Chromium and WKWebView on both backends.
7. **Saves survive an update.** A re-export that changes only what a save doesn't depend on (a texture, a line of
   dialogue's audio, the HUD) loads earlier saves; one that changes what restore needs (a behaviour's state, a scene's
   nodes, the action map, the engine's maths) refuses them with a message that says why. Replays still compare the
   whole build.
8. **A game keeps running and can be shared.**
   - The game app survives a lost GPU device mid-play: it rebuilds its renderer and goes on from the same step.
   - A web build served from any static host plays.
   - A Mac build is ready for Developer ID signing and notarisation; signing and notarising are the operator's steps.
   - Every Mac app ships the third-party licence notices game builds already carry.
9. **There is a game builder's guide.** The docs site gains an editor guide and a tutorial that goes from New Project
   to an exported game. A scenario follows the tutorial step by step in the Mac editor, so it can't drift from the
   app. Deploying the site stays the operator's step.
10. **Agents can build a game too.** Through MCP an agent starts a project from a template, attaches behaviours with
    their params, wires connections and exports. An agent session adds a level to the second game.
11. **The spikes have verdicts.** Networking (lockstep against rollback, AB-T-0622) and WebXR (AB-T-0623) each have a
    README with a verdict, run instructions and raw JSON. Whether either becomes a workstream is M7's question.
12. **M0 to M5 still hold**, on both backends, at the M6 commit. The second game holds 60 frames a second at 1080p on
    the M5 Max.

**The second game** (a proposal, the operator's to change): **"After Hours"**, in the sample cafe after closing. Mira
finds what the day's customers left behind (a scarf, a phone, a book) and puts each on the right shelf before Hana
locks up. It plays differently from the Morning Rush: searching instead of serving, a door and a switch that open the
back room, the inventory carrying more than one thing, and hints from Hana in dialogue. Its own behaviour (the shelf
that checks what's put on it) is the one a builder writes as a file, with its params and its `placed` signal declared.
It reuses the cafe set, so it needs no new set, only a few props from the starter content.

## What exists already, and what doesn't

| Need | State on 2026-11-26 |
|---|---|
| Behaviours in the inspector | Listed as text. `EditorSession` has no op for them (AB-T-0638) |
| Connections in the editor | No UI. Carried through copy and paste only (AB-T-0638) |
| A node's id | Set on add; the inspector renames a node's name, never its id (M5's check 8 found 21 of 22 ids differ) |
| A project's own behaviours | Run from the project's module, but can't declare params or signals; a connection from their signal fails validation (`@vrmxg/scene` `doc.js`) |
| New project, project settings | Not built. The editor opens a folder; `game.json` and the input map are edited as files |
| Hot reload | Not built (PRD §5.2, P1) |
| Saves across re-exports | Refused: a save carries the whole build's digest (AB-T-0631, the operator's decision) |
| A lost GPU device | The game stops (AB-T-0639) |
| Licence notices in the Mac apps' web builds | Missing (AB-T-0624); game builds have them |
| Sharing a build | An ad-hoc signed Mac app for this Mac; a web folder, untested on a static host |
| The guide | The docs site (docs.vrmxstudio.com, AB-R-1084) has the reference and seven pages; no editor guide, no tutorial |
| Starter content | The sample cafe and its characters only (PRD question 9 open; mesh2motion's CC0 clips and props are in `reference/`) |
| MCP for behaviours and connections | Scene tools set props; no behaviour or connection ops, no new project |

## Shape of the code

| Piece | Where | New or changed |
|---|---|---|
| Behaviour and connection ops; a node's id; one undo step each | `engine/packages/editor-core` | Changed |
| The behaviours and connections panels | `engine/packages/editor-ui`, `apps/editor` | Changed |
| A project behaviour's declaration (params, signals) read into the registry; validation of its signals | `engine/packages/registry`, `scene`, `script` | Changed |
| Reload a project's behaviours in play; keep state, or restart a node's behaviour, by the declaration | `engine/packages/script`, `apps/editor` | Changed |
| New Project, templates, Open Recent, project settings | `apps/editor`, `apps/shell` (a project-folder API), `content/templates/` | New |
| Starter content: a default animation set and an item pack | `content/starter/` (every file in its `LICENCES.md`) | New |
| A save-compatibility fingerprint | `engine/packages/bundle`, `save`, `apps/game` | Changed (AB-T-0631) |
| Device-loss recovery | `engine/packages/render`, `apps/game` | Changed (AB-T-0639) |
| A build for a static host; a Mac build ready to notarise; notices in every app | `engine/packages/bundle`, `apps/game-mac`, `apps/*-mac` | Changed (AB-T-0624) |
| MCP: behaviours, connections, new project | `engine/packages/mcp` | Changed |
| The editor guide and the tutorial | `docs/guide/` | New |
| The second game | `content/sample/after-hours/` | New |

## Workstreams

Sizes are rough: S about a day, M a few days, L a week or more.

| # | Workstream | Size | Needs | Task | What |
|---|---|---|---|---|---|
| W0 | **Behaviours that describe themselves** | M | none | AB-T-0644 | A project behaviour exports its declaration (params with JSON Schema, signals, the state it keeps); the registry takes it beside its own types; scene validation accepts connections from its signals; MCP's `describe` lists it. The sample game's behaviours declare theirs |
| W1 | **Behaviours and connections in the inspector** | L | W0 | AB-T-0638 | Add, remove and edit a node's behaviours by their schema (registry and project); a connections panel (signal, target from the tree, action, arguments from the action's schema); a node's id field; each one undo step. Completes M5's check 8 |
| W2 | **Hot reload** | M | W0 | AB-T-0645 | The editor's play watches the project's behaviours module (through the shell) and swaps it in place: a behaviour keeps its state when its declaration's state shape is unchanged, else it restarts on that node; a throwing reload keeps the old code and shows the error. Dev only |
| W3 | **New project and settings** | M | none | AB-T-0646 | New Project from templates, Open Recent, a project settings panel (entry scene, input map with rebinding, physics layers, the game's title and id); the shell's project-folder API |
| W4 | **Starter content** | M | none | AB-T-0647 | mesh2motion's CC0 clips retargeted into a default animation set, and a starter item pack (props, a door, a switch, a shelf, pickups) as VRMXI; every file in `LICENCES.md`; the templates use them |
| W5 | **Saves across updates** | S | none | AB-T-0631 | The fingerprint (below, decision 3): over what restore depends on, not the whole build; a texture-only re-export loads the save, a behaviour state change refuses it, replays compare the whole build |
| W6 | **A game that keeps running** | M | none | AB-T-0639, 0630, 0627, 0629, 0626 | Device-loss recovery in the render host and the game app (a forced loss mid-session matches an unbroken run's hashes); the dialogue service in every host; time scale and process mode in the snapshot; the counter default; disposal of what leaves a world's root |
| W7 | **Sharing a game** | M | W5 | AB-T-0648, AB-T-0624 | A web build that plays from a static host (checked by serving one locally and from a Worker preview); a Mac build with hardened runtime and entitlements ready for Developer ID; notices in every Mac app. The operator signs, notarises and deploys |
| W8 | **Agents** | S | W0, W1, W3 | AB-T-0649 | MCP: new project from a template, behaviour and connection ops, project settings; validate covers project behaviours and the optional-goal fix (AB-T-0641); the skill and `llms.txt` updated |
| W9 | **The game builder's guide** | M | W1, W3 | AB-T-0650 | An editor guide with screenshots and a tutorial from New Project to Export Game, in `docs/guide/`; a scenario that follows the tutorial in the Mac editor; the generated reference covers project behaviours |
| W10 | **The second game** | M | W1–W4 | AB-T-0651 | "After Hours" built through the editor by an AppProbe scenario, its own behaviour written as a file; a recorded session replayed in three runtimes on both backends; an agent session adds a level |
| W11 | **M6 acceptance** | S | all | AB-T-0652 | The twelve checks above, run and filed as receipts; M0 to M5 re-run at the M6 commit on both backends |

```
W0 behaviours describe ──┬─► W1 inspector ──────┬─► W8 agents ─────────┐
                         └─► W2 hot reload      ├─► W9 guide ──────────┤
W3 new project ─────────────────────────────────┤                      ├─► W11
W4 starter content ─────────────────────────────┴─► W10 second game ───┤
W5 saves ──────► W7 sharing ───────────────────────────────────────────┤
W6 keeps running ──────────────────────────────────────────────────────┘
```

Five streams can start at once: W0, W3, W4, W5 and W6. W1 and W3 both change `apps/editor`, so their files are kept
apart (the inspector against the project and menu code) or they run one after the other.

## Running alongside M6

- **Networking spike** (AB-T-0622; planned for M4 and M5, run now by the operator's call): lockstep against rollback
  on the deterministic 60 Hz step, over WebSocket and WebRTC, two game windows and one simulated network (latency,
  loss, jitter). It measures the input delay, how deep a rollback goes and its cost per step, and the snapshot size.
  Verdict in `spike-networking/`. M5's game app is the client.
- **WebXR spike** (AB-T-0623; the same): WebXR in WKWebView (does the shell expose it?) and in Safari on visionOS
  through loopback; MToon in stereo on WebGPU; 90 Hz presentation over the 60 Hz step; hands and gaze as input. Verdict
  in `spike-webxr/`.
- **The dev inspector dock** (AB-T-0610): a live inspector and performance readout in dev builds, which a builder
  testing their game would use.
- **Carried over:**
  - AB-T-0642: M5's check 4 (a real gamepad, VoiceOver, the HUD prompt, volume, gamepad rebinding), when a pad is here;
  - AB-T-0511: the base-Mac budget, now with both games;
  - AB-T-0557: a face take from a real camera;
  - AB-T-0591 and AB-T-0596: the WebGPU odd frame and the offline host's first frame;
  - AB-T-0640: the quiet-GPU check by utilisation, before M6's acceptance runs the matrix;
  - AB-T-0628, 0632 to 0635: registry asset references and the editor's small gaps, picked up where a workstream
    touches the same files;
  - AB-T-0556: our own text renderer;
  - AB-T-0513: the VRMXI review, still with the operator;
  - asks owed to other areas: AB-A-0324 (the ZONOS3 backend in the shell's voice) and AB-A-0329 (the companion takes
    the WebGPU default).

## Decisions

Made by the operator (2026-11-26):
1. **M6 centres on games others can build.** The spokesmodel app, the iPhone and the creator's episodes wait.
2. **The networking and WebXR spikes run alongside M6.** Whether either becomes a workstream waits on its verdict.

Approved with the plan (2026-11-26, AB-D-0297):
3. **Saves are checked by a compatibility fingerprint**, over what restore depends on: the scene documents and
   prefabs, each behaviour's declared state shape, the action map, and the engine's snapshot and maths versions.
   Declared migrations in `game.json` can come later without a format change. This answers AB-T-0631.
4. **A project's behaviour declares itself in its module**, as a static `describe` (params as JSON Schema, signals,
   the state it keeps), the same shape the registry's own behaviours have. No separate declaration file.
5. **Hot reload is the editor's only.** Exported builds are frozen and replay exactly; a session recorded across a
   reload is marked as such and isn't used as a replay fixture.
6. **Sharing means a web folder and a Mac app ready to notarise.** The operator holds the Developer ID, signs,
   notarises and decides where anything is published. No store submission in M6.
   A build runs under a Content Security Policy without `'unsafe-eval'` (W7, AB-T-0654 item 6): a project's declared
   schemas are checked by the draft 2020-12 meta-schema precompiled with Ajv standalone, never compiled at run time,
   and the policy a host should send is `contentSecurityPolicy()` in `@vrmxg/bundle/hosting` (WebAssembly by
   `'wasm-unsafe-eval'`, the page's import map and style by hash). The page doesn't set it itself: a `<meta>` would bind
   the Mac shell too.
7. **Starter content is CC0 only** (mesh2motion's clips and props first), so a builder can ship it without a licence
   question.
8. **The second game reuses the cafe set.** A new set is content work outside this plan.

## Open questions that don't block M6's start

- **The second game.** "After Hours" is a proposal; any small game with different mechanics serves check 6.
- **Touch and the iPhone.** Still not in M6. A shared web build makes it the next thing a player will ask for.
- **Localisation** (PRD P2): the dialogue UI keeps its strings in the project; string tables can follow.
- **Visual scripting** stays skipped (PRD §5.2). Does the connections panel plus declared behaviours cover what a
  non-programmer needs, or does M7 need more?
- **Where a builder's games live.** Projects are folders the builder picks; is a default projects folder wanted?

## Risks

| Risk | Effect | Handling |
|---|---|---|
| Hot reload breaks determinism | A replay recorded in the editor doesn't match the build | Reload is editor-only; a reloaded session is marked and never a fixture; check 6 replays a build's session |
| A project behaviour's declaration drifts from what it does | The inspector edits params the code ignores; validation passes a broken connection | The declaration is read from the running module, and a test fails when a declared signal is never emitted in the sample games' sessions |
| The editor work has no natural end again | M6 becomes the next editor rewrite | Checks 2, 5 and 6 are the limit: what the two levels' scenarios need. The rest stays filed |
| Starter content brings a licence surprise | A builder ships something they may not | CC0 only; every file has a `LICENCES.md` row and the export refuses one without |
| W1 and W3 change `apps/editor` at once | Merge conflicts, a broken editor | One writer per set of files; the editor's AppProbe scenarios run on every merge |
| Device-loss recovery changes what's drawn | A recovered game draws differently from an unbroken one | The simulation is untouched; check 8 compares per-step hashes, and frames only after recovery settles |
| The spikes slip a third time | They keep being carried | They're exit check 11; an unrun spike fails M6's acceptance |
| Other projects' GPU jobs during the acceptance | The matrix can't get a quiet GPU (M5's Gaea job) | AB-T-0640 first; the acceptance asks the operator before the GPU runs |

## Where things come from

| Piece | Source |
|---|---|
| The inspector's widgets, prefab overrides, the assets panel | M5 W4 to W6 (`editor-ui`, `editor-core`), AB-D-0290, 0291, 0294 |
| The game app, the build, game flow | M5 W0 to W2 (`bundle`, `game`, `apps/game`), AB-D-0282, 0283, 0286 |
| The Morning Rush and its level scenario | M5 W10 (`content/sample/game`, `acceptance/m5/rush*`), AB-D-0293 |
| The docs site | AB-T-0611, AB-R-1083, AB-R-1084 |
| What an editor should have | `research/playcanvas-comparison.md` |
| Starter clips and props | `reference/mesh2motion-app-main` (CC0 assets) |
