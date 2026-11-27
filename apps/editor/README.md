# VRMXG editor

M1 W7 (AB-T-0519), M2 W5 (AB-T-0528). Build a scene from a project's assets, edit it, play it in place; film it as a sequence on a timeline. Vite + Vue over
`@vrmxg/editor-core`; the engine side (`src/host.js`) lives outside Vue, which only ever holds plain copies of what the
panels show (the tree, the inspector's fields, the asset list), refreshed when the host says something changed.

```sh
npm run dev --prefix apps/editor        # http://localhost:5182, the sample project (read-only in a browser)
apps/editor-mac/scripts/build.sh        # the Mac app, where Open Project… mounts a folder and Save writes into it
```

| Panel | What |
|---|---|
| Toolbar | Open Project… (Mac), the project's scenes, a file name for Open, New and Save As…, a set and a file name for New Sequence, Save, Undo / Redo (named after the step: "Undo Move mira"), Move / Rotate / Scale, Snap (0.25 m, 15°, 0.1), Orbit (camera-controls, yomotsu, MIT: dolly to the cursor) or Fly view, Frame, Export, Play / Stop |
| Export (M1 W8) | A take (the last Play, whose input is recorded from step 0, or a project input file: `input/*.json`, `takes/*.json`), its length, a size (720p to 4K), a frame rate (24, 25, 29.97, 30, 50, 60), a codec (H.264, HEVC, HEVC with alpha, ProRes 4444), sound; Export Video… builds the take's world from step 0 and runs `@vrmxg/export` into the shell's AVAssetWriter (in a browser: a hash of every frame). The result line gives frames, length, the time and its breakdown, and a digest of the frames' hashes. With a sequence open, the first take is the sequence itself, at its own frame rate: it exports from frame 0 with an `.srt` of its dialogue beside the movie (M2 W12). Check Against Scrub then jumps to each shot's first, middle and last frame and every clip start and key, on a fresh world at the export size. Each is drawn as the export draws it and hashed like the export's frames. The line reads "Scrub matches the export: all N frames", or names the frames that differ and whether their world was the same. `?mode=check-export` runs the export and the check with no person at it, for a harness (`acceptance/m2/`). Save Still… (a PNG of the view at the chosen size) and Thumbnail (480×270, into the project as `thumbnails/<scene>.png`) |
| Export Game (M5 W0) | In the Export panel and as File › Export Game… in the Mac app: the open project as a game build, through `@vrmxg/bundle` (`src/export-game.js`; the build's contract is that package's README). The project's `game.json` says what the game is; without one the open scene is the game. Every check runs first (each file the game uses needs a row in the project's `LICENCES.md`, and a reference to a file the project lacks, or has in another case, stops the export), then the Mac app asks for a folder and writes the runtime, the game's files and `vrmxg-build.json` (`build.begin`, `build.write` in pieces of at most 4 MiB, each with its offset, `build.end`). The shell stages the build, checks it against the manifest and moves it in whole, and an export that fails on the way is aborted (`build.abort`), so the folder is as it was and takes the next try. The result line gives the files, the bytes, the build's digest, the manifest's hash and how many files a pattern row licensed; a refusal says which file and why, in the same line. The build is made from the project's saved files: with unsaved changes in the open scene the result line says they are not in it. While the window is asking something (the close sheet), Export Game does nothing; and closing the window or quitting while a game is being written asks first (Keep Exporting, or Stop and Close, which stops the export between two writes and leaves the folder as it was), before the question about unsaved changes. Export Game builds no world, so it has nothing to retire. Tests: `node --test test/` in `apps/editor` (the page's side against a stand-in shell, and the close question). The runtime comes from the editor's own `game-runtime/` folder, copied in by `vite.config.js` from `engine/packages/bundle/runtime/dist` (build it first: `npm run build:runtime -w @vrmxg/bundle`). In a browser tab the export is checked and hashed only: a page can't write a folder |
| Scene | The document's tree: click selects (shift adds), drag a row onto another to reparent it, or onto the empty space to move it to the top; Add (lights, cameras, groups, colliders, markers: types that need no asset), Delete |
| Viewport | The edit view: a SceneTree of the document, built but never stepped, drawn from the editor's own camera. Click picks (a prefab's inner parts pick the instance), the gizmo moves the selection (one undo step on release), an asset dropped on it lands on the surface under the pointer (floors and table tops, not walls) |
| Viewport aids (M5 W5) | `src/viewport/` (AB-T-0604, AB-T-0605), switched in the toolbar (Outline, Handles, Preview). An outline round the selection (stand-ins sharing the selected meshes' geometry and skeleton, drawn into a target of its own and laid over the frame; no shaders of ours, so the same code on WebGPU and WebGL); shape handles on a selected collider or sensor (box faces, a sphere's radius, a capsule's or cylinder's height and radius) and light (a point light's range, a spot light's range and cone): drag one and the face opposite stays put (⌥ grows both sides), Snap rounds sizes to 5 cm and angles to 1°, and the release is one undo step through the session's `resizeShape`, writing the props the inspector edits; a picture-in-picture of what the selected Camera or VirtualCamera sees (its rig evaluated once with no time passing, the node's state put back, so the edit world's hash doesn't move); a view cube (page buttons, "View from the top (+Y)") that turns the view to an axis; ⌘-drag (Ctrl-drag), or a plain drag with the toolbar's Box on, selects what lies wholly inside a rectangle (hidden nodes aren't picked), ⇧ adds; Escape drops a drag. On WebGPU with the post stack active, every pass to the canvas must draw the whole frame, so the frame and the aids are drawn into targets and reach the canvas in one pass (`src/viewport/composite.js`). The gizmo and the selection box moved into the same overlay scene: every aid is drawn after the edit view's frame and none is in the world or the render host's scene, so none reaches an export, a still, the play world or a world hash. A collider under a scaled RigidBody gets handles where the scene graph puts it; physics places it unscaled relative to the body, so there the two disagree (scale a body's colliders, not the body). The maths (drag to props, rectangle select, the cube's angles, the preview's pose) is plain functions tested in Node (`test/viewport.test.mjs`); the hand test is `apps/editor-mac/docs/HAND-TEST-M5-VIEWPORT.md` |
| Duplicate, Copy, Paste (M5 W5) | Edit › Duplicate (⌘D), Edit › Copy and Paste, and the scene tree's buttons: `@vrmxg/editor-core`'s `duplicate`, `copy` and `paste` (`clipboard.js`). Each pasted node gets a fresh id (stool-1 → stool-9); every reference (node props at any depth, as the registry declares them with `nodeRef` and `meta.nodeRefs`, behaviour params, prefab override values, connections) follows the copy when it names a copied node, stays when the scene has the node, and is dropped otherwise, so a paste into another scene leaves it valid; a clip read from the system clipboard is checked whole first (no cycles, unique ids, a size limit); a prefab instance keeps its overrides, the document's own asset entry is reused for the same file, and each is one undo step. A copy is the editor's clipboard (it outlives the scene, so nodes paste into another) and, through the page's copy event, text on the system clipboard |
| Inspector | Generated from the registry for the node's type: name, parent, position, rotation (degrees, yaw first), scale, then every prop by its widget (number, checkbox, list, colour, node, JSON); a set prop has a reset. A field commits on Return or leaving it |
| Assets | The project's placeable files (`@vrmxg/editor-core`'s `assetList`): drag one onto the viewport, or Add it where the view looks (the first thing in an empty scene goes at the origin) |
| MCP (M1 W9) | `vrmxg-mcp --editor` drives the open editor (`src/mcp.js`): the link polls 127.0.0.1:5183, on by default in the Mac app and with `?mcp` in a browser (`?mcp=<port>`, `?mcp=off`). Edits go through the session's command log ("Undo Add cam (MCP)"), play / step / input / interact / cues act on the play world, screenshot is the view; the status bar shows the link and the last call |
| Timeline (M2 W5; shared since M4 W5) | `@vrmxg/editor-ui/Timeline.vue`, the same component the creator uses (what each edit emits is `@vrmxg/editor-ui`'s `timeline-ui.js`, tested in Node). Shown for a sequence document (a `.vrmxs` filming a set): transport (start, frame back and on, play / pause, a Frame field, timecode, In / Out / clear range, Loop), the preview camera (the shot, through the CameraBrain, or the editor's), Angles (the shot and every VirtualCamera in a grid, W3's viewports), Edit view, Fit. The ruler, headers and lanes all read one `TimelineGeometry` (pixels per frame + first visible frame): ⌘-wheel or pinch zooms about the pointer, the wheel scrolls; the ruler scrubs. Keys (diamonds), clips and shots move by drag (an edge trims) with snapping to frames, markers, shot edges, other keys and the playhead within 8 px at any zoom, or by ← → (⇧: 10 frames); Delete removes. The side panel adds tracks (type and target as buttons), shots (on a camera, which also puts a clip on the camera track), markers, keys and clips at the playhead, Camera from view (a VirtualCamera where the editor's view is), and edits the selected item's fields. Every edit is one undo step (`@vrmxg/editor-core`'s `SequenceCommands`) |
| Preview (M2 W5) | A scrub shows the frame exactly as an export renders it: a full world of the sequence in its set, put on the frame's step from snapshots every 2 s (`@vrmxg/sequence`'s `SequencePlayer`), then the render host's `frameAt`. The status shows the frame, step, α, how it got there and the world's hash, which is the hash Node, Chromium and WKWebView record for that frame. An edit rebuilds the preview (a second or two) and scrubs back to the playhead; Play follows the wall clock and skips frames the scrub can't keep up with |
| Status | Node count, saved or not, valid or not, the document's hash; after a save its size and hash, and Reopen & compare (read back from disk: same bytes, valid); after Stop, whether the scene and the edit view are as before Play; frame and build times; what the app holds (`#holds`: "2 worlds of 74 built, 66 geometries, 58 textures": the worlds alive and the view renderer's GPU objects, AB-T-0592: a count that keeps climbing while the document is only edited is a leak, and the timeline hand test checks it); debug draw toggles |

Edits that only move nodes are applied to the edit view in place; anything else rebuilds it (about 300 ms for the
cafe in a browser: the characters' VRMs are parsed again, their bundles and clips kept between builds; the run-time
closet is left out of the edit view). Play builds the full world from a copy of the document, as the game does, with
the scene's camera and the keyboard, mouse and gamepad.

**Worlds are let go of, not dropped (AB-T-0592).** The edit view, the timeline's preview, Play and an export's take are
each a full world: physics in WASM memory, vertex data in typed arrays, and models, VRMs and textures in GPU memory,
about a third of a gigabyte a world in the Mac app. A world that is replaced is retired (`EditorHost.retire`): disposed
at once (`src/dispose.js`), or, while the view still shows it or a scrub is working on it, by the frame loop as soon as
it is free. Disposing is: sound, the Rapier world, every geometry, material and texture; and, given back by hand because
WebKit's collector can't be waited for, the characters' vertex data (their buffers are detached) and the textures'
decoded images (their `ImageBitmap`s are closed). Before, every rebuild kept its world for good, and the timeline hand
test took the web process to 25 GB; now every row of it ends under 2.3 GB on WebGPU and on WebGL (3.3 GB and 2.1 GB
at most, for a moment, while a world is built), and 478 rebuilds in a row stay flat. The numbers, and what each step
of the fix bought, are in
[`apps/editor-mac/docs/hand-test/results/ab-t-0592/`](../editor-mac/docs/hand-test/results/ab-t-0592/README.md).
The bookkeeping is `src/worlds.js` (`RetiredWorlds`: `retire`, `sweep`, `use`), tested in
`apps/creator/test/worlds.test.mjs`: **whatever builds a world owes it a `retire`**. What leaves a world's root while
it runs (a node removed during play, an item's model, a body the closet replaced, a wearable taken off) is handed to
the tree as detached (`tree.detach`, `tree.detached`: `@vrmxg/core`'s `remove`, the character's, item's and model's
`exitTree`, the character's `swapVRM`, the closet's `unhang`), and `disposeWorld` walks those as well as the root
(AB-T-0626, `test/dispose-detached.test.mjs`). Known cost: until the world goes, the set keeps all of them (a world
that removes or swaps a lot holds their memory for its life); bounding it is AB-T-0655.

**Closing asks first (the Mac app, shell 0.9.0, AB-T-0593).** With unsaved changes, File › Close Window, the close
button and Quit show a sheet in the window: Save (saves, then closes), Don't Save or Cancel. The bundled sample is
read-only, so there the sheet says the changes can't be kept and offers Cancel or Close Anyway. The question is
`@vrmxg/editor-ui`'s `closingQuestion`; opening another scene over unsaved changes still doesn't ask. The answer is
`src/closing.js` (`editorClosing`), and the window asks one question at a time (`questions`), so every close gets an
answer. **A scene is marked saved only once its write has succeeded** (`src/saving.js`, the session's `text()` then
`markSaved()`): a Save that fails (the folder gone, a full disk) keeps the window, shows why, and leaves the scene
unsaved, so the next close asks again. The page tells the shell whenever its unsaved state changes (`setEdited`): the
close button shows the dot, and a close the page is too busy to answer asks the person instead of closing.

A project's own modules (`behaviours.js`) import `@vrmxg/core` by name; the page's import map points that at
`static/vrmxg-core.js`, which hands them the editor's own engine. Not yet: dragging several timeline items at once, curve editing of keys, a shot list separate from the shot row, MCP tools for sequences (W11), multi-selection gizmos,
connections in the inspector, WebCodecs export in a browser (the spike chose it as a fallback only).

## New Project, Open Recent and project settings (M6 W3, AB-T-0646)

- **New Project…** (⇧⌘N, the toolbar) lists the templates in `content/templates/` (`templates/index.json`, written by
  `vite.config.js` with each file's place in the web content) and, in the Mac app, asks the shell's `project.create`
  (shell 0.14.0) to make the project in a folder the person names, `game.json` written with the game's id and title
  (`src/projects.js`). The new project opens on its game's entry scene; Open Project still opens the first scene.
- **Open Recent**: File › Open Recent in the Mac app and the toolbar's Recent list, both the shell's one list
  (`project.recent`, `project.reopen`: bookmarks, so no panel after a relaunch).
- **Project Settings…** (⇧⌘P, `src/ProjectSettings.vue` over `src/project-settings.js`): the game's title, id and
  version (`@vrmxg/editor-ui`'s ValueField), its behaviours module (a `.js` file of the project, M6 W9: what a build
  takes, read again at once by the inspector and Play, `EditorHost.reloadBehaviours`; Play also runs an unnamed root
  `behaviours.js`, and the panel says so until it is named, while Export Game refuses it on the Export line), the entry scene and the scenes it can reach, the controls (every action's
  key and gamepad button, rebound by pressing the new one, with `@vrmxg/game-ui`'s rows and conflict plan; actions of
  the game's own added and removed), and the physics layers with a collision matrix kept symmetric. Each change is one
  undo step of the settings' own history (Edit › Undo and Redo are the panel's while it is open) and is written at once
  to `game.json` (or to the input map's own file when game.json names one), checked as an export checks it; a write
  that fails leaves the settings as they were. Play in place uses the game's controls and layers from `game.json`.
- Hand test: `apps/editor-mac/docs/HAND-TEST-M6-NEW-PROJECT.md` (scenario beside it); `acceptance/m6/` plays the
  templates in Node and their builds in the game app.

## Hot reload while playing (M6 W2, AB-T-0645)

- In the Mac app, Play watches the project's behaviours module (the one `game.json` names, else `behaviours.js`; a
  build takes only the named one, so Export Game refuses a root `behaviours.js` that `game.json` doesn't name, M6 W9) and every module it imports relatively, through the shell's
  `project.watch` (shell 0.15.0, `watchesProject`). Save one in any text editor and it is imported fresh through
  Export Game's path (`export-game.js` `freshImporter`, blob: URLs, so a graph with an import cycle can't reload) and
  swapped in on a step boundary, without restarting the scene (`src/reload.js`). Each behaviour the module provides
  keeps its state (getState, then the new class's ready and setState) when its declared state shape is unchanged
  (`stateShape`, `@vrmxg/registry`), and restarts on its node otherwise; one that declares no state keeps it only when
  its class's text is unchanged. The new instance's ready runs either way; the listeners the old one added in its
  ready go, and so do the timers and tweens it made there (core's `dropListenersOf`, `timers.cancelMadeBy`): a kept
  behaviour's timers start again from its new ready. Only what a behaviour sets up in its ready is known to be its own:
  a listener or timer made in its constructor, in a step or in a signal's handler stays, still running the old code.
- A reload that throws (the module won't import, its declarations are refused, a new ready or setState throws) keeps
  the old code running and shows the error in its own box (`behaviourError`, `#behaviour-error`), as a declaration
  refused at open does (AB-T-0654 item 5); the status says what is watched and what each reload kept or restarted
  (`#reload-state`). An edit made while not playing is picked up by the next Play.
- A play recorded across a reload is marked (its input recording's `reloaded`), and the input service refuses to
  replay a marked recording: it isn't exported, baked or used as a fixture. An exported build has no watcher
  (`apps/game/test/no-watcher.test.mjs`). In a browser tab there is no watch, so no hot reload.
- Hand test: `apps/editor-mac/docs/HAND-TEST-M6-HOT-RELOAD.md` (scenario beside it).

## Renderer (M4 W3, AB-T-0575)

The editor draws with WebGPU where the page has it, else WebGL: `?renderer=webgl|webgpu|auto` forces either (the
default is `auto`, M4 check 8). The render host is made asynchronously (`RenderHost.create`), so `openProject` waits for
it (`ready`). The status bar's **Renderer** readout says which backend drew. Exports and Check Against Scrub draw on
offline hosts of the view's backend, each with that backend's post stack (pmndrs on WebGL, TSL on WebGPU) and readback
(`readbackFor`: WebGL's pixel pack, WebGPU's output target).
- **Check Against Scrub on WebGPU** (AB-T-0590, fixed) gave 24 of 26: frames 735 and 869, the espresso's steam, TSL
  post on. three.quarks' WebGPU materials decode a particle's colour only when compiled for an sRGB output, and r187
  keeps the first compile for every later draw. An export draws frame 0 without its look, so the steam was compiled
  decoded; the scrub compiled it inside the TSL scene pass. `@vrmxg/particles/webgpu` now decodes per draw (its README).
  The check also draws one throwaway frame on its fresh host before the first row: under GPU load a fresh WebGPU host's
  first post frame could differ (frame 1079, the first row, in 7 of 8 loads; 0 of 8 after the throwaway draw).

## Takes into sequences (M3 W4, AB-T-0543)

- **A Play's take** keeps the ai log beside its input: everything injected, from a director's requests and decisions
  to MCP's. Exports and Last play replay it with no model.
- **Take files:** a `takes/*.json` may be a full take (`vrmxg-take`: its cast, input and log), as well as a bare
  input recording.
- **Export › Bake into Sequence** writes `sequences/<scene>-take.vrmxs` (`takeToSequence`) and opens it:
  - her lines become dialogue clips, and the person's go on their character;
  - the decisions and the input become tracks.
- **Timeline › Regenerate**, on a selected line, speaks its text again with the TTS voice (the shell's `tts.speak`,
  or `?tts=http://127.0.0.1:5190/speak` for `tools/tts-server.py`). It writes the clip and its timings, and changes
  the line as one undo step.
- **Check Against Scrub** samples the whole frame a fractional key or clip start falls in. A baked take's decisions
  sit between frames, on exact steps.

Writing to the project (Bake, Regenerate) needs the Mac shell; in a browser the bundled sample is read-only.

