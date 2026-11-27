# The sample game's level, built in the editor (M5 W10, M6 W1): AppProbe scenario, WebGL forced: run of Nov 27, 2026 at 10:28 AM

- **App:** VRMXG Editor 0.1.0 (1), <repo>/apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `<repo>/apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL-webgl.scenario.md`
- **Checklist:** `<repo>/apps/editor-mac/docs/HAND-TEST-M5-LEVEL.md`
- **Result:** 17 rows: 10 passed, 4 failed, 3 errors, 0 need you; 0 checklist rows have no steps

## Failed

### 4. The rules: a GameRules node given its id, its seven flags (a map, key by key) and its los…

** (checklist line 14)

> The rules: a GameRules node given its id, its seven flags (a map, key by key) and its lose condition (any of: the clock done, two wrong orders), built in the condition's menus and rows.

**Failed:** after 5000 ms, still not find("id=prop-flags-right1").count == 1: 0

- 👀 shot 1: end
- ✅ `find("role=popupbutton name='Node type to add'").0.value == "GameRules"`
- ✅ `find("id=undo").0.name == "Undo Add gamerules"`
- ✅ `find("id=undo").0.name == "Undo Change id gamerules to rules"`
- ✅ `find("id=inspector-id").0.name == "Node rules"`
- ✅ `find("id=pos-x").0.value == "0"`
- ✅ `find("id=pos-y").0.value == "0"`
- ✅ `find("id=pos-z").0.value == "0"`
- ✅ `find("id=prop-flags-ordered1").count == 1`
- ✅ `find("id=prop-flags-ordered2").count == 1`
- ✅ `find("id=prop-flags-ordered3").count == 1`
- ❌ `find("id=prop-flags-right1").count == 1`, got `0`

![4-1](shots/r4-1.png)

<details><summary>Steps (16659 ms)</summary>

```
236: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3882,"y":333},"help":"The file New and Save As use, in the project","id":"file-n (52 ms)
237: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":111,"x":3150,"y":402},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/ (55 ms)
239: keys down → {"sent":true} (109 ms)
240: act surface=app role=menuitem name="GameRules" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":145,"x":3138,"y":474},"id":"_popUpItemAction:","name":"GameRules","ref":"A/0/0/1/15@999b (124 ms)
241: until find("role=popupbutton name='Node type to add'").0.value == "GameRules" timeout=5000 → ok (720 ms)
242: act id=add-node action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":3266,"y":400},"help":"","id":"add-node","name":"Add node","ref":"W:VRMXG Editor/0 (52 ms)
243: until find("id=undo").0.name == "Undo Add gamerules" timeout=5000 → ok (865 ms)
245: act id=field-id action=set_value value="rules" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":150,"x":4461,"y":599},"help":"The node's id: connections, behaviours and props that  (492 ms)
246: until find("id=undo").0.name == "Undo Change id gamerules to rules" timeout=5000 → ok (722 ms)
247: expect find("id=inspector-id").0.name == "Node rules" → ok (49 ms)
248: act id=pos-x action=set_value value="0" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":69,"x":4367,"y":732},"help":"","id":"pos-x","name":"Position X","ref":"W:VRMXG Edito (450 ms)
249: until find("id=pos-x").0.value == "0" timeout=5000 → ok (86 ms)
250: act id=pos-y action=set_value value="0" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":70,"x":4454,"y":732},"help":"","id":"pos-y","name":"Position Y","ref":"W:VRMXG Edito (458 ms)
251: until find("id=pos-y").0.value == "0" timeout=5000 → ok (87 ms)
252: act id=pos-z action=set_value value="0" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":70,"x":4541,"y":732},"help":"","id":"pos-z","name":"Position Z","ref":"W:VRMXG Edito (457 ms)
253: until find("id=pos-z").0.value == "0" timeout=5000 → ok (700 ms)
254: act id=prop-flags--newkey action=set_value value=ordered1 → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":199,"x":4361,"y":1087},"help":"","id":"prop-flags--newkey","name":"New key in flags" (469 ms)
255: act id=prop-flags--addkey action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":48,"x":4563,"y":621},"help":"","id":"prop-flags--addkey","name":"Add a key to flags","re (89 ms)
256: until find("id=prop-flags-ordered1").count == 1 timeout=5000 → ok (849 ms)
257: act id=prop-flags--newkey action=set_value value=ordered2 → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":199,"x":4361,"y":672},"help":"","id":"prop-flags--newkey","name":"New key in flags", (470 ms)
258: act id=prop-flags--addkey action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":48,"x":4563,"y":672},"help":"","id":"prop-flags--addkey","name":"Add a key to flags","re (87 ms)
259: until find("id=prop-flags-ordered2").count == 1 timeout=5000 → ok (833 ms)
260: act id=prop-flags--newkey action=set_value value=ordered3 → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":199,"x":4361,"y":719},"help":"","id":"prop-flags--newkey","name":"New key in flags", (466 ms)
261: act id=prop-flags--addkey action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":48,"x":4563,"y":719},"help":"","id":"prop-flags--addkey","name":"Add a key to flags","re (78 ms)
262: until find("id=prop-flags-ordered3").count == 1 timeout=5000 → ok (832 ms)
263: act id=prop-flags--newkey action=set_value value=right1 → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":199,"x":4361,"y":766},"help":"","id":"prop-flags--newkey","name":"New key in flags", (465 ms)
264: act id=prop-flags--addkey action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":48,"x":4563,"y":766},"help":"","id":"prop-flags--addkey","name":"Add a key to flags","re (113 ms)
265: until find("id=prop-flags-right1").count == 1 timeout=5000 → timed out, last 0 (5261 ms)
```
</details>

### 8. The till dragged from the assets panel onto the viewport (the real pointer), and the thre…

** (checklist line 18)

> The till dragged from the assets panel onto the viewport (the real pointer), and the three trays added from the panel; each given its id, name, place and the state it starts in, and moved before Mira in the scene's order (the Before menu).

**Failed:** after 10000 ms, still not find("id=undo").0.name == "Undo Add till": "Undo Change id gametimer-3 to brew-3"

- 👀 shot 1: end
- ✅ `find("id=asset-game-items-till-vrmxi").count == 1`
- ❌ `find("id=undo").0.name == "Undo Add till"`, got `"Undo Change id gametimer-3 to brew-3"`

![8-1](shots/r8-1.png)

<details><summary>Steps (12756 ms)</summary>

```
625: act id=assets-search action=set_value value=till → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":453,"x":3878,"y":1018},"help":"","id":"assets-search","name":"Search assets","ref":" (456 ms)
626: until find("id=asset-game-items-till-vrmxi").count == 1 timeout=10000 → ok (60 ms)
627: find id=asset-game-items-till-vrmxi → group "Item game/items/till.vrmxi, thumbnail" #asset-game-items-till-vrmxi help="game/items/till.vrmxi" (3477,1057 115×172) [W:VRMXG Editor/0/0/0/0/4/1/3/0@bda7 (34 ms)
628: set FROM = $.0.ref → "W:VRMXG Editor/0/0/0/0/4/1/3/0@bda7" (0 ms)
629: find name=Viewport exact=true → image "Viewport" (3320,392 1020×620) [W:VRMXG Editor/0/0/0/0/2/0@1bfb] (25 ms)
630: set TO = $.0.ref → "W:VRMXG Editor/0/0/0/0/2/0@1bfb" (0 ms)
631: pointer drag ref="W:VRMXG Editor/0/0/0/0/4/1/3/0@bda7" to_ref="W:VRMXG Editor/0/0/0/0/2/0@1bfb" steps=30 → {"action":"drag","activated":true,"at":{"x":3534.5,"y":1143},"probe_seq_before":0} (1525 ms)
632: until find("id=undo").0.name == "Undo Add till" timeout=10000 → timed out, last "Undo Change id gametimer-3 to brew-3" (10117 ms)
```
</details>

### 13. Each table area's tableZone, the game's own behaviour (declared by its describe), added f…

** (checklist line 23)

> Each table area's tableZone, the game's own behaviour (declared by its describe), added from the Behaviours panel with its seven params: the regular, her order's dialogue and the player from node menus (the player pinned: its default), her tray's item and her flags typed, the points pinned (their default).

**Failed:** after 5000 ms, still not find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61": "a7b-1c2d3e4f5a61"

- 👀 shot 1: end
- ✅ `find("id=inspector-id").0.name == "Node table-1"`
- ✅ `find("id=undo").0.name == "Undo Add tableZone to table-1"`
- ✅ `find("id=beh-tableZone").count == 1`
- ✅ `find("id=beh-tableZone-customer").0.value == "aoi"`
- ✅ `find("id=beh-tableZone-dialogue").0.value == "order-1"`
- ❌ `find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61"`, got `"a7b-1c2d3e4f5a61"`

![13-1](shots/r13-1.png)

<details><summary>Steps (10874 ms)</summary>

```
1097: act id=node-table-1 action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":262,"x":3040,"y":945},"help":"","id":"node-table-1","name":"Table 1 (table-1), Area","re (49 ms)
1098: until find("id=inspector-id").0.name == "Node table-1" → ok (40 ms)
1099: act id=beh-add action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":160,"x":4353,"y":938},"help":"","id":"beh-add","name":"Behaviour to add","ref":"W:VRMXG  (24 ms)
1101: keys down → {"sent":true} (109 ms)
1102: act surface=app role=menuitem name="tableZone" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":160,"x":4340,"y":1010},"id":"_popUpItemAction:","name":"tableZone","ref":"A/0/0/1/3@150b (69 ms)
1104: act id=beh-add-button action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":43,"x":4568,"y":936},"help":"Add behaviour tableZone","id":"beh-add-button","name":"Add  (65 ms)
1105: until find("id=undo").0.name == "Undo Add tableZone to table-1" timeout=5000 → ok (383 ms)
1106: until find("id=beh-tableZone").count == 1 timeout=5000 → ok (482 ms)
1107: act id=beh-tableZone-customer action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":147,"x":4457,"y":618},"help":"","id":"beh-tableZone-customer","name":"tableZone customer (27 ms)
1109: keys down → {"sent":true} (115 ms)
1110: act surface=app role=menuitem name="aoi" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":146,"x":4445,"y":1146},"id":"_popUpItemAction:","name":"aoi","ref":"A/0/0/1/22@f233","ro (65 ms)
1111: until find("id=beh-tableZone-customer").0.value == "aoi" timeout=5000 → ok (1186 ms)
1112: act id=beh-tableZone-dialogue action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":147,"x":4457,"y":645},"help":"","id":"beh-tableZone-dialogue","name":"tableZone dialogue (34 ms)
1114: keys down → {"sent":true} (115 ms)
1115: act surface=app role=menuitem name="order-1" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":146,"x":4445,"y":1581},"id":"_popUpItemAction:","name":"order-1","ref":"A/0/0/1/39@f07d" (88 ms)
1116: until find("id=beh-tableZone-dialogue").0.value == "order-1" timeout=5000 → ok (377 ms)
1117: act id=beh-tableZone-item action=set_value value="6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":147,"x":4457,"y":672},"help":"","id":"beh-tableZone-item","name":"tableZone item","r (787 ms)
1118: until find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61" timeout=5000 → timed out, last "a7b-1c2d3e4f5a61" (5085 ms)
```
</details>

### 17. Saved, and read back from disk the same bytes, valid; the file is what rush-level

** (checklist line 27)

> Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level, byte for byte.

**Failed:** expected find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid ", got "Scene game/rush-built.vrmxs 41 nodes saved valid hash dbf872188cd9772d"

- 👀 shot 1: end
- ✅ `find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$"`
- ✅ `find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid"`
- ❌ `find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid "`, got `"Scene game/rush-built.vrmxs 41 nodes saved valid hash dbf872188cd9772d"`

![17-1](shots/r17-1.png)

<details><summary>Steps (990 ms)</summary>

```
1660: act id=save action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":48,"x":3696,"y":333},"help":"","id":"save","name":"Save","ref":"W:VRMXG Editor/0/0/0/0/0 (46 ms)
1661: until find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$" timeout=20000 → ok (69 ms)
1662: act id=verify action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":26,"w":127,"x":3985,"y":1223},"help":"","id":"verify","name":"Reopen and compare","ref":"W:VRMX (46 ms)
1663: until find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid" timeout=30000 → ok (231 ms)
1664: expect find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid " → got "Scene game/rush-built.vrmxs 41 nodes saved valid hash dbf872188cd9772d" (44 ms)
```
</details>

## Errors (the run's, not necessarily the app's)

### 7. The two goals in order and the checkpoint, each given its id and its condition built in t…

** (checklist line 17)

> The two goals in order and the checkpoint, each given its id and its condition built in the condition's fields; the checkpoint's once pinned (its default, written into the file).

**Error:** ELEMENT_NOT_FOUND: no element matches role=menuitem name="GameGoal"

- 👀 shot 1: end

![7-1](shots/r7-1.png)

<details><summary>Steps (1138 ms)</summary>

```
478: act id=file-name action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":27,"w":139,"x":3882,"y":333},"help":"The file New and Save As use, in the project","id":"file-n (62 ms)
479: act role=popupbutton name="Node type to add" action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":111,"x":3133,"y":402},"help":"","name":"Node type to add","ref":"W:VRMXG Editor/0/0/0/0/ (52 ms)
481: keys down → {"sent":true} (113 ms)
```
</details>

### 14. Connections 1 to 13, from the Connections panel of the node that sends each (signal, targ…

** (checklist line 24)

> Connections 1 to 13, from the Connections panel of the node that sends each (signal, target and action picked from lists, arguments by the action's schema): the rules' ready to Hana's lookAt (a node argument), each order's chose to its brew timer and Hana's playLayer (a yes / no pinned false), each brew timer's timeout to its tray's state and Hana's line.

**Error:** ELEMENT_NOT_FOUND: no element matches role=menuitem name="tray-1"

- 👀 shot 1: end
- ✅ `find("id=inspector-id").0.name == "Node rules"`
- ✅ `find("id=undo").0.name == "Undo Connect rules.ready to hana-1.lookAt"`
- ✅ `find("id=conn-0").count == 1`
- ✅ `find("id=conn-0-arg-target").0.value == "mira"`
- ✅ `find("id=inspector-id").0.name == "Node order-1"`
- ✅ `find("id=undo").0.name == "Undo Connect order-1.chose to brew-1.start"`
- ✅ `find("id=conn-1").count == 1`
- ✅ `find("id=undo").0.name == "Undo Connect order-1.chose to hana-1.playLayer"`
- ✅ `find("id=conn-2").count == 1`
- ✅ `find("id=conn-2-arg-layer").0.value == "upperBody"`
- ✅ `find("id=conn-2-arg-loop--clear").count == 1`
- ✅ `find("id=conn-2-arg-slot").0.value == "use"`
- ✅ `find("id=inspector-id").0.name == "Node brew-1"`

![14-1](shots/r14-1.png)

<details><summary>Steps (18166 ms)</summary>

```
1193: act id=node-rules action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":25,"w":262,"x":3040,"y":1017},"help":"","id":"node-rules","name":"rules, GameRules","ref":"W:VR (31 ms)
1194: until find("id=inspector-id").0.name == "Node rules" → ok (43 ms)
1195: act id=conn-new-signal action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1075},"help":"","id":"conn-new-signal","name":"New connection signal"," (31 ms)
1197: keys down → {"sent":true} (114 ms)
1198: act surface=app role=menuitem name="ready" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1098},"id":"_popUpItemAction:","name":"ready","ref":"A/0/0/1/1@7a7f","r (90 ms)
1200: act id=conn-new-to action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1102},"help":"","id":"conn-new-to","name":"New connection target","ref" (74 ms)
1202: keys down → {"sent":true} (115 ms)
1203: act surface=app role=menuitem name="hana-1" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1605},"id":"_popUpItemAction:","name":"hana-1","ref":"A/0/0/1/21@0846", (77 ms)
1205: act id=conn-new-call action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1129},"help":"","id":"conn-new-call","name":"New connection action","re (70 ms)
1207: keys down → {"sent":true} (111 ms)
1208: act surface=app role=menuitem name="lookAt" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1296},"id":"_popUpItemAction:","name":"lookAt","ref":"A/0/0/1/7@e4ab"," (73 ms)
1210: act id=conn-new-add action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":69,"x":4360,"y":1156},"help":"Connect rules.ready to hana-1.lookAt","id":"conn-new-add", (69 ms)
1211: until find("id=undo").0.name == "Undo Connect rules.ready to hana-1.lookAt" timeout=5000 → ok (53 ms)
1212: until find("id=conn-0").count == 1 timeout=5000 → ok (366 ms)
1213: act id=conn-0-arg-target action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":147,"x":4457,"y":1026},"help":"","id":"conn-0-arg-target","name":"lookAt target","ref":" (452 ms)
1215: keys down → {"sent":true} (112 ms)
1216: act surface=app role=menuitem name="mira" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":146,"x":4445,"y":1505},"id":"_popUpItemAction:","name":"mira","ref":"A/0/0/1/20@208e","r (86 ms)
1217: until find("id=conn-0-arg-target").0.value == "mira" timeout=5000 → ok (765 ms)
1218: act id=node-order-1 action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":25,"w":262,"x":3040,"y":1235},"help":"","id":"node-order-1","name":"Aoi's order (order-1), Dial (469 ms)
1219: until find("id=inspector-id").0.name == "Node order-1" → ok (52 ms)
1220: act id=conn-new-signal action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1058},"help":"","id":"conn-new-signal","name":"New connection signal"," (35 ms)
1222: keys down → {"sent":true} (109 ms)
1223: act surface=app role=menuitem name="chose" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1201},"id":"_popUpItemAction:","name":"chose","ref":"A/0/0/1/6@cb17","r (98 ms)
1225: act id=conn-new-to action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1085},"help":"","id":"conn-new-to","name":"New connection target","ref" (69 ms)
1227: keys down → {"sent":true} (113 ms)
1228: act surface=app role=menuitem name="brew-1" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1924},"id":"_popUpItemAction:","name":"brew-1","ref":"A/0/0/1/35@b11c", (80 ms)
1230: act id=conn-new-call action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1112},"help":"","id":"conn-new-call","name":"New connection action","re (87 ms)
1232: keys down → {"sent":true} (111 ms)
1233: act surface=app role=menuitem name="start" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1183},"id":"_popUpItemAction:","name":"start","ref":"A/0/0/1/3@96c3","r (86 ms)
1235: act id=conn-new-add action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":69,"x":4360,"y":1139},"help":"Connect order-1.chose to brew-1.start","id":"conn-new-add" (73 ms)
1236: until find("id=undo").0.name == "Undo Connect order-1.chose to brew-1.start" timeout=5000 → ok (70 ms)
1237: until find("id=conn-1").count == 1 timeout=5000 → ok (801 ms)
1238: act id=conn-new-signal action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1057},"help":"","id":"conn-new-signal","name":"New connection signal"," (39 ms)
1240: keys down → {"sent":true} (112 ms)
1241: act surface=app role=menuitem name="chose" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1201},"id":"_popUpItemAction:","name":"chose","ref":"A/0/0/1/6@cb17","r (97 ms)
1243: act id=conn-new-to action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1084},"help":"","id":"conn-new-to","name":"New connection target","ref" (84 ms)
1245: keys down → {"sent":true} (111 ms)
1246: act surface=app role=menuitem name="hana-1" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1588},"id":"_popUpItemAction:","name":"hana-1","ref":"A/0/0/1/21@0846", (79 ms)
1248: act id=conn-new-call action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1111},"help":"","id":"conn-new-call","name":"New connection action","re (77 ms)
1250: keys down → {"sent":true} (111 ms)
1251: act surface=app role=menuitem name="playLayer" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1351},"id":"_popUpItemAction:","name":"playLayer","ref":"A/0/0/1/10@180 (97 ms)
1253: act id=conn-new-add action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":27,"w":69,"x":4360,"y":1138},"help":"Connect order-1.chose to hana-1.playLayer","id":"conn-new- (61 ms)
1254: until find("id=undo").0.name == "Undo Connect order-1.chose to hana-1.playLayer" timeout=5000 → ok (375 ms)
1255: until find("id=conn-2").count == 1 timeout=5000 → ok (488 ms)
1256: act id=conn-2-arg-layer action=set_value value="upperBody" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":147,"x":4457,"y":815},"help":"","id":"conn-2-arg-layer","name":"playLayer layer","re (446 ms)
1257: until find("id=conn-2-arg-layer").0.value == "upperBody" timeout=5000 → ok (671 ms)
1258: act id=conn-2-arg-loop--pin action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":14,"w":13,"x":4432,"y":915},"help":"Write the value shown (false) into the file, so it stays wh (41 ms)
1259: until find("id=conn-2-arg-loop--clear").count == 1 timeout=5000 → ok (353 ms)
1260: act id=conn-2-arg-slot action=set_value value="use" → {"action":"set_value","delivery":"delivered","element":{"frame":{"h":27,"w":147,"x":4457,"y":880},"help":"","id":"conn-2-arg-slot","name":"playLayer slot","ref" (918 ms)
1261: until find("id=conn-2-arg-slot").0.value == "use" timeout=5000 → ok (677 ms)
1262: act id=node-brew-1 action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":25,"w":262,"x":3040,"y":1042},"help":"","id":"node-brew-1","name":"brew-1, GameTimer","ref":"W: (42 ms)
1263: until find("id=inspector-id").0.name == "Node brew-1" → ok (37 ms)
1264: act id=conn-new-signal action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1040},"help":"","id":"conn-new-signal","name":"New connection signal"," (24 ms)
1266: keys down → {"sent":true} (108 ms)
1267: act surface=app role=menuitem name="timeout" exact=true action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":151,"x":4440,"y":1136},"id":"_popUpItemAction:","name":"timeout","ref":"A/0/0/1/4@41c2", (75 ms)
1269: act id=conn-new-to action=focus → {"action":"focus","delivery":"delivered","element":{"frame":{"h":22,"w":152,"x":4452,"y":1067},"help":"","id":"conn-new-to","name":"New connection target","ref" (64 ms)
1271: keys down → {"sent":true} (114 ms)
```
</details>

### 15. Connections 14 to 19: the serve goal to the till and Hana, the till's verb to setFlag, th…

** (checklist line 25)

> Connections 14 to 19: the serve goal to the till and Hana, the till's verb to setFlag, the till goal to the score (a number), won and lost to changeScene (a delay and a scene); the level's 19 connections, in order.

**Error:** ELEMENT_NOT_FOUND: no element matches id=node-serve

- 👀 shot 1: end

![15-1](shots/r15-1.png)

<details><summary>Steps (527 ms)</summary>

```
```
</details>

## Passed

- **1. The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars,…** (checklist line 11): find("id=project-name").0.name == "Project project-w10-level"; find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 26 nodes saved valid "; find("id=renderer").0.name == "Renderer WebGL"; find("id=node-aoi").count == 1; find("id=node-hana-1").count == 1 (6354 ms)
- **2. Mira plays and the regulars think: the player behaviour added to Mira, a brain to each re…** (checklist line 12): find("id=inspector-id").0.name == "Node mira"; find("id=undo").0.name == "Undo Add player to mira"; find("id=beh-player").count == 1; find("id=inspector-id").0.name == "Node aoi"; find("id=undo").0.name == "Undo Add brain to aoi"; find("id=beh-brain").count == 1; find("id=beh-brain-preset--kind").0.value == "path"; find("id=beh-brain-preset").0.value == "game/brains/regular.json"; find("id=beh-brain-vars-arrive").count == 1; find("id=beh-brain-vars-arrive--kind").0.value == "number"; find("id=beh-brain-vars-arrive").0.value == "8"; find("id=beh-brain-vars-seat").count == 1; find("id=beh-brain-vars-seat").0.value == "stool-2"; find("id=inspector-id").0.name == "Node ren"; find("id=undo").0.name == "Undo Add brain to ren"; find("id=beh-brain").count == 1; find("id=beh-brain-preset--kind").0.value == "path"; find("id=beh-brain-preset").0.value == "game/brains/regular.json"; find("id=beh-brain-vars-arrive").count == 1; find("id=beh-brain-vars-arrive--kind").0.value == "number"; find("id=beh-brain-vars-arrive").0.value == "35"; find("id=beh-brain-vars-seat").count == 1; find("id=beh-brain-vars-seat").0.value == "stool-3"; find("id=inspector-id").0.name == "Node yuki"; find("id=undo").0.name == "Undo Add brain to yuki"; find("id=beh-brain").count == 1; find("id=beh-brain-preset--kind").0.value == "path"; find("id=beh-brain-preset").0.value == "game/brains/regular.json"; find("id=beh-brain-vars-arrive").count == 1; find("id=beh-brain-vars-arrive--kind").0.value == "number"; find("id=beh-brain-vars-arrive").0.value == "60"; find("id=beh-brain-vars-seat").count == 1; find("id=beh-brain-vars-seat").0.value == "stool-5"; find("id=beh-brain-vars-arrive").0.value == "60"; find("id=doc-state").0.name matches " valid " (44383 ms)
- **3. The three table areas: one made, its shape pinned and its size set (a vector), Duplicated…** (checklist line 13): find("role=popupbutton name='Node type to add'").0.value == "Area"; find("id=undo").0.name == "Undo Add area"; find("id=pin-shape").count == 0; find("id=undo").0.name == "Undo Set area.shape"; find("id=prop-size-x").0.value == "1.1"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "1.8"; find("id=node-area-2").count == 1; find("id=node-area-3").count == 1; find("id=inspector-id").0.name matches "^3 nodes: "; find("id=prop-size-x").0.name != "size X (mixed values)"; find("id=prop-size-z").0.value == "1.8"; find("id=inspector-id").0.name == "Node area"; find("id=undo").0.name == "Undo Change id area to table-1"; find("id=inspector-id").0.name == "Node table-1"; find("id=field-name").0.value == "Table 1"; find("id=pos-x").0.value == "-1.45"; find("id=pos-y").0.value == "1"; find("id=pos-z").0.value == "1"; find("id=inspector-id").0.name == "Node area-2"; find("id=undo").0.name == "Undo Change id area-2 to table-2"; find("id=inspector-id").0.name == "Node table-2"; find("id=field-name").0.value == "Table 2"; find("id=pos-x").0.value == "1.45"; find("id=pos-y").0.value == "1"; find("id=pos-z").0.value == "1"; find("id=inspector-id").0.name == "Node area-3"; find("id=undo").0.name == "Undo Change id area-3 to table-3"; find("id=inspector-id").0.name == "Node table-3"; find("id=field-name").0.value == "Table 3"; find("id=pos-x").0.value == "1.45"; find("id=pos-y").0.value == "1"; find("id=pos-z").0.value == "-2"; find("id=doc-state").0.name matches " valid " (28680 ms)
- **5. The counters and the clock under the rules, each given its id (its key in the game state …** (checklist line 15): find("role=popupbutton name='Node type to add'").0.value == "GameCounter"; find("id=undo").0.name == "Undo Add gamecounter"; find("id=undo").0.name == "Undo Change id gamecounter to score"; find("id=inspector-id").0.name == "Node score"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-label").0.value == "Score"; find("role=popupbutton name='Node type to add'").0.value == "GameCounter"; find("id=undo").0.name == "Undo Add gamecounter"; find("id=undo").0.name == "Undo Change id gamecounter to served"; find("id=inspector-id").0.name == "Node served"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-label").0.value == "Served"; find("id=prop-max").0.value == "3"; find("role=popupbutton name='Node type to add'").0.value == "GameCounter"; find("id=undo").0.name == "Undo Add gamecounter"; find("id=undo").0.name == "Undo Change id gamecounter to mistakes"; find("id=inspector-id").0.name == "Node mistakes"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-label").0.value == "Wrong orders"; find("role=popupbutton name='Node type to add'").0.value == "GameTimer"; find("id=undo").0.name == "Undo Add gametimer"; find("id=undo").0.name == "Undo Change id gametimer to clock"; find("id=inspector-id").0.name == "Node clock"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-label").0.value == "Until ten o'clock"; find("id=prop-seconds").0.value == "240"; find("id=doc-state").0.name matches " valid " (38177 ms)
- **6. Three brew timers: one made, Duplicated twice, then all three selected and their seconds …** (checklist line 16): find("role=popupbutton name='Node type to add'").0.value == "GameTimer"; find("id=undo").0.name == "Undo Add gametimer"; find("id=field-parent").0.value == "rules"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-autostart").0.value == "0"; find("id=node-gametimer-2").count == 1; find("id=undo").0.name == "Undo Duplicate gametimer"; find("id=node-gametimer-3").count == 1; find("id=undo").0.name == "Undo Duplicate gametimer-2"; find("id=inspector-id").0.name == "Node gametimer"; find("id=inspector-id").0.name == "3 nodes: gametimer, gametimer-2, gametimer-3"; find("id=undo").0.name == "Undo Set seconds on 3 nodes"; find("id=prop-seconds").0.value == "6"; find("id=inspector-id").0.name == "Node gametimer"; find("id=undo").0.name == "Undo Change id gametimer to brew-1"; find("id=inspector-id").0.name == "Node brew-1"; find("id=inspector-id").0.name == "Node gametimer-2"; find("id=undo").0.name == "Undo Change id gametimer-2 to brew-2"; find("id=inspector-id").0.name == "Node brew-2"; find("id=inspector-id").0.name == "Node gametimer-3"; find("id=undo").0.name == "Undo Change id gametimer-3 to brew-3"; find("id=inspector-id").0.name == "Node brew-3"; find("id=doc-state").0.name matches " valid " (17623 ms)
- **9. Hana's briefing: a Dialogue given its id, that starts by itself, three lines (speaker, te…** (checklist line 19): find("role=popupbutton name='Node type to add'").0.value == "Dialogue"; find("id=undo").0.name == "Undo Add dialogue"; find("id=undo").0.name == "Undo Change id dialogue to briefing"; find("id=inspector-id").0.name == "Node briefing"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=prop-autostart").0.value == "1"; find("id=prop-lines").0.name == "lines, 1 row"; find("id=prop-lines-0-speaker").0.value == "hana-1"; find("id=prop-lines-0-text").0.value == "Morning, Mira! Three regulars are due. Take their orders, bring each one what I make, and close the till before ten."; find("id=prop-lines-0-clip").0.value == "game/voice/hana-brief.wav"; find("id=prop-lines-0-choices-0").count == 1; find("id=prop-lines-0-choices-0-id").0.value == "ready"; find("id=prop-lines-0-choices-0-text").0.value == "On it!"; find("id=prop-lines-0-choices-0-to").0.value == "ready"; find("id=prop-lines-0-choices-1").count == 1; find("id=prop-lines-0-choices-1-id").0.value == "coffee"; find("id=prop-lines-0-choices-1-text").0.value == "Coffee first?"; find("id=prop-lines-0-choices-1-to").0.value == "coffee"; find("id=prop-lines").0.name == "lines, 2 rows"; find("id=prop-lines-1-id").0.value == "ready"; find("id=prop-lines-1-speaker").0.value == "hana-1"; find("id=prop-lines-1-text").0.value == "That's the spirit. Here comes Aoi!"; find("id=prop-lines-1-clip").0.value == "game/voice/hana-brief-ready.wav"; find("id=prop-lines-1-next").0.value == "end"; find("id=prop-lines").0.name == "lines, 3 rows"; find("id=prop-lines-2-id").0.value == "coffee"; find("id=prop-lines-2-speaker").0.value == "hana-1"; find("id=prop-lines-2-text").0.value == "After the rush! Here comes Aoi."; find("id=prop-lines-2-clip").0.value == "game/voice/hana-brief-coffee.wav"; find("id=doc-state").0.name matches " valid " (25009 ms)
- **10. Aoi's order: a Dialogue given its id, three lines, the regular's question offering two ch…** (checklist line 20): find("role=popupbutton name='Node type to add'").0.value == "Dialogue"; find("id=undo").0.name == "Undo Add dialogue"; find("id=undo").0.name == "Undo Change id dialogue to order-1"; find("id=inspector-id").0.name == "Node order-1"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=field-name").0.value == "Aoi's order"; find("id=prop-lines").0.name == "lines, 1 row"; find("id=prop-lines-0-speaker").0.value == "aoi"; find("id=prop-lines-0-text").0.value == "Morning! Something warm and milky, please. Not too strong."; find("id=prop-lines-0-clip").0.value == "game/voice/aoi-ask.wav"; find("id=prop-lines-0-choices-0").count == 1; find("id=prop-lines-0-choices-0-id").0.value == "latte"; find("id=prop-lines-0-choices-0-text").0.value == "A latte, then."; find("id=prop-lines-0-choices-0-to").0.value == "right"; find("id=prop-lines-0-choices-0-set").count == 1; find("id=prop-lines-0-choices-0-set-ordered1").count == 1; find("id=prop-lines-0-choices-0-set-ordered1").0.value == "1"; find("id=prop-lines-0-choices-0-set-right1").count == 1; find("id=prop-lines-0-choices-0-set-right1").0.value == "1"; find("id=prop-lines-0-choices-1").count == 1; find("id=prop-lines-0-choices-1-id").0.value == "espresso"; find("id=prop-lines-0-choices-1-text").0.value == "A double espresso?"; find("id=prop-lines-0-choices-1-to").0.value == "wrong"; find("id=prop-lines-0-choices-1-set").count == 1; find("id=prop-lines-0-choices-1-set-ordered1").count == 1; find("id=prop-lines-0-choices-1-set-ordered1").0.value == "1"; find("id=prop-lines-0-choices-1-set-right1").count == 1; find("id=prop-lines").0.name == "lines, 2 rows"; find("id=prop-lines-1-id").0.value == "right"; find("id=prop-lines-1-speaker").0.value == "aoi"; find("id=prop-lines-1-text").0.value == "Perfect. Thank you!"; find("id=prop-lines-1-clip").0.value == "game/voice/aoi-right.wav"; find("id=prop-lines-1-next").0.value == "end"; find("id=prop-lines").0.name == "lines, 3 rows"; find("id=prop-lines-2-id").0.value == "wrong"; find("id=prop-lines-2-speaker").0.value == "aoi"; find("id=prop-lines-2-text").0.value == "Oh. Well, if you say so."; find("id=prop-lines-2-clip").0.value == "game/voice/aoi-wrong.wav"; find("id=doc-state").0.name matches " valid " (29652 ms)
- **11. Ren's order: a Dialogue given its id, three lines, the regular's question offering two ch…** (checklist line 21): find("role=popupbutton name='Node type to add'").0.value == "Dialogue"; find("id=undo").0.name == "Undo Add dialogue"; find("id=undo").0.name == "Undo Change id dialogue to order-2"; find("id=inspector-id").0.name == "Node order-2"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=field-name").0.value == "Ren's order"; find("id=prop-lines").0.name == "lines, 1 row"; find("id=prop-lines-0-speaker").0.value == "ren"; find("id=prop-lines-0-text").0.value == "Hi! Something cold, please? It's already warm out."; find("id=prop-lines-0-clip").0.value == "game/voice/ren-ask.wav"; find("id=prop-lines-0-choices-0").count == 1; find("id=prop-lines-0-choices-0-id").0.value == "chocolate"; find("id=prop-lines-0-choices-0-text").0.value == "A hot chocolate."; find("id=prop-lines-0-choices-0-to").0.value == "wrong"; find("id=prop-lines-0-choices-0-set").count == 1; find("id=prop-lines-0-choices-0-set-ordered2").count == 1; find("id=prop-lines-0-choices-0-set-ordered2").0.value == "1"; find("id=prop-lines-0-choices-0-set-right2").count == 1; find("id=prop-lines-0-choices-1").count == 1; find("id=prop-lines-0-choices-1-id").0.value == "iced-tea"; find("id=prop-lines-0-choices-1-text").0.value == "An iced tea."; find("id=prop-lines-0-choices-1-to").0.value == "right"; find("id=prop-lines-0-choices-1-set").count == 1; find("id=prop-lines-0-choices-1-set-ordered2").count == 1; find("id=prop-lines-0-choices-1-set-ordered2").0.value == "1"; find("id=prop-lines-0-choices-1-set-right2").count == 1; find("id=prop-lines-0-choices-1-set-right2").0.value == "1"; find("id=prop-lines").0.name == "lines, 2 rows"; find("id=prop-lines-1-id").0.value == "right"; find("id=prop-lines-1-speaker").0.value == "ren"; find("id=prop-lines-1-text").0.value == "Lovely, thanks."; find("id=prop-lines-1-clip").0.value == "game/voice/ren-right.wav"; find("id=prop-lines-1-next").0.value == "end"; find("id=prop-lines").0.name == "lines, 3 rows"; find("id=prop-lines-2-id").0.value == "wrong"; find("id=prop-lines-2-speaker").0.value == "ren"; find("id=prop-lines-2-text").0.value == "Hot? Hm. All right, then."; find("id=prop-lines-2-clip").0.value == "game/voice/ren-wrong.wav"; find("id=doc-state").0.name matches " valid " (30345 ms)
- **12. Yuki's order: a Dialogue given its id, three lines, the regular's question offering two c…** (checklist line 22): find("role=popupbutton name='Node type to add'").0.value == "Dialogue"; find("id=undo").0.name == "Undo Add dialogue"; find("id=undo").0.name == "Undo Change id dialogue to order-3"; find("id=inspector-id").0.name == "Node order-3"; find("id=pos-x").0.value == "0"; find("id=pos-y").0.value == "0"; find("id=pos-z").0.value == "0"; find("id=field-name").0.value == "Yuki's order"; find("id=prop-lines").0.name == "lines, 1 row"; find("id=prop-lines-0-speaker").0.value == "yuki"; find("id=prop-lines-0-text").0.value == "Just a green tea for me, please."; find("id=prop-lines-0-clip").0.value == "game/voice/yuki-ask.wav"; find("id=prop-lines-0-choices-0").count == 1; find("id=prop-lines-0-choices-0-id").0.value == "green-tea"; find("id=prop-lines-0-choices-0-text").0.value == "Green tea, coming up."; find("id=prop-lines-0-choices-0-to").0.value == "right"; find("id=prop-lines-0-choices-0-set").count == 1; find("id=prop-lines-0-choices-0-set-ordered3").count == 1; find("id=prop-lines-0-choices-0-set-ordered3").0.value == "1"; find("id=prop-lines-0-choices-0-set-right3").count == 1; find("id=prop-lines-0-choices-0-set-right3").0.value == "1"; find("id=prop-lines-0-choices-1").count == 1; find("id=prop-lines-0-choices-1-id").0.value == "coffee"; find("id=prop-lines-0-choices-1-text").0.value == "One black coffee."; find("id=prop-lines-0-choices-1-to").0.value == "wrong"; find("id=prop-lines-0-choices-1-set").count == 1; find("id=prop-lines-0-choices-1-set-ordered3").count == 1; find("id=prop-lines-0-choices-1-set-ordered3").0.value == "1"; find("id=prop-lines-0-choices-1-set-right3").count == 1; find("id=prop-lines").0.name == "lines, 2 rows"; find("id=prop-lines-1-id").0.value == "right"; find("id=prop-lines-1-speaker").0.value == "yuki"; find("id=prop-lines-1-text").0.value == "Thank you!"; find("id=prop-lines-1-clip").0.value == "game/voice/yuki-right.wav"; find("id=prop-lines-1-next").0.value == "end"; find("id=prop-lines").0.name == "lines, 3 rows"; find("id=prop-lines-2-id").0.value == "wrong"; find("id=prop-lines-2-speaker").0.value == "yuki"; find("id=prop-lines-2-text").0.value == "That's not what I said. But fine."; find("id=prop-lines-2-clip").0.value == "game/voice/yuki-wrong.wav"; find("id=doc-state").0.name matches " valid " (29737 ms)
- **16. A door prefab placed from the assets panel; a prop of its hinge overridden in the inspect…** (checklist line 26): find("id=add-prefabs-door-vrmxs").count == 1; find("id=undo").0.name == "Undo Add door"; find("id=node-door").0.name contains "inside"; find("id=node-door/hinge").count == 1; find("id=inspector-inner").count == 1; find("id=prop-mass").0.value == "12"; find("id=ov-mass").count == 0; find("id=undo").0.name == "Undo Override door/hinge.mass"; find("id=ov-mass").0.name == "mass overrides the prefab (prefab: 12): revert"; find("id=node-door").0.name contains "overridden"; find("id=ov-mass").count == 0; find("id=prop-mass").0.value == "12"; find("id=undo").0.name == "Undo Revert door/hinge.mass"; find("id=ov-mass").count == 1; find("id=ov-mass").count == 0; find("id=node-door").count == 0; find("id=doc-state").0.name matches " valid " (6626 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 4 | The rules: a GameRules node given its id, its seven flags (a map, key by key) and its los… | after 5000 ms, still not find("id=prop-flags-right1").count == 1: 0 | (none) | |
| 7 | The two goals in order and the checkpoint, each given its id and its condition built in t… | run error: ELEMENT_NOT_FOUND: no element matches role=menuitem name="GameGoal" | (none) | |
| 8 | The till dragged from the assets panel onto the viewport (the real pointer), and the thre… | after 10000 ms, still not find("id=undo").0.name == "Undo Add till": "Undo Change id gametimer-3 to brew-3" | (none) | |
| 13 | Each table area's tableZone, the game's own behaviour (declared by its describe), added f… | after 5000 ms, still not find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61": "a7b-1c2d3e4f5a61" | (none) | |
| 14 | Connections 1 to 13, from the Connections panel of the node that sends each (signal, targ… | run error: ELEMENT_NOT_FOUND: no element matches role=menuitem name="tray-1" | (none) | |
| 15 | Connections 14 to 19: the serve goal to the till and Hana, the till's verb to setFlag, th… | run error: ELEMENT_NOT_FOUND: no element matches id=node-serve | (none) | |
| 17 | Saved, and read back from disk the same bytes, valid; the file is what rush-level | expected find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid ", got "Scene game/rush-built.vrmxs 41 nodes saved valid hash dbf872188cd9772d" | (none) | |
