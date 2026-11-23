# @vrmxg/editor-ui

M4 W5 (AB-T-0577). The Vue components the editor and the creator share, over `@vrmxg/editor-core`'s model. The
timeline moved here from `apps/editor`; the storyboard strip and the render queue panel are new. Each component holds
no engine objects: it reads plain data and emits commands, which the app applies (each edit one undo step).

```js
import Timeline from '@vrmxg/editor-ui/Timeline.vue';               // M2 W5's timeline: transport, ruler, lanes, side panel
import StoryboardStrip from '@vrmxg/editor-ui/StoryboardStrip.vue'; // a card per shot, from @vrmxg/coverage's storyboard()
import RenderQueue from '@vrmxg/editor-ui/RenderQueue.vue';         // editor-core's RenderQueue: presets, jobs, states
import { moveCommand, clipSpec, storyCards, jobStatus } from '@vrmxg/editor-ui'; // what they decide, with no Vue
```

| Component | Props → events |
|---|---|
| `Timeline.vue` | `data` (the host's `timeline()`: the sequence, `rowsOf` rows, cameras, characters, playhead, range, scrub state), `disabled` → `cmd(name, …args)` (a `SequenceCommands` call), `scrub(frame)`, `transport(what, value)`, `select(selection)`. `fit()` and `select(sel)` are exposed. Unchanged from the editor's, except that its edits are built by `timeline-ui.js` and it no longer places itself in the editor's grid (the editor's `.app > .timeline` does) |
| `StoryboardStrip.vue` | `board` (`storyboard(doc, { set })`), `thumbs` (by shot id: `{ url, frame }`; one drawn for another frame is stale and not shown), `beats` (the script's beats by id: `{ line, text }`), `playhead`, `selected`, `status` → `pick(shotId, frame)`, `line(scriptLine)`. Cards read as `Shot 020, 48 frames from 48, camera vc-cu-hana then vc-two, hand edit` |
| `RenderQueue.vue` | `jobs` (`RenderQueue.list()`), `runner` (its name), `canAdd`, `disabled` → `add({ preset, name })`, `run`, `cancel(id)`, `remove(id)`, `retry(id)`, `move(id, delta)`. Each job's status reads `job-1 done: 397 frames · first-light-720p24.mp4 · frames 83e834f6feeb3835` |

Ids are stable for AppProbe scenarios: the timeline's `#tl-*` (as in the editor's M2 scenario), the strip's `#sb-status` and
`#sb-<shot>`, the queue's `#q-preset-<name>`, `#q-add`, `#q-run`, `#q-<job>-status`.

Tests (`node --test test/`): every command the timeline emits for a move, trim, nudge, delete, form and field
(`timeline-ui.test.mjs`); the strip's cards and the queue's status lines (`storyboard-ui.test.mjs`); and the three
components compiled from their `.vue` files (`vue/compiler-sfc`) and rendered on the server (`vue/server-renderer`) with
sample data, checking their ids and accessible names (`components.test.mjs`, `sfc.mjs`). Compiled files go to
`test/.build/` (ignored) and are removed after import.
