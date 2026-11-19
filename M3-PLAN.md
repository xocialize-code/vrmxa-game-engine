# VRMXG M3 plan: characters you talk to

*Draft, 2026-11-19. M3 picks from the PRD's "M3 Later" row (§8): persona-driven NPCs, ragdolls, vehicles, viewports and
split screen, networking, WebXR, WebGPU, and camera and gesture input. It builds on M2 (done 2026-11-18:
[acceptance/](acceptance/README.md), receipts AB-R-0994 to 1003). M2 built the behaviour trees, the action vocabulary
and the recorded-input hook "for M3's director" (AB-D-0256), and this milestone uses them.*

*The operator made three choices (decisions below):*
- *M3 centres on **characters you talk to**.*
- ***WebGPU, networking and WebXR move to M4.** WebGPU's blockers get research tasks that run in their own sessions.*
- *The **companion app starts in M3**, in its own folder, `vrmxa-companion`.*

*Filed as plan AB-P-0016, one bridge task per workstream (AB-T-0539 to 0552); decisions AB-D-0260 to 0262; WebGPU research AB-T-0553 and 0554; asks AB-A-0310 (the companion's bridge area), AB-A-0311 (`mlx-engine`: LLM tool calls and live STT) and AB-A-0312 (`mlx-solutions`: VoiceChatKit).*

## What M3 is done looking like

M3 is finished when **you can hold a spoken conversation with Hana in the cafe. What she says and does comes from her
persona, it acts on the world through the same actions her behaviour tree uses, and the whole conversation replays
exactly without the model.**

1. **A persona drives the character.** Hana's VRMXA persona (`personality`, `traits`, `speech_style`,
   `allowed_expressions`, `voice_id`; VRMXA §10) becomes two things:
   - a role profile: numbers that weight her utility scores, editable, stored as app persona (§10.2), never in the
     bundle;
   - the director's prompt, layered in §11's order: app framing, then core persona, then app memory, then the
     conversation.

   The director's tool schema is generated from the action registry and filtered for the character and the moment:
   - emotions come from her `allowed_expressions`;
   - gestures come from the slots her animation set fills;
   - targets come from ids she has perceived.

   Every reply is validated against that schema and against the world. A fixture set of bad replies is each rejected,
   and the tree carries on. The set covers malformed JSON, an unknown action, a face she isn't allowed, a gesture she
   has no clip for, and a target she hasn't seen.
2. **You talk, she answers.** In the playground's Mac app, the chain is:
   - you hold to talk, or speak hands-free with voice activity detection;
   - speech-to-text makes a transcript, and the director replies;
   - she says the reply with lip sync, from TTS with word timings.

   Measured on the M5 Max, the steady-state turn from the end of your speech to her first audio is at most 1.5 s.
   Behaviour covers the wait: she nods while you speak (`listen`) and looks away as she thinks (`think`). Past 1.5 s
   she says a short filler line. In a browser, the same conversation works typed, through the loopback stand-in.
3. **Her decisions act in the world.**
   - "Could I have a coffee?" becomes `setGoal` for her serving goal, and M2's server tree makes and brings it.
   - A follower told "wait by the door" goes there and waits.
   - On salient events she picks a goal from her role's list (goal choice).
   - Two characters with directors share one resident model through a queue. The character being spoken to goes first,
     and at most two requests are in flight.
4. **It replays exactly.** The input log records each decision as `{ step, agent, kind: "decision", calls, source:
   { model, promptHash } }`. The log also holds each user utterance, and the audio and timings of each line as assets.
   - A recorded two-minute conversation replays with no model running, with the same hash at every step in Node,
     Chromium and WKWebView.
   - Each pending span (between asking the model and its answer) is reproduced from the log's ticks.
   - A game saved mid-conversation loads and continues identically.
5. **A conversation becomes a shot.**
   - In the editor, a live take of a conversation records into a sequence as editable tracks: lines with their audio
     and timings, emotions, gestures and goals.
   - Regenerating one line is a single undoable edit.
   - The sequence exports the same frames twice, and a scrub draws exactly the exported frames.
   - The take's output aspect is fixed (AB-T-0538, carried over from M2).
6. **She sees you.** With the camera turned on:
   - Hana notices you (a presence stimulus) and looks toward you;
   - she answers a wave and a nod;
   - camera stimuli are inputs, logged with their step and replayed.

   The camera is off until you turn it on, and no frame leaves the device.
7. **Bodies and play** (the PRD's other M3 items that stay in M3; smaller):
   - **Ragdolls:** one mapping turns every VRM humanoid into capsules and joints. A character is knocked down,
     falls down the stairs and gets up, blending back into animation. It is deterministic and exact from snapshots.
   - **Vehicles:** a VRMXI vehicle on Rapier's raycast vehicle controller. Mira gets in, drives and gets out, and a
     recorded drive replays identically.
   - **Split screen:** two players on one keyboard and one gamepad get two viewports, each with its own camera brain.
8. **The companion app starts** in `../vrmxa-companion`, its own project from the start. It is a Mac app on the
   shared shell with the engine's packages, in one small room with one character from a `.vrmxa`. She:
   - idles with variety and looks at you;
   - holds a spoken conversation;
   - remembers your name between launches, as app memory keyed by her VRMXA id (§11).

   At idle it renders only when something changes, and its CPU and GPU use at idle are measured.
9. **Agents can direct a conversation.** Through MCP an agent can:
   - read a character's director state (pending request, prompt hash, log);
   - inject a decision;
   - play a recorded conversation;
   - edit a role profile.

   Each edit is undoable in the editor, and the tool list stays generic and under budget.
10. **M0, M1 and M2 still hold.** The acceptance, with the M3 checks added, re-runs green at the M3 commit in Node,
    Chromium and WKWebView.

Not in M3:
- **WebGPU** (M4). Its blockers are researched in parallel (see below).
- **Networking and WebXR** (M4).
- **The anime creator and game UI apps.**
- **Directors for every NPC.** Only the conversation and companion roles call the model; the rest stay on trees.
- **Cloth and soft bodies, iPhone, and a smaller-model tier for small Macs.** The model tier is an open question.

## Shape of the code

New since M2, with the same rules (JSDoc types, Node tests per package, the determinism lint on simulation packages,
Vue never holding engine objects):

```
engine/packages/
  director/     the LanguageModel adapter (shell bridge, loopback HTTP, scripted fixtures, replay); the request queue
                (one resident model, priorities, ≤ 2 in flight); prompts in VRMXA §11 order; tool schemas from the action
                registry, filtered per character and moment; reply validation and fallback; decisions → ai.inject at
                the next tick, logged
  persona/      VRMXA persona → role profile (numbers that weight utility), the allowed emotions and gestures, the voice;
                app persona and app memory as providers the app supplies (the engine stores neither)
  ai/           (grows) conversation behaviour: listen, think, gaze aversion, filler, turn-taking, endConversation; the
                conversation-partner and follower presets; goal lists per role
  voice/        (grows) live lines: the shell's tts.speak and the loopback server; each line's audio and timings
                recorded as assets
  input/        (grows) speech and camera stimuli as logged inputs; a second player's map
  sense/        camera presence, face direction and gestures (wave, nod, point) → stimuli; the camera's capture
                stays native or in the page, whichever the spike picks
  physics/      (grows) spherical and fixed joints, the ragdoll mapping and blend, the raycast vehicle
  item/         (grows) the vehicle item type and its seat
  render/post/  (grows) split screen: viewports with a brain each, the shadow map drawn once
apps/shell/     an optional voice product: mic capture, VAD, STT, LLM and TTS through MLXEngine, as the bridge methods
                stt.*, llm.respond and tts.speak
apps/editor/    record a take into a sequence; the director and persona inspectors
../vrmxa-companion/   the companion app (its own repository and bridge area)
```

- **The model is outside the step.** The director runs between steps. Its replies enter through `ai.inject`, the hook
  M2 built, at the first tick boundary after they arrive. Replay reads the log and never calls a model (research
  §4.3). The step's determinism boundary is unchanged (AB-D-0248).
- **One action vocabulary.** Tree leaves, sequence cues, MCP and the director's tool calls are the same registered
  actions. The director only narrows each action's schema; it adds no actions of its own.
- **Adapters at the seams.** The engine talks to a `LanguageModel`, a `SpeechToText` and the voice providers, never to
  MLXEngine directly. A scripted backend makes every test and acceptance check run without a model.
- **Privacy.** The microphone and camera are off until the user turns them on. Frames never leave the device.
  Conversation memory belongs to the app, not the engine or the bundle (VRMXA §11).

## Workstreams

Sizes are rough: S about a day, M a few days, L a week or more.

| # | Task | Workstream | Size | Needs | What |
|---|---|---|---|---|---|
| W0 | AB-T-0539 | **Director core** | L | none | `@vrmxg/director`: the `LanguageModel` adapter and its backends (shell, loopback, scripted, replay); the queue; prompts; tool schemas filtered from `actionSchemas()` per character and moment; validation against schema and world; fallback to the tree; decisions into `ai.inject` with `source { model, promptHash }`; the pending flag on the blackboard; timeouts |
| W1 | AB-T-0540 | **Personas** | M | none | `@vrmxg/persona`: VRMXA §10 persona → role profile (sociability, curiosity, boldness, energy, talkativeness, personal space, patience) weighting utility; derived once, editable, stored as app persona; the allowed emotions, filled gesture slots and voice; app memory as a provider; Hana's and the customer's personas |
| W2 | AB-T-0541 | **Conversation behaviour** | M | W0 | In `@vrmxg/ai`: `listen` (nods, gaze), `think` (gaze aversion), filler past 1.5 s, turn-taking, `endConversation`; conversation-partner and follower presets; goal lists per role and goal choice on salient events; commands ("wait by the door", "follow me") |
| W3 | AB-T-0542 | **Voice in and out** | L | W0 | An optional voice product in `apps/shell`: mic capture, VAD and live STT, the LLM with tool calls, and TTS with word timings (folds in AB-T-0537), through MLXEngine, as `stt.*`, `llm.respond` and `tts.speak`. Asks: `mlx-engine` AB-A-0311 (LLM tool calls, live STT) and AB-A-0308 (TTS), `mlx-solutions` AB-A-0312 (VoiceChatKit's capture, VAD and STT without its playback). A loopback stand-in (Python, mlx-lm and Kokoro, like `tts-server.py`) serves browsers and the acceptance; latency is measured end to end |
| W4 | AB-T-0543 | **Record, replay, bake** | M | W0, W3 | The conversation's log in the input log: utterances, decisions, each line's audio and timings as assets. Saves carry it, and replay needs no model. The editor records a live take into a sequence as editable tracks, and regenerating a line is one undo step. Fixes AB-T-0538 (the aspect in play takes) |
| W5 | AB-T-0544 | **Camera and gestures** | M | none | A short spike decides where capture runs: native capture in the shell (AVCapture, Vision or MediaPipe) or `getUserMedia` with MediaPipe in the page (the avatar studio's choice, AB-D-0241; the scheme origin may not count as a secure context). Then presence, face direction, wave, nod and point become stimuli logged as inputs, and the user's position maps into the room for look-at |
| W6 | AB-T-0545 | **Dialogue UI** | M | W0 | Typed chat for browsers, speech bubbles and captions in the world, choices. Text rendering follows AB-T-0536's spike (Slug vs troika-three-text), which is folded in here |
| W7 | AB-T-0546 | **Ragdolls** | M | none | Spherical and fixed joints in the physics adapter; one VRM humanoid → capsules and joints mapping; knockdown and get-up blended with the animation layers; snapshot-exact; powered ragdolls stay the Jolt trigger (PRD §5.5) |
| W8 | AB-T-0547 | **Vehicles** | M | none | Rapier's raycast vehicle behind the adapter; the VRMXI vehicle type (proposed on the open VRMXI review, AB-T-0513); seat, enter and exit verbs; a vehicle camera rig; a recorded drive replays identically |
| W9 | AB-T-0548 | **Split screen** | S | none | Two viewports with a camera brain each, a second player's action map (keyboard and gamepad), the shadow map drawn once, on M2's `renderViews` |
| W10 | AB-T-0549 | **MCP** | S | W0, W1, W4 | Director state, inject a decision, list and play conversation logs, edit a role profile; generic, under budget, undoable in the editor |
| W11 | AB-T-0550 | **Companion app v0** | L | W0, W1, W3 | In `../vrmxa-companion` with its own bridge area (AB-A-0310): a PRD, a Mac app on `apps/shell` and the engine's packages, a room, one character, idle variety, look-at, a spoken conversation, memory across launches, rendering on demand at idle. Runs concurrently in its own session |
| W12 | AB-T-0551 | **Content** | M | W2, W7, W8 | Hana as a conversation partner in the cafe; a follower; recorded conversations as fixtures; gestures (nod, shrug, point, laugh, wave); a fall on the stairs; a small vehicle; every file in `LICENCES.md` |
| W13 | AB-T-0552 | **M3 acceptance** | S | all | The ten checks above, run and filed as receipts; M0 to M2's re-run at the M3 commit |

```
W0 director ─┬─► W2 conversation ─┐
W1 personas ─┤                    ├─► W12 content ─┐
             ├─► W3 voice ─► W4 record + bake ─────┼─► W10 MCP ─► W13
             ├─► W6 dialogue UI ──────────────────┤
             └─► W11 companion (own repo, concurrent)
W5 camera + gestures ─────────────────────────────┤
W7 ragdolls ─┬────────────────────────────────────┤
W8 vehicles ─┘                                    │
W9 split screen ──────────────────────────────────┘
```

Six streams can start at once: the director, personas, camera and gestures, ragdolls, vehicles and split screen. Voice
can start against the loopback stand-in before MLXEngine answers.

## Running alongside M3

- **WebGPU research (M4's blockers),** in their own sessions:
  - AB-T-0553: three-vrm's MToon node material on three r187+ under `WebGPURenderer`;
  - AB-T-0554: the rest of the render path on WebGPU: the post stack in TSL, three.quarks, offline readback,
    deterministic frames, WebGPU in WKWebView.
- **The companion app** (W11), in its own session and repository from the start.

## Decisions made for M3 (2026-11-19)

1. **M3 centres on characters you talk to** (AB-D-0260). The exit checks centre on persona-driven conversation, its
   replay and its baking into shots. Ragdolls, vehicles and split screen stay in as smaller checks.
2. **WebGPU, networking and WebXR move to M4** (AB-D-0261). WebGPU's blockers are researched now, as their own tasks.
3. **The companion app starts in M3 in its own folder**, `vrmxa-companion`, as its own project (AB-D-0262). It consumes
   the engine and the shell by path, and gets its own bridge area.

Taken from research as defaults (say so if any should change):
- **Model:** *changed 2026-11-19 (AB-D-0265):* **LFM3-Omni-2B 4-bit, with the split turn.** The turn is a line call,
  then a JSON verdict call, salvaged part by part, with goodbyes decided by rule. The evaluation (AB-R-1018,
  `engine/packages/director/README.md`) scored it 26 of 31 cafe turns, with its line in about 90 ms. The first default,
  LFM2.5-8B-A1B int4 with reasoning skipped, scored 13 of 31, and every model was weak in one tool-calling call.
- **Speech:**
  - STT is MLXEngine's live plane (Nemotron) as VoiceChatKit uses it;
  - TTS is Kokoro with word timings (AB-A-0308);
  - the +30 ms timing correction stays in the engine (AB-R-0888).
- **The record:** the log, not a seed. Seeds help tests only.
- **Ragdolls, vehicles and split screen stay in M3.** They weren't moved to M4, so they are here as smaller checks
  (check 7).

## Open questions that don't block M3's start

- **How the shell reaches the model.** The shell can link MLXEngine packages in process, in an optional product so the
  editor and playground don't all carry it, or reach a service. The `mlx-engine` asks settle this; until then the
  loopback stand-in and the scripted backend carry the work.
- **A smaller-model tier.** LFM2.5, STT and TTS together sat at about 9.85 GB in VoiceChatKit. That is fine on the
  Studio, a concern for the companion on smaller Macs. Measure with AB-T-0511 (the base-Mac budget), now with the model
  resident.
- **The VRMXI review** (AB-T-0513) is still with the operator; the vehicle type is proposed on the same review.
- **Spokesmodel spots (PRD Q4)** and **starter content (Q9)** stay open.

## Risks

| Risk | Effect | Handling |
|---|---|---|
| Turns feel slow | Conversation feels broken | Non-reasoning replies, streamed TTS from the first sentence, `listen` / `think` / filler covering the gap; the turn is measured in each acceptance run |
| The model breaks the schema or invents ids | Wrong or impossible actions | Schemas narrowed per moment, validation against the world, fallback to the tree; constrained decoding where MLXEngine offers it; the bad-reply fixtures in the acceptance |
| MLXEngine's endpoints aren't ready | No live voice in the Mac apps | The loopback stand-in and scripted backend; the asks (AB-A-0308, 0311, 0312) filed at planning |
| Memory pressure with the model resident | Swapping, stalls on smaller Macs | One resident model, a queue, measured footprints; a smaller tier is an open question |
| Camera capture in the scheme origin | `getUserMedia` refused | The W5 spike picks native capture through the shell if the page can't |
| Live non-determinism leaks into the step | Replays diverge | Only `ai.inject` enters the step; decisions land on tick boundaries; the replay check compares every step's hash |
| Ragdoll joints explode or drift | Bad falls, replays diverge | Fixed solver iterations, limits per joint from the humanoid mapping, snapshot-exact tests |
| Privacy of the mic, the camera and memory | Trust | Off until turned on, frames on device, memory in the app under VRMXA §11 |

## Where things come from

| Piece | Source |
|---|---|
| Brains, actions, the recorded-input hook, sequences, export | M2 (`engine/packages/ai`, `sequence`, `export`), receipts AB-R-0994 to 1003 |
| The director's design, latency budget, tool schemas | `research/npc-ai.md` §4, §6 |
| Persona fields and memory rules | VRMXA §10–§11 (`../VRMXA_Specification/`) |
| Voice loop (capture, VAD, STT, streaming TTS) | `mlxengine-solutions/voice-chat-kit` (area `mlx-solutions`) |
| Lip sync and timings | `@vrmxg/voice`, AB-R-0888 |
| Body capture | the avatar studio's MediaPipe choice (AB-D-0241, AB-R-0911) |
| Physics joints and vehicles | `spike-physics/`, Rapier 0.21 (deterministic build) |
| Viewports | `@vrmxg/post` `renderViews` (M2 W3) |
