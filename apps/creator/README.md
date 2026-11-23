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
| Project of shorts | `shorts.json` lists a project's shorts (id, title, script, sequence, marks, set, coverage); a project without one (the sample) has a short per `scripts/*.fountain`. A short made here (New Short, Save As, a script opened from elsewhere) is a draft, marked • in the list, until it is saved: it never goes into `shorts.json`, and its id is free of every short and of every `sequences/<id>.vrmxs` and `scripts/<id>.fountain` in the project, so it can't open or overwrite one (New Short "Morning" in the sample is `morning-2`). `src/shorts.js` (`ShortList`) |
| Unsaved changes | Picking another short, New Short, Open Project and a script that opens another short ask first, in the window: Save, Don't Save (a draft then leaves the list) or Cancel. Closing the window or quitting doesn't ask yet: that needs the shell (AB-T-0593) |
| Script pane | The short's Fountain script with line numbers, its errors by line (click to go there) and find and replace. Typing applies 0.7 s after it stops, or Apply (⌘↩, Short › Apply Script). Undo with typing not yet applied applies it first and takes it back (Redo brings it again); Redo with typing pending applies it instead, as typing ends a redo chain: `@vrmxg/script`'s `applyScript` re-scripts the sequence, keeps hand edits, and makes the change one undo step ("Re-script (1 changed)"). A script with errors changes nothing. Undo and redo bring back the script each state was built from; typing not yet applied survives a timeline edit (`src/desk.js`, `ScriptDesk`) |
| Cameras | By rule (`@vrmxg/coverage`'s `coverByRule`, M4 W8) or the script's default. A new short is covered by rule; a short whose sequence already exists keeps what it was built with, so opening the sample changes nothing. Switching re-scripts (one undo step) |
| Viewport | The editor's preview: the sequence at the playhead, exactly as an export renders it. A short opens on its first shot's thumbnail frame |
| Storyboard | `@vrmxg/editor-ui`'s strip over `storyboard(doc, { set })`, with thumbnails drawn by `@vrmxg/coverage/thumbnails` on an offline host from a world of their own (never the preview's), 0.4 s after the document settles. Draws run one at a time; one overtaken by a newer edit stops and its pictures are dropped. Each draw's world shares the edit view's read bundles and clips and is disposed whole afterwards (`src/dispose.js`: physics, geometries, materials, textures). A card scrubs to its shot; its line button goes to the script line it came from |
| Timeline | `@vrmxg/editor-ui/Timeline.vue`, the editor's (M2 W5), on the same `SequenceCommands` |
| Cast | The script's roles (`@vrmxg/cast`'s `rolesOf`). Cast… (or opening a `.vrmxa`) puts the character in `characters/` under its name: the same file already there is reused; a different file with that name asks to Keep Both (a free name beside it), Replace or Cancel, so the card in the sequence and the file renders load are always the same bytes. It reads the card through vrmxa-core and casts it in the selected role: one undo step ("Cast HANA: Mira"), with casting's warnings. The role's lines are re-voiced in the new voice in that same step (M4 W11: `applyCast`'s `rebake` through `@vrmxg/voicing`'s `rebakeWith`, `src/voicing.js` `castAndVoice`). Takes already in the project are reused; the TTS (the shell's `tts.speak`, or `?tts=http://127.0.0.1:5190/speak`) is asked only for a line with no take, and with no TTS such lines are cast unvoiced and listed in the warnings |
| MCP | An agent makes the short through `vrmxg-mcp --creator` (M4 W11, below). The status bar's `#mcp-state` shows the link |
| Render queue | `@vrmxg/editor-ui`'s panel over editor-core's `RenderQueue`. A job renders the short as it was when queued (a snapshot), with or without its `.srt` as the job says. Cancel stops it (between frames, and after the last frame up to the moment the file is finished; the shell removes the partial file); a cancel that comes after that is shown on the done job. File › Export… renders only the job it adds. The runner exports the open short through the editor's M2 path: the shell's AVAssetWriter with sound and an `.srt` beside the movie, or frame hashes in a browser. `?queue=stub` uses `stubRunner`. W10 replaces the runner with delivery export (4K24, ProRes 4444, stills, turntable) without changing the queue or its panel |
| File › Open | A script opens as a short: the open short's own script re-scripts it from the opened text as one undo step; another short's script opens that short with it (unsaved); otherwise a new draft short with a free id. A character is cast in the selected role. A set goes under `sets/` (a `.vrmxs` that is a sequence or a prefab is refused, and refs the project doesn't hold are named), or a `.glb` with a set scene beside it (model, environment, sun, camera), as the set New Short films; name clashes ask as for characters. In a browser, files come from the page's picker and stay in memory |
| New Short | A script from a template (title page with the chosen set, one scene) built into a sequence |
| Save / Save As | The sequence, the script (when changed) and `shorts.json`. Save As makes a new short beside the old one |

Not yet: performance takes (W9), delivery
formats (W10), opening a set into the open short (a set joins the project for the next New Short), and per-role
expression vocabularies in the script build.

## MCP for shorts (M4 W11, AB-T-0583; M4 check 9)

```sh
claude mcp add vrmxg-creator -- node "$PWD/engine/packages/mcp/src/server.js" --creator   # listens on 127.0.0.1:5184
```

The page links to it in the Mac app, or in a browser with `?mcp` (`=port`, or `=off`), through the editor's `McpLink`
(`src/mcp.js`). The tools are `@vrmxg/mcp/shorts`' seven generic ones (`short`, `describe`, `command`, `render`, `read`,
`undo`, `redo`: about 420 tokens). The creator's actions are commands in a `CommandRegistry` with JSON Schemas
(`src/agent.js`), which `describe` returns on demand and `command` checks before running:

| Command | Does (each edit is one step of the creator's Undo, named with "(MCP)") |
|---|---|
| `write_script`, `patch_script` | The whole script, or exact find-and-replace edits (each find once), re-scripted through the script desk: "Re-script (1 changed) (MCP)". A script with errors changes nothing and lists them by line |
| `recast` | A `.vrmxa` in the project into a role, in a voice and outfit if given, with the role's lines re-voiced in the same step: "Cast HANA: Minimal (MCP)" |
| `revoice` | One line, one role's lines or all, in another voice or as a new take (@vrmxg/voicing `voiceLines`). New words for a line go into the script too, since the script owns the words (@vrmxg/script rule 7): the line is reworded in the script, re-scripted and voiced as one step, "Voice line "…" (new words) (MCP)" |
| `shot_camera` | An existing virtual camera on a shot, or a new one on a rig preset (@vrmxg/coverage `replaceShotCamera`, `cameraOnRig`): "Shot 030: camera vc-030-closeup (MCP)". It stays through re-scripts |
| `queue_export` | The short as it is now into the `RenderQueue` at a preset; `run: true` renders that job. Not an edit |
| `save` | `saveShort`. Not an edit |

The agent's session is `asAgent(session)`: the packages make their usual single `session.run`, and the label gets the
mark. `command` refuses an edit that made more than one step. Text from files (the script, its lines, `read`) comes back
inside a `content` field with a note that it is data, not instructions. Queuing and saving apply only typing not yet
applied: building an applied script again added a step of its own and put a re-voiced line's words back (found by the
first agent session).

**Checked (2026-11-23).** `test/agent.test.mjs` drives every command on the sample short in Node (a stand-in TTS): the
schemas and refusals, content marking (a line that reads like an order stays inside `content`), each edit one marked
step with exact bytes on undo and redo, a recast re-voiced in its step, takes reused, casting without a TTS, and a
re-script after the agent's camera keeping it. In the Mac app, `apps/creator-mac/scripts/mcp-session.mjs` ran a Claude
Code session (Sonnet, the creator's tools only, Kokoro through `tts-server.py`): 19 calls, none failed, $0.17
(`apps/creator-mac/docs/hand-test/results/mcp-creator-session.json`). AppProbe then walked its four steps back and forth
in the creator's Undo (`apps/creator-mac/docs/HAND-TEST-M4-MCP.md`).

Tests (`node --test test/`, in `npm test`): the project of shorts (discovery, `shorts.json`, title pages, beats, file
kinds, a set from a model, the template), and the script pane on the sample short (`desk.test.mjs`): opening it changes
nothing; a script edit after a hand edit is one undo step that keeps the hand edit, and undo and redo bring the script
back with the document; an error changes nothing and points at its line; unapplied typing survives a timeline edit; a
new short builds by rule with the same bytes twice.
