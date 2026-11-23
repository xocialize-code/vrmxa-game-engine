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
| Finder | Opening a `.fountain`, `.vrmxa`, `.vrmxs` or `.glb` with the app (Open Documents) does what File › Open does. The app declares those types at `LSHandlerRank` Alternate: it never claims to be their default app |

**Hand test (AppProbe, 2026-11-23).** [`docs/HAND-TEST-M4-CREATOR.md`](docs/HAND-TEST-M4-CREATOR.md) and its scenario,
10 of 10 rows passed under the GPU lock ([report](docs/hand-test/results/m4-creator/report.md)):
1. The project opens on the sample short with its sequence, an 11-card storyboard with thumbnails and the timeline, and
   no undo step.
2. File › Open… opens `first-light.fountain` from outside the project as a new short, covered by rule, with a 5-card
   storyboard.
3. A hand edit is one undo step. A script edit through find and replace is one more ("Re-script (1 changed)") that keeps
   it, and Edit › Undo / Redo bring the document (same hash) and the script back.
4. A script error changes nothing and names line 17.
5. A `.vrmxa` opened the Finder's way is copied into the project and cast as one undo step.
6. Save writes the sequence, the script and `shorts.json`.
7. File › Export… renders the short through the shell: 397 frames, H.264 720p24 with AAC sound and an `.srt` of the
   re-scripted lines, in under 5 s.
8. The menus carry the creator's items, and New Short builds a short from the template.

Screenshots in `docs/hand-test/shots/`. Typed values are checked and retried in the scenario: in the first run, keys
sent while the page was busy (a rebuild after Redo, an export) were dropped.
