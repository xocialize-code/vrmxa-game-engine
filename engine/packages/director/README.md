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

Tests without a world cover:
- the schemas narrowed to a moment;
- fifteen bad-reply fixtures, each rejected with a reason;
- good replies normalised into `inject`'s form;
- the §11 prompt order and the hash.

Not yet:
- conversation behaviour on the wait (`listen`, `think`, filler; W2);
- personas from VRMXA bundles (W1);
- the shell's `llm.respond` and the loopback stand-in (W3);
- the request's history in saves, and baking a take into a sequence (W4);
- MCP tools (W10);
- requests in flight when a snapshot is restored live (W4 decides: cancel them, or keep their answers).
