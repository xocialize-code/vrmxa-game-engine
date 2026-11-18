# VRMXG M2 plan: production

*Draft, 2026-11-18. M2 as the PRD scopes it (§8): the shot sequencer, virtual cameras and blends, the post stack,
particles, navigation and behaviour trees, save, layered animation (VRMXA G10) and IK. It builds on M1 (done 2026-11-18:
[acceptance/](acceptance/README.md), receipts AB-R-0967 to 0973). The operator chose its weighting and two of its
boundaries (decisions below): **anime production and a living cafe count equally**, the **LLM director waits for M3**,
and a **sequence is its own scene document** that instances the set. Filed as plan AB-P-0015, one bridge task per workstream (AB-T-0523 to 0535); decisions AB-D-0255 to 0257.*

## What M2 is done looking like

M2 is finished when **you can film a short anime scene in the cafe while the cafe lives on its own**:

1. **A sequence is authored in the editor.** Open the cafe project and create a sequence (a `.vrmxs` that instances
   `cafe.vrmxs`). In the editor's timeline, lay out 4–6 shots on a 24 fps ruler with these tracks:
   - camera cuts and blends;
   - Mira's and Hana's animation (slots and clips, blend-ins, held "on twos");
   - expressions and look-at targets;
   - dialogue (audio, visemes, subtitle);
   - property and event keys (the door, the lights);
   - music and sound;
   - post.

   Every edit is one undo step. Save and reopen gives the same bytes, and the file validates.
2. **Scrubbing is exact.** Jumping to any frame shows the same pixels as playing up to it. Authored tracks are
   evaluated from the frame alone, and simulation is re-run from the nearest snapshot. The snapshot holds physics,
   spring bones, navigation, the NPC brains and particles. A simulated span can be baked to keys.
3. **Cameras are cinematic.** The physical `Camera` takes focal length (mm), sensor and f-stop, and the engine works out
   the depth of field. `VirtualCamera`s have bodies, aims, seeded noise and impulses. A `CameraBrain` per output picks
   and blends them. Rig presets include over the shoulder, two-shot, shot / reverse shot on the 180° line, close-up,
   dolly on a path, crane and handheld. Inside a sequence, the camera track overrides priority. It all re-simulates
   identically.
4. **It looks like anime.** The post stack is scene data and keyable:
   - characters keep MToon outlines, and sets get screen-space edges;
   - selective bloom, LUT grade, vignette, grain;
   - physical depth of field from the camera;
   - speed lines and impact frames;
   - steam, dust and sparks as particles (deterministic, in the snapshot).

   A 4K export matches the 1080p preview's look (measured).
5. **It exports.** The sequence (30–60 s) exports from the editor at 24 fps:
   - H.264 1080p and ProRes 4444;
   - dialogue, music and effects from the timeline, sound at lag 0;
   - a subtitle file;
   - rendered frames identical across exports and identical to a scrub to the same frame.
6. **The cafe lives.** A navmesh is baked from the set; doors are obstacles and links, and the stools are smart objects.
   Hana runs the cafe from a behaviour tree:
   - she greets, takes an order at a table, walks to the counter and brings it back.

   A customer NPC has a tree of its own: comes in, sits, orders, waits, leaves. Both perceive by sight and hearing,
   and choose between behaviours with utility scores. One action vocabulary (`say`, `emote`, `gesture`, `lookAt`,
   `goTo`, `follow`, `interact`, `setGoal`, `wait`) serves tree leaves, sequence cues and MCP. Ten NPCs stay within the
   step budget, and a run replays bit for bit.
7. **Bodies move better.**
   - Layered animation (G10): Mira holds the sword with her upper body while her legs walk and run, from a mask per clip
     or slot.
   - Feet plant on slopes and steps (two-bone IK on a ground ray).
   - Hands reach for a door handle and the cupboard. Deterministic.
8. **Save and load.** A save holds the world snapshot, inventories and closet, flags and the NPC brains, and goes to a
   file through the Mac shell (IndexedDB in a browser). Loading it continues play identically: the same per-step
   hashes as the run that was saved.
9. **Agents can direct.** Through MCP an agent:
   - adds a shot, rigs a camera, keys an expression and a line of dialogue, and adjusts a behaviour tree, each edit
     undoable in the editor;
   - renders a frame of the sequence and reads an NPC's brain.

   The tool list stays generic and under budget.
10. **M0 and M1 still hold.** The acceptance (now with the M2 checks) re-runs green at the M2 commit in Node, Chromium
    and WKWebView. A recorded run with NPCs, and the sequence itself, hash identically everywhere.

Not in M2:
- the LLM director and persona-driven NPCs (M3);
- ragdolls, vehicles, ladders, cloth;
- networking;
- WebGPU / TSL rendering (until three-vrm's MToon node material lands on r187);
- the anime creator app itself, as opposed to the editor's timeline.

## Shape of the code

New since M1, with the same rules (JSDoc types, Node tests per package, the determinism lint on simulation packages,
Vue never holding engine objects):

```
engine/packages/
  tracks/       one track core: property, transform, expression, event, audio, animation (slot or clip, blend-in,
                held "on twos"); evaluate(frame) is pure; the AnimationPlayer node (doors, items, small cutscenes)
  sequence/     sequence documents (shots, overrides, markers, camera / lookAt / dialogue / post / simulation
                tracks), scrubbing from snapshots, bake to keys, subtitles
  camera/       (grows) physical Camera lens and DOF maths, VirtualCamera bodies / aims / noise / impulse,
                CameraBrain blends, Path3D, rig presets
  post/         PostStack adapter over pmndrs postprocessing 6.39 (TSL later), environment.post as data, anime
                effects (speed lines, focus lines, impact frame), resolution-independent parameters, viewports
  particles/    three.quarks 0.18 behind a deterministic adapter: seeded RNG, dmath, fixed step, snapshots
  nav/          navcat 0.4.1 pinned, crowd block vendored (literal angles), bake from colliders, tiles, door
                obstacles, off-mesh links, agents driving character controllers
  ai/           BT runtime + utility selector, blackboard and stimulus memory, perception, the action vocabulary
                registry, role presets; a recorded-input hook M3's LLM director will use
  save/         save service: snapshot + project state, versioned save files, shell and IndexedDB stores
  character/    (grows) animation layers and masks (G10), two-bone IK for feet and hands, emote / gesture slots
  voice/        (grows) lines from text through MLXEngine (TTS + word timings) baked to clips; live lines in play
apps/editor/    timeline panel, camera preview and multi-angle viewports, sequence documents, behaviour tree view
```

- **One track core, two users.** `AnimationPlayer` and sequences evaluate the same tracks, as Godot's `AnimationPlayer`
  and Unreal's Sequencer do. No Theatre.js: its studio is AGPL-3.0, and it has had no release since 2024
  (`research/cinematics.md` §1.1).
- **Authored tracks are evaluated, simulation is re-simulated.** Nothing authored keeps a clock: clip weights come from
  overlaps, and the mixer runs with `update(0)`. Physics, spring bones, navigation, brains and particles step at 60 Hz
  from snapshots. Frames between steps render interpolated presentation (AB-D-0245).
- **One action vocabulary.** Tree leaves, sequence cues, MCP's drive tools and (in M3) the LLM director's tool calls
  are the same registered actions, each with a JSON Schema the registry describes.
- **The determinism boundary is unchanged** (AB-D-0248):
  - simulation: navigation, AI, IK, animation layers and gameplay particles;
  - presentation: post, cameras' output and viewport rendering;
  - camera damping is stepped at 60 Hz, so camera moves re-simulate.

## Workstreams

Sizes are rough: S about a day, M a few days, L a week or more.

| # | Task | Workstream | Size | Needs | What |
|---|---|---|---|---|---|
| W0 | AB-T-0523 | **Track core** | L | none | `@vrmxg/tracks`: keys `[frame, value, ease?]` with step, linear and bezier interpolation; property, transform, expression, event, audio and animation tracks; per-track `step` (on ones / twos / threes); clip blends as weights from overlaps; the `AnimationPlayer` node; registry descriptions so MCP and the inspector address tracks by path |
| W1 | AB-T-0524 | **Sequences and scrubbing** | L | W0 | `@vrmxg/sequence`: the sequence document (a `.vrmxs` that instances the set, with shots, shot overrides and markers); camera, lookAt, dialogue (audio + visemes + subtitle), post and simulation tracks. Scrubbing from snapshots every N frames, with spring bones and every simulation service in the snapshot; bake a simulated span to keys; SRT subtitles from dialogue tracks |
| W2 | AB-T-0525 | **Cinematic cameras** | L | none | The physical `Camera` (mm, sensor, gate fit, focus, f-stop, dutch) with the engine's thin-lens maths; `VirtualCamera` bodies (fixed, follow, orbit, thirdPerson, firstPerson, dolly, hardLock), aims (lookAt, composer, groupFraming, panTilt), seeded noise and impulses; a `CameraBrain` per output with default and per-pair blends; `Path3D`; rig presets. M0's presets become VirtualCamera presets. camera-controls for editor navigation |
| W3 | AB-T-0526 | **Post stack, anime look, viewports** | M | W2 | `@vrmxg/post`: the PostStack adapter over pmndrs `postprocessing` 6.39.x, `environment.post` as data, the anime stack in order, custom effects (speed lines, focus lines, impact frame), outline policy, toon shadow preset, resolution-independent parameters. Viewports: scissored multi-angle preview and PiP on one renderer, render-target monitors (`research/cinematics.md` §1.3–1.4) |
| W4 | AB-T-0527 | **Particles** | M | none | `@vrmxg/particles`: three.quarks 0.18 behind the adapter `spike-particles/` proved (seeded RNG, dmath, fixed step, snapshot / restore pixel-identical); a `ParticleEmitter` node and effect assets; gameplay particles in simulation, visual-only ones as presentation; steam, dust, sparks |
| W5 | AB-T-0528 | **Timeline editor** | L | W0, W1, W2, W3 | The editor's timeline panel: ruler, track headers and lanes driven by one geometry value, as `DesignScaffoldTimeline` is; keys and clips edited by drag with snapping; the shot list; a camera preview and multi-angle views; scrub and play range; open and save sequence documents; every edit through the command log |
| W6 | AB-T-0529 | **Navigation** | M | none | `@vrmxg/nav`: navcat pinned with its crowd block vendored (constant angles as literals, per the spike); a bake from the set's colliders, tiled; doors as obstacles and off-mesh links; agents that drive Rapier character controllers; crowd state in the snapshot (`spike-navigation/`, AB-R-0925) |
| W7 | AB-T-0530 | **NPC brain and actions** | L | W6 | `@vrmxg/ai`: a small BT runtime (mistreevous-style JSON nodes, behavior3-style descriptors) with a utility selector, blackboard plans, stimulus memory, perception (sight cone with line-of-sight rays, hearing, proximity, smart-object adverts), seeded RNG per agent, LOD tick rates; the action vocabulary registry (`say`, `emote`, `gesture`, `lookAt`, `goTo`, `follow`, `interact`, `setGoal`, `wait`); role presets (server, customer, wanderer); the recorded-input hook for M3 (`research/npc-ai.md`) |
| W8 | AB-T-0531 | **Animation layers and IK** | M | none | Masks per clip or slot (full body, upper body, hands, face), proposed to the VRMXA spec as G10; upper-body layering over locomotion; two-bone IK for feet (ground ray, pelvis offset) and hands (reach, grip targets on items); emote and gesture slots. All deterministic |
| W9 | AB-T-0532 | **Save games** | M | W7 | `@vrmxg/save`: the save service (world snapshot, inventories, closet, flags, brains), versioned save files with the engine versions they need, the shell's file methods and IndexedDB in a browser, save slots in the playground and the editor's play mode |
| W10 | AB-T-0533 | **Dialogue voices** | M | none | Lines from text through MLXEngine: TTS with word timings via the Mac shell's bridge (an ask to the `mlx-engine` area for the endpoint), baked to clips and timings files the dialogue track and `say` use. Live lines in play only, as presentation. This is the live TTS that AB-D-0254 moved to M2 |
| W11 | AB-T-0534 | **MCP and content** | M | W1, W5, W7 | MCP tools for sequences and brains, kept generic (sequence edits are document edit ops; the tool list stays under its budget); a screenshot of any sequence frame. Content: a customer NPC, behaviour trees for Hana and the customer, emote / gesture clips, the espresso machine's steam, a LUT, and a 45 s sequence "Morning at the cafe" (5 shots, 3–4 lines, a music cue), every file in `LICENCES.md` |
| W12 | AB-T-0535 | **M2 acceptance** | S | all | The ten checks above, run and filed as receipts; M0 and M1's re-run on the M2 commit |

```
W0 tracks ──► W1 sequences ─────────────┐
W2 cameras ─► W3 post + viewports ──────┼─► W5 timeline ─┐
W4 particles ───────────────────────────┘                │
W6 nav ─────► W7 brain + actions ─► W9 save ─────────────┼─► W11 MCP + content ─► W12
W8 layers + IK ──────────────────────────────────────────┤
W10 dialogue voices ─────────────────────────────────────┘
```

Five streams can start at once: tracks and sequences, cameras and post, particles, navigation and brains, and layers
and IK. Dialogue voices can start too, once the MLXEngine endpoint is agreed.

## Decisions made for M2 (2026-11-18)

1. **Production and the living cafe weigh the same** (AB-D-0255). The exit checks cover both: a filmed sequence and NPCs that run
   the cafe on their own. M2 is the larger milestone for it.
2. **The LLM director waits for M3** (AB-D-0256). M2 builds behaviour trees, utility selection and the shared action vocabulary,
   and the recorded-input hook the director will use. No model is called in M2's simulation.
3. **A sequence is its own scene document** (AB-D-0257). It instances the set scene, so one set can be filmed by many sequences,
   and editing shots never touches the set's file.

Taken from research and the spikes as defaults (say so if any should change):
- **Sequencer:** built in-house on one track core.
- **Post stack:** pmndrs `postprocessing` 6.39 behind an adapter (TSL later).
- **Particles:** three.quarks behind a deterministic adapter.
- **Navigation:** navcat, with recast-navigation-js as the fallback.
- **NPC brain:** our own small BT runtime with a utility selector.
- **Editor navigation:** camera-controls.

## Open questions that don't block M2's start

- **How lines reach MLXEngine.** W10 needs a TTS-with-timings endpoint reachable from the shell (the native bridge to
  MLXEngine). This is an ask to `mlx-engine` before W10 starts; until it is answered, lines are made offline as in M1.
- **G10 in the spec.** Masks per clip or slot are an open VRMXA issue. W8 proposes the field and keeps it in the
  engine's animation data until the spec owner decides.
- **The base-Mac budget** (AB-T-0511) should be measured before ten NPCs and a post stack land on top of M1's
  scenes.
- **Spokesmodel spots (PRD Q4)**: the anime creator, or an app of their own? Not needed until the creator app starts.
- **Starter content (PRD Q9)**: mesh2motion's CC0 clips for emotes and gestures, or generated ones. W11 decides.

## Risks

| Risk | Effect | Handling |
|---|---|---|
| Scrubbing is slow on long shots | The timeline feels sluggish | Snapshots every N frames (spring bones and every simulation service in them); bake simulated spans to keys; measure scrub latency at 30 and 60 s and set a budget |
| pmndrs `postprocessing` v7 or a three bump breaks the stack | Post stops working | Pin 6.39.x (`three <0.188`); three's own `EffectComposer` worked with MToon in the spike, so it stays as the fallback adapter |
| navcat is pre-1.0 | API changes | Pin 0.4.1, vendor the crowd block, keep recast-navigation-js behind the same adapter |
| Behaviour trees sprawl into code | Agents can't read or edit them | Trees are JSON assets with registered node descriptors; MCP and the editor read and edit them like any document |
| IK fights the animation layers | Feet slide, hands jitter | IK runs after layers, inside the step, with fixed solver iterations; acceptance checks foot height on the stairs and the hand-to-target distance |
| Ten NPCs, post and particles blow the budget | Frame time | Per-agent LOD tick rates, perception time-slicing, particles as presentation where they don't affect play; measure with the M0 harness, extended |
| MLXEngine's TTS endpoint isn't ready | No new dialogue lines | Offline generation as in M1 (Kokoro), with the same timings format |

## Where things come from

| Piece | Source |
|---|---|
| Runtime, items, interaction, closet, audio, voice, editor, export, MCP | M0 and M1 (`engine/packages/*`, `apps/*`), receipts AB-R-0946 to 0973 |
| Sequencer, cameras, post, viewports | `research/cinematics.md`, `spike-cinematics/` (AB-R-0928, AB-R-0929) |
| Particles | `spike-particles/` (AB-R-0926) |
| Navigation | `spike-navigation/` (AB-R-0925) |
| NPC brain and actions | `research/npc-ai.md` |
| Scrubbing and step rate | `spike-steprate/` (AB-D-0245), `spike-determinism/`, `@vrmxg/snapshot` |
| Timeline UI geometry | `DesignScaffold/Docs/Timeline.md` |
| Layered motion | VRMXA `OPEN-ISSUES.md` G10 |
