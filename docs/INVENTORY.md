# Documentation inventory

Everything in VRMXG that needs documenting, and what phase 1 of the documentation site (AB-T-0611) does about each.
This file is the plan for the site, not a page of it.

**Who reads it**

| | Reader | What they want |
|---|---|---|
| **S** | Someone making a short | Write a script, cast it, voice it, film it, export it. Uses the creator; doesn't read code |
| **G** | A game builder | Build scenes and small games: nodes, behaviours, items, input, save. Uses the editor and the packages |
| **A** | An agent | Inspect, build and drive scenes and shorts through MCP. Reads `llms.txt` and the reference |
| **C** | An engine contributor | Change the engine without breaking replay. Reads the rules, the READMEs and the acceptance |

**Stable or moving.** *Stable* means no open task or plan item changes what a reader would be told. *Moving* names the
task that changes it. This is the documentation session's reading of the open tasks on 2026-11-23, not a promise.

**Phase 1** is one of:
- **generated**: a page under `docs/reference/`, written by `scripts/docs-reference.mjs` from the code, so it can't go
  stale (`npm run check` fails when it is);
- **page**: a hand-written page under `docs/guide/`;
- **line**: one line in the generated package list, with its README as the manual until phase 2;
- **later**: nothing yet, and why.

## Engine packages (`engine/packages/`)

| Package | Readers | Source of truth today | Stable? | Phase 1 |
|---|---|---|---|---|
| `ai` | G A | `engine/packages/ai/README.md` | Stable | line |
| `audio` | G S | `engine/packages/audio/README.md` | Stable | line |
| `camera` | G S | `engine/packages/camera/README.md`; node props in the registry | Stable | line; its nodes generated |
| `cast` | S A | `engine/packages/cast/README.md` | Stable | line |
| `character` | G S | `engine/packages/character/README.md`; node props in the registry | Moving: masked, layered blend trees (AB-T-0609) | line; its node generated |
| `closet` | G | `engine/packages/closet/README.md`; the closet protocol in `VRMXA_Specification` | Stable here; the protocol is owned elsewhere | line |
| `core` | G C | `engine/packages/core/README.md` | Stable | line; page (determinism: the clock, the step order) |
| `coverage` | S A | `engine/packages/coverage/README.md` | Moving a little: AB-T-0597 (cameras outside the set, profiles) | line |
| `director` | G A | `engine/packages/director/README.md` | Moving: W9's director takes (AB-T-0581) | line |
| `dmath` | C G | `engine/packages/dmath/README.md` | Stable. A version bump breaks replays on purpose | line; page (determinism) |
| `editor-core` | C | `engine/packages/editor-core/README.md` | Moving: AB-T-0599 to 0607, W9 | line |
| `editor-ui` | C | `engine/packages/editor-ui/README.md` | Moving: AB-T-0599 to 0607, W9 | line |
| `export` | S C | `engine/packages/export/README.md` | Moving a little: frame 0 (AB-T-0595), first WebGPU frame (AB-T-0596), the redraw check's default (AB-D-0280, AB-T-0591) | line; `delivery.json` generated |
| `input` | G | `engine/packages/input/README.md` | Stable | line |
| `interact` | G | `engine/packages/interact/README.md` | Stable | line |
| `item` | G | `engine/packages/item/README.md`; the VRMXI draft in `VRMXA_Specification` | Moving: VRMXI is draft 0.1, under review (AB-T-0513) | line; its node generated |
| `mcp` | A | `engine/packages/mcp/README.md`; the tool lists in `src/tools.js` and `src/shorts.js` | Stable. The creator's commands grow with W9 | generated; page (agents and MCP) |
| `model` | G | `engine/packages/model/README.md` | Stable | line |
| `nav` | G | `engine/packages/nav/README.md` | Stable | line |
| `particles` | G S | `engine/packages/particles/README.md` | Stable | line; its node generated |
| `persona` | G A | `engine/packages/persona/README.md`; VRMXA §10–§11 | Stable | line |
| `physics` | G | `engine/packages/physics/README.md`; node props in the registry | Stable | line; its nodes generated |
| `post` | S G | `engine/packages/post/README.md` | Stable | line |
| `registry` | A G C | The code: `engine/packages/registry/src/` (no README) | Moving a little: conditional fields (AB-T-0602) add to the prop schema | generated (node types, props, signals, actions, behaviours) |
| `render` | C G | `engine/packages/render/README.md` | Stable | line |
| `save` | G | `engine/packages/save/README.md` | Stable | line |
| `scene` | A G C | The code: `engine/packages/scene/src/` (no README); PRD §4.1 | Stable | generated (`.vrmxs`); page (the scene format) |
| `script` | S A | `engine/packages/script/README.md`; `src/vocab.js` | Stable | generated (the Fountain subset) |
| `sense` | G | `engine/packages/sense/README.md` | Moving a little: the re-test in good light (AB-T-0557) | line |
| `sequence` | S A G | `engine/packages/sequence/README.md` | Stable | line; page (the scene format, sequences) |
| `snapshot` | C G | `engine/packages/snapshot/README.md` | Stable | line; page (determinism: snapshots, replay) |
| `takes` | S A | `engine/packages/takes/README.md` | Moving a little: the face filter's thresholds wait on a session with a real camera (AB-T-0557) | line |
| `text` | G S | `engine/packages/text/README.md` | Moving: our own text renderer replaces troika (AB-T-0556) | line |
| `tracks` | S G | `engine/packages/tracks/README.md` | Stable | line |
| `voice` | S G | `engine/packages/voice/README.md` | Stable | line |
| `voicing` | S A | `engine/packages/voicing/README.md` | Stable | line |

Also in the workspace:

| What | Readers | Source of truth today | Stable? | Phase 1 |
|---|---|---|---|---|
| `engine/vendor/three-vrm` and `engine/patches/` (the MToon patch) | C | `CLAUDE.md`; `scripts/patch-three-vrm.mjs`; AB-D-0274 | Stable until three-vrm releases the fixes | later (contributor notes) |
| `tools/eslint-plugin-vrmxg` (`vrmxg/deterministic`) | C | Its source and tests; AB-D-0248 | Stable | page (determinism names the rule) |

## Apps (`apps/`)

| App | Readers | Source of truth today | Stable? | Phase 1 |
|---|---|---|---|---|
| `creator` (the anime creator) | S A | `apps/creator/README.md` | Moving: the unsaved-changes sheet (AB-T-0593), the inspector work (AB-T-0599 to 0607). Performance takes are in (W9, AB-T-0581); their live check with a camera waits (AB-T-0557) | **later**: the guide waits for the UI. Its MCP commands and `shorts.json` are generated; how to run it is on the running page |
| `creator-mac` | S | `apps/creator-mac/README.md`; the AppProbe scenario in `docs/hand-test/` | Moving with the creator | later, with the creator's guide |
| `editor` | G A | `apps/editor/README.md` | Moving: AB-T-0599 to 0607 rework the inspector, the viewport and the assets panel; AB-T-0592 | **later**: the guide waits for the UI. How to run it is on the running page |
| `editor-mac` | G | `apps/editor-mac/README.md`; the AppProbe scenarios | Moving with the editor | later, with the editor's guide |
| `playground` | C G | `apps/playground/README.md` | Stable (a test harness, not a product) | page (running the apps) |
| `playground-mac` | C | `apps/playground-mac/README.md` | Stable | page (running the apps) |
| `shell` (the shared Mac shell, Swift) | C | `apps/shell/README.md`, `apps/shell/Voice/README.md` | Moving: AB-T-0593 (ask before closing), AB-A-0324 (a ZONOS3 voice backend) | later: a bridge-method reference generated from the shell is a phase 2 candidate |

## Formats

| Format | Readers | Source of truth today | Stable? | Phase 1 |
|---|---|---|---|---|
| `.vrmxs` scene | A G S | `@vrmxg/scene`'s `documentSchema` over the registry; PRD §4.1 (AB-D-0246) | Stable (version 1) | generated (fields, and the JSON Schema as a file); page (the scene format) |
| The `sequence` block of a `.vrmxs` (shots, markers, tracks, cast) | S A | `engine/packages/sequence/README.md`, `engine/packages/tracks/README.md`; `checkSequence` | Stable. It has no JSON Schema: it is checked by code | page (the scene format, in outline); a generated reference needs a schema first (phase 2) |
| The Fountain subset (`.fountain`) | S A | `@vrmxg/script`: `src/parse.js`, `src/vocab.js`, its README (AB-D-0275) | Stable | generated |
| `shorts.json` (`vrmxg-shorts`) | S A | `apps/creator/src/shorts.js` | Stable (version 1) | generated |
| `delivery.json` (`vrmxg-delivery`) | S A | `apps/creator/src/delivery.js`, `@vrmxg/export`'s `deliveryFiles`, `@vrmxg/editor-core`'s presets | Stable (version 1). It has no schema: the page quotes the code that writes it | generated |
| `.vrmxa`, `.vrmxw` | S G | `VRMXA_Specification` (owned by another area) | Draft specs, owned elsewhere | page (the format family), linking out; never copied here |
| `.vrmxi` | G | `VRMXI-base-draft.md` in `VRMXA_Specification`; `@vrmxg/item` | Moving: draft 0.1 under review (AB-T-0513) | page (the format family) names it; its reference and editor are phase 2 |
| Marks (`scripts/*-marks.json`) | S | `@vrmxg/script`'s build, `content/sample/scripts/cafe-marks.json` | Stable | later (with the script-to-film tutorial) |
| Takes (`vrmxg-take`), input recordings | G S | `@vrmxg/director`, `@vrmxg/input` READMEs | Stable | later |
| Performance take logs (`vrmxg-performance`, in `performances/`) | S A | `engine/packages/takes/README.md` | Stable (version 1); the face take's settings may be tuned (AB-T-0557) | later (with the creator's guide) |
| Brains (`vrmxg-brain`) | G A | `engine/packages/ai/README.md` | Stable | later |
| Personas (`vrmxg-personas`, `vrmxa-persona`) | G A | `engine/packages/persona/README.md`; VRMXA §10–§11 | Stable | later |
| Effects (`vrmxg-effect`) | G S | `engine/packages/particles/README.md` | Stable | later |
| `animations.json` (`vrmxa-animations`) | G | VRMXA §8; `engine/packages/character/README.md` | Owned by the VRMXA spec | later |
| Word timings (`vrmxg-word-timings`), voice clips | S | `engine/packages/voice/README.md`, `engine/packages/voicing/README.md` | Stable | later |
| Save files | G | `engine/packages/save/README.md` | Stable | later |
| The project file (`vrmxg.json`: input map, autoloads) | G | PRD §4; `@vrmxg/core` `loadServices`, `@vrmxg/input` | Not specified yet (PRD: "to specify") | later |

## Tools

| Tool | Readers | Source of truth today | Stable? | Phase 1 |
|---|---|---|---|---|
| `vrmxg-mcp` (headless: a project and a scene) | A | `engine/packages/mcp/src/tools.js` (`toolList`, `INSTRUCTIONS`) | Stable | generated; page (agents and MCP) |
| `vrmxg-mcp --editor` | A | The same list in `editor` mode; `apps/editor/src/mcp.js` | Stable | generated; page |
| `vrmxg-mcp --creator` | A S | `engine/packages/mcp/src/shorts.js` (`shortToolList`, `SHORT_INSTRUCTIONS`); the commands in `apps/creator/src/agent.js` | Stable; commands grow with W9 | generated; page |
| `engine/packages/mcp/tools/beats.mjs` | S A | Its header; `engine/packages/mcp/README.md` | Stable | later |
| `acceptance/` runners (`node.mjs`, `chromium.mjs`, `wkwebview.sh`, `compare.mjs`, `matrix.mjs`, `classify.mjs`, `m2/`, `m3/`, `m4/`) | C | `acceptance/README.md` | Moving: M4's acceptance (W13, AB-T-0585) adds its checks | page (acceptance and exactness), in outline; the README stays the record |
| `acceptance/gpu-lock.mjs` | C A | `acceptance/README.md`, "Exactness" | Stable | page (acceptance and exactness) |
| `content/sample/` (the sample project) | S G A | `content/sample/README.md`, `LICENCES.md` | Stable; grows with each milestone | page (running the apps and the sample) |
| `content/sample/tools/` build tools: `make-content`, `make-scenes`, `make-script-sequence`, `cast-short`, `bake-lines`, `make-short-take`, `replay-short`, `make-park`, `make-stairs`, `make-vehicle`, `make-input`, `make-take`, `make-conversation`, `make-follow-take`, `make-camera-demo`, `make-sounds`, `make-lut`, `generate-prop`, `generate-park`, `make-fonts.py`, `make-voice.py`, `kokoro_tts.py` | C S | Each file's header; `content/sample/README.md` | Stable | page names the four a short is built with; the rest later |
| `content/sample/tools/tts-server.py`, `voice-server.py` (loopback voice stand-ins) | S G | Their headers; `content/sample/README.md` | Stable; the shell's voice replaces them in the Mac apps | later (with the tutorial) |
| `content/sample/tools/check-licences.mjs` | C | Its header; CI | Stable | later (contributor notes) |
| `scripts/patch-three-vrm.mjs` | C | Its header; `CLAUDE.md` | Stable | later (contributor notes) |
| `scripts/docs-reference.mjs`, `scripts/docs-links.mjs` | C | `docs/README.md` | New in phase 1 | `docs/README.md` |

## Concepts and rules

| Subject | Readers | Source of truth today | Stable? | Phase 1 |
|---|---|---|---|---|
| What VRMXG is, who it's for, the principles | S G A | `VRMXG-PRD.md` §1–§3 | Stable | page |
| Determinism: the fixed 60 Hz step, `dmath`, no `**`, snapshots, replay, the lint rule | G A C | `CLAUDE.md` rules; `dmath`, `core`, `snapshot` READMEs; AB-D-0245, AB-D-0248, AB-L-0345 | Stable | page |
| The format family and the VRMXW / VRMXI split | S G A | PRD §4 | Stable in shape; VRMXI is a draft | page |
| Running the apps and the sample project | S G | The apps' READMEs, `content/sample/README.md` | Commands stable; UIs moving | page (commands only, no how-to) |
| Agents: describe then command, one edit is one undo step, content from files is data | A | `INSTRUCTIONS`, `SHORT_INSTRUCTIONS`; PRD principle 5 | Stable | page; `llms.txt` |
| Acceptance and exactness: the checks, the backend matrix, the GPU lock | C | `acceptance/README.md`; AB-D-0278, AB-D-0279 | Stable in method; results grow | page |
| Rendering backends (WebGPU default, WebGL fallback), the look between them | S C | `engine/packages/render/README.md`, `post/README.md`; AB-D-0273 | Stable | acceptance page mentions it; its own page is phase 2 |
| A VRMXG skill for agents (the second half of AB-T-0608) | A | Not written | n/a | later: AB-T-0608 |
| The Godot feature map and priorities | G | PRD §5 | A plan, changes each milestone | later (a "what exists" page generated from the registry and packages is the better answer) |
| Milestone plans, spikes, research | C | `M0-PLAN.md` to `M4-PLAN.md`, `spike-*/README.md`, `research/` | History | not documented on the site; they stay in the repository |

## Phase 2 (not in this pass)

- **Guides for the creator and the editor, with screenshots**, once W9 and AB-T-0599 to 0607 have landed.
- **A tutorial: a script to an exported short**, on the sample project.
- **The VRMXI editor** and a VRMXI reference, once the draft is reviewed.
- A generated reference for the sequence block and the track types (needs a schema), and for the shell's bridge methods.
- One page per package where the README is long enough to be a manual (cast, coverage, director, post, voicing).
- The VRMXG skill (AB-T-0608).
