# VRMXG M4 plan: the anime creator, on WebGPU

**M4 is done (2026-11-24), by the operator's call: eight of its ten exit checks pass at 4a93837, and two pass in part
and are carried on.** The verdicts are in [acceptance/](acceptance/README.md): receipts AB-R-1088 to 1099, with the
backend matrix's AB-R-1087 (tasks AB-T-0585 and AB-T-0614). You can make a one-minute short in the creator from a
script to an exported film on WebGPU: The Regular delivers at 4K in 60 to 67 s against the 4-minute target, twice to the
same frames; its lines are voiced in the Mac app by the shell's own Kokoro; and an agent can make its edits through MCP.

Carried on, as M3 carried AB-T-0557:
- **check 5:** the face take is proven on a synthetic face; a take from a real camera waits on the operator (AB-T-0557);
- **check 8:** the companion hasn't taken the WebGPU default (AB-A-0329, in its own repository), and the base-Mac budget
  isn't measured (AB-T-0511: there is no base M-series Mac here);
- **the beta's rare odd WebGPU frame** (AB-T-0591): deliveries redraw-check for it (AB-D-0280) until it is tested again
  on the release macOS.

At the acceptance itself (7984207) seven checks passed and three in part; check 3 passed later the same day
(AB-T-0614: the creator's Mac app speaks through the shell's `tts.speak`), as did the four AppProbe rows of check 8 that
the acceptance had left (AB-R-1099).

*Started 2026-11-20.* The Avatar Studio can now make the characters M4 casts:
- its spike (`spike-avatar-studio/`) found the studio needn't move onto the engine for M4;
- `0.1.0-preview.1` is tagged and published, and plan 0.2's agent tools (A1–A3, `vrmxa mcp`) are merged;
- Hana and Mira exist as `.vrmxa` files built with its command-line tool from licensed VRoid Hub pieces
  (`../vrmxa-avatar-studio/content/characters/`, approved by the operator 2026-11-19). They replace the 0.34 fixtures
  in W12.

Their voices wait on AB-A-0323 (a persona naming a Kokoro preset voice). Until it's answered, casting (W6) maps a role
to a preset as the sample does now.

*Filed as plan AB-P-0018: tasks W0–W13 are AB-T-0572 to AB-T-0585 (W0 and W4 can start at once), decisions 1–7 are AB-D-0270 to AB-D-0276.*

*Draft, 2026-11-19. M4 picks from the PRD's "M4 Later" row (§8): WebGPU, networking, WebXR, the anime creator and the
game UI app. It builds on M3 (done 2026-11-19: [acceptance/](acceptance/README.md), receipts AB-R-1038 to 1046 and
1048). M2 built the sequencer, cameras, post stack and export. M3 made takes from conversations and baked them into
sequences. The WebGPU research (AB-T-0553, AB-T-0554) found nothing that blocks M4 (AB-R-1004 to 1008, 1016).*

*The operator made three choices (decisions below):*
- *M4 centres on **the anime creator app, on WebGPU**.*
- ***WebGPU becomes the default renderer**, with WebGL kept as a tested fallback.*
- ***Product spokesmodel spots get an app of their own**, after M4. That settles PRD question 4.*

*Not chosen, so they run as research alongside M4 or wait: networking and WebXR (spikes only), the game UI app (after
M4), and the companion's v1 (its own area and phasing).*

## What M4 is done looking like

M4 is finished when **you can make a one-minute anime short in the anime creator, from a script to an exported film:
cast, voiced, performed, shot and rendered on WebGPU. The engine runs on WebGPU everywhere, with WebGL as the fallback,
and every frame still replays exactly.**

1. **A script becomes a sequence.** In the anime creator's Mac app, you write or import a short script:
   - the format is a Fountain subset: scene headings, action, character cues, dialogue, parentheticals and
     transitions;
   - the creator turns it into a sequence over a set: numbered shots (010, 020 …), the cast placed on marks, a
     dialogue track per line, the speaker's look-at, a default performance (talk clips and gestures from the line's
     tags and the parentheticals), and camera coverage (see 4);
   - editing the script updates the sequence and keeps hand edits made since, and each change is one undo step;
   - the same script makes the same sequence, byte for byte.
2. **You cast it.** Characters come from `.vrmxa` files you pick (the shell's binary open, AB-A-0314), and their
   wardrobe comes through the closet protocol. Sets come from `.glb` or `.vrmxs`. A character's VRMXA persona gives
   her voice (`voice_id`) and her allowed expressions. Recasting a role swaps the character and keeps the performance,
   re-baking her lines in the new voice.
3. **The lines are voiced.** Each line is spoken in the character's voice through the shell's TTS (Kokoro, with word
   timings), or through the loopback stand-in in a browser. The bake writes its audio, visemes and subtitle into the
   dialogue track. Regenerating one line, or every line of one character, is one undo step. Music and sound effects go
   on their buses.
4. **The cameras cover it.** Coverage is made by rules from the script and the marks:
   - an establishing wide;
   - shot / reverse shot on the 180° line for an exchange;
   - close-ups on a beat;
   - two-shots for overlap.

   Each camera is an editable virtual camera on a rig preset (M2), and replacing a shot's camera is one edit. A
   storyboard strip shows a thumbnail per shot, rendered from snapshots.
5. **A performance can be acted.** A take records one character's performance into tracks:
   - **puppet:** drive her with the keyboard or a gamepad;
   - **director:** talk to her through M3's director, and her lines, emotions, gestures and goals become tracks;
   - **face:** the shell's camera (Vision, on the device) drives her expressions and head from your face: blink, mouth
     open, smile, brows, head turn.

   A take's tracks are edited like any others, and a take replays exactly from its log.
6. **It renders on WebGPU.** The creator draws through `WebGPURenderer`:
   - MToon with AB-T-0553's three-vrm patch, checked against the stock file on every bump;
   - the anime post stack as TSL (AB-T-0554's seed);
   - particles through `three.quarks/webgpu`.

   Two exports of the short are byte-identical in WKWebView over both origins. Jumping to any frame from a snapshot
   draws exactly the exported frame. On WebGL the same short renders within the look tolerance the acceptance sets
   (SSIM ≥ 0.98 against WebGPU at 1080p), translucent materials aside (decision 4).
7. **It exports for delivery.** From the creator's render queue:
   - H.264 or HEVC for delivery, and ProRes 4444 with alpha for compositing, at 1080p24 and 4K24;
   - sound at lag 0 and an `.srt` with every line;
   - stills, a turntable and thumbnails;
   - the minute-long short exports at 4K in under 4 minutes on the M5 Max, with the time measured and filed.
8. **The engine is on WebGPU everywhere.**
   - The playground, the editor and the companion pick WebGPU where `navigator.gpu` exists and fall back to WebGL;
     a query switch forces either one.
   - The acceptance runs every check on both backends in Chromium and WKWebView. The simulation hashes don't depend
     on the backend, and rendered frames are exact per backend.
   - The 20-character budget (M0 check 4) holds on WebGPU, and the base-Mac measurement (AB-T-0511) is taken on both.
9. **Agents can make a short.** Through MCP an agent can:
   - write or patch the script;
   - recast a role;
   - re-voice a line;
   - change a shot's camera;
   - render a frame;
   - queue an export.

   Each edit is undoable in the creator, and the tool list stays generic and under budget.
10. **M0 to M3 still hold.** The acceptance, with M4's checks added, re-runs green at the M4 commit in Node, Chromium
    and WKWebView, on both backends where a check renders.

Not in M4:
- **The spokesmodel app** (decision 3). M4 keeps the script, casting and voicing pieces in packages it can reuse.
- **The game UI app.**
- **Networking and WebXR**, beyond the two spikes (see below).
- **The companion's v1**, which follows its own PRD in its own area.
- **Hand-drawn or 2D animation, lip-sync editing beyond visemes, and multi-scene episodes.** M4's short is one set and
  one sequence; episodes, which chain sequences, are an open question.

## Shape of the code

| Piece | Where | New or changed |
|---|---|---|
| The renderer choice, warm-up renderer, PMREM, buffer sizing, node frame per offline frame | `engine/packages/render` | Changed (AB-T-0554's list, items 1 and 5) |
| The three-vrm patch and its `--check` | `engine/patches/`, `scripts/patch-three-vrm.mjs`, run on install and in CI | New, from `spike-webgpu-mtoon` |
| The TSL post adapter beside the pmndrs one | `engine/packages/post` | Changed (from `spike-webgpu-render/web/src/tsl-post.js`) |
| `BatchedRenderer` from the host | `engine/packages/particles` | Changed (one line) |
| WebGPU readback, top-down rows, `captureStill` | `engine/packages/export` | Changed |
| The script: a Fountain subset parser, script → sequence, coverage rules, edits that keep hand changes | `engine/packages/script` | New |
| Casting: roles, `.vrmxa` and set loading, persona → voice and expressions, recast | `engine/packages/cast` | New, on `persona`, `closet`, `character` |
| Performance takes: puppet, director, face | `engine/packages/director` (takes), `engine/packages/sense` (face) | Changed |
| The timeline, storyboard strip and render queue, shared by the editor and the creator | `engine/packages/editor-core` and a shared Vue component set | Changed (the timeline moves out of `apps/editor`) |
| The creator | `apps/creator` (Vue), `apps/creator-mac` (on `apps/shell`) | New |
| MCP tools for scripts, casting, voicing, shots and exports | `engine/packages/mcp` | Changed |

## Workstreams

Sizes are rough: S about a day, M a few days, L a week or more.

| # | Workstream | Size | Needs | What |
|---|---|---|---|---|
| W0 | **WebGPU render host** | M | none | `RenderHost` takes a `WebGPURenderer` (`await init()`), the backend choice with fallback and a query switch, WebGPU's PMREM for the room environment, the drawing-buffer size, the node frame advanced per offline frame, and one warm-up renderer at app start (AB-T-0554's gotchas 1 and 6). The three-vrm patch goes in with `--check` in CI |
| W1 | **TSL post** | M | W0 | The TSL adapter in `@vrmxg/post` with the same spec, order, `setParams`, `settle()`, LUTs and resolution-independent lengths; the character mask from a layer pass; pipelines cached per structure (gotchas 4 and 5) |
| W2 | **Particles and readback on WebGPU** | S | W0 | `@vrmxg/particles` takes the host's `BatchedRenderer`. `@vrmxg/export` gains a WebGPU `Readback` (an output target per size, a ring of 3 map buffers, top-down rows and a flag for `toImageRGBA`) and `captureStill` |
| W3 | **Both backends in the acceptance** | M | W0–W2 | Every rendering check runs on WebGPU and WebGL in Chromium and WKWebView (scheme and loopback); the look tolerance between backends; the 20-character budget on WebGPU; the default flips to WebGPU in the playground, editor and companion once the acceptance is green |
| W4 | **Scripts** | L | none | `@vrmxg/script`: a Fountain subset parser (own code, small), the script → sequence build (shots, marks, dialogue, look-at, default performance), edits that keep hand changes (a stable id per script element), deterministic output, and validation errors that point at script lines |
| W5 | **The creator app** | L | W4 | `apps/creator`: a project of shorts, the script pane, the storyboard strip, the timeline (moved into a shared package with the editor), the viewport and the render queue; `apps/creator-mac` on the shell: menus, File › Open for scripts, `.vrmxa` and sets, saving, export through the shell. An AppProbe scenario from the start |
| W6 | **Casting** | M | W4 | `@vrmxg/cast`: roles in the script, characters from `.vrmxa`, wardrobe through the closet, voice and allowed expressions from the persona, and recasting that keeps the performance and re-bakes the lines |
| W7 | **Voicing** | S | W6 | M3's line bake (`tools/bake-lines.mjs`) becomes the creator's: per line or per character, through the shell's `tts.speak` or the loopback stand-in; audio, visemes and subtitles into the dialogue track; one undo step per regeneration; music and sound effects on their buses |
| W8 | **Coverage cameras** | M | W4 | Rules from the script and the marks: establishing wide, shot / reverse shot on the 180° line, close-ups on beats, two-shots for overlap; virtual cameras on M2's rig presets; thumbnails per shot from snapshots |
| W9 | **Performance takes** | L | W5 | Puppet takes (input), director takes (M3) and face takes. Face first needs a short spike: Vision's face landmarks in the shell, or MediaPipe's face blendshapes running natively, to blink, mouth, smile, brows and head; a take is a log, and it replays exactly |
| W10 | **Delivery export** | M | W2, W5 | The render queue: H.264, HEVC and ProRes 4444 with alpha at 1080p24 and 4K24, sound, `.srt`, stills, a turntable and thumbnails; the 4K export time measured |
| W11 | **MCP** | S | W4–W7 | Script read and patch, recast, re-voice, shot camera, render a frame, queue an export; generic, under budget, undoable in the creator |
| W12 | **Content** | M | W4–W8 | A sample short: a one-minute script for Mira and Hana in the cafe, its sequence, baked lines and a take. A second set made with Gaea. Every file in `LICENCES.md` |
| W13 | **M4 acceptance** | S | all | The ten checks above, run and filed as receipts; M0 to M3's re-run at the M4 commit on both backends |

```
W0 WebGPU host ─┬─► W1 TSL post ──────┐
                ├─► W2 particles + readback ─┬─► W3 both backends ─────────────┐
                │                            └──────────► W10 delivery ────────┤
W4 scripts ─────┼─► W5 creator app ─┬─► W9 performance takes ─────────────────┤
                ├─► W6 casting ─► W7 voicing ─┬─► W11 MCP ─────────────────────┼─► W13
                └─► W8 coverage ──────────────┴─► W12 content ─────────────────┘
```

Two streams can start at once: the WebGPU host (W0) and scripts (W4). The creator app (W5) can scaffold on the shell
in parallel, against a hand-written sequence, until W4 lands.

## Running alongside M4

- **Networking spike** (for M5): lockstep against rollback on our deterministic 60 Hz step, over WebSocket and WebRTC,
  with two playground windows and one simulated network (latency, loss, jitter). It measures the input delay, how deep
  a rollback goes and its cost per step, and the snapshot size. Rapier's snapshots, `ai.inject` and the director's
  log decide what can roll back. Verdict, run instructions and raw JSON in `spike-networking/`.
- **WebXR spike** (for M5): WebXR in WKWebView (does the shell expose it?) and in Safari on visionOS through loopback;
  MToon in stereo on WebGPU; 90 Hz presentation over the 60 Hz step; hands and gaze as input. Verdict in `spike-webxr/`.
- **The companion's v1**, in its own area (`vrmxa-companion`), on its PRD's phasing: push-to-talk or a wake word, the
  camera (its v0d), window modes and the menu bar (its v0e). It takes the engine's WebGPU default once W3 lands.
- **Carried over:**
  - AB-T-0557: the camera re-test in good light, which W9's face takes need anyway;
  - AB-T-0511: the base-Mac budget, now on both backends (W3);
  - AB-T-0513: the VRMXI review, still with the operator;
  - AB-T-0556: our own text renderer, which matters for the creator's 4K title cards (troika is the default until
    it lands);
  - adopting VRMXA 0.35 for the sample's Mira.

## Decisions made for M4 (2026-11-19)

1. **M4 centres on the anime creator, on WebGPU.** The exit checks follow one short from script to export. Two of the
   PRD's four users need it: anime short production now, and spokesmodels through their own app later.
2. **WebGPU is the default renderer, and WebGL is a tested fallback.** Each app picks WebGPU where `navigator.gpu`
   exists. The acceptance runs both. Exports are exact per backend, as they already are per browser engine. WebKit's
   readback is slower on WebGPU (23.7 against 20.8 ms a frame at 4K, AB-R-1007), and that cost is accepted.
3. **Product spokesmodel spots get their own app, after M4** (PRD question 4). The creator's script, casting and
   voicing live in engine packages so that app can reuse them.

Taken from research as defaults (say so if any should change):
4. **Translucency blends in linear light on WebGPU.** That is three's design and the physically correct blend, and our
   WebGL output already blends in linear light wherever the post stack runs (AB-R-1016). The acceptance excludes
   translucent materials from the backend look check. The other option, blending in sRGB on WebGPU through an 8-bit
   target, would need its own costing.
5. **Stay on three r187 with the six-line three-vrm patch** until a three-vrm release fixes #1889/#1890 and #1904
   to #1907. `--check` fails on any three-vrm bump that changes the patched file.
6. **Scripts are a Fountain subset with our own small parser.** Fountain is a plain-text screenplay format with an
   open spec. Writing our own parser means no dependency to vet, and it gives the script stable ids for keeping hand
   edits.
7. **The creator is its own app** (`apps/creator`, `apps/creator-mac`), as the PRD decided (§1). It shares the
   timeline and editor-core with the editor rather than being an editor mode.

## Open questions that don't block M4's start

- **Face capture's source.** *Decided 2026-11-23 (AB-D-0281, W9's spike, `spike-face/`, AB-R-1085): Vision's landmarks
  in the shell.* They give blink, mouth, smile, brows and head at 4 ms a frame with nothing to ship. MediaPipe's 52
  blendshapes run natively in 3 ms, but there is no MediaPipe build for a macOS Swift app; they stay the fallback if
  the live session (AB-T-0557) shows Vision isn't enough.
- **Episodes.** Do shorts chain sequences into episodes, with shared casting and continuity? Not in M4; asked again
  at M5.
- **Where TTS voices come from in a browser build.** The loopback stand-in serves the acceptance, and the shell serves
  the Mac app. A hosted voice service is out of scope.
- **Starter content (PRD question 9)** stays open beyond the sample short and the Gaea set.

## Risks

| Risk | Effect | Handling |
|---|---|---|
| WebGPU's r187 workarounds break on a three upgrade | Frames stop being exact, or the first frame is flat | Each gotcha has a test in W0–W2; three stays pinned; the acceptance runs both backends on every bump |
| three-vrm's patch drifts | MToon fails to link or looks wrong | `--check` in CI; the upstream issues and PRs are filed (#1904 to #1911); drop each edit when a release fixes it |
| WebKit's slow readback | 4K exports take longer | Measured in W10 against the 4-minute target; WebGL export stays available as a per-export choice |
| Script → sequence overwrites hand edits | People stop trusting the script pane | Stable ids per script element; hand-edited keys are marked and kept; tests for edit-then-rescript |
| Coverage rules make dull or broken films | Every short looks the same, or crosses the line | Rules are a start, not the film: every camera is editable; the 180° check is a lint, not a block |
| Face capture is too noisy for anime | Jittery expressions | Smoothing and thresholds per channel; the take is editable; the re-test in good light (AB-T-0557) comes first |
| Two apps share the timeline | A change for one breaks the other | The timeline moves into a shared package with its own tests before the creator uses it |
| Memory with TTS resident while rendering 4K | Swapping during an export | Voices bake before the export; models unload before the render queue runs; measured in W10 |

## Where things come from

| Piece | Source |
|---|---|
| The WebGPU render path and its gotchas | `spike-webgpu-render/` (AB-R-1005 to 1008), `spike-webgpu-mtoon/` (AB-R-1004, 1016) |
| The sequencer, cameras, post and export | M2 (`engine/packages/sequence`, `camera`, `post`, `export`), receipts AB-R-0994 to 1003 |
| Takes, the director and line baking | M3 (`engine/packages/director`, `content/sample/tools/bake-lines.mjs`), receipts AB-R-1020, 1021 |
| The camera and Vision in the shell | M3 W5 (`spike-camera/`, AB-R-1029), `apps/shell` CameraMethods |
| Personas and voices | VRMXA §10–§11, `@vrmxg/persona`, the shell's voice (AB-R-1037) |
| What an anime sequencer needs, and the reference designs | `research/cinematics.md` §2 |
| Fountain | The Fountain screenplay format's open spec (fountain.io) |
