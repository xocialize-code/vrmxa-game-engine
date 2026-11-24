# Editor hand test (M1 W7): AppProbe scenario: run of Nov 24, 2026 at 12:03 AM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M1-EDITOR.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M1-EDITOR.md`
- **Result:** 7 rows: 5 passed, 1 failed, 1 errors, 0 need you; 0 checklist rows have no steps

## Failed

### 1. The project opens from a folder (Open Project…): its name shows and its assets are listed

** (checklist line 7)

> The project opens from a folder (Open Project…): its name shows and its assets are listed.

**Failed:** after 10000 ms, still not find("id=doc-state").0.name matches "^Scene cafe.vrmxs": "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0"

- 👀 shot 1: end
- ❌ `find("id=doc-state").0.name matches "^Scene cafe.vrmxs"`, got `"Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0"`


<details><summary>Steps (11308 ms)</summary>

```
launched VRMXG Editor pid 36011, log ~/Library/Caches/AppProbe/logs/VRMXGEditor-2026-11-24T080250Z.log
20: wait id=open-project enabled=true timeout_ms=40000 → found after 551 ms: button "Open project" #open-project [W:VRMXG Editor/0/0/0/0/0/1@4649] (553 ms)
21: until find("id=doc-state").0.name matches "^Scene cafe.vrmxs" → timed out, last "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" (10127 ms)
```
</details>

## Errors (the run's, not necessarily the app's)

### 6. Save writes the scene into the project; reopening it from disk gives the same bytes, and …

** (checklist line 12)

> Save writes the scene into the project; reopening it from disk gives the same bytes, and it validates.

**Error:** DISABLED: button "Save (open a project folder to save)" is disabled: 

- 👀 shot 1: end


<details><summary>Steps (372 ms)</summary>

```
```
</details>

## Passed

- **2. A new scene is built from the asset list: the set, two characters, two items, each one Ad…** (checklist line 8): find("id=doc-state").0.name matches "^Scene built-cafe.vrmxs 1 nodes"; find("id=doc-state").0.name matches " 2 nodes "; find("id=doc-state").0.name matches " 3 nodes "; find("id=doc-state").0.name matches " 4 nodes "; find("id=doc-state").0.name matches " 5 nodes "; find("id=doc-state").0.name matches " 6 nodes unsaved changes valid "; find("id=undo").0.name == "Undo Add sword-pickup"; find("role=statictext text=Error").count == 0 (8068 ms)
- **3. Nodes move and change in the inspector: position, rotation, name and a prop, each one und…** (checklist line 9): find("id=inspector-id").0.name == "Node mira"; find("id=undo").0.name == "Undo Move mira"; find("id=undo").0.name == "Undo Rotate mira"; find("id=inspector-id").0.name == "Node hana"; find("id=undo").0.name == "Undo Rename hana"; find("id=undo").0.name == "Undo Set hana.walkSpeed" (3313 ms)
- **4. The tree reparents and deletes: a door moves under a new group, deleting the group delete…** (checklist line 10): find("id=undo").0.name == "Undo Add node3d"; find("id=inspector-id").0.name == "Node cafe-door"; find("id=undo").0.name == "Undo Move cafe-door under node3d"; find("id=undo").0.name == "Undo Delete node3d"; find("id=node-cafe-door").count == 0; find("id=doc-state").0.name matches " 5 nodes " (1651 ms)
- **5. Undo and redo walk the history from the Edit menu and the toolbar, and come back to exact…** (checklist line 11): find("id=node-cafe-door").count == 1; find("id=redo").0.name == "Redo Move cafe-door under node3d"; find("id=redo").0.name == "Redo Add node3d"; find("id=doc-state").0.name == $before; find("id=node-cafe-door").count == 1 (1621 ms)
- **7. Play runs the scene; Stop leaves the scene exactly as before Play (same hash), and the ed…** (checklist line 13): find("id=play").0.name == "Stop"; find("id=stop-result").0.name matches "^Stopped: scene as before Play \\([0-9a-f]{16}\\), view unchanged$"; find("id=doc-state").0.name == $before (4029 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 1 | The project opens from a folder (Open Project…): its name shows and its assets are listed | after 10000 ms, still not find("id=doc-state").0.name matches "^Scene cafe.vrmxs": "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" | (none) | |
| 6 | Save writes the scene into the project; reopening it from disk gives the same bytes, and … | run error: DISABLED: button "Save (open a project folder to save)" is disabled:  | (none) | |
