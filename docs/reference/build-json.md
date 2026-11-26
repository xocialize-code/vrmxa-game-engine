---
title: "vrmxg-build.json"
description: "A game build's manifest: the game, the runtime it was made with, and every file with its SHA-256 and licence."
order: 84
---

# vrmxg-build.json

> Generated from `@vrmxg/bundle` (`makeManifest`, its README) by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

A game build is a web folder: the runtime, the project's files under `project/`, and `vrmxg-build.json`, which lists
every other file with its SHA-256 and its licence. `format` is `"vrmxg-build"`, `version` `1`, and a
runtime keeps contract 1 (its own table is `vrmxg-runtime.json`).

## Layout

```
<build>/
  vrmxg-build.json          the manifest: every file in the folder is one it lists
  index.html                the runtime's entry: what a browser or the Mac shell opens
  assets/…, vrmxg-core.js   the rest of the runtime, at the runtime's own paths
  THIRD-PARTY-LICENCES.txt  the licence texts of what the runtime includes
  project/                  the game's files at their refs
    game.json, LICENCES.md, cafe.vrmxs, behaviours.js, characters/mira.vrmxa, …
```

Serve the folder from any origin and open `index.html`; the Mac game app wraps the folder as its web content.

## The manifest

| Field | What |
|---|---|
| `version` | 1. A loader refuses a version it doesn't read; a change to anything below is a new version |
| `game` | The game document, checked and with its defaults filled in (see [game.json](./game-json)). `entry` is the scene the game starts in; `input` is the action map inline, a ref to a JSON file holding `{ "actions": … }`, or null for the engine's default |
| `runtime` | The runtime the build was made with: its name, version, the contract it keeps, its entry page, and the digest of its file table |
| `compat` | The build's save-compatibility fingerprint (below): what a save made with it needs to be restored. Absent in a build from before M6 |
| `files` | Every file of the build but the manifest itself. `role` is `runtime` or `project`; a project file's path is `project/` + its ref. `licence` is the file's row in the project's `LICENCES.md` (the cell, as Markdown), or the runtime table's. `licenceFrom` is there only when a pattern row licensed the file (`"licenceFrom": "voice/*.wav"`): nobody listed that file by name |
| `hash` | `sha256`: lowercase hex, 64 digits, from this package's own implementation in every runtime (`src/sha256.js`, tested against `node:crypto`) |
| `digest` | The SHA-256 of one line per file, `<sha256>  <path>\n`, in the order of `files`. It names the build's content, and `shasum -a 256` output reproduces it. A session log is checked against it: a replay is exact only on the build it was played on |
| `bytes` | The sum of the files' sizes |

**Order and spelling.** `files` is sorted by path, compared by UTF-16 code unit (JavaScript's default sort). Paths are
relative, with `/`, in Unicode form NFC, and with no empty, `.` or `..` segment, backslash, colon or control character;
two paths that differ only by case are refused (a Mac's disk can't hold both). The manifest's bytes are `JSON.stringify(manifest, null, 1)`
and a newline, keys in the order above. It holds no clock, no path of the machine and no user name. Two builds are
the same bytes exactly when their manifests' SHA-256 match (`exportBuild` returns it as `sha256`).

## Saves across updates

(item 3). A save is a world snapshot, and restoring one depends on some of a build and not
the rest. `compat` is a fingerprint of that part (`src/compat.js`), so the game app loads a save into any export of
the game whose fingerprint matches the one the save carries: a re-export that changed a texture, a material's colour,
a sound or the game's `release` goes on from its earlier saves, with the same per-step hashes as the run that never
stopped. One whose fingerprint differs refuses the save and says which part changed. Where it isn't sure, it counts
more rather than less: a refused save is better than one restored wrong.

| Part | What it covers | Changes it |
|---|---|---|
| `scenes` | Every `.vrmxs` of the build (the scenes and their prefabs), each as canonical JSON (keys sorted: spacing and key order don't count). `scenes` lists each one's hash by ref, so a refusal names the file | Any edit to a scene or a prefab |
| `assets` | What else a restore reads the structure of, by ref (`assets`). Items (`.vrmxi`: states, clips, parts, joints) and characters (`.vrmxa`: the node list a pose is restored onto in order, spring bones) whole, as `file:<sha256>`: both are ZIP containers this package doesn't open. glTF models (`.glb`, `.gltf`, `.vrm`) by structure, `gltf:<sha>`: their JSON without images, materials, textures, samplers, buffers, buffer views and an accessor's place in its buffer. Brain documents (`vrmxg-brain`) whole and the game's animation set by each clip's name, duration, looping, root motion and tracks, `json:<sha>` | Any change to an item or a character, a re-texture included; a model's nodes, meshes, accessors (counts, bounds), skins, animations or physics extensions; a brain; a clip added, removed, renamed or retimed |
| `behaviours` | Every behaviour the scenes attach, by name (`behaviours`). A project behaviour that declares its state (its own `static describe = { state: <JSON Schema> }`, ) is `state:<sha>` of the schema's `stateShape` (canonical, annotations out); a schema that allows anything (`true`, `{}`, annotations only) declares nothing. One that doesn't declare is `code:<sha>`: the game's behaviours module and every module it imports relatively. An engine behaviour is `engine:<sha>` of the state its registry entry declares, or `runtime:<version>` while it declares none | A declared state's shape; any edit to undeclared code; an undeclared engine behaviour on a new runtime |
| `input` | The action map's actions by name and type, in their order (the game's, or the runtime's default map; a game that spells out the default map is the same). The input snapshot holds axes and buttons in that order. Bindings are a player's settings and aren't in the snapshot | An action added, removed, renamed, retyped or moved |
| `engine` | The runtime's version, snapshot format, `@vrmxg/dmath` version and portable maths' fingerprint (`@vrmxg/save`'s `mathsFingerprint`). The version stays in until the engine's node types declare their state: `SNAPSHOT_FORMAT` hasn't moved since M0 although they have changed what they keep | A new runtime |

Undeclared stays strict on purpose: changing code that declares nothing refuses every earlier save, never lets one load
silently into code that might restore it wrong. Which of a scene's behaviours are the project's is read from the
module's exports without running it (`export * from` followed into the project's modules). What they declare is read
from the registry the export's checks use: `exportBuild({ importModule })` imports the game's behaviours module
once, declares its classes' own `describe`s in that registry (`declareProjectBehaviours`), and the fingerprint takes
each project entry's `stateShape` (`declaredShape`: W0's canonical shape, with `'true'` and `'{}'` counting as
undeclared). The editor passes its own registry, the one its play and validation use. An export with neither counts
every project behaviour by its code.

In Node the importer is `behavioursImporter(folder)` (`./node`), and every call imports a fresh module graph: the
module's URL carries a load token that a resolve hook carries into every relative specifier inside the folder, so no
module of the graph comes from Node's module cache (item 1). A long-running process (MCP's server) or an
export after an edit never reads declarations from an older copy, and a load that failed isn't kept for the next try.
Everything else in the fingerprint is read from the project's files and the runtime's table: no clock, no machine.

The runtime's table carries what the fingerprint needs from the engine (`engine` in `vrmxg-runtime.json`:
`{ snapshot, dmath, maths, actions, behaviours }`, written by the Vite plugin's `engine` option; the game app computes
it in `apps/game/scripts/engine-compat.mjs`). A runtime whose table has none makes the default action map and every
engine behaviour its version too.

`compatProblems(saved, current)` says why a save's fingerprint can't be restored into a build's: one reason per part,
each a sentence ("the scene game/level.vrmxs changed", "the item game/items/till.vrmxi changed", "the state the
behaviour pressToStart keeps changed", "the code of the behaviours pressToStart and tableZone changed (they declare
no state, so any change to their code counts)", "the game's controls changed", "the engine changed (a new version of
it)"). The fingerprint has a `version` (1): a later kind, or save migrations declared in `game.json`, can accept an
earlier one without changing this format.

**Not counted:** textures, materials and the bytes of meshes (a model's geometry edited without a change to its
accessors' counts or bounds), sounds and voice timings, animation clips' bytes, personas, the game's title and
release. Rapier's bytes in a save restore the physics world as it was saved, colliders included.

## A whole manifest

Of a build with one runtime file and one project file, as the exporter writes it (`makeManifest`, `serializeManifest`):

```json
{
 "format": "vrmxg-build",
 "version": 1,
 "game": {
  "format": "vrmxg-game",
  "version": 1,
  "id": "my-game",
  "title": "my-game",
  "entry": "level.vrmxs",
  "scenes": [
   "level.vrmxs"
  ],
  "behaviours": null,
  "animations": null,
  "personas": null,
  "input": null,
  "include": []
 },
 "runtime": {
  "name": "my-runtime",
  "version": "1.0.0",
  "contract": 1,
  "entry": "index.html",
  "digest": "2a0e4374268cf118a35d5b143fa488e6b5621253d8fadf0c3f96093bb4a297f7"
 },
 "hash": "sha256",
 "project": "project/",
 "bytes": 39,
 "digest": "368467b16faa276bdc139d9487330c17732a1ecb881fcdc6008a9e70d9fd1de4",
 "files": [
  {
   "path": "index.html",
   "role": "runtime",
   "bytes": 15,
   "sha256": "fe26c59e91ac8de694b2531dc3bdc1b7faf471d3d7e4e00870af60f5f22897cb",
   "licence": "Ours"
  },
  {
   "path": "project/game.json",
   "role": "project",
   "bytes": 24,
   "sha256": "bb42209d867ada3174c16bb1f9af70b73a33a52897ef9342a727421e1910874b",
   "licence": "Ours"
  }
 ]
}
```
