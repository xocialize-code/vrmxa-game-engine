# AB-T-0592: the editor's web process, before and after (2026-11-24)

The editor's Mac app (Release, `apps/editor-mac/scripts/build.sh`) running the M2 timeline scenario
([`../../HAND-TEST-M2-TIMELINE.scenario.md`](../../HAND-TEST-M2-TIMELINE.scenario.md)) under the GPU lock, with the web
content process's `phys_footprint` sampled once a second by
[`apps/editor-mac/scripts/web-footprint.py`](../../../../scripts/web-footprint.py) (`footprint --noCategories`, and
`footprint`'s categories every 15 s). Mac Studio, M5 Max, 128 GB, macOS 27.3 beta (26C5047e). GB are GiB.

| Run | Code | Rows | Peak | After row 1, 3, 5, 8 | GPU process, peak |
|---|---|---|---|---|---|
| [`before-webgpu`](before-webgpu/) | main at ffe7c81 | 7 pass, row 8's checks pass | **25.51 GB** | 3.05, 10.44, 23.45, 25.51 | 0.79 GB |
| [`dispose-only-webgpu`](dispose-only-webgpu/) | replaced worlds disposed | the same | 2.85 GB | 2.10, 1.45, 1.58, 1.89 | 0.60 GB |
| [`dispose-only-webgl`](dispose-only-webgl/) | the same, `renderer=webgl` | the same | 15.87 GB | 1.64, 5.85, 14.12, 15.82 | 3.59 GB |
| [`after-webgpu`](after-webgpu/) | the fix as committed (8b04b5e) | the same | **3.31 GB** (one sample; five of 67 over 2.2 GB) | 1.80, 1.37, 1.52, 1.74 | 0.66 GB |
| [`after-webgl`](after-webgl/) | the same, `renderer=webgl` | the same | **2.09 GB** | 1.12, 1.16, 1.03, 1.65 | 0.58 GB |
| [`after-review-webgpu`](after-review-webgpu/) | after the review of PR 33 (the bookkeeping moved to `worlds.js`) | the same | 2.30 GB | row 8: 1.81 | 0.65 GB |
| [`soak-webgpu`](soak-webgpu/) | the fix; rows 1 to 5, then ten more passes of undo-all and redo-all (478 worlds built) | 15 of 15 | 1.87 GB | flat between 1.1 and 1.5 GB for five minutes | 0.75 GB |

The peak moves from run to run: the build before the last one (the same editor code) peaked at 1.88 GB on WebGPU and
1.66 GB on WebGL in the same scenario. The soak and the two `dispose-only` runs were taken on those earlier builds of
this branch. Each folder has the series (`footprint.json`), AppProbe's report and its results. Row 8 is `judge: human` (the angle
grid): its screenshots are in `after-webgpu/shots/` and `after-webgl/shots/`. The sample's characters show as bare
bodies in every run, before and after: the worktree has none of the git-ignored `.vrm` files.

## What it was

Not Play, and not WebKit: every world the editor built was kept for good.
- **Every edit builds worlds.** The edit view is rebuilt for anything but a moved node, and, with the timeline's
  preview showing, the preview world too. Undo and redo do the same. The scenario builds 74 worlds; rows 1 to 7 are
  where the memory went, and row 8 (Play) added 0.1 GB.
- **A world costs about a third of a gigabyte** in the web process: at 46 s the baseline held 14.9 GB of GPU-backed
  memory (`Owned physical footprint (unmapped) (graphics)`) and 5.5 GB of typed arrays. `footprint` files those under
  `WebAssembly Memory`: checked with `jsc`, a filled 1 GB `Uint8Array` shows as 1.07 GB there. It is JavaScriptCore's
  ArrayBuffer storage, not Rapier's WASM memory.
- **Nothing let them go.** `EditorHost` replaced `this.edit` and `this.preview` and dropped the old world. Its Rapier
  world, geometries, materials and textures were never disposed, so the renderer went on holding them.
- **The kill is a matter of when WebKit looks.** This baseline run reached 25.5 GB and lived; the run that filed the
  task was killed at 24.5 GB ("Unable to shrink memory footprint of process below the kill threshold (16384 MB)").

## The fix, in two steps

1. **Replaced worlds are retired and disposed** (`EditorHost.retire`, `apps/editor/src/dispose.js`): the edit view's
   old world once its replacement is shown, the preview's, Play's on Stop, an export's and a scrub check's take. A
   world the view still shows or a scrub is working on waits for the frame loop. That alone was enough on WebGPU
   (2.85 GB) and not on WebGL (15.87 GB).
2. **What WebKit would hold until it collects is given back by hand.** On WebGL the status readout said 2 worlds
   alive, 66 geometries and 58 textures, yet the process stood at 15 GB and stayed there through 90 s idle
   ([`dispose-only-webgl-idle`](dispose-only-webgl-idle/)). A weak reference to each built world showed why: in that
   run WebKit had collected none of 72 disposed worlds. In another run of the same build it had collected all but
   three, and the process ended at 1.2 GB. JavaScriptCore collects by how much JavaScript allocates; a dead world is
   small in objects and large outside them (each character's vertex data and morph targets in typed arrays, its
   textures' decoded `ImageBitmap`s), and on WebGL the editor allocates little. On WebGPU three's node system
   allocates enough for collections to keep up, which is luck. So `disposeWorld` now detaches the buffers of every
   skinned mesh's geometry (`ArrayBuffer.transfer`) and closes every texture's `ImageBitmap`. Both backends now end
   every row under 2.3 GB (a few samples higher while a world is being built), and 478 rebuilds in a row leave 2
   worlds, 67 geometries and 107 textures, as at the start.

## What guards it

- The editor's status bar shows what it holds (`#holds`: "2 worlds of 74 built, 66 geometries, 58 textures"), and the
  timeline scenario waits for "1 or 2 worlds" after the undo and redo row and after Play.
- `apps/creator/test/worlds.test.mjs`: the host's bookkeeping (`apps/editor/src/worlds.js`: `retire`, `sweep`, `use`).
  A world nothing shows goes at once; one the view shows waits for the view to move on; one in use isn't disposed
  under the work; a dispose that throws loses no other world.
- `apps/creator/test/dispose.test.mjs`: a world's physics, geometries, materials and textures once each; a skinned
  mesh's index, attributes and morph targets detached, a static mesh's left alone; one `ImageBitmap` behind two
  textures closed once.

## Not measured
- What leaves a world's root while it runs (a body the closet replaced, a node removed during play): the dispose walks
  the root, so those wait for the collector. Read from the code, not measured; AB-T-0626.

- The memory before the fix on WebGL (the baseline was taken on WebGPU, the default).
- A world's cost in the creator (its own scenario wasn't sampled); it uses the same host and the same dispose.
- Play and export in a loop. Their worlds are disposed the same way and their scenarios pass, but no series was taken.
