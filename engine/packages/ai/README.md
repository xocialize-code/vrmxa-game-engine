# @vrmxg/ai

M2 W7 (AB-T-0530). NPC brains, as `research/npc-ai.md` recommends. Inside the 60 Hz step everything is deterministic, data-defined and in the snapshot:
- **perception** → **knowledge** (blackboard and stimulus memory) → **decision** (behaviour trees with a utility selector) → **action** (one vocabulary shared by trees, cues, MCP and, in M3, the director).

```js
import { installAi } from '@vrmxg/ai';
installAi(tree);                      // world.js and the MCP engine do this (after nav and interaction)
// in a scene: { "id": "hana-1", "type": "Character", "behaviours": [{ "use": "brain", "preset": "server", "vars": { "counter": [0.6, 0, -4.6] } }] }
ai.inject({ step: 120, agent: 'hana-1', action: { do: 'say', args: { text: 'Good morning!' } } }); // the director's hook
```

| Piece | What |
|---|---|
| `brain` behaviour | On a Character. Each tick: perception, then the tree. It ticks every `tickEvery` steps, four times slower beyond `lodDistance` from the player (the LOD). Randomness comes from its own stream (scene seed + node id). Blackboard, memory, tree state and running actions are its node state. `inspect()` gives the running branch, the utility scores, the blackboard and the memory (the debugger and MCP view) |
| Perception | **Sight:** a cone, a range, and a line-of-sight ray from the eyes past walls. **Hearing:** speech and other stimuli within their loudness, attenuated by `sensitivity`. **Proximity:** a radius. Each sensed thing becomes a memory record `{ kind, source, topic, pos, first, last, strength }`; strength rises while sensed, decays when not, and the record is forgotten after `maxAge`. Smart objects: `ai.adverts(node, verb)` lists items offering a verb, and a seat counts only while it has a free place |
| Trees (`bt.js`) | JSON nodes. Composites: `sequence`, `selector`, `parallel`, `utility`. Decorators: `repeat`, `invert`, `succeed`, `fail`, `guard`, `cooldown`. Leaves: `until`, `condition`, `action`, `set`, `choose`. Arguments may name blackboard values (`"$customer"`, `"$goal.params.customer"`, `"$self"`), and keys may too (`"greeted.$newcomer"`). `NODE_TYPES` describes them for the registry and MCP |
| Utility | Each option's score is the product of its considerations: an input (`goal`, `bb`, `memory`, `closeness`, `advert`, `test`, `random`, `constant`) through a curve, softened by its weight. The option's own weight multiplies that, and the running option gets a hysteresis bonus. Options are re-scored every `rate` ticks and whenever the running one ends; a switch cancels the abandoned option's actions |
| Curves | `linear`, `inverse`, whole-power `exponent`, `logistic` (a smoothstep stand-in), `bell`, `step`, `constant`. All polynomials, with no exp and no fractional pow |
| Actions | `say` (heard by others as speech, with a topic), `emote`, `gesture` (a one-shot slot), `lookAt`, `goTo` (along the navmesh; arriving where the mesh ends counts), `follow`, `interact` (sit, use, …, or stand), `setGoal` (yours or another agent's), `wait`. Each has a JSON Schema (`actionSchemas()`) |
| Presets | `wanderer`: reachable random points near home, pauses, and sits on a free seat now and then. `customer`: comes in, takes a free seat, calls the server over, orders when asked, waits, drinks, stands, leaves. `server`: greets newcomers, takes an order (walks over, asks, listens), makes it at the counter, brings it, and tends the counter otherwise. A scene can give a preset object in place of a name |
| Director hook | `inject` queues a goal or an action for a step. It applies at the agent's next tick (an action runs as an override the tree waits behind) and is logged; `record()` returns the log and `replay(log)` queues it again. A shot replays without calling the model (research §4.3) |

Measured:
- Acceptance check 14: Hana serves Mira. Mira sits (368), Hana greets her (453), asks (834), Mira orders (835), Hana acknowledges (963) and serves (2014), and Mira stands (2488) and leaves. It is identical at every step in Node, Chromium and WKWebView, and a snapshot mid-order re-simulates identically.
- `results/npcs.json` (Node 26, M5 Max), ten characters on brains in the cafe: the whole step costs 1.0 ms mean (p95 1.4); brains 0.04 ms and nav 0.09 ms of it.

Tests (`npm test`):
- curves, sequences with blackboard references, utility hysteresis and switching (cancelling the abandoned goTo), guard / until / cooldown / repeat, tree state resuming from a copy, presets compiling;
- on the cafe: the serving story in order, two runs identical, a snapshot mid-order replaying, and an injected decision landing on its step and replaying from the log.

Not yet:
- the editor's behaviour tree view;
- MCP tools for brains (W11);
- emote and gesture slots beyond the character's set;
- a crowd brain for audiences;
- the LLM director itself (M3, AB-D-0256).
