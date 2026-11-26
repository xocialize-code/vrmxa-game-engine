# Starter content: licences

Every file in `content/starter/` and where it comes from. **Everything a game ships from here is CC0 1.0** (decision
AB-D-0297 item 7): a game builder can use, change and sell it with no credit and no licence question. "Xocialize original" rows are ours,
released under CC0 1.0 too; the scripts in `tools/` are code, under the repository's MIT OR Apache-2.0.
`node content/starter/tools/check-licences.mjs` (CI and `npm test`) fails on a file this table doesn't list, a row
that matches nothing, or a content row whose licence isn't CC0. The rows for clips and items are written by
`tools/make-licences.mjs` from `animations/provenance.json` and `items/provenance.json`, which hold each file's
source in full (file, SHA-256, the source's own licence statement).

**mesh2motion** (`Mesh2Motion/mesh2motion-app` at `7963d4c6f760152c41d60a8bdf52fc75d0d34925`, 2026-11-07: every file read is
byte-identical to that commit; archive `https://github.com/Mesh2Motion/mesh2motion-app/archive/7963d4c6f760152c41d60a8bdf52fc75d0d34925.zip`). Its art (3D models, rigs, animations) is CC0 1.0
by its `LICENSE-CC0.MD` ("All 3d models, blend files, rigs, animations") and its README ("Licenses"); its code is MIT,
and none of it is copied here. Its manifests have no per-file licence. Who made each source, as far as mesh2motion's
own records say (`tools/upstream.mjs`, read from its public history):
- 26 clips are tagged `quaternius`: Quaternius' Universal Animation Library, CC0 (its licence is vendored in
  `Mesh2Motion/mesh2motion-assets` at `CC0-packs/Quaternius/License.txt`).
- The three weapon props are KayKit's Fantasy Weapons Bits 1.0 by Kay Lousberg, CC0 (vendored at
  `CC0-packs/Kaykit/`; mesh2motion's props are the pack's meshes re-exported).
- **11 clips have no recorded author** (listen, think, greet, nod, clap, cheer, happy, angry, pickUp, death, kick): every
  commit to their sources is by mesh2motion's maintainer, none names a source, and none is one of its motion captures.
  Their CC0 rests on mesh2motion's blanket statement.

**Not CC0 in mesh2motion, and not used here:** several rig variations (Sophia CC-SA 4.0; Jay, Sintel, Bunny and Carrot
CC-BY: its `src/lib/RigConfig.ts` and `mesh2motion-assets/3d-models/CC-SA/`). Only its human animation GLBs and three
weapon props are read; no model or variation is.

"Xocialize original (code)" is code made for this repository by Xocialize LLC: the tools and tests that make and check
the content. They aren't content and no game ships them.

## Documents and data

| File | Licence | Source |
|---|---|---|
| `README.md` | CC0-1.0 | What the starter content is and how to use and remake it |
| `LICENCES.md` | CC0-1.0 | This table, written by `tools/make-licences.mjs` |
| `animations.json` | CC0-1.0 | The default animation set (VRMXA §8.4): every clip with its slots, written by `tools/make-animations.mjs` |
| `animations/provenance.json` | CC0-1.0 | Each clip's source in full (mesh2motion file and SHA-256, its .blend, the floor lift, the retarget's check and vrmxa-core's clip checker's notes) |
| `items/provenance.json` | CC0-1.0 | Each item's source in full (generated, or the mesh2motion prop with its SHA-256) |

## Animation clips (`.vrma`)

| File | Licence | Source |
|---|---|---|
| `animations/clips/idle.vrma` | CC0-1.0 | mesh2motion's "Idle_A" (`static/assets/human/animations/idle-a.glb`, SHA-256 87b14d162867…; made from `rigs/human/idles/animation-human-idle-a.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/idle-foldArms.vrma` | CC0-1.0 | mesh2motion's "Idle_FoldArms" (`static/assets/human/animations/idle-foldarms.glb`, SHA-256 cf2633678d94…; made from `rigs/human/idles/animation-human-idle-foldarms.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/walk.vrma` | CC0-1.0 | mesh2motion's "Walk" (`static/assets/human/animations/walk.glb`, SHA-256 c961d6dd9985…; made from `rigs/human/locomotion/animation-human-walk.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/run.vrma` | CC0-1.0 | mesh2motion's "Jog" (`static/assets/human/animations/jog.glb`, SHA-256 8262507f4354…; made from `rigs/human/locomotion/animation-human-jog.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/jump.vrma` | CC0-1.0 | mesh2motion's "Jump_Start" (`static/assets/human/animations/jump-start.glb`, SHA-256 3a560b390cd4…; made from `rigs/human/locomotion/animation-human-jump-start.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/fall.vrma` | CC0-1.0 | mesh2motion's "Jump_air" (`static/assets/human/animations/jump-air.glb`, SHA-256 666e9f7afec6…; made from `rigs/human/locomotion/animation-human-jump-air.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/land.vrma` | CC0-1.0 | mesh2motion's "Jump_Land" (`static/assets/human/animations/jump-land.glb`, SHA-256 38a417280d96…; made from `rigs/human/locomotion/animation-human-jump-land.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/crouch.vrma` | CC0-1.0 | mesh2motion's "Crouch_Idle" (`static/assets/human/animations/crouch-idle.glb`, SHA-256 3a34c46805ac…; made from `rigs/human/idles/animation-human-crouch-idle.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/crouchWalk.vrma` | CC0-1.0 | mesh2motion's "Crouch_Walk" (`static/assets/human/animations/crouch-walk.glb`, SHA-256 2586c27cc4bc…; made from `rigs/human/locomotion/animation-human-crouch-walk.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/sit.vrma` | CC0-1.0 | mesh2motion's "Sitting_Enter" (`static/assets/human/animations/sitting-enter.glb`, SHA-256 7a149a9b939b…; made from `rigs/human/idles/animation-human-sitting-enter.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/sitIdle.vrma` | CC0-1.0 | mesh2motion's "Sitting_Idle" (`static/assets/human/animations/sitting-idle.glb`, SHA-256 f727f07d8916…; made from `rigs/human/idles/animation-human-sitting-idle.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/stand.vrma` | CC0-1.0 | mesh2motion's "Sitting_Exit" (`static/assets/human/animations/sitting-exit.glb`, SHA-256 0f4472c389ce…; made from `rigs/human/idles/animation-human-sitting-exit.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/getUp.vrma` | CC0-1.0 | mesh2motion's "LayToIdle" (`static/assets/human/animations/laytoidle.glb`, SHA-256 b6ea55799510…; made from `rigs/human/combat/reactions/animation-human-laytoidle.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/talk.vrma` | CC0-1.0 | mesh2motion's "Idle_Talking" (`static/assets/human/animations/idle-talking.glb`, SHA-256 d955f598b772…; made from `rigs/human/idles/animation-human-idle-talking.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/listen.vrma` | CC0-1.0 | mesh2motion's "Idle Listening" (`static/assets/human/animations/idle-listening.glb`, SHA-256 baf99e376c14…; made from `rigs/human/idles/animation-human-idle-listening.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/think.vrma` | CC0-1.0 | mesh2motion's "Confused" (`static/assets/human/animations/confused.glb`, SHA-256 20d0ba8de8ae…; made from `rigs/human/emotions/animation-human-confused.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/greet.vrma` | CC0-1.0 | mesh2motion's "Greeting" (`static/assets/human/animations/greeting.glb`, SHA-256 abf286fad037…; made from `rigs/human/emotes/animation-human-greeting.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/nod.vrma` | CC0-1.0 | mesh2motion's "Head Nod" (`static/assets/human/animations/head-nod.glb`, SHA-256 8a44b309edc5…; made from `rigs/human/emotes/animation-human-head-nod.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/clap.vrma` | CC0-1.0 | mesh2motion's "Clapping" (`static/assets/human/animations/clapping.glb`, SHA-256 4d603cf8b90b…; made from `rigs/human/emotes/animation-human-clapping.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/cheer.vrma` | CC0-1.0 | mesh2motion's "Victory Fist Pump" (`static/assets/human/animations/victory-fist-pump.glb`, SHA-256 9241e35c368c…; made from `rigs/human/emotions/animation-human-victory-fist-pump.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/happy.vrma` | CC0-1.0 | mesh2motion's "Victory" (`static/assets/human/animations/victory.glb`, SHA-256 660f7b607d0b…; made from `rigs/human/emotions/animation-human-victory.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/angry.vrma` | CC0-1.0 | mesh2motion's "Angry" (`static/assets/human/animations/angry.glb`, SHA-256 978b28846a2c…; made from `rigs/human/emotions/animation-human-angry.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/sip.vrma` | CC0-1.0 | mesh2motion's "Consume" (`static/assets/human/animations/consume.glb`, SHA-256 93ff67295f91…; made from `rigs/human/activities/animation-human-consume.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/dance.vrma` | CC0-1.0 | mesh2motion's "Dance_Simple" (`static/assets/human/animations/dance-simple.glb`, SHA-256 aa3e2b18ffac…; made from `rigs/human/emotes/animation-human-dance-simple.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/use.vrma` | CC0-1.0 | mesh2motion's "Interact" (`static/assets/human/animations/interact.glb`, SHA-256 9091ffa013fc…; made from `rigs/human/activities/animation-human-interact.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/equip.vrma` | CC0-1.0 | mesh2motion's "PickUp_Table" (`static/assets/human/animations/pickup-table.glb`, SHA-256 e766b343577a…; made from `rigs/human/activities/animation-human-pickup-table.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/pickUp.vrma` | CC0-1.0 | mesh2motion's "Pick Up" (`static/assets/human/animations/pick-up.glb`, SHA-256 e7cce9330a84…; made from `rigs/human/activities/animation-human-pick-up.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/carry.vrma` | CC0-1.0 | mesh2motion's "Walk_Carry" (`static/assets/human/animations/walk-carry.glb`, SHA-256 6e1c3261d865…; made from `rigs/human/locomotion/animation-human-walk-carry.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/push.vrma` | CC0-1.0 | mesh2motion's "Push" (`static/assets/human/animations/push.glb`, SHA-256 8dd37dfe212f…; made from `rigs/human/activities/animation-human-push.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/chestOpen.vrma` | CC0-1.0 | mesh2motion's "Chest_Open" (`static/assets/human/animations/chest-open.glb`, SHA-256 9114a135144c…; made from `rigs/human/activities/animation-human-chest-open.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/idle-sword.vrma` | CC0-1.0 | mesh2motion's "Idle_Sword" (`static/assets/human/animations/idle-sword.glb`, SHA-256 54e2d11bdfe8…; made from `rigs/human/combat/melee/animation-human-idle-sword.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/swordAttack.vrma` | CC0-1.0 | mesh2motion's "Sword_Attack" (`static/assets/human/animations/sword-attack.glb`, SHA-256 228f86e32a61…; made from `rigs/human/combat/melee/animation-human-sword-attack.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/swordBlock.vrma` | CC0-1.0 | mesh2motion's "Sword_Block" (`static/assets/human/animations/sword-block.glb`, SHA-256 e0509533376c…; made from `rigs/human/combat/defense/animation-human-sword-block.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/hit.vrma` | CC0-1.0 | mesh2motion's "Hit_Chest" (`static/assets/human/animations/hit-chest.glb`, SHA-256 7051f57eeb32…; made from `rigs/human/combat/reactions/animation-human-hit-chest.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/death.vrma` | CC0-1.0 | mesh2motion's "Death_A" (`static/assets/human/animations/death-a.glb`, SHA-256 b2cd811cf25d…; made from `rigs/human/combat/reactions/animation-human-death-A.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/punch.vrma` | CC0-1.0 | mesh2motion's "Punch_Jab" (`static/assets/human/animations/punch-jab.glb`, SHA-256 3723568cf799…; made from `rigs/human/combat/unarmed/animation-human-punch-jab.blend`), by Quaternius (quaternius.com), Universal Animation Library; CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |
| `animations/clips/kick.vrma` | CC0-1.0 | mesh2motion's "Kick Front" (`static/assets/human/animations/kick-front.glb`, SHA-256 44f265489d6f…; made from `rigs/human/combat/unarmed/animation-human-kick-front.blend`), **author unrecorded** (CC0 per mesh2motion's blanket statement; its history shows only its maintainer committing it, no source named); CC0 1.0. Retargeted onto the VRM humanoid by `tools/make-animations.mjs` |

## Items (`.vrmxi`)

| File | Licence | Source |
|---|---|---|
| `items/door.vrmxi` | CC0-1.0 | "Wooden door" (VRMXI `door`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/chest.vrmxi` | CC0-1.0 | "Chest" (VRMXI `container`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/lever.vrmxi` | CC0-1.0 | "Lever" (VRMXI `switch`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/button.vrmxi` | CC0-1.0 | "Button" (VRMXI `switch`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/chair.vrmxi` | CC0-1.0 | "Chair" (VRMXI `seat`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/bench.vrmxi` | CC0-1.0 | "Bench" (VRMXI `seat`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/shelf.vrmxi` | CC0-1.0 | "Shelf" (VRMXI `x-vrmxg.prop`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/table.vrmxi` | CC0-1.0 | "Table" (VRMXI `x-vrmxg.prop`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/crate.vrmxi` | CC0-1.0 | "Crate" (VRMXI `x-vrmxg.prop`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/barrel.vrmxi` | CC0-1.0 | "Barrel" (VRMXI `x-vrmxg.prop`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/coin.vrmxi` | CC0-1.0 | "Coin" (VRMXI `pickup`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/key.vrmxi` | CC0-1.0 | "Key" (VRMXI `pickup`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/mug.vrmxi` | CC0-1.0 | "Mug" (VRMXI `pickup`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |
| `items/sword.vrmxi` | CC0-1.0 | "Sword" (VRMXI `pickup`): Kay Lousberg (www.kaylousberg.com), KayKit: Fantasy Weapons Bits 1.0 (`Assets/sword_A.glb (876 indices)`), CC0 1.0, as mesh2motion's prop `sword_A` (`static/assets/props/sword_A.glb`, SHA-256 ffe9ce1812ee…, with its texture); made into an item (collider, reach, verb) by `tools/make-items.mjs` |
| `items/axe.vrmxi` | CC0-1.0 | "Axe" (VRMXI `pickup`): Kay Lousberg (www.kaylousberg.com), KayKit: Fantasy Weapons Bits 1.0 (`Assets/axe_A.glb (3618 indices)`), CC0 1.0, as mesh2motion's prop `axe_A` (`static/assets/props/axe_A.glb`, SHA-256 13b89844f462…, with its texture); made into an item (collider, reach, verb) by `tools/make-items.mjs` |
| `items/hammer.vrmxi` | CC0-1.0 | "Hammer" (VRMXI `pickup`): Kay Lousberg (www.kaylousberg.com), KayKit: Fantasy Weapons Bits 1.0 (`Assets/hammer_A.glb (1572 indices)`), CC0 1.0, as mesh2motion's prop `hammer_A` (`static/assets/props/hammer_A.glb`, SHA-256 87ec8602dfdf…, with its texture); made into an item (collider, reach, verb) by `tools/make-items.mjs` |
| `items/spawn.vrmxi` | CC0-1.0 | "Player start" (VRMXI `spawnPoint`): generated from boxes and cylinders by `tools/make-items.mjs`; Xocialize LLC dedicates it to the public domain (CC0 1.0) |

## Tools and tests (not content)

| File | Licence | Source |
|---|---|---|
| `tools/make-animations.mjs` | Xocialize original (code) | Retargets mesh2motion's clips and writes the set |
| `tools/starter-clips.mjs` | Xocialize original (code) | Which clips, and the slots and sets they fill |
| `tools/make-items.mjs` | Xocialize original (code) | Writes the items and checks them with the VRMXI checker |
| `tools/starter-items.mjs` | Xocialize original (code) | The items: models, states, verbs, seats, and what doing each verb shows |
| `tools/glb.mjs` | Xocialize original (code) | The items' GLB writer (boxes, cylinders, brought-in meshes, KHR physics, animations) |
| `tools/upstream.mjs` | Xocialize original (code) | What mesh2motion's records say about each source: the pinned commit, authors, history |
| `tools/make-stills.mjs` | Xocialize original (code) | Draws the contact sheets of the set and the pack (acceptance/results/m6-starter-*.png) |
| `tools/make-licences.mjs` | Xocialize original (code) | Writes this table |
| `tools/check-licences.mjs` | Xocialize original (code) | Checks this table |
| `test/*.test.mjs` | Xocialize original (code) | The starter's tests: licences, the set cast and played, every item used, the tools remake the same bytes |
