# @vrmxg/editor-core

M1 W7 (AB-T-0519). The editor's model without UI or three.js: a scene open for editing, its selection, undoable
commands, assets placed as nodes, save, and play in place. The editor app draws it; MCP can drive the same session
(W9); Node tests exercise it.

```js
import { EditorSession, assetList } from '@vrmxg/editor-core';
const s = new EditorSession({ registry, text, prefabs, path: 'cafe.vrmxs' });   // or EditorSession.empty(registry)
assetList(registry, projectFiles);        // [{ ref, kind: 'Character', nodeType: 'Character', … }]
const id = s.addFromAsset('characters/mira.vrmxa', { at: [0, 0, 4] });       // asset entry (reused) + node, one step
s.setTransform(id, { q: [0, 1, 0, 0] });  // "Rotate mira"
s.setProp('door-1', 'state', 'locked'); s.reparent('door-1', 'doors'); s.remove(['doors']);
s.setPropOn(['lamp-a', 'lamp-b'], 'intensity', 4);                  // M5 W4: "Set intensity on 2 nodes", one step
s.setTransforms([{ id: 'a', t: { p: [1, 0, 0] } }, { id: 'b', t: { p: [1, 2, 0] } }]); // "Move 2 nodes"
s.beginGesture(); s.withGesture(() => s.setProp('lamp-a', 'intensity', 2.5)); s.endGesture(); // a drag: one step
s.undo(); s.redo(); s.history();          // { undo: 'Delete doors', redo: null, … }
const text = s.save();                    // canonical .vrmxs: reopened, it serialises to the same bytes
const world = await s.startPlay((doc) => buildWorld(R, { ...sample, doc }, opts));   // a copy; edits refused
s.stopPlay(() => host.detach());          // { restored: true, hash, before }: the document as before Play
```

| Piece | What |
|---|---|
| Commands | Each is one undo step: a batch of `@vrmxg/scene`'s edit ops with a label (`Add mira`, `Move mira`, `Set door-1.state`, `Move door-1 under doors`, `Delete doors`). A refused edit (the schema, a cycle) leaves nothing behind. Deleting removes children and asset entries nothing uses any more |
| Assets | `assetList` reads a project's files: `.glb` → Model, `.vrmxa` / `.vrm` → Character, `.vrmxi` → Item, `.vrmxs` → Instance, the node type found through the registry (each type names the asset types it takes). `.vrmxw` is listed but not placed: wearables go on through a character's closet |
| Selection | Ids, the last one primary; it follows deletes, and undo doesn't reselect |
| Files | `text()` is the canonical serialisation, `hash()` its hash, `dirty` compares with what was saved, `validate()` runs the scene validator with the prefabs |
| Play in place | `startPlay(build)` snapshots the document (text and hash) and hands the builder a copy; `stopPlay(dispose)` checks the document is byte for byte as before (and puts it back if not) and restores the selection |
| Several nodes (M5 W4, AB-T-0601) | `setPropOn(ids, key, value)` and `setTransforms([{ id, t }])` edit a selection as one undo step; nodes that already hold the value get no op, and an invalid value changes none. A node with no props gets the whole `props` object (clearing its last prop removes it), so undo gives the node back byte for byte; `setProp` does the same |
| Gestures (M5 W4, AB-T-0600) | A number field's drag edits live and is one undo step: `beginGesture()` on its first move, its edits made through `withGesture(fn)`, `endGesture()` on release folds them into one (labelled as the last; each path's last set kept; none when the values came back), `cancelGesture()` (Escape) undoes them and leaves nothing to redo. Only `withGesture`'s edits belong to the drag: another edit meanwhile (MCP's) stays its own step, put back before the folded one, unless it touched a node the drag touched, when nothing is folded |
| Finite numbers | A value holding Infinity or NaN is refused by every edit (`@vrmxg/scene`'s add, set and setDoc) and reported by `validate()`: a file can't hold one |

Tests (`node --test test/`): the sample's asset list; building the cafe from it (add, move, edit, reparent, delete),
every step undone back to the empty scene and redone, saved and reopened byte for byte and valid; the committed cafe
opening unchanged; selection; play in place on a real SceneTree (a copy, edits refused, Stop restores the document and
the selection, the edit view never stepped); M5 W4's multi-node edits and gestures (`multi.test.mjs`).

## The timeline's model (M2 W5, AB-T-0528)

`timeline.js` and `sequence.js`: what the editor's timeline panel draws and does, with no UI, tested in Node.

| Piece | What |
|---|---|
| `TimelineGeometry` | One value (`pxPerFrame`, `visibleStart`) that the ruler, track headers and lanes all read, as `DesignScaffoldTimeline` does: `x(frame)`, `frameAt(x)`, `frames(px)`, `zoom(scale, anchor)` (the anchor stays put), `scroll`, `ticks(width, fps)` (the smallest step at least 56 px apart; majors each second, as timecode) |
| Snapping | `snapTargets(seq, { except, playhead })`: frame 0 and the end, markers, shot edges, keys and clip edges, the playhead (not the dragged item); `snapFrame(frame, targets, tolerance)` with the tolerance in frames from `SNAP_PX` (8) at the current zoom, so snapping feels the same at every zoom |
| `rowsOf(seq)` | The rows: the shots, then each track as keys or clips (`CLIP_TRACKS`; expression and post keys per channel) |
| `SequenceCommands` (`session.seq`) | `set`, `addTrack` / `removeTrack` / `setTrack`, `addKey` / `moveKey` / `setKey` / `removeKey` (kept sorted; a key landing on another replaces it), `addClip` / `moveClip` / `setClip` / `removeClip`, `addShot` (with a camera, its clip on the camera track in the same step) / `moveShot` (its camera clip follows) / `setShot` / `removeShot`, `addMarker` / `removeMarker`. Each copies the sequence, changes the copy, checks it with `checkSequence` (targets may be the set's nodes: `session.targetIds`) and puts it in with one `setDoc` op: one undo step, refused whole |
| `newSequenceDoc({ id, set, fps, duration })` | An empty sequence document; `session.isSequence`; `session.validate()` checks a sequence composed with its set (`session.setDoc`) |

`@vrmxg/scene` serializes a sequence block line by line (its scalars, then one shot, marker and track per line), so
moving a key changes one line, and saving then reopening gives the same bytes.

## The render queue (M4 W5, AB-T-0577)

`queue.js`: `RenderQueue({ runner, onChange })` renders jobs one at a time through a runner, and owns their order and
state (`queued`, `running`, `done`, `failed`, `cancelled`). `add({ short, ref, preset | size, fps, codec, audio,
subtitles, seconds, name })` takes a preset's values (`PRESETS`: draft 720p H.264, review 1080p H.264, master 1080p
ProRes 4444; `fps: null` is the sequence's own rate); `run()`, `cancel(id)` (a queued job never runs; the running one
sees its `AbortSignal`), `retry`, `remove`, `move`, `list()` (copies). A runner is `{ name, run(job, { progress,
signal }) }`. A runner error with `code: 'cancelled'` (a closed save panel) ends the job cancelled, not failed.
`stubRunner` renders nothing and reports the frames it would draw. **W10 fills this interface** with delivery export;
the creator's runner until then is the editor's M2 export through the shell (`apps/creator/src/host.js`). Tests:
`test/queue.test.mjs`.
