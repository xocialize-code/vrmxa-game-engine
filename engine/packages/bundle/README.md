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

```sh
npm run build:runtime -w @vrmxg/bundle                              # the runtime a build is made with, once
node engine/packages/bundle/src/cli.js content/sample out/cafe      # vrmxg-export <project> <out> [--runtime <folder>]
node engine/packages/bundle/src/cli.js content/sample --check       # every check, the digests, nothing written
node engine/packages/bundle/src/cli.js --verify out/cafe            # is the folder the build its manifest describes?
```

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
  vrmxg-build.json          the manifest, written last: a folder without it is an unfinished build
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
| `files` | Every file of the build but the manifest itself. `role` is `runtime` or `project`; a project file's path is `project/` + its ref. `licence` is the file's row in the project's `LICENCES.md` (the cell, as Markdown), or the runtime table's |
| `hash` | `sha256`: lowercase hex, 64 digits, from this package's own implementation in every runtime (`src/sha256.js`, tested against `node:crypto`) |
| `digest` | The SHA-256 of one line per file, `<sha256>  <path>\n`, in the order of `files`. It names the build's content, and `shasum -a 256` output reproduces it |
| `bytes` | The sum of the files' sizes |

**Order and spelling.** `files` is sorted by path, compared by UTF-16 code unit (JavaScript's default sort). Paths are
relative, with `/`, and no empty, `.` or `..` segment, backslash, colon or control character; two paths that differ
only by case are refused (a Mac's disk can't hold both). The manifest's bytes are `JSON.stringify(manifest, null, 1)`
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

A project with no `game.json` can still be exported from the editor: the open scene is the entry, with the project's
`behaviours.js`, `animations.json` and `personas.json` where it has them (`defaultGame`).

## What goes into a build

The exporter traces the game's files from its documents (`collect`):

1. The roots: `LICENCES.md`, `game.json`, and everything the game document names.
2. **A file is collected when a collected JSON document (`.vrmxs`, `.json`) holds its path as a string value.** That
   one rule follows a scene's assets and prefabs, a sequence's set, brain and effect documents named by path, voice
   clips in connections and tracks, persona cores and animation clips, without this package knowing those formats.
3. A `.wav` brings the `.timings.json` beside it. A module (`.js`, `.mjs`) brings its relative imports.

A file read from a path a behaviour builds at run time is named by nothing: list it in `include`. **The loader
refuses a ref the manifest doesn't list, by name**, so a file the trace missed fails on the first play and says which
file, instead of going missing silently. Hidden files (a segment starting with `.`) are never part of a project.

**Licences.** Every collected file needs a row in the project's `LICENCES.md`: a table row whose first cell is the
file's path in backticks (`*` matches within one folder level), the licence in the second cell. It is the table
`content/sample/tools/check-licences.mjs` checks in CI. A file with no row stops the export before anything is
written, and the error (`BuildError`, code `no_licence`, `files`) names every such file. Files the game doesn't use
need no row to export.

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
   published on `globalThis.VRMXG_CORE` before the import (`runtime/vrmxg-core.js` is the shim).
4. It has no file named `vrmxg-build.json` or `vrmxg-runtime.json` and none under `project/`. Every file has a
   licence in its table.

**The runtime in the slot today** is `runtime/` (`vrmxg-stepper`): it opens the build, builds the entry scene's
world and steps it at 60 Hz with no renderer, showing the step and the world's hash. `?check=<take>&steps=<n>` replays
recorded input from the build and publishes a hash of the world after every step, which is how the acceptance checks
play a build in Chromium and WKWebView. **M5 W1 replaces it**: build `apps/game` with `vrmxgRuntime`, and point the
editor's `gameRuntime` (`apps/editor/vite.config.js`) and the command line's `--runtime` at its output.

The runtime's bytes are part of a build's identity. Two Vite builds of the same sources give the same table (checked
here: the table's SHA-256 after two builds). A build made with another runtime says so in `runtime.digest`, and the
same project then differs only in the runtime's rows.

## The loader

`openBuild(read)` takes a reader of the build's files by path and returns a `Build`:

| | |
|---|---|
| `build.game`, `build.runtime`, `build.manifest` | What the manifest says |
| `build.bytes(ref)`, `text(ref)`, `json(ref)` | A project file by ref. `bytes` is bound, so it is the `resolve` every engine service takes. A ref the manifest doesn't list throws `not_in_build`, naming it. A file whose bytes aren't the ones the manifest hashed throws `changed` (checked the first time each file is read; `verify: false` turns it off) |
| `build.has(ref)`, `info(ref)`, `refs()`, `path(ref)` | What the build holds; a file's row; its path under the build's root |
| `build.actions()` | The game's action map, or null for the engine's default: pass it to `installInput(tree, { actions })` |
| `build.behaviours(importModule)` | The project's behaviours by the names its scenes use. The module's hash is checked before it is imported |
| `build.verifyAll()` | Reads every file, the runtime's too, against the manifest |

What the engine needs to play a build is those four things: the game, a resolver, the input map and the behaviours.
`runtime/play.js` shows the whole of it (it builds the world with the apps' shared `buildWorld`).

## The Mac shell's side

A page can't write a folder, so in the Mac app the editor writes a build through three bridge methods (`apps/shell`,
`BuildFolder.swift`): `build.begin { name }` (a folder panel, or `VRMXG_SHELL_BUILD`), `build.write { path, base64 }`
per file, `build.end`. The page decides every byte; the shell owns only where they go. An export goes into a folder
that is absent, empty or holds an earlier build, whose listed files are removed first. A folder holding anything else
is refused, in the shell and in Node (`prepareFolder`): an export never deletes what it didn't write. The editor
runs every check before it asks for a folder, so a refused export replaces nothing.

## Checked

- `node --test test/` (40 tests): the hash against `node:crypto`; the licence table; the trace; the exporter (the
  manifest, the same bytes from a listing in another order, each refusal); the loader; folders and the command line;
  the Vite plugin; the sample's build replayed against the project (240 steps; skipped without vrmxa-avatar-studio).
- `node acceptance/m5/build.mjs --chromium --mac … --refused …`, then `acceptance/m5/build-wkwebview.sh`: M5's exit
  check 1 on the sample project. Results and the receipt are in [acceptance/README.md](../../../acceptance/README.md).
- The editor's Export Game in the Mac app: `apps/editor-mac/docs/HAND-TEST-M5-EXPORT-GAME.md`.

## Not here yet

- A build has no signature. The loader's hashes catch a changed or swapped file, and nothing authenticates the
  manifest itself: someone who can rewrite a file can rewrite its row. Signing and notarising a game are outside M5
  (M5-PLAN decision 2).
- The trace follows documents, not code: a ref a behaviour computes needs `include`.
- No compression or packing of the project's files: they ship as they are.
