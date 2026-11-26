# @vrmxg/bundle

M5 W0 (AB-T-0615). A project exported as a game build: a web folder with the runtime, the game's files and a manifest
that lists every file with its SHA-256 and its licence. The same project gives the same build, byte for byte, from Node
and from the Mac editor. The design is decision AB-D-0282; this file is the contract the game app (M5 W1) and the MCP
export tool (M5 W9) build on.

```js
import { exportBuild, openBuild, fetchReader } from '@vrmxg/bundle';
import { exportToFolder, openFolder, behavioursImporter, checkFolder } from '@vrmxg/bundle/node';

await exportToFolder({ project: 'content/sample', runtime: 'engine/packages/bundle/runtime/dist', out: 'build/cafe' });
const build = await openFolder('build/cafe');                       // a page: openBuild(fetchReader('./'))
const behaviours = await build.behaviours(behavioursImporter('build/cafe'));
const scene = JSON.parse(await build.text(build.game.entry));       // build.bytes is the `resolve` engine services take
```

`exportBuild({ project, runtime, game?, ready?, write?, onProgress? })` is the one exporter. Its first half,
`planBuild({ project, game?, registry? })`, reads only the project: the game document checked, every file traced, each
one's licence row; it throws the same refusals and returns what a build would hold. With `all: true` it carries on past
each refusal and returns every one as `problems`, for a check that shows a person everything at once; `exportBuild`
never asks for that, so a build is the same either way. MCP's project check calls it, so a check and an export can't
disagree about what is refused. Every check passes before
`ready` is called and before the first `write`, so a caller that has to ask for a folder asks only then; `write: null`
checks and hashes everything and writes nothing. It returns the manifest, its text, that text's SHA-256, and
`byPattern`.

```sh
npm run build:runtime -w @vrmxg/bundle                              # the runtime a build is made with, once
node engine/packages/bundle/src/cli.js content/sample out/cafe      # vrmxg-export <project> <out> [--runtime <folder>]
node engine/packages/bundle/src/cli.js content/sample --check       # every check, the digests, nothing written
node engine/packages/bundle/src/cli.js --verify out/cafe            # is the folder the build its manifest describes?
node engine/packages/bundle/src/cli.js content/sample out/rush --game game/game.json   # another game the project holds
```

`--game <ref>` (M5 W10) exports the game a document elsewhere in the project describes, read as the project's `game.json`
(so the build's own `game.json` is that document): the sample project holds the cafe (`game.json`) and the sample game,
"The Morning Rush" (`game/game.json`). `exportToFolder({ gameFile })` and `projectWithGame(dir, ref)` (a project reader,
nothing copied) are the same from code.

## What "built in" means

M5's decision 2 says a build has "the runtime and its behaviours built in". The Mac editor is a sandboxed WKWebView
page: it can't run a bundler, and the build has to be the bytes Node writes. So **an export copies and hashes, and
never compiles**:

- **The runtime is prebuilt.** Vite builds it ahead of time on a developer's machine or CI, with a table
  (`vrmxg-runtime.json`) of every file's size, SHA-256 and licence. The editor ships that folder as data
  (`game-runtime/` in its web root); Node reads it from a folder. The exporter checks each runtime file against the
  table and copies it in unchanged.
- **Behaviours travel as the ES modules the project wrote**, at their refs under `project/`. The runtime imports
  them at run time and hands them `@vrmxg/core` through an import map (in Node: a resolve hook,
  `behavioursImporter`). They are hashed and licensed like any other file. This is how the editor already loads a
  project's behaviours.
- **The exporter is plain JavaScript over a reader and a writer**, with its own SHA-256, so the same code runs in
  Node and in a page and neither needs `crypto`, a secure context or a file system of its own.

## A build's layout

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

## The manifest: `vrmxg-build.json`

```json
{
 "format": "vrmxg-build",
 "version": 1,
 "game": { "format": "vrmxg-game", "version": 1, "id": "cafe", "title": "The cafe", "entry": "cafe.vrmxs",
           "scenes": ["cafe.vrmxs"], "behaviours": "behaviours.js", "animations": "animations.json",
           "personas": "personas.json", "input": { "actions": { "move_x": { "…": "…" } } }, "include": ["input/walk-in.json"] },
 "runtime": { "name": "vrmxg-stepper", "version": "0.1.0", "contract": 1, "entry": "index.html", "digest": "…" },
 "compat": { "format": "vrmxg-compat", "version": 1, "digest": "…",
             "parts": { "scenes": "…", "behaviours": "…", "input": "…", "engine": "…" },
             "scenes": { "cafe.vrmxs": "…" }, "behaviours": { "wander": "code:…", "player": "engine:…" } },
 "hash": "sha256",
 "project": "project/",
 "bytes": 22172602,
 "digest": "…",
 "files": [
  { "path": "index.html", "role": "runtime", "bytes": 917, "sha256": "…", "licence": "Xocialize original" },
  { "path": "project/sets/cafe.glb", "role": "project", "bytes": 12345, "sha256": "…", "licence": "Xocialize original" }
 ]
}
```

| Field | What |
|---|---|
| `version` | 1. A loader refuses a version it doesn't read; a change to anything below is a new version |
| `game` | The game document, checked and with its defaults filled in (below). `entry` is the scene the game starts in; `input` is the action map inline, a ref to a JSON file holding `{ "actions": … }`, or null for the engine's default |
| `runtime` | The runtime the build was made with: its name, version, the contract it keeps, its entry page, and the digest of its file table |
| `compat` | The build's save-compatibility fingerprint (M6 W5, below): what a save made with it needs to be restored. Absent in a build from before M6 |
| `files` | Every file of the build but the manifest itself. `role` is `runtime` or `project`; a project file's path is `project/` + its ref. `licence` is the file's row in the project's `LICENCES.md` (the cell, as Markdown), or the runtime table's. `licenceFrom` is there only when a pattern row licensed the file (`"licenceFrom": "voice/*.wav"`): nobody listed that file by name |
| `hash` | `sha256`: lowercase hex, 64 digits, from this package's own implementation in every runtime (`src/sha256.js`, tested against `node:crypto`) |
| `digest` | The SHA-256 of one line per file, `<sha256>  <path>\n`, in the order of `files`. It names the build's content, and `shasum -a 256` output reproduces it. A session log is checked against it: a replay is exact only on the build it was played on |
| `bytes` | The sum of the files' sizes |

**Order and spelling.** `files` is sorted by path, compared by UTF-16 code unit (JavaScript's default sort). Paths are
relative, with `/`, in Unicode form NFC, and with no empty, `.` or `..` segment, backslash, colon or control character;
two paths that differ only by case are refused (a Mac's disk can't hold both). The manifest's bytes are `JSON.stringify(manifest, null, 1)`
and a newline, keys in the order above. It holds no clock, no path of the machine and no user name. Two builds are
the same bytes exactly when their manifests' SHA-256 match (`exportBuild` returns it as `sha256`).

## The game document: `game.json`

What Export Game reads to know what the game is (`format: "vrmxg-game"`, `version: 1`). The sample's is
`content/sample/game.json`.

| Key | What |
|---|---|
| `id` | Lowercase letters, digits and hyphens. The default name of the build's folder |
| `title` | Shown by the runtime. Default: the id |
| `entry` | The scene the game starts in |
| `scenes` | Every scene the game can reach. The entry is always one of them |
| `behaviours`, `animations`, `personas` | The project's behaviours module, animation sets and app personas, by ref, where it has them |
| `input` | The action map (`@vrmxg/input`'s `actions`): inline as `{ "actions": { … } }`, or a ref to a JSON file holding that. Absent: the engine's default map |
| `include` | Files no document names, by ref or by pattern (`*` within one folder level) |
| `ignore` | Strings in the game's documents that look like files and aren't: the export would otherwise stop on them (below) |
| `physics` | The game's collision layers (M6 W3, the editor's project settings): `{ "layers": ["default", "player", …], "collides"?: { layer: [the layers it collides with] } }`, 1 to 15 names (lowercase letters, digits, `-` and `_`), as `@vrmxg/physics`'s `Layers` reads them; a layer missing from `collides` collides with every layer. A node's `layer` (a Collider's, an Area's, a Character's capsule) names one; a node with none is on the first. Absent: one layer, `default`. Every world of the game is built with it. In the manifest only when the game has it |
| `release` | The game's own version, as its players see it: one to three numbers with dots (`"1.2.0"`). The Mac game app takes it as its version (M5 W1). Absent: none in the manifest |

A project with no `game.json` can still be exported from the editor: the open scene is the entry, with the project's
`behaviours.js`, `animations.json` and `personas.json` where it has them (`defaultGame`).

## What goes into a build

The exporter traces the game's files from its documents (`collect`):

1. The roots: `LICENCES.md`, `game.json`, and everything the game document names.
2. **A file is collected when a collected JSON document (`.vrmxs`, `.json`) holds its path as a string value**, from
   the project's root or beside the document (a line's timings name their clip by file name). That one rule follows
   a scene's assets and prefabs, a sequence's set, brain and effect documents named by path, voice clips in
   connections and tracks, persona cores and animation clips, without this package knowing those formats.
3. A `.wav` brings the `.timings.json` beside it. A module (`.js`, `.mjs`) brings its relative imports.

**A reference that names no file stops the export**, and the error names the document and the reference
(`level.vrmxs names props/dor.glb (asset "door"), which the project doesn't have`):

- **In a scene, what the schema types as a file is taken exactly, spaces and all** (`sceneRefs`): the asset table's
  `ref`s, a sequence's `set`, and any prop, behaviour parameter or action argument the registry declares as an asset
  reference (`P.assetRef`). Such a reference must name a file of the project. Today the registry types only the asset
  table: no prop uses `P.assetRef` yet, and the props that carry a path (`say`'s `clip`, an emitter's `effect`, a
  brain's `preset`) are plain strings, so they fall under the next rule until the registry types them (AB-T-0628).
  Props the registry types as a choice, a colour, a node or a number are never references, nor are ids and names.
- **Any other string** (a scene's plain-string props, and every string of a JSON document that has no schema) is
  taken for a reference when it reads as a path: it ends in an extension the project's files have, isn't a URL, and
  is one word or names a folder the project has (`voice/hello there.wav`). A sentence is not a path. One that only
  looks like a file (`intro.wav` as text) stops the export, and the message gives the line to add:
  `"ignore": ["intro.wav"]` in `game.json`.
- **Case counts.** `Props/Door.glb` for `props/door.glb` opens on a Mac's disk and would not in a build served from
  anywhere, so it stops the export and the error gives both spellings. Any string that is a file's whole path but for
  its case, and ends in an extension the project has, is taken for that file misspelt, with or without a space and
  wherever the file is.
- `./props/door.glb` and the Unicode form of a name are normalised (`normRef`: NFC, no leading `./`). A build names
  each file once, in NFC, and the loader normalises what the engine asks for the same way. Two files whose names
  differ only in Unicode form can't both go in.
- A module may import `@vrmxg/core` and its own relative files. Any other import stops the export: a build has
  nothing else to give it. **Imports are read by a real lexer** (`moduleImports`: `es-module-lexer` 3.0.5, MIT, its
  pure-JavaScript build, which needs no WebAssembly and no start-up step). It knows where a `/` divides and where it
  begins a regular expression, reads templates, comments and minified code, and is the same lexer in the exporter and
  in the loader. **It fails closed:** a module that doesn't lex is refused, and so is one that imports a path it works
  out as it runs (`import(name)`, a template with a hole), because neither the export nor the loader could know, hold
  or check what that loads. The acceptance scripts read fourteen awkward modules (`runtime/lexer-cases.js`) in Node,
  Chromium and WKWebView and compare the three.

What nothing names goes in `include`: a file read from a path a behaviour builds at run time. **The loader refuses a ref the manifest
doesn't list, by name**, so such a file fails on the first play and says which file. Hidden files (a segment starting
with `.`) are never part of a project. Only the files a game uses are held to a build's rules for names; a file it
doesn't use can be called anything. A project whose listing was cut short (the Mac shell lists at most 20,000 files,
and says when it stopped there) is not exported from.

**Licences.** Every collected file needs a row in the project's `LICENCES.md`: a table row whose first cell is the
file's path in backticks (`*` matches within one folder level), the licence in the second cell, in any table of the
file. It is the rule `content/sample/tools/check-licences.mjs` checks in CI, plus one thing: the licence cell may not
be empty. **Collision layers.** A node in a collected scene or prefab on a layer the game doesn't have (`physics.layers`, or
`default` without it) stops the export (`unknown_layer`, naming the scene, the node and the layer): a world with that
node couldn't be built, so the game wouldn't load. MCP's project check reports it the same way, from the same check.

A file with no row stops the export before anything is written, and the error (`BuildError`, code
`no_licence`, `files`) names every such file. Files the game doesn't use need no row to export.

What the check does not do (decision AB-D-0284): **it does not read what a licence says.** A row whose licence is
"unknown, do not ship" passes; whether a licence allows a file into a game is a person's call when the row is written.
What it does instead is show which files nobody listed by name: a file licensed by a pattern row carries
`licenceFrom` in the manifest, `exportBuild` returns them as `byPattern`, and `vrmxg-export` prints them. An exact row
beats a pattern row for the same file.

## Saves across updates: the compatibility fingerprint

M6 W5 (AB-T-0631, AB-D-0297 item 3). A save is a world snapshot, and restoring one depends on some of a build and not
the rest. `compat` is a fingerprint of that part (`src/compat.js`), so the game app loads a save into any export of
the game whose fingerprint matches the one the save carries: a re-export that changed a texture, a material's colour,
a sound or the game's `release` goes on from its earlier saves, with the same per-step hashes as the run that never
stopped. One whose fingerprint differs refuses the save and says which part changed. Where it isn't sure, it counts
more rather than less: a refused save is better than one restored wrong.

| Part | What it covers | Changes it |
|---|---|---|
| `scenes` | Every `.vrmxs` of the build (the scenes and their prefabs), each as canonical JSON (keys sorted: spacing and key order don't count). `scenes` lists each one's hash by ref, so a refusal names the file | Any edit to a scene or a prefab |
| `assets` | What else a restore reads the structure of, by ref (`assets`). Items (`.vrmxi`: states, clips, parts, joints) and characters (`.vrmxa`: the node list a pose is restored onto in order, spring bones) whole, as `file:<sha256>`: both are ZIP containers this package doesn't open. glTF models (`.glb`, `.gltf`, `.vrm`) by structure, `gltf:<sha>`: their JSON without images, materials, textures, samplers, buffers, buffer views and an accessor's place in its buffer. Brain documents (`vrmxg-brain`) whole and the game's animation set by each clip's name, duration, looping, root motion and tracks, `json:<sha>` | Any change to an item or a character, a re-texture included; a model's nodes, meshes, accessors (counts, bounds), skins, animations or physics extensions; a brain; a clip added, removed, renamed or retimed |
| `behaviours` | Every behaviour the scenes attach, by name (`behaviours`). A project behaviour that declares its state (its own `static describe = { state: <JSON Schema> }`, M6 W0) is `state:<sha>` of the schema's `stateShape` (canonical, annotations out); a schema that allows anything (`true`, `{}`, annotations only) declares nothing. One that doesn't declare is `code:<sha>`: the game's behaviours module and every module it imports relatively. An engine behaviour is `engine:<sha>` of the state its registry entry declares, or `runtime:<version>` while it declares none | A declared state's shape; any edit to undeclared code; an undeclared engine behaviour on a new runtime |
| `input` | The action map's actions by name and type, in their order (the game's, or the runtime's default map; a game that spells out the default map is the same). The input snapshot holds axes and buttons in that order. Bindings are a player's settings and aren't in the snapshot | An action added, removed, renamed, retyped or moved |
| `engine` | The runtime's version, snapshot format, `@vrmxg/dmath` version and portable maths' fingerprint (`@vrmxg/save`'s `mathsFingerprint`). The version stays in until the engine's node types declare their state: `SNAPSHOT_FORMAT` hasn't moved since M0 although they have changed what they keep | A new runtime |

Undeclared stays strict on purpose: changing code that declares nothing refuses every earlier save, never lets one load
silently into code that might restore it wrong. Which of a scene's behaviours are the project's is read from the
module's exports without running it (`export * from` followed into the project's modules). What they declare is read
from the registry the export's checks use (M6 W0): `exportBuild({ importModule })` imports the game's behaviours module
once, declares its classes' own `describe`s in that registry (`declareProjectBehaviours`), and the fingerprint takes
each project entry's `stateShape` (`declaredShape`: W0's canonical shape, with `'true'` and `'{}'` counting as
undeclared). The editor passes its own registry, the one its play and validation use. An export with neither counts
every project behaviour by its code.

In Node the importer is `behavioursImporter(folder)` (`./node`), and every call imports a fresh module graph: the
module's URL carries a load token that a resolve hook carries into every relative specifier inside the folder, so no
module of the graph comes from Node's module cache (AB-T-0654 item 1). A long-running process (MCP's server) or an
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

## The runtime's contract (contract 1)

A runtime is any built web app with a `vrmxg-runtime.json` beside it. `@vrmxg/bundle/vite` writes one:

```js
import { vrmxgRuntime } from '@vrmxg/bundle/vite';
plugins: [vrmxgRuntime({ name: 'vrmxg-game', version: pkg.version, licence: 'Xocialize original',
  licences: [['assets/sql-wasm-*.wasm', 'sql.js 1.15.2 (MIT): see THIRD-PARTY-LICENCES.txt']] })]
```

The plugin lists every file of the output folder with its hash. A chunk's licence names the packages bundled into
it. It also writes `THIRD-PARTY-LICENCES.txt`: the licence text of each of those packages, and the copyright notices
our own modules carry in their headers (fdlibm's in `@vrmxg/dmath`, the vendored lip-sync rules and navcat blocks). A
minified bundle keeps no comments, so this file is how those notices ship with the code.

What a runtime keeps, so any build can sit around it:

1. Its `entry` (`index.html`) is the page to open, at the build's root.
2. It reads `./vrmxg-build.json` beside the entry and the project's files from `./project/<ref>`. Use the loader:
   `openBuild(fetchReader('./'))`.
3. It imports the project's behaviour modules from `./project/` at run time (`build.behaviours(importModule)`), and
   its entry carries an import map that gives them `@vrmxg/core`: the runtime's own copy of the engine's core,
   published on `globalThis.VRMXG_CORE` before the import (`runtime/vrmxg-core.js` is the shim). A behaviour that
   declares itself (M6 W0) carries its declaration in the module (a static `describe` on its class), so a build needs
   nothing else to read it; `build.behaviours` declares them into the engine's registry and refuses what it won't take
   (`bad_behaviours`), and the world builder puts them in the world's registry (`declareProjectBehaviours` from
   `@vrmxg/registry`). An export given `importModule` (Node's exporters pass `behavioursImporter(folder)`) declares them
   too, so a project behaviour's asset params are traced as typed references, and refuses the same declarations.
4. It has no file named `vrmxg-build.json` or `vrmxg-runtime.json` and none under `project/`. Every file has a
   licence in its table.

**The runtime a game is made with is the game app** (`apps/game`, `vrmxg-game`; M5 W1, decision AB-D-0286): `npm run
build -w @vrmxg/game-app` writes `apps/game/dist` with its table, and `vrmxg-export`'s `--runtime` and the editor's
`gameRuntime` (`apps/editor/vite.config.js`) default to it. `vrmxg-export` stops, and says how to build it, when it isn't
built: it never takes another runtime in its place. The game app opens the build, steps a `GameFlow` session and draws it
(title menu, pause, save slots, settings). It keeps the harness mode the minimal runtime had: `?check=<take>&steps=<n>`
makes no renderer and no menus, replays recorded input from the build in its entry scene and publishes a hash of the
world after every step (`window.__result`, `READY`), which is how `acceptance/m5/build.mjs` and `build-wkwebview.sh`
play a build in Chromium and WKWebView.

**A stale runtime is refused.** The game app's build writes a source stamp beside its dist (`apps/game/dist-sources.json`,
git-ignored; `runtimeSources` in `@vrmxg/bundle/node`): every source file its bundle was built from with its SHA-256,
its page, its config, this package's Vite plugin, and the lock files of the two installs it takes packages from (this
workspace's `package-lock.json`, and vrmxa-core's own `package.json` and `package-lock.json`, where sql.js comes from).
**What the stamp doesn't cover:** the contents of `node_modules` (a package is seen only through its lock file, so a
reinstall at the same versions, or a package edited by hand in `node_modules`, goes unnoticed; the three-vrm patch is
applied there on install and is covered by CI's `--check --require-patched`, not by the stamp), files read at build time
that aren't modules (an asset copied as a file is seen only through the lock file of the package it comes from), and
the versions of Node and of the operating system the build ran on. Its runtime version carries the stamp's digest
(`0.1.0+854dbd840f55`; the digest is of the contents only, so it is the same wherever the checkout is). `vrmxg-export`
and the editor's build check the stamp (`checkRuntimeSources`) and refuse a dist whose sources changed since it was built,
naming the files; the editor's dev server warns. `vrmxgRuntime`'s `version` may be a function, read once the bundle is
written, for a version like that.

`runtime/` (`vrmxg-stepper`: the build's entry scene stepped at 60 Hz with no renderer) stays as this package's small
reference runtime and goes into a build only when `--runtime` names its folder (`npm run build:runtime -w
@vrmxg/bundle`).

The runtime's bytes are part of a build's identity. Two Vite builds of the same sources give the same table (checked
here: the table's SHA-256 after two builds). A build made with another runtime says so in `runtime.digest`, and the
same project then differs only in the runtime's rows.

## The loader

`openBuild(read)` takes a reader of the build's files by path and returns a `Build`:

| | |
|---|---|
| `build.game`, `build.runtime`, `build.manifest` | What the manifest says |
| `build.bytes(ref)`, `text(ref)`, `json(ref)` | A project file by ref. `bytes` is bound, so it is the `resolve` every engine service takes. A ref is looked up as the exporter spelled it (NFC, no leading `./`). A ref the manifest doesn't list throws `not_in_build`, naming it. A file whose bytes aren't the ones the manifest hashed throws `changed` (checked the first time each file is read; `verify: false` turns it off). A file the manifest lists that isn't there throws `incomplete`, naming it: the folder is not the whole build |
| `build.has(ref)`, `info(ref)`, `refs()`, `path(ref)` | What the build holds; a file's row; its path under the build's root |
| `build.actions()` | The game's action map, or null for the engine's default: pass it to `installInput(tree, { actions })` |
| `build.modules(ref)` | A module and every module it imports relatively, each read and checked against the manifest |
| `build.behaviours(importModule)` | The project's behaviours by the names its scenes use. Every module of the graph is checked first (`modules`): a changed module, one that imports a file the build doesn't hold, one that doesn't lex, or one that imports a path it works out as it runs stops here, before any of them runs |
| `build.verifyAll()` | Reads every file, the runtime's too, against the manifest |

What the engine needs to play a build is those four things: the game, a resolver, the input map and the behaviours.
`runtime/play.js` shows the whole of it (it builds the world with the apps' shared `buildWorld`).

**What is verified, and what is not.**

| | Checked against the manifest |
|---|---|
| A project file read through `bytes`, `text` or `json` | Yes, the bytes that are returned |
| The behaviours module and the modules it imports by a relative specifier | Yes, before any of them is imported. But the import then fetches each file again by its URL, so the bytes that run were checked a moment before they were loaded, not as they were loaded. A browser gives no way to import a module from bytes and keep its relative imports |
| A module reached only by `import()` of a computed path | There is none: a module that has such an import is refused, at export and by the loader |
| The runtime's own files (`index.html`, its scripts, its WebAssembly) | No. They are what runs the loader, and the browser has loaded them before it starts. `verifyAll()` checks them afterwards, which finds damage, not a runtime that was replaced |
| The manifest itself | No. A build has no signature |

So the hashes protect against a build that is damaged, half copied or edited by hand, and say which file. They do
not protect against someone who can rewrite the folder while it is played, or who rewrites a file together with its
row.

## Where a build is written

**The folder is as it was until the export is whole.** In Node (`stageFolder`) and in the Mac shell (`build.*`,
`apps/shell`'s `BuildFolder.swift`) the files are written into a staging folder inside the build's folder
(`.vrmxg-export-<id>`). An export that fails, is aborted, or loses its page leaves an earlier build whole and the
folder free for the next try, with no staging folder left behind.

**The end leaves the earlier build or the new one, never neither** (`commit()`, `build.end`):

1. Every staged file is checked against the staged manifest: the same files, each with its size and SHA-256. A piece
   that went missing, a file the manifest doesn't list, or one file where fifteen are listed stops here.
2. The folder is decided on again (below). Nothing of the earlier build has been touched yet.
3. The earlier build's files are held aside in the staging folder, not deleted, and its folders are removed. So a
   path that was a folder can be a file now, and a folder renamed only by case gets its new name on disk.
4. The new manifest replaces the old in one step, then the new files move in.
5. If any step fails, the commit is undone, the manifest first, since it decides which build the folder is. The
   earlier manifest goes back over the new one, what moved in is taken out, and the earlier build's files are put
   back. A file that can't be put back stays held in the staging folder, which is then kept, not dropped: the error
   says so, and the next export restores it. If the earlier manifest itself can't be put back, nothing is undone:
   the folder is the new build's, incomplete, and the next export finishes it from the staging folder.

At every instant the folder's own manifest lists every file in the folder. **A folder in the middle of that is not
a build, and doesn't pass for one:** its manifest lists files that are not there yet, so `checkFolder` reports its
`state` as `incomplete` (not `whole`), `vrmxg-export --verify` says so and exits 1, `openFolder` refuses it naming the
missing files, and the loader in a page throws `incomplete` on the first listed file it can't read. If the process
is killed in the middle, the next export first puts that right (`recoverFolder`): a file the folder's manifest lists, with the size and hash
it lists, that is missing from the folder and present in a leftover staging folder, is moved in. That finishes a
build whose files were on their way in, or restores one whose files were on their way out.

**Nothing in a staging folder is licence to delete or overwrite anything outside it.** Only the folder's own
`vrmxg-build.json` says what a build wrote. A leftover staging folder is removed (links in it are unlinked, never
followed), and nothing is taken from it but files the committed manifest vouches for by hash. No path of a build, a
runtime or a project may have a segment that starts with `.vrmxg-export`, so a page can't write into one.

**What an export may replace** (`planFolder`, and the same rule in Swift). The folder may be absent, empty, or hold
an earlier build, every file in it one that build's manifest lists. It is refused, before anything is touched, when:

- it holds a file the manifest doesn't list (the earlier build is not deleted first);
- it holds a symbolic link or a special file anywhere (a link named `project` is not an empty folder, and nothing is
  written or deleted through it);
- its manifest is not a build's, or is of a version this exporter doesn't read, or lists a path that leaves the folder.

Only regular files a manifest lists are ever removed: a row that names a folder deletes nothing in it. The one
exception is the Finder's `.DS_Store` inside a folder of the earlier build, removed with the folder. The folder
itself may be reached through a link, since the person named it. `checkFolder` counts a link as a file the build
doesn't list.

**The Mac shell's side.** A page can't write a folder, so the editor writes through four bridge methods (shell 0.10.0):

| | |
|---|---|
| `build.begin { name }` → `{ id, path, name }` | A folder panel (or `VRMXG_SHELL_BUILD`). The folder is checked and a staging folder made; nothing of an earlier build is touched. `id` is the page's handle on its export: a page that reloaded has none and can write nothing. A second `begin` drops an export the page gave up on |
| `build.write { id, path, base64, offset? }` | One file, or the piece of one that begins at `offset`. A piece that leaves a gap or lands on bytes already written (one sent twice) is refused. The editor sends a file in pieces of at most 4 MiB (`CHUNK` in `apps/editor/src/export-game.js`), so no bridge message outgrows that whatever the file's size |
| `build.end { id }` → `{ path, name, files, bytes }` | The five steps above. The shell hashes natively (CryptoKit) |
| `build.abort { id }` | Drops what this export wrote. The editor calls it when anything fails after `begin` |

The page decides every byte; the shell owns where they go and checks that what arrived is what the page's manifest
lists. In the editor, closing the window or quitting while a build is being written asks first, and Stop and Close
stops the export between two writes with `build.abort` (`exportClosing`, on the shell's close question). The editor asks for the folder only once every check has passed (`exportBuild`'s `ready`), and reads and
hashes each file once, as it is written.

## Checked

- `node --test test/compat.test.mjs` (15 tests, M6 W5): what changes the fingerprint and what doesn't (a texture, a
  colour, a sound, the release, a scene's spacing, a clip's bytes, a declared behaviour's code or annotations: nothing;
  a scene, a prefab, a model's nodes, an item, a character, a brain, a renamed clip, undeclared code and what it
  imports, a declared state's shape, an action added or reordered, a new runtime: each its own part; `true` and `{}`
  declare nothing, a subclass doesn't inherit a describe), the reasons, Node's exporter reading a declaration from the
  project's module with an edit to it or to a module it imports never read from the cache, and `behavioursImporter`
  loading a fresh graph per call (a failed load not kept).
- `node acceptance/m6/saves.mjs` (M6 W5, 10 checks): the Morning Rush exported, a session saved at step 3000 and played
  on, then re-exported with one change at a time. A texture, a sound, the release and a line added to the declared
  behaviours' module load the save and go on with the same hashes for 1800 steps; a declared state rewritten, a scene
  node, an item, the action map and (on a build where pressToStart declares nothing) its code refuse it with their
  reason; the first build's log doesn't replay on the second. Results in `acceptance/results/m6-saves/summary.json`.
- `node --test test/` (89 tests): the hash against `node:crypto`; the licence table; the trace (typed references taken
  exactly, a reference in the wrong case, to no file, in another Unicode form, beside its document; what reads as a
  path and what doesn't; fourteen awkward modules through the lexer, the repository's own minified bundles, computed
  imports refused); the exporter (the manifest, the same bytes from a listing in another order, each refusal, `ready`
  after every check, each file read once); the loader (every module checked before any runs; a listed file that
  isn't there); folders (links, a stray file beside a build, an old manifest of another version, a row naming a
  folder, pieces and their offsets, the staged files checked against the manifest, a commit failed at each of its
  stages and rolled back, then failed again while undoing, a folder reshaped and renamed by case, a planted staging
  manifest, what a killed export left, an incomplete folder) and the command line; the Vite plugin; the sample's build
  replayed against the project (240 steps; skipped without vrmxa-avatar-studio).
- `node --test test/export-game.test.mjs` in `apps/editor` (10 tests): Export Game's page side against a stand-in shell. `swift test` in
  `apps/shell`: `BuildFolderTests`, the real folder.
- `node acceptance/m5/build.mjs --chromium --mac … --refused …`, then `acceptance/m5/build-wkwebview.sh`: M5's exit
  check 1 on the sample project: 12 of 12 and 4 of 4 (AB-R-1102). The results are in
  [acceptance/README.md](../../../acceptance/README.md).
- The editor's Export Game in the Mac app: `apps/editor-mac/docs/HAND-TEST-M5-EXPORT-GAME.md`.

## Known limits

- **A build has no signature.** See "What is verified, and what is not" above. Signing and notarising a game are
  outside M5 (M5-PLAN decision 2).
- **The trace follows documents, not code.** A ref a behaviour computes needs `include`.
- **Most of a scene's path-carrying props are untyped today.** The registry declares `clip`, `effect` and `preset` as
  plain strings, so they are found by reading as a path, not by type (AB-T-0628). A misspelt one with a space in it,
  in a folder the project doesn't have, is the case that reaches play before it is named (by the loader).
- **The licence check doesn't read the licence** (AB-D-0284, above).
- **A module that works out what it imports as it runs can't be exported** (`import(name)`). Import by a literal
  path. This is on purpose: the build couldn't hold or check what such an import loads.
- **The lexer is a third party's** (`es-module-lexer`, pinned to 3.0.5): the exporter and the loader are only as right
  about a module's imports as it is. Its licence ships in a build's `THIRD-PARTY-LICENCES.txt`.
- **A whole file is in memory while it is hashed and written**, in the page and in Node. Only the bridge message is
  bounded (4 MiB pieces). A project file of several hundred megabytes would need a streaming reader.
- **Two exports into one folder at once** are not guarded against each other beyond the checks at the start and the
  end of each, and a folder changed by something else between a check and the move that follows it is not detected.
- No compression or packing of the project's files: they ship as they are.
