# The sample game's level, built in the editor (M5 W10): AppProbe scenario, WebGL forced: run of Nov 25, 2026 at 2:47 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL-webgl.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M5-LEVEL.md`
- **Result:** 13 rows: 1 passed, 12 failed, 0 need you; 0 checklist rows have no steps

## Failed

### 1. The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars,…

** (checklist line 10)

> The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars, with no rules yet.

**Failed:** after 90000 ms, still not find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 26 nodes saved valid ": "Scene game/rush-built.vrmxs 47 nodes saved valid hash 66f03be7f6a2cd11"

- 👀 shot 1: end
- ✅ `find("id=project-name").0.name == "Project project-w10-level"`
- ❌ `find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 26 nodes saved valid "`, got `"Scene game/rush-built.vrmxs 47 nodes saved valid hash 66f03be7f6a2cd11"`

![1-1](shots/r1-1.png)

<details><summary>Steps (96396 ms)</summary>

```
launched VRMXG Editor pid 51916, log ~/Library/Caches/AppProbe/logs/VRMXGEditor-2026-11-25T224407Z.log
24: wait id=open-project enabled=true timeout_ms=40000 → found after 2016 ms: button "Open project" #open-project [W:VRMXG Editor/0/0/0/0/0/1@4649] (2020 ms)
25: act id=open-project action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":44,"w":106,"x":2719,"y":162},"help":"","id":"open-project","name":"Open project","ref":"W:VRMXG (611 ms)
26: until find("id=project-name").0.name == "Project project-w10-level" → ok (1973 ms)
27: act id=file-name action=set_value value=game/rush-built.vrmxs → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"fi (765 ms)
28: act id=open-file action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":52,"x":3305,"y":171},"help":"Open the scene or sequence named in the file field","id":"o (40 ms)
29: until find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 26 nodes saved valid " timeout=90000 → timed out, last "Scene game/rush-built.vrmxs 47 nodes saved valid hash 66f03be7f6a2cd11" (90292 ms)
```
</details>

### 2. The rules: a GameRules node with its seven flags (a map, key by key) and its lose conditi…

** (checklist line 11)

> The rules: a GameRules node with its seven flags (a map, key by key) and its lose condition (any of: the clock done, two wrong orders), built in the condition's menus and rows.

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add gamerules": "Undo Add gamerules-2"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "GameRules"`
- ❌ `find("id=undo").0.name == "Undo Add gamerules"`, got `"Undo Add gamerules-2"`

![2-1](shots/r2-1.png)

<details><summary>Steps (7097 ms)</summary>

```
38: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (53 ms)
39: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (52 ms)
41: keys down → {"sent":true} (119 ms)
42: act surface=app role=menuitem name="GameRules" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":583},"id":"_popUpItemAction:","name":"GameRules","ref":"A/0/0/1/15@999b (71 ms)
43: until find("role=popupbutton name='Node type to add'").0.value == "GameRules" timeout=5000 → ok (708 ms)
44: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (45 ms)
45: until find("id=undo").0.name == "Undo Add gamerules" timeout=5000 → timed out, last "Undo Add gamerules-2" (5291 ms)
```
</details>

### 3. The counters and the clock under the rules: keys, labels, a maximum typed as arithmetic, …

** (checklist line 12)

> The counters and the clock under the rules: keys, labels, a maximum typed as arithmetic, the clock's 240 seconds typed as 4*60.

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add gamecounter": "Undo Add gamecounter-4"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "GameCounter"`
- ❌ `find("id=undo").0.name == "Undo Add gamecounter"`, got `"Undo Add gamecounter-4"`

![3-1](shots/r3-1.png)

<details><summary>Steps (7001 ms)</summary>

```
95: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (52 ms)
96: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (58 ms)
98: keys down → {"sent":true} (113 ms)
99: act surface=app role=menuitem name="GameCounter" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":247},"id":"_popUpItemAction:","name":"GameCounter","ref":"A/0/0/1/16@7e (75 ms)
100: until find("role=popupbutton name='Node type to add'").0.value == "GameCounter" timeout=5000 → ok (730 ms)
101: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (50 ms)
102: until find("id=undo").0.name == "Undo Add gamecounter" timeout=5000 → timed out, last "Undo Add gamecounter-4" (5179 ms)
```
</details>

### 4. Three brew timers: one made, Duplicated twice, then all three selected and their seconds …

** (checklist line 13)

> Three brew timers: one made, Duplicated twice, then all three selected and their seconds typed once for all (one undo step); each given its key.

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add gametimer-2": "Undo Add gametimer-5"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "GameTimer"`
- ❌ `find("id=undo").0.name == "Undo Add gametimer-2"`, got `"Undo Add gametimer-5"`

![4-1](shots/r4-1.png)

<details><summary>Steps (6988 ms)</summary>

```
172: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (52 ms)
173: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (57 ms)
175: keys down → {"sent":true} (109 ms)
176: act surface=app role=menuitem name="GameTimer" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":247},"id":"_popUpItemAction:","name":"GameTimer","ref":"A/0/0/1/17@7926 (83 ms)
177: until find("role=popupbutton name='Node type to add'").0.value == "GameTimer" timeout=5000 → ok (729 ms)
178: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (48 ms)
179: until find("id=undo").0.name == "Undo Add gametimer-2" timeout=5000 → timed out, last "Undo Add gametimer-5" (5158 ms)
```
</details>

### 5. The two goals in order and the checkpoint, each with its condition built in the condition…

** (checklist line 14)

> The two goals in order and the checkpoint, each with its condition built in the condition's fields.

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add gamegoal": "Undo Add gamegoal-3"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "GameGoal"`
- ❌ `find("id=undo").0.name == "Undo Add gamegoal"`, got `"Undo Add gamegoal-3"`

![5-1](shots/r5-1.png)

<details><summary>Steps (7044 ms)</summary>

```
226: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (51 ms)
227: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (58 ms)
229: keys down → {"sent":true} (111 ms)
230: act surface=app role=menuitem name="GameGoal" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":247},"id":"_popUpItemAction:","name":"GameGoal","ref":"A/0/0/1/18@fd9b" (82 ms)
231: until find("role=popupbutton name='Node type to add'").0.value == "GameGoal" timeout=5000 → ok (727 ms)
232: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (52 ms)
233: until find("id=undo").0.name == "Undo Add gamegoal" timeout=5000 → timed out, last "Undo Add gamegoal-3" (5216 ms)
```
</details>

### 6. The three table areas: one made and sized (a vector), Duplicated twice, then all three se…

** (checklist line 15)

> The three table areas: one made and sized (a vector), Duplicated twice, then all three selected to see the size they share; each named and placed.

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add area": "Undo Add area-4"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "Area"`
- ❌ `find("id=undo").0.name == "Undo Add area"`, got `"Undo Add area-4"`

![6-1](shots/r6-1.png)

<details><summary>Steps (7033 ms)</summary>

```
344: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (54 ms)
345: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (59 ms)
347: keys down → {"sent":true} (111 ms)
348: act surface=app role=menuitem name="Area" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":79},"id":"_popUpItemAction:","name":"Area","ref":"A/0/0/1/12@e8da","rol (80 ms)
349: until find("role=popupbutton name='Node type to add'").0.value == "Area" timeout=5000 → ok (704 ms)
350: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (50 ms)
351: until find("id=undo").0.name == "Undo Add area" timeout=5000 → timed out, last "Undo Add area-4" (5214 ms)
```
</details>

### 7. The till dragged from the assets panel onto the viewport (the real pointer), and the thre…

** (checklist line 16)

> The till dragged from the assets panel onto the viewport (the real pointer), and the three trays added from the panel; each named, placed and given the state it starts in.

**Failed:** after 10000 ms, still not find("id=undo").0.name == "Undo Add till": "Undo Add till-2"

- 👀 shot 1: end
- ✅ `find("id=asset-game-items-till-vrmxi").count == 1`
- ❌ `find("id=undo").0.name == "Undo Add till"`, got `"Undo Add till-2"`

![7-1](shots/r7-1.png)

<details><summary>Steps (11988 ms)</summary>

```
401: act id=assets-search action=set_value value=till → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":1315,"x":3446,"y":1538},"help":"","id":"assets-search","name":"Search assets","ref": (471 ms)
402: until find("id=asset-game-items-till-vrmxi").count == 1 timeout=10000 → ok (35 ms)
403: find id=asset-game-items-till-vrmxi → group "Item game/items/till.vrmxi, thumbnail" #asset-game-items-till-vrmxi help="game/items/till.vrmxi" (3046,1577 108×165) [W:VRMXG Editor/0/0/0/0/4/1/3/0@bda7 (28 ms)
404: set FROM = $.0.ref → "W:VRMXG Editor/0/0/0/0/4/1/3/0@bda7" (0 ms)
405: find name=Viewport exact=true → image "Viewport" (2889,213 1882×1319) [W:VRMXG Editor/0/0/0/0/2/0@1bfb] (25 ms)
406: set TO = $.0.ref → "W:VRMXG Editor/0/0/0/0/2/0@1bfb" (0 ms)
407: pointer drag ref="W:VRMXG Editor/0/0/0/0/4/1/3/0@bda7" to_ref="W:VRMXG Editor/0/0/0/0/2/0@1bfb" steps=30 → {"action":"drag","activated":false,"at":{"x":3100,"y":1659.5},"probe_seq_before":0} (873 ms)
408: until find("id=undo").0.name == "Undo Add till" timeout=10000 → timed out, last "Undo Add till-2" (10155 ms)
```
</details>

### 8. Hana's briefing: a Dialogue that starts by itself, three lines (speaker, text, clip, ids …

** (checklist line 17)

> Hana's briefing: a Dialogue that starts by itself, three lines (speaker, text, clip, ids and the line after), the first offering two choices that branch.

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add dialogue": "Undo Add dialogue-5"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "Dialogue"`
- ❌ `find("id=undo").0.name == "Undo Add dialogue"`, got `"Undo Add dialogue-5"`

![8-1](shots/r8-1.png)

<details><summary>Steps (6781 ms)</summary>

```
467: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (29 ms)
468: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (26 ms)
470: keys down → {"sent":true} (112 ms)
471: act surface=app role=menuitem name="Dialogue" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":415},"id":"_popUpItemAction:","name":"Dialogue","ref":"A/0/0/1/20@80b9" (55 ms)
472: until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000 → ok (623 ms)
473: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (27 ms)
474: until find("id=undo").0.name == "Undo Add dialogue" timeout=5000 → timed out, last "Undo Add dialogue-5" (5227 ms)
```
</details>

### 9. Aoi's order: three lines, the regular's question offering two choices, each setting the o…

** (checklist line 18)

> Aoi's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add dialogue-2": "Undo Add dialogue-6"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "Dialogue"`
- ❌ `find("id=undo").0.name == "Undo Add dialogue-2"`, got `"Undo Add dialogue-6"`

![9-1](shots/r9-1.png)

<details><summary>Steps (6248 ms)</summary>

```
533: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (40 ms)
534: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (32 ms)
536: keys down → {"sent":true} (114 ms)
537: act surface=app role=menuitem name="Dialogue" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":223},"id":"_popUpItemAction:","name":"Dialogue","ref":"A/0/0/1/20@80b9" (50 ms)
538: until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000 → ok (28 ms)
539: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (31 ms)
540: until find("id=undo").0.name == "Undo Add dialogue-2" timeout=5000 → timed out, last "Undo Add dialogue-6" (5267 ms)
```
</details>

### 10. Ren's order: three lines, the regular's question offering two choices, each setting the o…

** (checklist line 19)

> Ren's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add dialogue-3": "Undo Add dialogue-7"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "Dialogue"`
- ❌ `find("id=undo").0.name == "Undo Add dialogue-3"`, got `"Undo Add dialogue-7"`

![10-1](shots/r10-1.png)

<details><summary>Steps (6216 ms)</summary>

```
621: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (29 ms)
622: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (31 ms)
624: keys down → {"sent":true} (114 ms)
625: act surface=app role=menuitem name="Dialogue" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":223},"id":"_popUpItemAction:","name":"Dialogue","ref":"A/0/0/1/20@80b9" (55 ms)
626: until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000 → ok (30 ms)
627: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (26 ms)
628: until find("id=undo").0.name == "Undo Add dialogue-3" timeout=5000 → timed out, last "Undo Add dialogue-7" (5246 ms)
```
</details>

### 11. Yuki's order: three lines, the regular's question offering two choices, each setting the …

** (checklist line 20)

> Yuki's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).

**Failed:** after 5000 ms, still not find("id=undo").0.name == "Undo Add dialogue-4": "Undo Add dialogue-8"

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "Dialogue"`
- ❌ `find("id=undo").0.name == "Undo Add dialogue-4"`, got `"Undo Add dialogue-8"`

![11-1](shots/r11-1.png)

<details><summary>Steps (6194 ms)</summary>

```
709: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3159,"y":171},"help":"The file New and Save As use, in the project","id":"file-n (28 ms)
710: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":3,"x":2694,"y":223},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/1/ (27 ms)
712: keys down → {"sent":true} (116 ms)
713: act surface=app role=menuitem name="Dialogue" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":2681,"y":223},"id":"_popUpItemAction:","name":"Dialogue","ref":"A/0/0/1/20@80b9" (53 ms)
714: until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000 → ok (30 ms)
715: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":2702,"y":221},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (28 ms)
716: until find("id=undo").0.name == "Undo Add dialogue-4" timeout=5000 → timed out, last "Undo Add dialogue-8" (5215 ms)
```
</details>

### 13. Saved, and read back from disk the same bytes, valid; the file is what rush-level

** (checklist line 22)

> Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level.

**Failed:** expected find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid ", got "Scene game/rush-built.vrmxs 57 nodes saved valid hash e0f2e09b2b6cc548"

- 👀 shot 1: end
- ✅ `find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$"`
- ✅ `find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid"`
- ❌ `find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid "`, got `"Scene game/rush-built.vrmxs 57 nodes saved valid hash e0f2e09b2b6cc548"`

![13-1](shots/r13-1.png)

<details><summary>Steps (1011 ms)</summary>

```
829: act id=save action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":47,"x":3867,"y":171},"help":"","id":"save","name":"Save","ref":"W:VRMXG Editor/0/0/0/0/0 (49 ms)
830: until find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$" timeout=20000 → ok (69 ms)
831: act id=verify action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":26,"w":127,"x":3557,"y":1743},"help":"","id":"verify","name":"Reopen and compare","ref":"W:VRMX (46 ms)
832: until find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid" timeout=30000 → ok (356 ms)
833: expect find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid " → got "Scene game/rush-built.vrmxs 57 nodes saved valid hash e0f2e09b2b6cc548" (45 ms)
```
</details>

## Passed

- **12. A door prefab placed from the assets panel; a prop of its hinge overridden in the inspect…** (checklist line 21): find("id=add-prefabs-door-vrmxs").count == 1; find("id=undo").0.name == "Undo Add door"; find("id=node-door").0.name contains "inside"; find("id=node-door/hinge").count == 1; find("id=inspector-inner").count == 1; find("id=prop-mass").0.value == "12"; find("id=ov-mass").count == 0; find("id=undo").0.name == "Undo Override door/hinge.mass"; find("id=ov-mass").0.name == "mass overrides the prefab (prefab: 12): revert"; find("id=node-door").0.name contains "overridden"; find("id=ov-mass").count == 0; find("id=prop-mass").0.value == "12"; find("id=undo").0.name == "Undo Revert door/hinge.mass"; find("id=ov-mass").count == 1; find("id=ov-mass").count == 0; find("id=node-door").count == 0; find("id=doc-state").0.name matches " valid " (4367 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 1 | The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars,… | after 90000 ms, still not find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 26 nodes saved valid ": "Scene game/rush-built.vrmxs 47 nodes saved valid hash 66f03be7f6a2cd11" | (none) | |
| 2 | The rules: a GameRules node with its seven flags (a map, key by key) and its lose conditi… | after 5000 ms, still not find("id=undo").0.name == "Undo Add gamerules": "Undo Add gamerules-2" | (none) | |
| 3 | The counters and the clock under the rules: keys, labels, a maximum typed as arithmetic, … | after 5000 ms, still not find("id=undo").0.name == "Undo Add gamecounter": "Undo Add gamecounter-4" | (none) | |
| 4 | Three brew timers: one made, Duplicated twice, then all three selected and their seconds … | after 5000 ms, still not find("id=undo").0.name == "Undo Add gametimer-2": "Undo Add gametimer-5" | (none) | |
| 5 | The two goals in order and the checkpoint, each with its condition built in the condition… | after 5000 ms, still not find("id=undo").0.name == "Undo Add gamegoal": "Undo Add gamegoal-3" | (none) | |
| 6 | The three table areas: one made and sized (a vector), Duplicated twice, then all three se… | after 5000 ms, still not find("id=undo").0.name == "Undo Add area": "Undo Add area-4" | (none) | |
| 7 | The till dragged from the assets panel onto the viewport (the real pointer), and the thre… | after 10000 ms, still not find("id=undo").0.name == "Undo Add till": "Undo Add till-2" | (none) | |
| 8 | Hana's briefing: a Dialogue that starts by itself, three lines (speaker, text, clip, ids … | after 5000 ms, still not find("id=undo").0.name == "Undo Add dialogue": "Undo Add dialogue-5" | (none) | |
| 9 | Aoi's order: three lines, the regular's question offering two choices, each setting the o… | after 5000 ms, still not find("id=undo").0.name == "Undo Add dialogue-2": "Undo Add dialogue-6" | (none) | |
| 10 | Ren's order: three lines, the regular's question offering two choices, each setting the o… | after 5000 ms, still not find("id=undo").0.name == "Undo Add dialogue-3": "Undo Add dialogue-7" | (none) | |
| 11 | Yuki's order: three lines, the regular's question offering two choices, each setting the … | after 5000 ms, still not find("id=undo").0.name == "Undo Add dialogue-4": "Undo Add dialogue-8" | (none) | |
| 13 | Saved, and read back from disk the same bytes, valid; the file is what rush-level | expected find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid ", got "Scene game/rush-built.vrmxs 57 nodes saved valid hash e0f2e09b2b6cc548" | (none) | |
