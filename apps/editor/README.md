# VRMXG editor

M1 W7 (AB-T-0519). Build a scene from a project's assets, edit it, play it in place. Vite + Vue over
`@vrmxg/editor-core`; the engine side (`src/host.js`) lives outside Vue, which only ever holds plain copies of what the
panels show (the tree, the inspector's fields, the asset list), refreshed when the host says something changed.

```sh
npm run dev --prefix apps/editor        # http://localhost:5182, the sample project (read-only in a browser)
apps/editor-mac/scripts/build.sh        # the Mac app, where Open Project… mounts a folder and Save writes into it
```

| Panel | What |
|---|---|
| Toolbar | Open Project… (Mac), the project's scenes, a file name for New and Save As…, Save, Undo / Redo (named after the step: "Undo Move mira"), Move / Rotate / Scale, Snap (0.25 m, 15°, 0.1), Orbit or Fly view, Frame, Export, Play / Stop |
| Export (M1 W8) | A take (the last Play, whose input is recorded from step 0, or a project input file: `input/*.json`, `takes/*.json`), its length, a size (720p to 4K), a frame rate (24, 25, 29.97, 30, 50, 60), a codec (H.264, HEVC, HEVC with alpha, ProRes 4444), sound; Export Video… builds the take's world from step 0 and runs `@vrmxg/export` into the shell's AVAssetWriter (in a browser: a hash of every frame). The result line gives frames, length, the time and its breakdown, and a digest of the frames' hashes. Save Still… (a PNG of the view at the chosen size) and Thumbnail (480×270, into the project as `thumbnails/<scene>.png`) |
| Scene | The document's tree: click selects (shift adds), drag a row onto another to reparent it, or onto the empty space to move it to the top; Add (lights, cameras, groups, colliders, markers: types that need no asset), Delete |
| Viewport | The edit view: a SceneTree of the document, built but never stepped, drawn from the editor's own camera. Click picks (a prefab's inner parts pick the instance), the gizmo moves the selection (one undo step on release), an asset dropped on it lands on the surface under the pointer (floors and table tops, not walls) |
| Inspector | Generated from the registry for the node's type: name, parent, position, rotation (degrees, yaw first), scale, then every prop by its widget (number, checkbox, list, colour, node, JSON); a set prop has a reset. A field commits on Return or leaving it |
| Assets | The project's placeable files (`@vrmxg/editor-core`'s `assetList`): drag one onto the viewport, or Add it where the view looks (the first thing in an empty scene goes at the origin) |
| MCP (M1 W9) | `vrmxg-mcp --editor` drives the open editor (`src/mcp.js`): the link polls 127.0.0.1:5183, on by default in the Mac app and with `?mcp` in a browser (`?mcp=<port>`, `?mcp=off`). Edits go through the session's command log ("Undo Add cam (MCP)"), play / step / input / interact / cues act on the play world, screenshot is the view; the status bar shows the link and the last call |
| Status | Node count, saved or not, valid or not, the document's hash; after a save its size and hash, and Reopen & compare (read back from disk: same bytes, valid); after Stop, whether the scene and the edit view are as before Play; frame and build times; debug draw toggles |

Edits that only move nodes are applied to the edit view in place; anything else rebuilds it (about 300 ms for the
cafe in a browser: the characters' VRMs are parsed again, their bundles and clips kept between builds; the run-time
closet is left out of the edit view). Play builds the full world from a copy of the document, as the game does, with
the scene's camera and the keyboard, mouse and gamepad.

A project's own modules (`behaviours.js`) import `@vrmxg/core` by name; the page's import map points that at
`static/vrmxg-core.js`, which hands them the editor's own engine. Not yet: multi-selection gizmos, copy and paste,
connections in the inspector, WebCodecs export in a browser (the spike chose it as a fallback only).
