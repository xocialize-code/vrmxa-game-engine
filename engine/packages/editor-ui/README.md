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

`closingQuestion({ dirty, canSave, memory, title, neverSaved, project, reason })` (M5 W8, AB-T-0593) is what a window
asks before it closes or the app quits, as plain data for the app's own sheet: null when nothing would be lost; Save,
Don't Save and Cancel where Save reaches the disk; Cancel and Close Anyway (or Quit Anyway) where it can't, as in the
bundled sample. The Mac shell asks the page first (`apps/shell`, `onClosing`); the editor and the creator answer with it.
`questions(show)` is the window's sheet: `ask(title, text, options)` resolves with the chosen option's id, `reply(id)`
answers it, and a second `ask` while one is up resolves `"cancel"` at once without being shown, so every question is
answered (a close that is waiting for its answer can't be orphaned by another one).

## The inspector's widgets (M5 W4, AB-T-0599 to 0602)

```js
import NumberField from '@vrmxg/editor-ui/NumberField.vue'; // drag, arrow keys, typed arithmetic ("1.5 * 2 + 0.25")
import ValueField from '@vrmxg/editor-ui/ValueField.vue';   // any prop's editor, from its JSON Schema and registry meta
import { inspectorFields, sharedFields, widgetOf, evalArithmetic } from '@vrmxg/editor-ui';
```

| Component | Props → events |
|---|---|
| `NumberField.vue` | `id`, `label`, `value`, `mixed`, `min`, `max`, `step`, `precision`, `integer`, `unit`, `disabled`, `grip` → `change(value)`, `gesture('begin' \| 'end' \| 'cancel')`. A real `<input>` (AppProbe's `set_value` commits it through the change event). Drag the grip, or the number itself, past 3 px: one `step` per pixel, Shift ×0.1, Alt ×10; arrow keys step; Return or leaving commits; Escape restores (or cancels a drag). Mixed: empty, "—", and `(mixed values)` in its name. Started from the operator's vue-three-inspector `NumberField.vue`, with its `new Function` replaced by a parser (`numbers.js`) and its time-window merge by the session's gesture |
| `ValueField.vue` | `id`, `label`, `schema`, `meta`, `value`, `fallback` (the default), `mixed`, `optional`, `disabled`, `nodes` → `change(newValue)` (the whole value, once per edit, as plain data), `gesture`. The widget is `widgetOf(schema, meta, value)`: number, boolean, enum, string, colour, node, asset, vec (one number field per axis), list (rows to add, remove and move, each its own fields), struct (its fields, then unknown keys, kept and removable; an unset nested block waits behind a `+ key` button), map (renamable keys), curve (`[frame, value, ease?]` keys with a preview), choice (an anyOf's branches), scalar (a value of several types), and a JSON text box only for an untyped field with no value. A game condition is edited under its `test`'s branch (`resolveSchema`, `fitBranch`) |

Ids and names come from the path: `#prop-lines-1-text` is "lines 2 text". A key's part is one to one (`idPart`:
letters and digits kept, anything else as `_<hex>_`, so "a b", "a.b" and "a-b" differ) and never holds `-`, so a field's
own controls follow `--`, which no key can give: rows `--up`, `--down`, `--remove`, lists `--add`, structs and maps
`--newkey` and `--addkey`, map keys `--key`, unset blocks `--set`, set optional fields `--clear`, choices `--kind`. `inspectorFields(describeType(reg,
type), node)` is a node's fields (value, default, widget, range, step and precision from the registry's meta, and
whether its `visibleIf` / `enabledIf` hold); `sharedFields([...])` merges several nodes' into one inspector: the props
they share with the same widget, mixed where their shown values differ, shown if any shows it, enabled if all do.

Ids are stable for AppProbe scenarios: the timeline's `#tl-*` (as in the editor's M2 scenario), the strip's `#sb-status` and
`#sb-<shot>`, the queue's `#q-preset-<name>`, `#q-add`, `#q-run`, `#q-<job>-status`.

Tests (`node --test test/`): every command the timeline emits for a move, trim, nudge, delete, form and field
(`timeline-ui.test.mjs`); the strip's cards and the queue's status lines (`storyboard-ui.test.mjs`); the closing
question's three cases (`closing-ui.test.mjs`); the number field's arithmetic, clamping, steps and drags
(`numbers.test.mjs`); every M0 prop's widget (none a JSON box), branches, valid new rows, edits that keep unknown keys,
a node's fields with its conditions and several nodes' mixed fields (`fields.test.mjs`); one question at a time (`questions.test.mjs`); and the three
components compiled from their `.vue` files (`vue/compiler-sfc`) and rendered on the server (`vue/server-renderer`) with
sample data, checking their ids and accessible names (`components.test.mjs`, `sfc.mjs`). Compiled files go to
`test/.build/` (ignored) and are removed after import.
