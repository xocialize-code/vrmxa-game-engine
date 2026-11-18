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
| Export (M1 W8) | A take (the last Play, whose input is recorded from step 0, or a project input file: `input/*.json`, `takes/*.json`), its length, a size (720p to 4K), a frame rate (24, 25, 29.97, 30, 50, 60), a codec (H.264, HEVC, HEVC with alpha, ProRes 4444), sound; Export Video… builds the take's world from step 0 and runs `@vrmxg/export` into the shell's AVAssetWriter (in a browser: a hash of every frame). The result line gives frames, length, the time and its breakdown, and a digest of the frames' hashes. Save Still… (a PNG of the view at the chosen size) and Thumbnail (480×270, into the project as `thumbnails/<scene>.png`) |
| Scene | The document's tree: click selects (shift adds), drag a row onto another to reparent it, or onto the empty space to move it to the top; Add (lights, cameras, groups, colliders, markers: types that need no asset), Delete |
| Viewport | The edit view: a SceneTree of the document, built but never stepped, drawn from the editor's own camera. Click picks (a prefab's inner parts pick the instance), the gizmo moves the selection (one undo step on release), an asset dropped on it lands on the surface under the pointer (floors and table tops, not walls) |
| Inspector | Generated from the registry for the node's type: name, parent, position, rotation (degrees, yaw first), scale, then every prop by its widget (number, checkbox, list, colour, node, JSON); a set prop has a reset. A field commits on Return or leaving it |
| Assets | The project's placeable files (`@vrmxg/editor-core`'s `assetList`): drag one onto the viewport, or Add it where the view looks (the first thing in an empty scene goes at the origin) |
| MCP (M1 W9) | `vrmxg-mcp --editor` drives the open editor (`src/mcp.js`): the link polls 127.0.0.1:5183, on by default in the Mac app and with `?mcp` in a browser (`?mcp=<port>`, `?mcp=off`). Edits go through the session's command log ("Undo Add cam (MCP)"), play / step / input / interact / cues act on the play world, screenshot is the view; the status bar shows the link and the last call |
| Timeline (M2 W5) | Shown for a sequence document (a `.vrmxs` filming a set): transport (start, frame back and on, play / pause, a Frame field, timecode, In / Out / clear range, Loop), the preview camera (the shot, through the CameraBrain, or the editor's), Angles (the shot and every VirtualCamera in a grid, W3's viewports), Edit view, Fit. The ruler, headers and lanes all read one `TimelineGeometry` (pixels per frame + first visible frame): ⌘-wheel or pinch zooms about the pointer, the wheel scrolls; the ruler scrubs. Keys (diamonds), clips and shots move by drag (an edge trims) with snapping to frames, markers, shot edges, other keys and the playhead within 8 px at any zoom, or by ← → (⇧: 10 frames); Delete removes. The side panel adds tracks (type and target as buttons), shots (on a camera, which also puts a clip on the camera track), markers, keys and clips at the playhead, Camera from view (a VirtualCamera where the editor's view is), and edits the selected item's fields. Every edit is one undo step (`@vrmxg/editor-core`'s `SequenceCommands`) |
| Preview (M2 W5) | A scrub shows the frame exactly as an export renders it: a full world of the sequence in its set, put on the frame's step from snapshots every 2 s (`@vrmxg/sequence`'s `SequencePlayer`), then the render host's `frameAt`. The status shows the frame, step, α, how it got there and the world's hash, which is the hash Node, Chromium and WKWebView record for that frame. An edit rebuilds the preview (a second or two) and scrubs back to the playhead; Play follows the wall clock and skips frames the scrub can't keep up with |
| Status | Node count, saved or not, valid or not, the document's hash; after a save its size and hash, and Reopen & compare (read back from disk: same bytes, valid); after Stop, whether the scene and the edit view are as before Play; frame and build times; debug draw toggles |

Edits that only move nodes are applied to the edit view in place; anything else rebuilds it (about 300 ms for the
cafe in a browser: the characters' VRMs are parsed again, their bundles and clips kept between builds; the run-time
closet is left out of the edit view). Play builds the full world from a copy of the document, as the game does, with
the scene's camera and the keyboard, mouse and gamepad.

A project's own modules (`behaviours.js`) import `@vrmxg/core` by name; the page's import map points that at
`static/vrmxg-core.js`, which hands them the editor's own engine. Not yet: dragging several timeline items at once, curve editing of keys, a shot list separate from the shot row, MCP tools for sequences (W11), multi-selection gizmos, copy and paste,
connections in the inspector, WebCodecs export in a browser (the spike chose it as a fallback only).
