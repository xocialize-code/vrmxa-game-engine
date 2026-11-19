# @vrmxg/director

M3 W0 (AB-T-0539). The LLM director, as `research/npc-ai.md` §4 recommends. It makes persona-driven decisions **outside
the 60 Hz step**, and they enter the step only through `@vrmxg/ai`'s recorded-input hook (`ai.inject`). Everything that
changes the world is in the ai service's log, so a conversation replays with no model at all.

```js
import { installDirector, httpModel, shellModel, scriptedModel, replayModel } from '@vrmxg/director';
const director = installDirector(tree, {
  model: shellModel(native),                // or httpModel('http://127.0.0.1:8080/v1/chat/completions'), scriptedModel([...])
  persona: (id) => personas.get(id),        // the persona in effect: core with the app's laid over (VRMXA §10)
  memory: (id) => appMemory.summary(id),    // what the app remembers, as text (§11); the engine stores none
  user: 'mira', userName: 'Mira',           // the character the person speaks as
});
director.talk('hana-1', 'Could I get a latte?');   // the person says something
director.consider('hana-1', 'A customer came in.'); // goal choice on a salient event (W2 calls it)
// the host, after every step:
tree.step(); director.pump();
// replay: no model; the log carries every request and decision
W.ai.replay(recordedLog);                   // with installDirector(tree, { model: replayModel() })
```

| Piece | What |
|---|---|
| `LanguageModel` (`model.js`) | `{ name, respond(request) }`. `shellModel(native)` calls the Mac shell's `llm.respond` (MLXEngine; asked of `mlx-engine`, AB-A-0311). `httpModel(url)` talks to an OpenAI-compatible chat-completions server on loopback (mlx-lm's, for browsers). `scriptedModel(list \| fn, { latency })` answers from a script after `latency` steps: every test and acceptance check runs on it. `replayModel()` is never asked |
| Requests | `talk` (priority 0: the one being spoken to) and `consider` (priority 1). One shared queue, at most `maxInFlight` (2) at the model. A request gives up after `timeout` steps (240 = 4 s). Timeouts and scripted latency count steps, released by `pump()`; nothing reads a clock |
| The moment (`moment()`) | What the character can act on now: the people in its memory (sight, near, speech), the person (as `user`), items within `reach` and their verbs, its faces (the persona's `allowedExpressions` that its VRM has, else VRM 1.0's five emotions), its gestures (filled slots that aren't locomotion or item actions), and its goals (the persona's, else the brain preset's `goals`). Read between steps, never written |
| Prompts (`prompt.js`) | In VRMXA §11's order: the app's framing and the persona, then what the app remembers, then the conversation so far, then the moment and the newest line. `promptHash` (FNV-1a, 64 bits, key order ignored) names the request in the log |
| Tools (`schema.js`) | `toolsFor(moment)`: the ai vocabulary with its free strings narrowed to enums (emotions, gestures, people, items, verbs, goals), plus `endConversation`. A tool with nothing to choose from is left out. Coordinates are never offered |
| Validation | `validate(reply, moment, { exists })`: every call must match its tool's schema, every id must still be in the world, at most four calls, one line and one movement. Text with no calls is read as a line. Any fault rejects the whole reply, with reasons |
| Into the step | A request enters at once as `{ kind: 'request', bb: { director: { pending, since }, heard } }`: the tree sees the wait on its next tick (W2 plays `think` on it). A decision enters on the first tick after the reply arrives as `{ kind: 'decision', actions, goal, bb, meta: { source: { model, promptHash } } }`. `say` becomes its face, the line, its gesture and a look at the listener, started together. A rejected, failed or timed-out request enters as a decision with no calls: the wait clears and the tree carries on. A late answer is dropped |
| Conversation (M3 W2) | Inputs the director sends into the step:<br>• `talk` sets `bb.conversation { with, last }` and her reply renews it; `endConversation` clears it;<br>• `speaking(agent, on)` sets `bb.hearing` while the person speaks (from voice activity, W3) and starts a conversation;<br>• `watch(agent, node, signal, { reason, cooldown })` asks for goal choice when a signal fires, after the step it fired in, at most once per cooldown.<br>A decision that acts starts with `think { on: false }`, so she stops looking away as she answers. `user` in a goal's params becomes the person's node |
| `inspect(agent)` | Pending requests, the last one (calls or errors), and the conversation so far: for the debugger and MCP (W10) |

**The `ai` service's side** (in `@vrmxg/ai`, for this package):
- `inject` takes `actions` (started together; the tree waits until all are done), `bb` values, `kind` and `meta`.
- Injected arguments are literal: "$4.50" is text, never a blackboard reference.
- The snapshot and the hash hold only injected events already due. Events queued for later steps (a replayed log) are
  inputs, so a replay is the same world as the live run at every step. A restore keeps the tree's own later inputs.

Measured (Node 26, M5 Max, `npm test`, the sample cafe with a scripted model; needs `vrmxa-avatar-studio` beside the repo):
- **A conversation.** Mira asks for a latte at step 500. Hana is flagged waiting from step 501 and answers 30 steps later:
  a happy face, the line and a look at Mira, all on the same step.
  - Two live runs are the same world every 30 steps.
  - The log alone, with `replayModel()`, is the same world every 30 steps, and the model is never asked.
  - A snapshot taken while she waits (step 515), restored with the log's later entries, matches at every later sample.
- **Bad replies in the world.** Five bad replies (malformed JSON, an unknown action, a face she isn't allowed, a gesture
  she has no clip for, a target she hasn't seen) and a model error: each is rejected or failed with its reason. Nothing
  of them is said, and Hana still serves Mira.
- **A model that never answers** times out after 240 steps, and its late answer is dropped.

Conversation (M3 W2, `test/conversation.test.mjs`, the cafe):
- **Hana as `host`.** She listens while Mira speaks (looks at her, nods) and looks away while the reply is on its way.
  Past 1.5 s she says a filler line, then the reply. "Could I have a latte?" becomes `takeOrder` with the order, and
  she makes and brings it without asking again. Two runs and a replay of the log are the same world every 30 steps.
- **Lingering.** A talkative Hana (0.9) stays in a quiet conversation for about 18 s, a reserved one (0.1) about 6 s.
- **Hana as `follower`.** "Wait by the door" sends her to the entrance to wait there; "follow me" brings her back to
  Mira.
- **Goal choice** on a watched signal is asked after the step it fired in, and once per cooldown.
- **Turn-taking.** A reply that arrives while Mira is still speaking waits until she stops.

A spoken turn (M3 W3, `scripts/measure-turn.mjs` through the loopback stand-in `content/sample/tools/voice-server.py`,
M5 Max). Ten lines to Hana, each synthesised in another voice, transcribed by whisper-large-v3-turbo, answered by
LFM2.5-8B-A1B int4 (reasoning skipped) with her real prompt and tools, and her line synthesised by Kokoro:
- **Latency meets the target, with the GPU to itself.** STT + LLM + TTS took a median 0.59–0.95 s (max 1.63 s), about
  1.0–1.4 s from the end of speech once the detector's 450 ms wait is added.
  - With other models running on the GPU (a Gaea z-image worker and TRELLIS.2), it took a median 1.2–1.8 s
    (these first runs' files are superseded by the split turn's measurement below).
- **Speech-to-text was word-perfect** on all ten lines.
- **The model is not reliable enough yet.**
  - Across the runs, 3–6 of 10 replies had no line: an action alone, a line over 400 characters, or its tool call
    written as markup in the text. At temperature 0.2, half the lines were markup.
  - Some lines echoed the person ("Do you have any non-milk options today?").
  - The latte request became `takeOrder` on the wrong turn, or not at all.

  The validator now rejects a line holding markup (`MARKUP`): before that, some of it would have been spoken.

  The prompt now puts the situation in the system prompt and the person's words alone in the newest turn. It asks for
  exactly one line per reply, in her own words. That cut the echoes but did not fix the rest. Choosing the director's
  model (another model, reasoning on, or constrained decoding) is open.

**The director's design and model** (AB-D-0265, the operator's choice after the evaluation below): `Director` makes
the split turn by default (`design: 'split'`; `design: 'one'` keeps the one-call turn, which the W0 and W2 tests use):
1. Her line is asked for first. It enters the step as soon as it arrives, with `think` off, the line and a look, so she
   speaks while the verdict is asked for.
2. The verdict follows as a second decision (`meta.part: 'verdict'`): what validated (face, gesture, action, goal),
   what was dropped, and `endConversation` after a goodbye, by rule.
3. If the verdict fails or times out, the line stands, and the goodbye rule still applies.
4. A goal choice with no one speaking (`consider`) is a verdict alone.

The default model is LFM3-Omni-2B 4-bit. A spoken turn on it (`scripts/measure-turn.mjs`, `results/turn-omni4.json`;
Omni hears through its own ASR, Kokoro speaks from `tts-server.py`; M5 Max, with TRELLIS.2 running):
- **First audio:** median 638 ms (max 964 ms) for STT 164 + line 277 + TTS 211. That is about 1.1 s from the end of
  speech with the detector's 450 ms.
- **Lines:** 10 of 10 valid.
- **Hearing:** 9 of 10 heard word for word. The tenth was "Good morning, Hanath."
- **The verdict:** median 718 ms, while she speaks.

Tests: `test/split-cafe.test.mjs` runs on the cafe:
- the line, then the verdict, with the order made and brought, and a replay of the log the same world;
- a goodbye ended by rule though the verdict was not JSON;
- a verdict that never comes, leaving the line;
- a goal choice as a verdict alone.

**Choosing the director's model** (`scripts/eval-models.mjs`; `results/models.json`, every reply in `results/models.md`).
Setup:
- **Turns:** 31 typed turns to Hana, scored by checks: small talk, orders, things that only sound like orders, looking at
  and using things, goodbyes and things that only sound like them, and a follower's commands.
- **Prompt and validation:** the director's real prompt, tools and validation.
- **Models:** four local models through the stand-in (`voice-server.py --llm lfm25,omni4,lfm3fast,qwen4`), greedy.
- **Designs:** one call with tools (W0), and the split turn (`split.js`): a line call, then a JSON verdict call. The
  split comes from the companion's spike, AB-R-1017.

A turn passes when its reply is valid, it has a clean line (no echo, at most 200 characters), and every check holds.
M5 Max, with other GPU work running (a Bernini job and a Swift build), so the times are relative:

| Model | Design | Passed | Valid with a line | Echoes | Checks | Reply ms median / p90 | Line ms |
|---|---|---|---|---|---|---|---|
| LFM2.5-8B-A1B int4 (reasoning skipped) | one | **14/31** | 21 | 2 | 28/39 | 201 / 301 | 201 |
| LFM2.5-8B-A1B int4 (reasoning skipped) | split | **13/31** | 31 | 6 | 26/39 | 328 / 446 | 98 |
| LFM3-Omni-2B 4-bit | one | **15/31** | 25 | 2 | 25/39 | 156 / 186 | 156 |
| LFM3-Omni-2B 4-bit | split | **26/31** | 31 | 1 | 35/39 | 303 / 450 | 87 |
| LFM3-1.7B 8-bit (thinking off) | one | **13/31** | 14 | 0 | 20/39 | 234 / 298 | 234 |
| LFM3-1.7B 8-bit (thinking off) | split | **13/31** | 31 | 0 | 21/39 | 590 / 751 | 137 |
| Qwen3-VL-4B-Instruct 4-bit | one | **17/31** | 21 | 0 | 32/39 | 539 / 583 | 539 |
| Qwen3-VL-4B-Instruct 4-bit | split | **27/31** | 31 | 0 | 35/39 | 748 / 1169 | 221 |

- **The split turn is the design.** In one call, every model often left out the line, or failed on orders and
  commands (0 of 6 orders, 0 of 5 commands for all four). Qwen chose the right goals in one call but spoke only about
  two times in three. With the split, every model gave a valid line on every turn.
- **The split works with `salvage`.** The line must stand alone. Each verdict part (face, gesture, action, goal) is
  kept only if it validates on its own, after `normalizeVerdict` maps the shapes models write instead:
  - a verb as the action;
  - a goal as the action, or as a string;
  - a name where an id belongs;
  - a missing target, customer or order.

  Goodbyes are decided by rule (`isGoodbye`). Validating the verdict whole (the first run) cut the split's passes
  roughly in half.
- **Two models lead.**
  - **LFM3-Omni-2B 4-bit** passed 26 of 31, with its line in about 90 ms and the whole turn in about 300 ms. It missed
    two of five commands and one "use".
  - **Qwen3-VL-4B-Instruct 4-bit** passed 27 of 31, with every order and every command right. It is about 2.5 times
    slower: its line takes about 220 ms and the whole turn about 750 ms. Its misses were extra goals and actions nobody
    asked for (an order on "Good morning"), and its lines run sharper in tone.
  - LFM2.5, the plan's default, passed 13 of 31 and echoed six lines.
- **What the numbers don't judge:** character. A person's read of `results/models.md` decides between the two leaders'
  voices, as the companion's spike also found.
- **One caution about the order checks:** when a model gives `takeOrder` without the order, the person's words fill
  it. That is engine behaviour (the host's tree only needs to know there is an order), but it helps those checks pass.

Tests without a world cover:
- the schemas narrowed to a moment;
- fifteen bad-reply fixtures, each rejected with a reason;
- good replies normalised into `inject`'s form;
- the §11 prompt order and the hash.

Not yet:
- the shell's `llm.respond` (W3; waits on `mlx-engine`, AB-A-0311);
- a person's read of Omni's character, and a prompt pass (AB-R-1017 found it repetitive as prompted);
- the request's history in saves, and baking a take into a sequence (W4);
- MCP tools (W10);
- requests in flight when a snapshot is restored live (W4 decides: cancel them, or keep their answers).
