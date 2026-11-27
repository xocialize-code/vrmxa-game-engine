# The sample game's level, built in the editor (M5 W10, M6 W1): AppProbe scenario, WebGL forced: run of Nov 27, 2026 at 10:23 AM

- **App:** VRMXG Editor 0.1.0 (1), <repo>/apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `<repo>/apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL-webgl.scenario.md`
- **Checklist:** `<repo>/apps/editor-mac/docs/HAND-TEST-M5-LEVEL.md`
- **Result:** 17 rows: 12 passed, 4 failed, 1 errors, 0 need you; 0 checklist rows have no steps

## Failed

### 13. Each table area's tableZone, the game's own behaviour (declared by its describe), added f…

** (checklist line 23)

> Each table area's tableZone, the game's own behaviour (declared by its describe), added from the Behaviours panel with its seven params: the regular, her order's dialogue and the player from node menus (the player pinned: its default), her tray's item and her flags typed, the points pinned (their default).

**Failed:** after 5000 ms, still not find("id=beh-tableZone-customer").0.value == "ren": "yuki"

- 👀 shot 1: end
- ✅ `find("id=inspector-id").0.name == "Node table-1"`
- ✅ `find("id=undo").0.name == "Undo Add tableZone to table-1"`
- ✅ `find("id=beh-tableZone").count == 1`
- ✅ `find("id=beh-tableZone-customer").0.value == "aoi"`
- ✅ `find("id=beh-tableZone-dialogue").0.value == "order-1"`
- ✅ `find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61"`
- ✅ `find("id=beh-tableZone-ordered").0.value == "ordered1"`
- ✅ `find("id=beh-tableZone-player--clear").count == 1`
- ✅ `find("id=beh-tableZone-points--clear").count == 1`
- ✅ `find("id=beh-tableZone-right").0.value == "right1"`
- ✅ `find("id=inspector-id").0.name == "Node table-2"`
- ✅ `find("id=undo").0.name == "Undo Add tableZone to table-2"`
- ✅ `find("id=beh-tableZone").count == 1`
- ❌ `find("id=beh-tableZone-customer").0.value == "ren"`, got `"yuki"`

![13-1](shots/r13-1.png)

<details><summary>Steps (20072 ms)</summary>

```
1097: act id=node-table-1 action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":25,"w":262,"x":3040,"y":1041},"help":"","id":"node-table-1","name":"Table 1 (table-1), Area","r (49 ms)
1098: until find("id=inspector-id").0.name == "Node table-1" → ok (73 ms)
1099: act id=beh-add action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":160,"x":4353,"y":1168},"help":"","id":"beh-add","name":"Behaviour to add","ref":"W:VRMXG (59 ms)
1101: keys down → {"sent":true} (114 ms)
1102: act surface=app role=menuitem name="tableZone" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":160,"x":4340,"y":1240},"id":"_popUpItemAction:","name":"tableZone","ref":"A/0/0/1/3@150b (103 ms)
1104: act id=beh-add-button action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":4568,"y":1166},"help":"Add behaviour tableZone","id":"beh-add-button","name":"Add (92 ms)
1105: until find("id=undo").0.name == "Undo Add tableZone to table-1" timeout=5000 → ok (985 ms)
1106: until find("id=beh-tableZone").count == 1 timeout=5000 → ok (67 ms)
1107: act id=beh-tableZone-customer action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":147,"x":4457,"y":618},"help":"","id":"beh-tableZone-customer","name":"tableZone customer (64 ms)
1109: keys down → {"sent":true} (114 ms)
1110: act surface=app role=menuitem name="aoi" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":146,"x":4445,"y":1242},"id":"_popUpItemAction:","name":"aoi","ref":"A/0/0/1/26@f233","ro (96 ms)
1111: until find("id=beh-tableZone-customer").0.value == "aoi" timeout=5000 → ok (1488 ms)
1112: act id=beh-tableZone-dialogue action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":147,"x":4457,"y":645},"help":"","id":"beh-tableZone-dialogue","name":"tableZone dialogue (62 ms)
1114: keys down → {"sent":true} (115 ms)
1115: act surface=app role=menuitem name="order-1" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":146,"x":4445,"y":1749},"id":"_popUpItemAction:","name":"order-1","ref":"A/0/0/1/46@f07d" (114 ms)
1116: until find("id=beh-tableZone-dialogue").0.value == "order-1" timeout=5000 → ok (1282 ms)
1117: act id=beh-tableZone-item action=set_value value="6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":147,"x":4457,"y":672},"help":"","id":"beh-tableZone-item","name":"tableZone item","r (481 ms)
1118: until find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61" timeout=5000 → ok (857 ms)
1119: act id=beh-tableZone-ordered action=set_value value="ordered1" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":147,"x":4457,"y":705},"help":"","id":"beh-tableZone-ordered","name":"tableZone order (471 ms)
1120: until find("id=beh-tableZone-ordered").0.value == "ordered1" timeout=5000 → ok (768 ms)
1121: act id=beh-tableZone-player--pin action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":14,"w":13,"x":4439,"y":773},"help":"Write the value shown (\"mira\") into the file, so it stays (68 ms)
1122: until find("id=beh-tableZone-player--clear").count == 1 timeout=5000 → ok (874 ms)
1123: act id=beh-tableZone-points--pin action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":14,"w":13,"x":4439,"y":803},"help":"Write the value shown (10) into the file, so it stays when  (63 ms)
1124: until find("id=beh-tableZone-points--clear").count == 1 timeout=5000 → ok (899 ms)
1125: act id=beh-tableZone-right action=set_value value="right1" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":147,"x":4457,"y":737},"help":"","id":"beh-tableZone-right","name":"tableZone right", (469 ms)
1126: until find("id=beh-tableZone-right").0.value == "right1" timeout=5000 → ok (740 ms)
1127: act id=node-table-2 action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":25,"w":262,"x":3040,"y":1065},"help":"","id":"node-table-2","name":"Table 2 (table-2), Area","r (63 ms)
1128: until find("id=inspector-id").0.name == "Node table-2" → ok (72 ms)
1129: act id=beh-add action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":160,"x":4353,"y":938},"help":"","id":"beh-add","name":"Behaviour to add","ref":"W:VRMXG  (60 ms)
1131: keys down → {"sent":true} (115 ms)
1132: act surface=app role=menuitem name="tableZone" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":160,"x":4340,"y":1010},"id":"_popUpItemAction:","name":"tableZone","ref":"A/0/0/1/3@150b (120 ms)
1134: act id=beh-add-button action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":4568,"y":936},"help":"Add behaviour tableZone","id":"beh-add-button","name":"Add  (77 ms)
1135: until find("id=undo").0.name == "Undo Add tableZone to table-2" timeout=5000 → ok (884 ms)
1136: until find("id=beh-tableZone").count == 1 timeout=5000 → ok (62 ms)
1137: act id=beh-tableZone-customer action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":147,"x":4457,"y":618},"help":"","id":"beh-tableZone-customer","name":"tableZone customer (67 ms)
1139: keys down → {"sent":true} (111 ms)
1140: act surface=app role=menuitem name="ren" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":146,"x":4445,"y":1266},"id":"_popUpItemAction:","name":"ren","ref":"A/0/0/1/27@4aea","ro (106 ms)
1141: until find("id=beh-tableZone-customer").0.value == "ren" timeout=5000 → timed out, last "yuki" (5010 ms)
```
</details>

### 14. Connections 1 to 13, from the Connections panel of the node that sends each (signal, targ…

** (checklist line 24)

> Connections 1 to 13, from the Connections panel of the node that sends each (signal, target and action picked from lists, arguments by the action's schema): the rules' ready to Hana's lookAt (a node argument), each order's chose to its brew timer and Hana's playLayer (a yes / no pinned false), each brew timer's timeout to its tray's state and Hana's line.

**Failed:** after 5000 ms, still not find("id=conn-0-arg-target").0.value == "mira": "ren"

- 👀 shot 1: end
- ✅ `find("id=inspector-id").0.name == "Node rules"`
- ✅ `find("id=undo").0.name == "Undo Connect rules.ready to hana-1.lookAt"`
- ✅ `find("id=conn-0").count == 1`
- ❌ `find("id=conn-0-arg-target").0.value == "mira"`, got `"ren"`

![14-1](shots/r14-1.png)

<details><summary>Steps (10202 ms)</summary>

```
1193: act id=node-rules action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":25,"w":262,"x":3040,"y":1114},"help":"","id":"node-rules","name":"rules, GameRules","ref":"W:VR (59 ms)
1194: until find("id=inspector-id").0.name == "Node rules" → ok (81 ms)
1195: act id=conn-new-signal action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1075},"help":"","id":"conn-new-signal","name":"New connection signal"," (58 ms)
1197: keys down → {"sent":true} (112 ms)
1198: act surface=app role=menuitem name="ready" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1098},"id":"_popUpItemAction:","name":"ready","ref":"A/0/0/1/1@7a7f","r (115 ms)
1200: act id=conn-new-to action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1102},"help":"","id":"conn-new-to","name":"New connection target","ref" (109 ms)
1202: keys down → {"sent":true} (114 ms)
1203: act surface=app role=menuitem name="hana-1" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1701},"id":"_popUpItemAction:","name":"hana-1","ref":"A/0/0/1/25@0846", (96 ms)
1205: act id=conn-new-call action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1129},"help":"","id":"conn-new-call","name":"New connection action","re (109 ms)
1207: keys down → {"sent":true} (108 ms)
1208: act surface=app role=menuitem name="lookAt" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1296},"id":"_popUpItemAction:","name":"lookAt","ref":"A/0/0/1/7@e4ab"," (99 ms)
1210: act id=conn-new-add action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":69,"x":4360,"y":1156},"help":"Connect rules.ready to hana-1.lookAt","id":"conn-new-add", (97 ms)
1211: until find("id=undo").0.name == "Undo Connect rules.ready to hana-1.lookAt" timeout=5000 → ok (899 ms)
1212: until find("id=conn-0").count == 1 timeout=5000 → ok (61 ms)
1213: act id=conn-0-arg-target action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":147,"x":4457,"y":1026},"help":"","id":"conn-0-arg-target","name":"lookAt target","ref":" (73 ms)
1215: keys down → {"sent":true} (112 ms)
1216: act surface=app role=menuitem name="mira" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":146,"x":4445,"y":1601},"id":"_popUpItemAction:","name":"mira","ref":"A/0/0/1/24@208e","r (100 ms)
1217: until find("id=conn-0-arg-target").0.value == "mira" timeout=5000 → timed out, last "ren" (5058 ms)
```
</details>

### 15. Connections 14 to 19: the serve goal to the till and Hana, the till's verb to setFlag, th…

** (checklist line 25)

> Connections 14 to 19: the serve goal to the till and Hana, the till's verb to setFlag, the till goal to the score (a number), won and lost to changeScene (a delay and a scene); the level's 19 connections, in order.

**Failed:** after 5000 ms, still not find("id=conn-13").count == 1: 0

- 👀 shot 1: end
- ✅ `find("id=inspector-id").0.name == "Node serve"`
- ✅ `find("id=undo").0.name == "Undo Connect serve.completed to till.enterState"`
- ❌ `find("id=conn-13").count == 1`, got `0`

![15-1](shots/r15-1.png)

<details><summary>Steps (9733 ms)</summary>

```
1488: act id=node-serve action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":25,"w":262,"x":3040,"y":1307},"help":"","id":"node-serve","name":"serve, GameGoal","ref":"W:VRM (66 ms)
1489: until find("id=inspector-id").0.name == "Node serve" → ok (72 ms)
1490: act id=conn-new-signal action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1074},"help":"","id":"conn-new-signal","name":"New connection signal"," (60 ms)
1492: keys down → {"sent":true} (115 ms)
1493: act surface=app role=menuitem name="completed" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1122},"id":"_popUpItemAction:","name":"completed","ref":"A/0/0/1/2@ba73 (120 ms)
1495: act id=conn-new-to action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1101},"help":"","id":"conn-new-to","name":"New connection target","ref" (103 ms)
1497: keys down → {"sent":true} (109 ms)
1498: act surface=app role=menuitem name="till" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1581},"id":"_popUpItemAction:","name":"till","ref":"A/0/0/1/20@a8e0","r (93 ms)
1500: act id=conn-new-call action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1128},"help":"","id":"conn-new-call","name":"New connection action","re (104 ms)
1502: keys down → {"sent":true} (106 ms)
1503: act surface=app role=menuitem name="enterState" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1200},"id":"_popUpItemAction:","name":"enterState","ref":"A/0/0/1/3@2ef (93 ms)
1505: act id=conn-new-add action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":69,"x":4360,"y":1155},"help":"Connect serve.completed to till.enterState","id":"conn-new (94 ms)
1506: until find("id=undo").0.name == "Undo Connect serve.completed to till.enterState" timeout=5000 → ok (1013 ms)
1507: until find("id=conn-13").count == 1 timeout=5000 → timed out, last 0 (5173 ms)
```
</details>

### 17. Saved, and read back from disk the same bytes, valid; the file is what rush-level

** (checklist line 27)

> Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level, byte for byte.

**Failed:** expected find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid ", got "Scene game/rush-built.vrmxs 47 nodes saved valid hash 0a85abd9ea8ce507"

- 👀 shot 1: end
- ✅ `find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$"`
- ✅ `find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid"`
- ❌ `find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid "`, got `"Scene game/rush-built.vrmxs 47 nodes saved valid hash 0a85abd9ea8ce507"`

![17-1](shots/r17-1.png)

<details><summary>Steps (980 ms)</summary>

```
1660: act id=save action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":48,"x":3696,"y":333},"help":"","id":"save","name":"Save","ref":"W:VRMXG Editor/0/0/0/0/0 (53 ms)
1661: until find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$" timeout=20000 → ok (73 ms)
1662: act id=verify action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":26,"w":127,"x":3991,"y":1223},"help":"","id":"verify","name":"Reopen and compare","ref":"W:VRMX (51 ms)
1663: until find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid" timeout=30000 → ok (238 ms)
1664: expect find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid " → got "Scene game/rush-built.vrmxs 47 nodes saved valid hash 0a85abd9ea8ce507" (53 ms)
```
</details>

## Errors (the run's, not necessarily the app's)

### 12. Yuki's order: a Dialogue given its id, three lines, the regular's question offering two c…

** (checklist line 22)

> Yuki's order: a Dialogue given its id, three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).

**Error:** ELEMENT_NOT_FOUND: no element matches id=field-id

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "Dialogue"`
- ✅ `find("id=undo").0.name == "Undo Add dialogue"`

![12-1](shots/r12-1.png)

<details><summary>Steps (2621 ms)</summary>

```
999: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3882,"y":333},"help":"The file New and Save As use, in the project","id":"file-n (64 ms)
1000: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":111,"x":3133,"y":402},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/ (65 ms)
1002: keys down → {"sent":true} (113 ms)
1003: act surface=app role=menuitem name="Dialogue" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":3121,"y":402},"id":"_popUpItemAction:","name":"Dialogue","ref":"A/0/0/1/20@80b9" (100 ms)
1004: until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000 → ok (67 ms)
1005: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":3249,"y":400},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (67 ms)
1006: until find("id=undo").0.name == "Undo Add dialogue" timeout=5000 → ok (756 ms)
```
</details>

## Passed

- **1. The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars,…** (checklist line 11): find("id=project-name").0.name == "Project project-w10-level"; find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 26 nodes saved valid "; find("id=renderer").0.name == "Renderer WebGL"; find("id=node-aoi").count == 1; find("id=node-hana-1").count == 1 (6282 ms)
- **2. Mira plays and the regulars think: the player behaviour added to Mira, a brain to each re…** (checklist line 12): find("id=inspector-id").0.name == "Node mira"; find("id=undo").0.name == "Undo Add player to mira"; find("id=beh-player").count == 1; find("id=inspector-id").0.name == "Node aoi"; find("id=undo").0.name == "Undo Add brain to aoi"; find("id=beh-brain").count == 1; find("id=beh-brain-preset--kind").0.value == "path"; find("id=beh-brain-preset").0.value == "game/brains/regular.json"; find("id=beh-brain-vars-arrive").count == 1; find("id=beh-brain-vars-arrive--kind").0.value == "number"; find("id=beh-brain-vars-arrive").0.value == "8"; find("id=beh-brain-vars-seat").count == 1; find("id=beh-brain-vars-seat").0.value == "stool-2"; find("id=inspector-id").0.name == "Node ren"; find("id=undo").0.name == "Undo Add brain to ren"; find("id=beh-brain").count == 1; find("id=beh-brain-preset--kind").0.value == "path"; find("id=beh-brain-preset").0.value == "game/brains/regular.json"; find("id=beh-brain-vars-arrive").count == 1; find("id=beh-brain-vars-arrive--kind").0.value == "number"; find("id=beh-brain-vars-arrive").0.value == "35"; find("id=beh-brain-vars-seat").count == 1; find("id=beh-brain-vars-seat").0.value == "stool-3"; find("id=inspector-id").0.name == "Node yuki"; find("id=undo").0.name == "Undo Add brain to yuki"; find("id=beh-brain").count == 1; find("id=beh-brain-preset--kind").0.value == "path"; find("id=beh-brain-preset").0.value == "game/brains/regular.json"; find("id=beh-brain-vars-arrive").count == 1; find("id=beh-brain-vars-arrive--kind").0.value == "number"; find("id=beh-brain-vars-arrive").0.value == "60"; find("id=beh-brain-vars-seat").count == 1; find("id=beh-brain-vars-seat").0.value == "stool-5"; find("id=beh-brain-vars-arrive").0.value == "60"; find("id=doc-state").0.name matches " valid " (43906 ms)
- **3. The three table areas: one made, its shape pinned and its size set (a vector), Duplicated…** (checklist line 13): find("role=popupbutton name='Node type to add'").0.value == "Area"; find("id=undo").0.name == "Undo Add area"; find("id=pin-shape").count == 0; find("id=undo").0.name == "Undo Set area.shape"; find("id=prop-size-x").0.value == "1.1"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "1.8"; find("id=node-area-2").count == 1; find("id=node-area-3").count == 1; find("id=inspector-id").0.name matches "^3 nodes: "; find("id=prop-size-x").0.name != "size X (mixed values)"; find("id=prop-size-z").0.value == "1.8"; find("id=inspector-id").0.name == "Node area"; find("id=undo").0.name == "Undo Change id area to table-1"; find("id=inspector-id").0.name == "Node table-1"; find("id=field-name").0.value == "Table 1"; find("id=pos-x").0.value == "-1.45"; find("id=pos-y").0.value == "1"; find("id=pos-z").0.value == "1"; find("id=inspector-id").0.name == "Node area-2"; find("id=undo").0.name == "Undo Change id area-2 to table-2"; find("id=inspector-id").0.name == "Node table-2"; find("id=field-name").0.value == "Table 2"; find("id=pos-x").0.value == "1.45"; find("id=pos-y").0.value == "1"; find("id=pos-z").0.value == "1"; find("id=inspector-id").0.name == "Node area-3"; find("id=undo").0.name == "Undo Change id area-3 to table-3"; find("id=inspector-id").0.name == "Node table-3"; find("id=field-name").0.value == "Table 3"; find("id=pos-x").0.value == "1.45"; find("id=pos-y").0.value == "1"; find("id=pos-z").0.value == "-2"; find("id=doc-state").0.name matches " valid " (28553 ms)
- **4. The rules: a GameRules node given its id, its seven flags (a map, key by key) and its los…** (checklist line 14): find("role=popupbutton name='Node type to add'").0.value == "GameRules"; find("id=undo").0.name == "Undo Add gamerules"; find("id=undo").0.name == "Undo Change id gamerules to rules"; find("id=inspector-id").0.name == "Node rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-flags-ordered1").count == 1; find("id=prop-flags-ordered2").count == 1; find("id=prop-flags-ordered3").count == 1; find("id=prop-flags-right1").count == 1; find("id=prop-flags-right2").count == 1; find("id=prop-flags-right3").count == 1; find("id=prop-flags-tillClosed").count == 1; find("id=prop-flags").0.name == "flags, 7 entries"; find("id=prop-lose-test").0.value == "any"; find("id=prop-lose-of-0").count == 1; find("id=prop-lose-of-0-key").0.value == "timers.clock.done"; find("id=prop-lose-of-1").count == 1; find("id=prop-lose-of-1-key").0.value == "counters.mistakes"; find("id=prop-lose-of-1-op").0.value == "ge"; find("id=prop-lose-of-1-value").0.value == "2"; find("id=prop-lose-of").0.name == "lose of, 2 rows"; find("id=doc-state").0.name matches " valid " (25640 ms)
- **5. The counters and the clock under the rules, each given its id (its key in the game state …** (checklist line 15): find("role=popupbutton name='Node type to add'").0.value == "GameCounter"; find("id=undo").0.name == "Undo Add gamecounter"; find("id=undo").0.name == "Undo Change id gamecounter to score"; find("id=inspector-id").0.name == "Node score"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-label").0.value == "Score"; find("role=popupbutton name='Node type to add'").0.value == "GameCounter"; find("id=undo").0.name == "Undo Add gamecounter"; find("id=undo").0.name == "Undo Change id gamecounter to served"; find("id=inspector-id").0.name == "Node served"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-label").0.value == "Served"; find("id=prop-max").0.value == "3"; find("role=popupbutton name='Node type to add'").0.value == "GameCounter"; find("id=undo").0.name == "Undo Add gamecounter"; find("id=undo").0.name == "Undo Change id gamecounter to mistakes"; find("id=inspector-id").0.name == "Node mistakes"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-label").0.value == "Wrong orders"; find("role=popupbutton name='Node type to add'").0.value == "GameTimer"; find("id=undo").0.name == "Undo Add gametimer"; find("id=undo").0.name == "Undo Change id gametimer to clock"; find("id=inspector-id").0.name == "Node clock"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-label").0.value == "Until ten o'clock"; find("id=prop-seconds").0.value == "240"; find("id=doc-state").0.name matches " valid " (38099 ms)
- **6. Three brew timers: one made, Duplicated twice, then all three selected and their seconds …** (checklist line 16): find("role=popupbutton name='Node type to add'").0.value == "GameTimer"; find("id=undo").0.name == "Undo Add gametimer"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-autostart").0.value == "0"; find("id=node-gametimer-2").count == 1; find("id=undo").0.name == "Undo Duplicate gametimer"; find("id=node-gametimer-3").count == 1; find("id=undo").0.name == "Undo Duplicate gametimer-2"; find("id=inspector-id").0.name == "Node gametimer"; find("id=inspector-id").0.name == "3 nodes: gametimer, gametimer-2, gametimer-3"; find("id=undo").0.name == "Undo Set seconds on 3 nodes"; find("id=prop-seconds").0.value == "6"; find("id=inspector-id").0.name == "Node gametimer"; find("id=undo").0.name == "Undo Change id gametimer to brew-1"; find("id=inspector-id").0.name == "Node brew-1"; find("id=inspector-id").0.name == "Node gametimer-2"; find("id=undo").0.name == "Undo Change id gametimer-2 to brew-2"; find("id=inspector-id").0.name == "Node brew-2"; find("id=inspector-id").0.name == "Node gametimer-3"; find("id=undo").0.name == "Undo Change id gametimer-3 to brew-3"; find("id=inspector-id").0.name == "Node brew-3"; find("id=doc-state").0.name matches " valid " (17486 ms)
- **7. The two goals in order and the checkpoint, each given its id and its condition built in t…** (checklist line 17): find("role=popupbutton name='Node type to add'").0.value == "GameGoal"; find("id=undo").0.name == "Undo Add gamegoal"; find("id=undo").0.name == "Undo Change id gamegoal to serve"; find("id=inspector-id").0.name == "Node serve"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-text").0.value == "Serve the three regulars"; find("id=prop-when-test").0.value == "all"; find("id=prop-when-of-0").count == 1; find("id=prop-when-of-0-key").0.value == "counters.served"; find("id=prop-when-of-0-op").0.value == "ge"; find("id=prop-when-of-0-value").0.value == "3"; find("id=prop-when-of-1").count == 1; find("id=prop-when-of-1-key").0.value == "counters.mistakes"; find("id=prop-when-of-1-op").0.value == "lt"; find("id=prop-when-of-1-value").0.value == "2"; find("id=prop-when-of").0.name == "when of, 2 rows"; find("role=popupbutton name='Node type to add'").0.value == "GameGoal"; find("id=undo").0.name == "Undo Add gamegoal"; find("id=undo").0.name == "Undo Change id gamegoal to close-till"; find("id=inspector-id").0.name == "Node close-till"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-text").0.value == "Close the till"; find("id=prop-when-test").0.value == "all"; find("id=prop-when-test").0.value == "state"; find("id=prop-when-key").0.value == "flags.tillClosed"; find("role=popupbutton name='Node type to add'").0.value == "Checkpoint"; find("id=undo").0.name == "Undo Add checkpoint"; find("id=undo").0.name == "Undo Change id checkpoint to cp-first"; find("id=inspector-id").0.name == "Node cp-first"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-slot").0.value == "first-order"; find("id=prop-label").0.value == "First order served"; find("id=pin-once").count == 0; find("id=undo").0.name == "Undo Set cp-first.once"; find("id=prop-when-test").0.value == "all"; find("id=prop-when-test").0.value == "state"; find("id=prop-when-key").0.value == "counters.served"; find("id=prop-when-op").0.value == "ge"; find("id=prop-when-value").0.value == "1"; find("id=doc-state").0.name matches " valid " (54995 ms)
- **8. The till dragged from the assets panel onto the viewport (the real pointer), and the thre…** (checklist line 18): find("id=asset-game-items-till-vrmxi").count == 1; find("id=undo").0.name == "Undo Add till"; find("id=field-name").0.value == "Till"; find("id=pos-x").0.value == "-1.65"; find("id=pos-y").0.value == "1.06"; find("id=pos-z").0.value == "-3.95"; find("id=prop-state").0.value == "locked"; find("id=field-before").0.value == "mira"; find("id=undo").0.name == "Undo Move till before mira"; find("id=asset-game-items-order-1-vrmxi").count == 1; find("id=undo").0.name == "Undo Add order-1"; find("id=undo").0.name == "Undo Change id order-1 to tray-1"; find("id=inspector-id").0.name == "Node tray-1"; find("id=field-name").0.value == "Order for table 1"; find("id=pos-x").0.value == "-0.9"; find("id=pos-y").0.value == "1.06"; find("id=pos-z").0.value == "-3.95"; find("id=prop-state").0.value == "waiting"; find("id=field-before").0.value == "mira"; find("id=undo").0.name == "Undo Move tray-1 before mira"; find("id=asset-game-items-order-2-vrmxi").count == 1; find("id=undo").0.name == "Undo Add order-2"; find("id=undo").0.name == "Undo Change id order-2 to tray-2"; find("id=inspector-id").0.name == "Node tray-2"; find("id=field-name").0.value == "Order for table 2"; find("id=pos-x").0.value == "-0.1"; find("id=pos-y").0.value == "1.06"; find("id=pos-z").0.value == "-3.95"; find("id=prop-state").0.value == "waiting"; find("id=field-before").0.value == "mira"; find("id=undo").0.name == "Undo Move tray-2 before mira"; find("id=asset-game-items-order-3-vrmxi").count == 1; find("id=undo").0.name == "Undo Add order-3"; find("id=undo").0.name == "Undo Change id order-3 to tray-3"; find("id=inspector-id").0.name == "Node tray-3"; find("id=field-name").0.value == "Order for table 3"; find("id=pos-x").0.value == "0.6"; find("id=pos-y").0.value == "1.06"; find("id=pos-z").0.value == "-3.95"; find("id=prop-state").0.value == "waiting"; find("id=field-before").0.value == "mira"; find("id=undo").0.name == "Undo Move tray-3 before mira"; find("id=doc-state").0.name matches " valid " (39469 ms)
- **9. Hana's briefing: a Dialogue given its id, that starts by itself, three lines (speaker, te…** (checklist line 19): find("role=popupbutton name='Node type to add'").0.value == "Dialogue"; find("id=undo").0.name == "Undo Add dialogue"; find("id=undo").0.name == "Undo Change id dialogue to briefing"; find("id=inspector-id").0.name == "Node briefing"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-autostart").0.value == "1"; find("id=prop-lines").0.name == "lines, 1 row"; find("id=prop-lines-0-speaker").0.value == "hana-1"; find("id=prop-lines-0-text").0.value == "Morning, Mira! Three regulars are due. Take their orders, bring each one what I make, and close the till before ten."; find("id=prop-lines-0-clip").0.value == "game/voice/hana-brief.wav"; find("id=prop-lines-0-choices-0").count == 1; find("id=prop-lines-0-choices-0-id").0.value == "ready"; find("id=prop-lines-0-choices-0-text").0.value == "On it!"; find("id=prop-lines-0-choices-0-to").0.value == "ready"; find("id=prop-lines-0-choices-1").count == 1; find("id=prop-lines-0-choices-1-id").0.value == "coffee"; find("id=prop-lines-0-choices-1-text").0.value == "Coffee first?"; find("id=prop-lines-0-choices-1-to").0.value == "coffee"; find("id=prop-lines").0.name == "lines, 2 rows"; find("id=prop-lines-1-id").0.value == "ready"; find("id=prop-lines-1-speaker").0.value == "hana-1"; find("id=prop-lines-1-text").0.value == "That's the spirit. Here comes Aoi!"; find("id=prop-lines-1-clip").0.value == "game/voice/hana-brief-ready.wav"; find("id=prop-lines-1-next").0.value == "end"; find("id=prop-lines").0.name == "lines, 3 rows"; find("id=prop-lines-2-id").0.value == "coffee"; find("id=prop-lines-2-speaker").0.value == "hana-1"; find("id=prop-lines-2-text").0.value == "After the rush! Here comes Aoi."; find("id=prop-lines-2-clip").0.value == "game/voice/hana-brief-coffee.wav"; find("id=doc-state").0.name matches " valid " (29083 ms)
- **10. Aoi's order: a Dialogue given its id, three lines, the regular's question offering two ch…** (checklist line 20): find("role=popupbutton name='Node type to add'").0.value == "Dialogue"; find("id=undo").0.name == "Undo Add dialogue"; find("id=undo").0.name == "Undo Change id dialogue to order-1"; find("id=inspector-id").0.name == "Node order-1"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=field-name").0.value == "Aoi's order"; find("id=prop-lines").0.name == "lines, 1 row"; find("id=prop-lines-0-speaker").0.value == "aoi"; find("id=prop-lines-0-text").0.value == "Morning! Something warm and milky, please. Not too strong."; find("id=prop-lines-0-clip").0.value == "game/voice/aoi-ask.wav"; find("id=prop-lines-0-choices-0").count == 1; find("id=prop-lines-0-choices-0-id").0.value == "latte"; find("id=prop-lines-0-choices-0-text").0.value == "A latte, then."; find("id=prop-lines-0-choices-0-to").0.value == "right"; find("id=prop-lines-0-choices-0-set").count == 1; find("id=prop-lines-0-choices-0-set-ordered1").count == 1; find("id=prop-lines-0-choices-0-set-ordered1").0.value == "1"; find("id=prop-lines-0-choices-0-set-right1").count == 1; find("id=prop-lines-0-choices-0-set-right1").0.value == "1"; find("id=prop-lines-0-choices-1").count == 1; find("id=prop-lines-0-choices-1-id").0.value == "espresso"; find("id=prop-lines-0-choices-1-text").0.value == "A double espresso?"; find("id=prop-lines-0-choices-1-to").0.value == "wrong"; find("id=prop-lines-0-choices-1-set").count == 1; find("id=prop-lines-0-choices-1-set-ordered1").count == 1; find("id=prop-lines-0-choices-1-set-ordered1").0.value == "1"; find("id=prop-lines-0-choices-1-set-right1").count == 1; find("id=prop-lines").0.name == "lines, 2 rows"; find("id=prop-lines-1-id").0.value == "right"; find("id=prop-lines-1-speaker").0.value == "aoi"; find("id=prop-lines-1-text").0.value == "Perfect. Thank you!"; find("id=prop-lines-1-clip").0.value == "game/voice/aoi-right.wav"; find("id=prop-lines-1-next").0.value == "end"; find("id=prop-lines").0.name == "lines, 3 rows"; find("id=prop-lines-2-id").0.value == "wrong"; find("id=prop-lines-2-speaker").0.value == "aoi"; find("id=prop-lines-2-text").0.value == "Oh. Well, if you say so."; find("id=prop-lines-2-clip").0.value == "game/voice/aoi-wrong.wav"; find("id=doc-state").0.name matches " valid " (35311 ms)
- **11. Ren's order: a Dialogue given its id, three lines, the regular's question offering two ch…** (checklist line 21): find("role=popupbutton name='Node type to add'").0.value == "Dialogue"; find("id=undo").0.name == "Undo Add dialogue"; find("id=undo").0.name == "Undo Change id dialogue to order-2"; find("id=inspector-id").0.name == "Node order-2"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=field-name").0.value == "Ren's order"; find("id=prop-lines").0.name == "lines, 1 row"; find("id=prop-lines-0-speaker").0.value == "ren"; find("id=prop-lines-0-text").0.value == "Hi! Something cold, please? It's already warm out."; find("id=prop-lines-0-clip").0.value == "game/voice/ren-ask.wav"; find("id=prop-lines-0-choices-0").count == 1; find("id=prop-lines-0-choices-0-id").0.value == "chocolate"; find("id=prop-lines-0-choices-0-text").0.value == "A hot chocolate."; find("id=prop-lines-0-choices-0-to").0.value == "wrong"; find("id=prop-lines-0-choices-0-set").count == 1; find("id=prop-lines-0-choices-0-set-ordered2").count == 1; find("id=prop-lines-0-choices-0-set-ordered2").0.value == "1"; find("id=prop-lines-0-choices-0-set-right2").count == 1; find("id=prop-lines-0-choices-1").count == 1; find("id=prop-lines-0-choices-1-id").0.value == "iced-tea"; find("id=prop-lines-0-choices-1-text").0.value == "An iced tea."; find("id=prop-lines-0-choices-1-to").0.value == "right"; find("id=prop-lines-0-choices-1-set").count == 1; find("id=prop-lines-0-choices-1-set-ordered2").count == 1; find("id=prop-lines-0-choices-1-set-ordered2").0.value == "1"; find("id=prop-lines-0-choices-1-set-right2").count == 1; find("id=prop-lines-0-choices-1-set-right2").0.value == "1"; find("id=prop-lines").0.name == "lines, 2 rows"; find("id=prop-lines-1-id").0.value == "right"; find("id=prop-lines-1-speaker").0.value == "ren"; find("id=prop-lines-1-text").0.value == "Lovely, thanks."; find("id=prop-lines-1-clip").0.value == "game/voice/ren-right.wav"; find("id=prop-lines-1-next").0.value == "end"; find("id=prop-lines").0.name == "lines, 3 rows"; find("id=prop-lines-2-id").0.value == "wrong"; find("id=prop-lines-2-speaker").0.value == "ren"; find("id=prop-lines-2-text").0.value == "Hot? Hm. All right, then."; find("id=prop-lines-2-clip").0.value == "game/voice/ren-wrong.wav"; find("id=doc-state").0.name matches " valid " (35224 ms)
- **16. A door prefab placed from the assets panel; a prop of its hinge overridden in the inspect…** (checklist line 26): find("id=add-prefabs-door-vrmxs").count == 1; find("id=undo").0.name == "Undo Add door"; find("id=node-door").0.name contains "inside"; find("id=node-door/hinge").count == 1; find("id=inspector-inner").count == 1; find("id=prop-mass").0.value == "12"; find("id=ov-mass").count == 0; find("id=undo").0.name == "Undo Override door/hinge.mass"; find("id=ov-mass").0.name == "mass overrides the prefab (prefab: 12): revert"; find("id=node-door").0.name contains "overridden"; find("id=ov-mass").count == 0; find("id=prop-mass").0.value == "12"; find("id=undo").0.name == "Undo Revert door/hinge.mass"; find("id=ov-mass").count == 1; find("id=ov-mass").count == 0; find("id=node-door").count == 0; find("id=doc-state").0.name matches " valid " (7284 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 12 | Yuki's order: a Dialogue given its id, three lines, the regular's question offering two c… | run error: ELEMENT_NOT_FOUND: no element matches id=field-id | (none) | |
| 13 | Each table area's tableZone, the game's own behaviour (declared by its describe), added f… | after 5000 ms, still not find("id=beh-tableZone-customer").0.value == "ren": "yuki" | (none) | |
| 14 | Connections 1 to 13, from the Connections panel of the node that sends each (signal, targ… | after 5000 ms, still not find("id=conn-0-arg-target").0.value == "mira": "ren" | (none) | |
| 15 | Connections 14 to 19: the serve goal to the till and Hana, the till's verb to setFlag, th… | after 5000 ms, still not find("id=conn-13").count == 1: 0 | (none) | |
| 17 | Saved, and read back from disk the same bytes, valid; the file is what rush-level | expected find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid ", got "Scene game/rush-built.vrmxs 47 nodes saved valid hash 0a85abd9ea8ce507" | (none) | |
