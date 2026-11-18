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

Tests (`node --test test/`): the sample's asset list; building the cafe from it (add, move, edit, reparent, delete),
every step undone back to the empty scene and redone, saved and reopened byte for byte and valid; the committed cafe
opening unchanged; selection; play in place on a real SceneTree (a copy, edits refused, Stop restores the document and
the selection, the edit view never stepped).
