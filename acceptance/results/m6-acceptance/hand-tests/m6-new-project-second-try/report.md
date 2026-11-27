# New Project, Open Recent and project settings (M6 W3): AppProbe scenario: run of Nov 27, 2026 at 10:04 AM

- **App:** VRMXG Editor 0.1.0 (1), <repo>/apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `<repo>/apps/editor-mac/docs/hand-test/HAND-TEST-M6-NEW-PROJECT.scenario.md`
- **Checklist:** `<repo>/apps/editor-mac/docs/HAND-TEST-M6-NEW-PROJECT.md`
- **Result:** 10 rows: 6 passed, 0 failed, 2 errors, 0 need you, 2 skipped; 0 checklist rows have no steps

## Errors (the run's, not necessarily the app's)

### 5. Physics layers: added by name, and the collision matrix changes both layers at once

** (checklist line 26)

> Physics layers: added by name, and the collision matrix changes both layers at once.

**Error:** DISABLED: button "Add layer" is disabled: 

- 👀 shot 1: end

![5-1](shots/r5-1.png)

<details><summary>Steps (1707 ms)</summary>

```
86: act id=settings-new-layer action=set_value value=player commit=none → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":24,"w":156,"x":3410,"y":846},"help":"","id":"settings-new-layer","name":"New layer name","r (384 ms)
```
</details>

### 6. Export Game writes the new game's build, named by its id

** (checklist line 27)

> Export Game writes the new game's build, named by its id.

**Error:** ELEMENT_NOT_FOUND: no element matches id=export-open

- 👀 shot 1: end

![6-1](shots/r6-1.png)

<details><summary>Steps (448 ms)</summary>

```
```
</details>

## Passed

- **1. File › New Project… makes a game from "One level": named in the sheet, made in a new fold…** (checklist line 22) ◐: partly checked, not: the folder's files and their licences are checked outside the app (new-project-mac.mjs); find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=template-level").0.value == "1"; find("id=template-empty").count == 1; find("id=new-project-id").0.value == "cafe-dash"; find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid"; find("id=project-name").0.name == "Project Cafe Dash"; find("role=alert").count == 0 (5080 ms)
- **2. Play in place plays the new level, and Stop puts the scene back as it was** (checklist line 23) ◐: partly checked, not: nobody walks Mira to the counter here (a held key isn't a step AppProbe has); the game app does it, row 9; find("text=Playing · step").0.name matches "step [1-9][0-9]{2}"; find("id=stop-result").0.name matches "^Stopped: scene as before Play" (3316 ms)
- **3. Project Settings: a title change is one undo step, written to game** (checklist line 24) ◐: partly checked, not: game.json on disk is read by new-project-mac.mjs (title "Cafe Dash Deluxe"); find("id=settings-title").0.value == "Cafe Dash"; find("id=settings-id").0.value == "cafe-dash"; find("id=settings-undo").0.name == "Undo Title Cafe Dash Deluxe"; find("id=settings-title").0.value == "Cafe Dash"; find("id=settings-redo").0.name == "Redo Title Cafe Dash Deluxe"; find("id=settings-title").0.value == "Cafe Dash Deluxe"; find("id=settings-error").count == 0 (1608 ms)
- **4. Rebinding: Jump takes the key pressed (J); a key another action has (E, Interact's) asks …** (checklist line 25) ◐: partly checked, not: a gamepad button wasn't captured (no pad here, AB-T-0642); new-project-mac.mjs reads jump's KeyJ from game.json; find("id=settings-bind-jump-keyboard").0.name == "Press a key for Jump, or Escape to cancel"; find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: J. Change"; find("id=settings-undo").0.name == "Undo Jump: J"; find("text=E is Interact now. Move it to Jump?").count > 0; find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: E. Change"; find("id=settings-bind-interact-keyboard").0.name == "Interact, keyboard: Left click. Change"; find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: J. Change"; find("id=settings-bind-interact-keyboard").0.name == "Interact, keyboard: E, Left click. Change" (843 ms)
- **7. New Project from "Empty game": the project opens on its one scene, plays, and exports** (checklist line 28): find("id=template-empty").0.value == "1"; find("id=new-project-id").0.value == "blank"; find("id=doc-state").0.name matches "^Scene main.vrmxs 6 nodes saved valid"; find("id=project-name").0.name == "Project Blank"; find("text=Playing · step").0.name matches "step [1-9][0-9]{2}"; find("id=stop-result").0.name matches "^Stopped: scene as before Play"; find("id=export-game-result").0.name matches "^Exported game blank: .*entry main.vrmxs.*/m6-builds/blank$" (1928 ms)
- **8. File › Open Recent reopens the first project, with no panel, on its level** (checklist line 29): menu("File › Open Recent").items.0.name == "Blank"; find("id=project-name").0.name == "Project Cafe Dash"; find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid"; find("id=open-recent").0.value == "Recent…" (1708 ms)
## Skipped

- **9. The builds are whole, and the game app plays each: the level to its ending (`templates-ga…** (checklist line 30): run outside the app: node acceptance/m6/templates-game.mjs <container>/tmp/m6-builds/cafe-dash <container>/tmp/m6-builds/blank (0 ms)
- **10. The folder panel: New Project with no hook asks where the folder goes and what it is call…** (checklist line 31): run by HAND-TEST-M6-NEW-PROJECT-recent.scenario.md, which has no new-project hook (the real save panel) (0 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 5 | Physics layers: added by name, and the collision matrix changes both layers at once | run error: DISABLED: button "Add layer" is disabled:  | (none) | |
| 6 | Export Game writes the new game's build, named by its id | run error: ELEMENT_NOT_FOUND: no element matches id=export-open | (none) | |
