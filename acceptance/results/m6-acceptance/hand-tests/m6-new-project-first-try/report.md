# New Project, Open Recent and project settings (M6 W3): AppProbe scenario: run of Nov 27, 2026 at 10:04 AM

- **App:** VRMXG Editor 0.1.0 (1), <repo>/apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `<repo>/apps/editor-mac/docs/hand-test/HAND-TEST-M6-NEW-PROJECT.scenario.md`
- **Checklist:** `<repo>/apps/editor-mac/docs/HAND-TEST-M6-NEW-PROJECT.md`
- **Result:** 10 rows: 7 passed, 1 failed, 0 need you, 2 skipped; 0 checklist rows have no steps

## Failed

### 4. Rebinding: Jump takes the key pressed (J); a key another action has (E, Interact's) asks …

** (checklist line 25)

> Rebinding: Jump takes the key pressed (J); a key another action has (E, Interact's) asks first, Move It moves it, and Undo puts both back.

**Failed:** after 10000 ms, still not find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: J. Change": "Press a key for Jump, or Escape to cancel"

- 👀 shot 1: end
- ✅ `find("id=settings-bind-jump-keyboard").0.name == "Press a key for Jump, or Escape to cancel"`
- ❌ `find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: J. Change"`, got `"Press a key for Jump, or Escape to cancel"`

![4-1](shots/r4-1.png)

<details><summary>Steps (11669 ms)</summary>

```
67: act id=settings-bind-jump-keyboard action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":125,"x":3999,"y":722},"help":"","id":"settings-bind-jump-keyboard","name":"Jump, keyboar (27 ms)
68: until find("id=settings-bind-jump-keyboard").0.name == "Press a key for Jump, or Escape to cancel" → ok (12 ms)
69: keys keys=j → {"sent":true} (112 ms)
70: until find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: J. Change" → timed out, last "Press a key for Jump, or Escape to cancel" (10226 ms)
```
</details>

## Passed

- **1. File › New Project… makes a game from "One level": named in the sheet, made in a new fold…** (checklist line 22) ◐: partly checked, not: the folder's files and their licences are checked outside the app (new-project-mac.mjs); find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=template-level").0.value == "1"; find("id=template-empty").count == 1; find("id=new-project-id").0.value == "cafe-dash"; find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid"; find("id=project-name").0.name == "Project Cafe Dash"; find("role=alert").count == 0 (5584 ms)
- **2. Play in place plays the new level, and Stop puts the scene back as it was** (checklist line 23) ◐: partly checked, not: nobody walks Mira to the counter here (a held key isn't a step AppProbe has); the game app does it, row 9; find("text=Playing · step").0.name matches "step [1-9][0-9]{2}"; find("id=stop-result").0.name matches "^Stopped: scene as before Play" (3077 ms)
- **3. Project Settings: a title change is one undo step, written to game** (checklist line 24) ◐: partly checked, not: game.json on disk is read by new-project-mac.mjs (title "Cafe Dash Deluxe"); find("id=settings-title").0.value == "Cafe Dash"; find("id=settings-id").0.value == "cafe-dash"; find("id=settings-undo").0.name == "Undo Title Cafe Dash Deluxe"; find("id=settings-title").0.value == "Cafe Dash"; find("id=settings-redo").0.name == "Redo Title Cafe Dash Deluxe"; find("id=settings-title").0.value == "Cafe Dash Deluxe"; find("id=settings-error").count == 0 (1399 ms)
- **5. Physics layers: added by name, and the collision matrix changes both layers at once** (checklist line 26) ◐: partly checked, not: new-project-mac.mjs reads collides { default: [default, player], pickup: [player, pickup] } from game.json; find("id=settings-layer-1").0.value == "player"; find("id=settings-layer-0").0.value == "default"; find("id=settings-layer-2").0.value == "pickup"; find("id=settings-collide-default-pickup").0.value == "0"; find("id=settings-undo").0.name == "Undo default passes through pickup" (1666 ms)
- **6. Export Game writes the new game's build, named by its id** (checklist line 27) ◐: partly checked, not: the build is checked and played outside the app (row 9); find("id=export-game-result").0.name matches "^Exported game cafe-dash: [0-9]+ files, [0-9]+ bytes, entry level.vrmxs, runtime vrmxg-game .*/m6-builds/cafe-dash$"; find("role=alert").count == 0 (793 ms)
- **7. New Project from "Empty game": the project opens on its one scene, plays, and exports** (checklist line 28): find("id=template-empty").0.value == "1"; find("id=new-project-id").0.value == "blank"; find("id=doc-state").0.name matches "^Scene main.vrmxs 6 nodes saved valid"; find("id=project-name").0.name == "Project Blank"; find("text=Playing · step").0.name matches "step [1-9][0-9]{2}"; find("id=stop-result").0.name matches "^Stopped: scene as before Play"; find("id=export-game-result").0.name matches "^Exported game blank: .*entry main.vrmxs.*/m6-builds/blank$" (1952 ms)
- **8. File › Open Recent reopens the first project, with no panel, on its level** (checklist line 29): menu("File › Open Recent").items.0.name == "Blank"; find("id=project-name").0.name == "Project Cafe Dash"; find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid"; find("id=open-recent").0.value == "Recent…" (1693 ms)
## Skipped

- **9. The builds are whole, and the game app plays each: the level to its ending (`templates-ga…** (checklist line 30): run outside the app: node acceptance/m6/templates-game.mjs <container>/tmp/m6-builds/cafe-dash <container>/tmp/m6-builds/blank (0 ms)
- **10. The folder panel: New Project with no hook asks where the folder goes and what it is call…** (checklist line 31): run by HAND-TEST-M6-NEW-PROJECT-recent.scenario.md, which has no new-project hook (the real save panel) (0 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 4 | Rebinding: Jump takes the key pressed (J); a key another action has (E, Interact's) asks … | after 10000 ms, still not find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: J. Change": "Press a key for Jump, or Escape to cancel" | (none) | |
