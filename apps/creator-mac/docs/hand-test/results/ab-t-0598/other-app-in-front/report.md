# Creator hand test (M4 W5): AppProbe scenario: run of Nov 23, 2026 at 7:22 PM

- **App:** VRMXG Creator 0.1.0 (1), /Volumes/Satechi/Development/vrmxa-game-engine/.claude/worktrees/m4-w0-webgpu-host-165ee5/apps/creator-mac/build/VRMXGCreator.app
- **Scenario:** `/Volumes/Satechi/Development/vrmxa-game-engine/.claude/worktrees/m4-w0-webgpu-host-165ee5/apps/creator-mac/docs/hand-test/HAND-TEST-M4-CREATOR.scenario.md`
- **Checklist:** `/Volumes/Satechi/Development/vrmxa-game-engine/.claude/worktrees/m4-w0-webgpu-host-165ee5/apps/creator-mac/docs/HAND-TEST-M4-CREATOR.md`
- **Result:** 15 rows: 13 passed, 2 failed, 0 need you; 0 checklist rows have no steps

## Failed

### 14. Leaving a short with unsaved changes asks first: Cancel stays, Don't Save goes back to th…

** (checklist line 26)

> Leaving a short with unsaved changes asks first: Cancel stays, Don't Save goes back to the saved short.

**Failed:** after 3 tries, still not find("id=script-find").0.value == "Then you'd better come in.": "[[gret]]"

- 👀 shot 1: end
- ❌ `find("id=script-find").0.value == "Then you'd better come in."`, got `"[[gret]]"`

![14-1](shots/r14-1.png)

<details><summary>Steps (3476 ms)</summary>

```
226: act id=script-find action=set_value value="Then you'd better come in." → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":26,"w":102,"x":3000,"y":438},"help":"","id":"script-find","name":"Find in script","ref":"W: (462 ms)
226: act id=script-find action=set_value value="Then you'd better come in." → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":26,"w":102,"x":3000,"y":438},"help":"","id":"script-find","name":"Find in script","ref":"W: (456 ms)
226: act id=script-find action=set_value value="Then you'd better come in." → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":26,"w":102,"x":3000,"y":438},"help":"","id":"script-find","name":"Find in script","ref":"W: (464 ms)
```
</details>

### 15. New Short makes a short in the chosen set from a script template

** (checklist line 27)

> New Short makes a short in the chosen set from a script template.

**Failed:** after 3 tries, still not find("id=new-short-title").0.value == "Third Take": "Second take"

- 👀 shot 1: end
- ❌ `find("id=new-short-title").0.value == "Third Take"`, got `"Second take"`

![15-1](shots/r15-1.png)

<details><summary>Steps (3379 ms)</summary>

```
249: act id=new-short-title action=set_value value="Third Take" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":26,"w":129,"x":3357,"y":324},"help":"","id":"new-short-title","name":"New short title","ref (424 ms)
249: act id=new-short-title action=set_value value="Third Take" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":26,"w":129,"x":3357,"y":324},"help":"","id":"new-short-title","name":"New short title","ref (440 ms)
249: act id=new-short-title action=set_value value="Third Take" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":26,"w":129,"x":3357,"y":324},"help":"","id":"new-short-title","name":"New short title","ref (437 ms)
```
</details>

## Passed

- **1. The project opens with its short, and the short with its sequence, storyboard and timelin…** (checklist line 13): find("id=doc-state").0.name matches "^Short cafe-order "; find("id=project-name").0.name == "Project project"; find("id=doc-state").0.name matches "^Short cafe-order sequences/cafe-order.vrmxs [0-9]+ nodes saved valid "; find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails"; find("id=short-cafe-order").0.name == "Short The Order (cafe-order)"; find("id=tl-head-shots").count == 1; find("id=undo").0.name == "Undo"; find("id=tl-scrub").0.name matches "^Showing frame 24 step 60 " (9255 ms)
- **2. File › Open… opens a Fountain script from outside the project: a new short, built with ca…** (checklist line 14): find("id=open-result").0.name == "Opened first-light.fountain (script) → short first-light"; find("id=doc-state").0.name matches "^Short first-light sequences/first-light.vrmxs [0-9]+ nodes unsaved changes valid "; find("id=sb-status").0.name == "Storyboard 5 shots, 5 thumbnails"; find("id=coverage-rule").0.value == "1"; find("role=button name='Clip vc-est-int-cafe-dawn 0 to 48' exact=true").count == 1; find("id=tl-head-mira-says").count == 1; find("id=short-first-light").0.name == "Short First Light (first-light), not saved"; find("id=tl-scrub").0.name matches "^Showing frame 24 " (4582 ms)
- **3. A hand edit on the timeline is one undo step** (checklist line 15): find("id=undo").0.name == "Undo Move clip hana-1-act 1"; find("role=button name='Clip greet 213 to 249' exact=true").count == 1 (2582 ms)
- **4. Editing the script re-scripts the sequence as one undo step and keeps the hand edit; Edit…** (checklist line 16): find("id=script-find").0.value == "first cup today."; find("id=script-replace").0.value == "first cup of the day."; find("id=undo").0.name == "Undo Re-script (1 changed)"; find("role=button name='Clip greet 213 to 249' exact=true").count == 1; find("role=button name='first cup of the day.'").count == 1; find("id=script-state").0.name matches "applied unsaved$"; find("id=undo").0.name == "Undo Move clip hana-1-act 1"; find("id=doc-state").0.name == $before; find("id=script value='first cup today.'").count == 1; find("id=doc-state").0.name == $after; find("id=script value='first cup of the day.'").count == 1 (8749 ms)
- **5. A script with an error changes nothing and points at its line; fixing it changes nothing …** (checklist line 17): find("id=script-find").0.value == "[[greet]]"; find("id=script-replace").0.value == "[[gret]]"; find("id=script-errors").count == 1; find("role=button name='Error at line 17: [[gret]]'").count == 1; find("id=doc-state").0.name == $after; find("id=undo").0.name == "Undo Re-script (1 changed)"; find("id=script-find").0.value == "[[gret]]"; find("id=script-replace").0.value == "[[greet]]"; find("id=script-errors").count == 0; find("id=script-state").0.name matches " applied "; find("id=doc-state").0.name == $after; find("id=undo").0.name == "Undo Re-script (1 changed)" (3515 ms)
- **6. Typing in the script pane applies once typing stops, as one undo step; Undo while typing …** (checklist line 18): find("id=undo").0.name == "Undo Re-script (1 added)"; find("id=script-state").0.name matches " applied unsaved$"; find("id=redo").0.name == "Redo Re-script (1 changed)"; find("id=undo").0.name == "Undo Re-script (1 added)"; find("id=redo").0.name == "Redo Re-script (1 changed)"; find("id=doc-state").0.name == $start; find("id=script value='Hana smiles.'").count == 0 (11914 ms)
- **7. A character opened from the Finder is cast in the selected role, as one undo step** (checklist line 19): find("id=undo").0.name == "Undo Cast HANA: Mira"; find("id=role-hana-1").0.name matches "cast characters/mira-guest\.vrmxa"; find("id=cast-result").0.name matches "^Cast Mira as hana-1: Cast HANA: Mira" (3372 ms)
- **8. Save writes the short into the project: its sequence, its script and shorts** (checklist line 20): find("id=saved").0.name matches "^Saved sequences/first-light.vrmxs · [0-9]+ bytes · [0-9a-f]{16} · scripts/first-light.fountain$"; find("id=doc-state").0.name matches " saved valid "; find("id=script-state").0.name matches "applied saved$" (447 ms)
- **9. File › Export… queues the short and renders it through the shell** (checklist line 21): find("id=q-job-1-status").0.name matches "^job-1 (rendering|starting)"; find("id=q-job-1-status").0.name matches "^job-1 (done|failed)"; find("id=q-job-1-status").0.name matches "^job-1 done: 397 frames · first-light-720p24\\.mp4 · frames [0-9a-f]{16}$" (4201 ms)
- **10. Cancel stops a running render and leaves no movie behind; File › Export… renders only the…** (checklist line 22): find("id=q-job-2-status").0.name == "job-2 queued"; find("id=q-job-2-status").0.name == "job-2 starting"; find("id=q-job-2-status").0.name == "job-2 cancelled"; find("id=q-job-3-status").0.name == "job-3 queued"; find("id=q-job-4-status").0.name matches "^job-4 done: 397 frames"; find("id=q-job-3-status").0.name == "job-3 queued" (6143 ms)
- **11. A delivery preset renders the film for delivery into the project's deliveries folder, dra…** (checklist line 23): find("id=q-job-3").count == 0; find("id=q-stills").count == 1; find("id=q-stills").0.value == "1"; find("id=q-thumbnails").0.value == "1"; find("id=q-turntable").0.value == "1"; find("id=q-check").0.value == "1"; find("id=q-job-5-status").0.name == "job-5 queued"; find("id=q-job-5-label").0.name == "job-5 First Light · Delivery 1080p24 HEVC · checked"; find("id=q-job-5-status").0.name matches "^job-5 rendering [0-9]+ of 120 \\(turntable "; find("id=q-job-5-status").0.name matches "^job-5 (done|failed)"; find("id=q-job-5-status").0.name matches "^job-5 done: 397 frames · first-light-1080p24-hevc\\.mp4 · frames [0-9a-f]{16} · 5 stills · 5 thumbnails · 2 turntables · 15 files on disk · redraw check: (every frame twice the same|[0-9]+ odd draws? outvoted)$" (12647 ms)
- **12. ProRes 4444 at 4K draws on WebGL when the job says so, the extras as ticked; H** (checklist line 24): find("id=q-turntable").0.value == "0"; find("id=q-check").0.value == "0"; find("id=q-job-6-status").0.name == "job-6 queued"; find("id=q-job-6-label").0.name == "job-6 First Light · Delivery 4K24 ProRes 4444 with alpha · WebGL"; find("id=q-check").0.value == "1"; find("id=q-job-7-status").0.name == "job-7 queued"; find("id=q-job-7-label").0.name == "job-7 First Light · Delivery 4K24 H.264 · checked"; find("id=q-job-7-status").0.name matches "^job-7 (done|failed)"; find("id=q-job-6-status").0.name matches "^job-6 done: 397 frames · first-light-4k24-prores\\.mov · frames [0-9a-f]{16} · 5 stills · 5 thumbnails · 0 turntables · 13 files on disk$"; find("id=q-job-7-status").0.name matches "^job-7 done: 397 frames · first-light-4k24-h264\\.mp4 · frames [0-9a-f]{16} · 0 stills · 0 thumbnails · 0 turntables · 3 files on disk · redraw check: (every frame twice the same|[0-9]+ odd draws? outvoted)$" (24981 ms)
- **13. The File and Short menus carry the creator's own items** (checklist line 25): menu("File › New Short").enabled == true; menu("File › Open Script…").enabled == true; menu("File › Open Character…").enabled == true; menu("File › Open Set…").enabled == true; menu("File › Export…").enabled == true; menu("Short › Apply Script").enabled == true; menu("Short › Render Queue").enabled == true (1260 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 14 | Leaving a short with unsaved changes asks first: Cancel stays, Don't Save goes back to th… | after 3 tries, still not find("id=script-find").0.value == "Then you'd better come in.": "[[gret]]" | (none) | |
| 15 | New Short makes a short in the chosen set from a script template | after 3 tries, still not find("id=new-short-title").0.value == "Third Take": "Second take" | (none) | |
