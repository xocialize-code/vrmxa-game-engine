# @vrmxg/save

M2 W9 (AB-T-0532). Save games. A save is the world snapshot (`@vrmxg/snapshot`) in a versioned file. The snapshot holds every node and every service: physics bytes, inventories, the closet, the crowd, NPC brains and their memory, and the flags kept here. The file also names what it needs to replay the same.

```js
import { installSave, IndexedDBStore, ShellStore } from '@vrmxg/save';
const save = installSave(tree, { scene: { ref: 'cafe.vrmxs', doc } }); // world.js does this
save.setFlag('keyFound');
const file = save.save({ name: 'Slot one', savedAt: new Date().toISOString() });  // plain JSON
await store.write('slot-1', file);
// later, into a fresh world of the same scene:
await fresh.services.get('save').load(await store.read('slot-1'));  // → the step play goes on from
```

| Piece | What |
|---|---|
| The file | `{ format: "vrmxg-save", version, name, savedAt, requires, summary, snapshot }`. Typed arrays travel as base64 markers, exact (our own base64, the same bytes in every runtime). `summary` is what a slot list shows: step, seconds, scene, characters, flags, inventories |
| `requires` | The snapshot format; the Rapier build (snapshots replay only on the build that made them); a fingerprint of the portable maths (`@vrmxg/dmath` at fixed inputs, since another dmath changes every hash); the services with state; the scene's ref and hash |
| `check(file)` / `load(file)` | Loading refuses a file whose requirements differ and says which: "made with Rapier …", "the scene now is …". It brings each body to the saved look (`closet.adoptLook`, a redraw outside the step, for drawn-in clothing), then restores the snapshot. Input recordings replay from the clock's step, so a take replays on after a load |
| `cannotSave()` | A closet redraw in flight refuses a save (its result lands on a later step) |
| Stores | `ShellStore` (the Mac shell's `saves.*`: the app's own folder, no panels), `IndexedDBStore` (a browser), `MemoryStore`, and `FsStore` (`@vrmxg/save/node`, files in a folder). Same shape for all: `list`, `read`, `write`, `remove`. A listing's entry has the save's `build` (the game build's digest, `extra.build.digest`), `game` (its game id) and `compat` (that build's save-compatibility fingerprint as `{ format, version, digest, parts }`, M6 W5), so a slot list can tell a save it can't load, and why, without reading it |

**In the apps:**
- The playground has three slots (Save, Load) in the toolbar.
- The editor has Save Game in play mode, plus Load Game, which starts a play of the scene as it is and refuses a save made before the scene was edited.

Measured (acceptance check 15):
- The take with items, saved at step 720 after the sword went into Mira's closet: 235 KB, saved in 3 ms, loaded in 17–24 ms.
- In Node, Chromium and WKWebView it is the same file, and loaded into a fresh world the remaining 948 steps hash identically everywhere and identically to the run that never stopped.

Tests (`npm test`):
- encode / decode (typed arrays, −0, NaN, maps; base64 against the platform's);
- a world with physics saved mid-fall, loaded, and the same per-step hashes after; flags back;
- refusals with their reasons;
- memory and file stores;
- on the cafe: the take with items saved after the sword, written to a file, loaded, the same hashes to the end.

`save({ extra })` (M3 W4) carries app data outside the simulation, which the world never reads: the director's
conversation history, which its prompts need after a load (`director.getHistory()` / `setHistory()`). After loading
into a live world, `director.resume()` asks again any question the save caught on its way to the model. In a replay,
the log's entries after the save point are queued again (`ai.replay(log.filter((e) => e.step > step))`).
