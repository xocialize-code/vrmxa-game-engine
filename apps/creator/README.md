# VRMXG creator

M4 W5 (AB-T-0577; decision AB-D-0276: the creator is its own app). The anime creator: write a short as a Fountain script,
see it as a sequence, a storyboard and a timeline, hand-edit it, cast it, and queue it for render. Vite + Vue; the
engine side (`src/host.js`) is the editor's host (`apps/editor/src/host.js`: the session, the preview and scrub through
`SequencePlayer`, the render host on WebGPU or WebGL, export through the shell) with what a short adds.

```sh
npm run dev --prefix apps/creator        # http://localhost:5185, the sample project (opened files and saves stay in memory)
apps/creator-mac/scripts/build.sh        # the Mac app, where Open Project… mounts a folder and Save writes into it
```

| Panel | What |
|---|---|
| Project of shorts | `shorts.json` lists a project's shorts (id, title, script, sequence, marks, set, coverage); a project without one (the sample) has a short per `scripts/*.fountain`. Save writes it. `src/shorts.js` |
| Script pane | The short's Fountain script with line numbers, its errors by line (click to go there) and find and replace. Typing applies 0.7 s after it stops, or Apply (⌘↩, Short › Apply Script): `@vrmxg/script`'s `applyScript` re-scripts the sequence, keeps hand edits, and makes the change one undo step ("Re-script (1 changed)"). A script with errors changes nothing. Undo and redo bring back the script each state was built from; typing not yet applied survives a timeline edit (`src/desk.js`, `ScriptDesk`) |
| Cameras | By rule (`@vrmxg/coverage`'s `coverByRule`, M4 W8) or the script's default. A new short is covered by rule; a short whose sequence already exists keeps what it was built with, so opening the sample changes nothing. Switching re-scripts (one undo step) |
| Viewport | The editor's preview: the sequence at the playhead, exactly as an export renders it. A short opens on its first shot's thumbnail frame |
| Storyboard | `@vrmxg/editor-ui`'s strip over `storyboard(doc, { set })`, with thumbnails drawn by `@vrmxg/coverage/thumbnails` on an offline host from a world of their own (never the preview's), 0.4 s after the document settles. A card scrubs to its shot; its line button goes to the script line it came from |
| Timeline | `@vrmxg/editor-ui/Timeline.vue`, the editor's (M2 W5), on the same `SequenceCommands` |
| Cast | The script's roles (`@vrmxg/cast`'s `rolesOf`). Cast… (or opening a `.vrmxa`) copies the character into `characters/`, reads its card through vrmxa-core and casts it in the selected role: one undo step ("Cast HANA: Mira"), with casting's warnings. W7 adds the re-bake of the role's lines to that step (`applyCast`'s `rebake` hook) |
| Render queue | `@vrmxg/editor-ui`'s panel over editor-core's `RenderQueue`. The runner exports the open short through the editor's M2 path: the shell's AVAssetWriter with sound and an `.srt` beside the movie, or frame hashes in a browser. `?queue=stub` uses `stubRunner`. W10 replaces the runner with delivery export (4K24, ProRes 4444, stills, turntable) without changing the queue or its panel |
| File › Open | A script opens as a short: its own if the project has one by that name, re-scripted from the opened text as one undo step; otherwise a new short, built and opened unsaved. A character is cast in the selected role. A set (`.vrmxs`, or a `.glb` wrapped in a set scene: model, environment, sun, camera) joins the project as the set New Short films. In a browser, files come from the page's picker and stay in memory |
| New Short | A script from a template (title page with the chosen set, one scene) built into a sequence |
| Save / Save As | The sequence, the script (when changed) and `shorts.json`. Save As makes a new short beside the old one |

Not yet: MCP for shorts (W11; the editor's `McpLink` pattern applies), voicing (W7), performance takes (W9), delivery
formats (W10), opening a set into the open short (a set joins the project for the next New Short), and per-role
expression vocabularies in the script build.

Tests (`node --test test/`, in `npm test`): the project of shorts (discovery, `shorts.json`, title pages, beats, file
kinds, a set from a model, the template), and the script pane on the sample short (`desk.test.mjs`): opening it changes
nothing; a script edit after a hand edit is one undo step that keeps the hand edit, and undo and redo bring the script
back with the document; an error changes nothing and points at its line; unapplied typing survives a timeline edit; a
new short builds by rule with the same bytes twice.
