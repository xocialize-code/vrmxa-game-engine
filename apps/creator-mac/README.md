# VRMXG creator for the Mac

M4 W5 (AB-T-0577). The creator's web build on the shared shell (`apps/shell`, AB-D-0253), with `pageUndo` so Edit ›
Undo / Redo reach the short's history. No Xcode project: `scripts/build.sh` runs the Vite build, `swift build` and an ad
hoc signature.

```sh
apps/creator-mac/scripts/build.sh                 # build/VRMXGCreator.app (SKIP_WEB=1 reuses apps/creator/dist)
open apps/creator-mac/build/VRMXGCreator.app
apps/creator-mac/scripts/hand-test-fixtures.sh    # a fresh sample project and an inbox of files to open, in the app's sandbox
```

| Menu | Items (each sends the page `menu.<event>`; shell 0.7.0) |
|---|---|
| File | Open… (a script, character or set: the shell's binary open, AB-A-0314, `serve: true`), Open Project…, New Short (⌘N), Open Script…, Open Character…, Open Set…, Export… (⌘E: queue the open short at the draft preset and render it), Save, Save As… |
| Short | Apply Script (⌘↩), Render Queue (⌥⌘R) |
| Finder | Opening a `.fountain`, `.vrmxa`, `.vrmxs` or `.glb` with the app (Open Documents, `openTypes`) does what File › Open does. The app declares those types at `LSHandlerRank` Alternate: it never claims to be their default app |

**Hand test (AppProbe, 2026-11-23).** [`docs/HAND-TEST-M4-CREATOR.md`](docs/HAND-TEST-M4-CREATOR.md) and its scenario,
13 of 13 rows passed under the GPU lock ([report](docs/hand-test/results/m4-creator/report.md)):
1. The project opens on the sample short with its sequence, an 11-card storyboard with thumbnails and the timeline, and
   no undo step.
2. File › Open… opens `first-light.fountain` from outside the project as a new draft short, covered by rule, with a 5-card
   storyboard.
3. A hand edit is one undo step. A script edit through find and replace is one more ("Re-script (1 changed)") that keeps
   it, and Edit › Undo / Redo bring the document (same hash) and the script back. A script error changes nothing and
   names line 17.
4. Typing in the pane applies after 0.7 s as one step. Undo while typing is unapplied takes the typing back, and
   nothing applies after it.
5. A `.vrmxa` opened the Finder's way is copied into the project and cast as one undo step.
6. Save writes the sequence, the script and `shorts.json` (saved shorts only).
7. File › Export… renders the short through the shell: 397 frames, H.264 720p24 with AAC sound and an `.srt` of the
   re-scripted lines. A running job cancelled leaves no movie, and Export… renders only the job it adds.
8. Leaving a short with unsaved changes asks: Cancel stays, Don't Save goes back to the saved short.
9. The menus carry the creator's items, and New Short builds a draft short from the template.
10. M4 W10, delivery: a delivery preset renders into the project's `deliveries/<name>/` (film with sound, `.srt`, a still
    and a thumbnail per shot, a turntable per character, `delivery.json`), and the job's line says how many files the
    runner then found on disk (15). ProRes 4444 4K draws on WebGL when the job says so; H.264 4K with the redraw check
    outvoted one odd WebGPU draw in the final run. 15 of 15 rows ([report](docs/hand-test/results/m4-w10-delivery/report.md)).

Screenshots in `docs/hand-test/shots/`. Typed values are checked and retried in the scenario: in the first run, keys
sent while the page was busy (a rebuild after Redo, an export) were dropped. A cancel during the frames themselves is
too quick to catch from AppProbe (a 761-frame ProRes export draws its frames in about 2 s); `@vrmxg/export`'s tests
cover a cancel at and after the last frame.

**MCP (M4 W11, AB-T-0583).** The page links to `vrmxg-mcp --creator` (127.0.0.1:5184) whenever it runs in the app.
`scripts/mcp-session.mjs` runs a Claude Code session with only the creator's tools against the open app, and
[`docs/HAND-TEST-M4-MCP.md`](docs/HAND-TEST-M4-MCP.md) with its scenario checks that each of the agent's edits is a step
of the creator's Undo marked "(MCP)": 4 of 4 rows passed on 2026-11-23 ([report](docs/hand-test/results/m4-mcp/report.md)).
Launch with `VRMXG_QUERY=tts=http://127.0.0.1:5190/speak` (and `content/sample/tools/tts-server.py`) for the voicing;
the shell has no `tts.speak` yet, so without it a recast re-voices only from takes already in the project and lists the
lines left to voice.
