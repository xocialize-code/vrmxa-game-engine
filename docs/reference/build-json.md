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
| `files` | Every file of the build but the manifest itself. `role` is `runtime` or `project`; a project file's path is `project/` + its ref. `licence` is the file's row in the project's `LICENCES.md` (the cell, as Markdown), or the runtime table's. `licenceFrom` is there only when a pattern row licensed the file (`"licenceFrom": "voice/*.wav"`): nobody listed that file by name |
| `hash` | `sha256`: lowercase hex, 64 digits, from this package's own implementation in every runtime (`src/sha256.js`, tested against `node:crypto`) |
| `digest` | The SHA-256 of one line per file, `<sha256>  <path>\n`, in the order of `files`. It names the build's content, and `shasum -a 256` output reproduces it |
| `bytes` | The sum of the files' sizes |

**Order and spelling.** `files` is sorted by path, compared by UTF-16 code unit (JavaScript's default sort). Paths are
relative, with `/`, in Unicode form NFC, and with no empty, `.` or `..` segment, backslash, colon or control character;
two paths that differ only by case are refused (a Mac's disk can't hold both). The manifest's bytes are `JSON.stringify(manifest, null, 1)`
and a newline, keys in the order above. It holds no clock, no path of the machine and no user name. Two builds are
the same bytes exactly when their manifests' SHA-256 match (`exportBuild` returns it as `sha256`).

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
