---
title: "Node types"
description: "The 27 node types of a VRMXG scene, with each one's props, signals and actions."
order: 10
---

# Node types

> Generated from `@vrmxg/registry` (`m0Registry`) by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

Every node in a `.vrmxs` scene has a type from the node registry (`@vrmxg/registry`). The registry is the one place
a type's props, signals and actions are declared: the scene's JSON Schema, the editor's inspector and the MCP
tools are all generated from it, and so is this page.

- A **prop** is saved in the scene under the node's `props`. *Simulated* props are inside the determinism boundary:
  they are part of what replays bit for bit. The others are presentation.
- A **signal** is something a node emits. A scene's `connections` wire a signal to another node's action.
- An **action** is something a node can be told to do: by a connection, a behaviour, or `call_action` over MCP.
- A type that **extends** another has everything its parent has.

27 types:

| Type | Extends | Asset | What |
|---|---|---|---|
| [Node3D](#node3d) |  |  | A transform in the tree. Every other node type derives from it. |
| [AudioPlayer](#audioplayer) | Node3D | `audio` (required) | Plays a sound clip (.wav) everywhere at once: music, ambience, interface sounds. |
| [AudioPlayer3D](#audioplayer3d) | AudioPlayer | `audio` (required) | Plays a sound clip from where it is: doors, switches, machines. |
| [AnimationPlayer](#animationplayer) | Node3D |  | Plays keyed tracks on the simulation clock: properties, transforms, expressions, character animation, events and sounds. For doors, items, lights and small cutscenes. |
| [Marker](#marker) | Node3D |  | A named point: spawn points, look targets, waypoints. |
| [Model](#model) | Node3D | `glb` (required) | Static or animated glTF geometry from a .glb asset (sets, props). |
| [Instance](#instance) | Node3D | `vrmxs` (required) | Another .vrmxs scene placed here (a prefab), with overrides by inner node id. |
| [Character](#character) | Node3D | `vrmxa` (required) | A VRMXA character: VRM body, closet, animation sets, voice. |
| [Camera](#camera) | Node3D |  | A physical camera: lens, sensor and focus, as the cinematics research specifies. |
| [VirtualCamera](#virtualcamera) | Node3D |  | A candidate shot: a body (where the camera is), an aim (where it looks), a lens, seeded noise and impulses. A CameraBrain picks one and renders through its Camera. |
| [CameraBrain](#camerabrain) | Node3D |  | Picks the live VirtualCamera on its channel and blends between them onto a Camera node: one per output (main view, picture in picture, split screen, a render job). |
| [ParticleEmitter](#particleemitter) | Node3D |  | Shows a particle effect where it stands: steam, dust, sparks, or an effect document from the project. In the simulation by default (seeded, in the snapshot, scrubs exactly); presentation for visual-only dressing. |
| [Path3D](#path3d) | Node3D |  | A smooth path through points (Catmull-Rom, by arc length) for dollies, rails and cranes. |
| [DirectionalLight](#directionallight) | Node3D |  | Sun-like light along the node's -Z. The shadow box is centred on the node. |
| [PointLight](#pointlight) | Node3D |  | Omni light with range. |
| [SpotLight](#spotlight) | Node3D |  | Cone light along the node's -Z. |
| [Environment](#environment) | Node3D |  | How the world looks around everything: background, environment lighting, ambient, fog, tone mapping, exposure, an optional ground plane. One per scene (the first wins). |
| [Item](#item) | Node3D | `vrmxi` (required) | A VRMXI game item: a door, container, pickup, switch, seat or spawn point, with its states and verbs. |
| [RigidBody](#rigidbody) | Node3D |  | A Rapier rigid body; its Collider children give it shape. |
| [Collider](#collider) | Node3D |  | A collision shape. Under a RigidBody it moves with it; otherwise it is fixed. |
| [Area](#area) | Collider |  | A sensor volume: reports bodies entering and leaving (door triggers, pickups). |
| [BoneAttachment](#boneattachment) | Node3D |  | Rides on a humanoid bone of the Character it is inside (held and stowed items). |
| [GameRules](#gamerules) | Node3D |  | A scene's rules: when the game is won and lost, and the flags it starts with. One per scene. Its actions change the game state and move the game to another scene. |
| [GameCounter](#gamecounter) | Node3D |  | A number the game counts: the score (the counter named "score"), orders taken, coins. |
| [GameTimer](#gametimer) | Node3D |  | A clock counted in simulation steps: a countdown that times out, or a stopwatch (no length). It follows its node's pause and time scale, and stops when the game is won or lost. |
| [GameGoal](#gamegoal) | Node3D |  | Something to get done: the HUD shows the first one that isn't. Done when its condition first holds, or by its action. |
| [Checkpoint](#checkpoint) | Node3D |  | A point where the game saves by itself (into a slot of the save store): when its condition first holds, or by its action (a trigger's connection). |

## Node3D

A transform in the tree. Every other node type derives from it.

- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

None.

**Signals**

| Signal | What |
|---|---|
| `ready` | The node entered the running tree. |

**Actions**

| Action |
|---|
| `show` |
| `hide` |

## AudioPlayer

Plays a sound clip (.wav) everywhere at once: music, ambience, interface sounds.

- **Extends:** [Node3D](#node3d)
- **Asset:** required, of type `audio` (the node's `asset` names an entry in the scene's `assets`)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `bus` | `music`, `sfx`, `voice`, `ambience` | `"sfx"` |  |  | The mixer bus it plays on. |
| `volume` | number | `1` | 0 to 4 |  | Linear gain. |
| `loop` | boolean | `false` |  | yes |  |
| `autoplay` | boolean | `false` |  | yes | Start when the scene starts. |

**Signals**

| Signal | Arguments |
|---|---|
| `started` |  |
| `finished` | `stopped` (boolean) |

Also, from Node3D: `ready`.

**Actions**

| Action | What |
|---|---|
| `play` | Play from the start. |
| `stop` |  |

Also, from Node3D: `show`, `hide`.

## AudioPlayer3D

Plays a sound clip from where it is: doors, switches, machines.

- **Extends:** [AudioPlayer](#audioplayer) → [Node3D](#node3d)
- **Asset:** required, of type `audio` (the node's `asset` names an entry in the scene's `assets`)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `refDistance` | number | `1` | ≥ 0.01 m | Full volume up to this distance. |
| `maxDistance` | number | `30` | ≥ 0.1 m |  |
| `rolloff` | number | `1` | ≥ 0 | How fast it fades past refDistance (inverse distance). |

Also, from AudioPlayer: `bus`, `volume`, `loop`, `autoplay`.

**Signals**

None of its own.

Also, from AudioPlayer: `ready`, `started`, `finished`.

**Actions**

None of its own.

Also, from AudioPlayer: `show`, `hide`, `play`, `stop`.

## AnimationPlayer

Plays keyed tracks on the simulation clock: properties, transforms, expressions, character animation, events and sounds. For doors, items, lights and small cutscenes.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `tracks` | list of object |  |  | yes | The tracks it plays. |
| `length` | number |  | ≥ 0 frames | yes | Where it ends (default: its last key or clip). |
| `fps` | number | `30` | 1 to 240 | yes | Frames per second the keys are counted in. |
| `speed` | number | `1` | 0 to 16 | yes |  |
| `loop` | boolean | `false` |  | yes |  |
| `autoplay` | boolean | `false` |  | yes | Start when the scene starts. |

**Signals**

| Signal | Arguments | What |
|---|---|---|
| `started` | `from` (number) |  |
| `finished` | `stopped` (boolean) |  |
| `event` | `name` (string) | An event key with emit. |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `play` | `from` (number): Frame to start from (0) | Play from a frame. |
| `stop` |  |  |
| `seek` | `frame` (number): Frame to show | Jump to a frame (no events fire). |

Also, from Node3D: `show`, `hide`.

## Marker

A named point: spawn points, look targets, waypoints.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default |
|---|---|---|
| `purpose` | `spawn`, `look`, `waypoint`, `other` | `"other"` |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## Model

Static or animated glTF geometry from a .glb asset (sets, props).

- **Extends:** [Node3D](#node3d)
- **Asset:** required, of type `glb` (the node's `asset` names an entry in the scene's `assets`)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby), [`pickup`](./behaviours#pickup)

**Props**

| Prop | Type | Default | Simulated | What |
|---|---|---|---|---|
| `castShadow` | boolean | `true` |  |  |
| `receiveShadow` | boolean | `true` |  |  |
| `colliders` | `none`, `fromAsset`, `trimesh`, `convex` | `"fromAsset"` | yes | Where physics colliders come from: KHR_physics in the asset, or generated. |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## Instance

Another .vrmxs scene placed here (a prefab), with overrides by inner node id.

- **Extends:** [Node3D](#node3d)
- **Asset:** required, of type `vrmxs` (the node's `asset` names an entry in the scene's `assets`)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby), [`pickup`](./behaviours#pickup)

**Props**

None.

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## Character

A VRMXA character: VRM body, closet, animation sets, voice.

- **Extends:** [Node3D](#node3d)
- **Asset:** required, of type `vrmxa` (the node's `asset` names an entry in the scene's `assets`)
- **Behaviours it accepts:** [`wander`](./behaviours#wander), [`greet`](./behaviours#greet), [`switchedBy`](./behaviours#switchedby), [`noticeViewer`](./behaviours#noticeviewer), [`brain`](./behaviours#brain), [`player`](./behaviours#player)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `outfit` | string |  |  |  | Outfit id from the character's closet. |
| `controller` | `none`, `player`, `npc` | `"none"` |  | yes |  |
| `animationSet` | string |  |  |  | Animation set id; defaults to the one equipped items imply (VRMXA §8.3). |
| `capsuleHeight` | number |  | 0.3 to 3 m | yes |  |
| `walkSpeed` | number | `1.4` | ≥ 0 m/s | yes |  |
| `jumpSpeed` | number | `4.5` | ≥ 0 m/s | yes |  |
| `layer` | string |  |  |  | Collision layer of the capsule. |
| `mass` | number |  | ≥ 1 kg | yes | Shared among the ragdoll's parts when knocked down (60). |
| `getUpSeconds` | number |  | 0.1 to 10 s | yes | How long getting up from a ragdoll blends back into animation (1.2). |
| `head` | vec3 `[x, y, z]` |  | rad | yes | Turn the head over the animation: [yaw to her left, pitch up, roll to her left shoulder]. Keyed by a face take or by hand. |
| `gaze` | list of number |  |  | yes | Where the eyes look, from her facing: [yaw to her left, pitch up] in radians. It comes before a look-at target; a puppet take keys it. |

**Signals**

| Signal | Arguments |
|---|---|
| `arrived` | `target` (node id) |
| `spoke` | `text` (string) |
| `lineEnded` | `text` (string) |
| `dressed` | `worn` (list of string) |
| `knockedDown` |  |
| `gettingUp` |  |
| `gotUp` |  |
| `faced` |  |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `say` | `text` (string): What to say (the caption; lip-synced from estimated timings without a clip); `clip` (string): A voice line in the project (.wav), with its word timings beside it (\<clip>.timings.json) | Speak a line: the clip plays from the head, the mouth follows its word timings, a caption shows. |
| `reach` | `hand` (`left`, `right`): Which hand (right); `point` (vec3 `[x, y, z]`, m): A point; `target` (node id): Or a node; `part` (string): An item's part (a knob); `seconds` (number, s): How long (1) | Reach a hand to a point, a node or an item's part: two-bone IK on the arm, fading in and out. |
| `goTo` | `target` (node id): Node to walk to; `point` (vec3 `[x, y, z]`, m): Or a point to walk to | Walk to a node or a point, along the navmesh when the scene has one (around tables and through doorways), else straight. |
| `emote` | `name` (string): Expression or emote clip name |  |
| `lookAt` | `target` (node id): Node to look at; omit to stop |  |
| `knockDown` | `impulse` (vec3 `[x, y, z]`, N·s): A shove in world space, on the torso (or `part`); `part` (string): The humanoid bone whose part takes the shove (spine); `getUp` (boolean): Get up once settled (true); false stays down until getUp | Fall as a ragdoll (capsules and joints from the humanoid), then get up, blending back into animation. |
| `getUp` |  | Get up from a ragdoll lying still. |
| `face` | `target` (node id): Turn to face this node; `point` (vec3 `[x, y, z]`, m): Or this point; `rate` (number, rad/s): How fast (4) | Turn the body to face a node or a point, in place; look-at alone stops about 100° from the facing. |

Also, from Node3D: `show`, `hide`.

## Camera

A physical camera: lens, sensor and focus, as the cinematics research specifies.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `focalLength` | number | `50` | 4 to 1200 mm |  |  |
| `sensor` | `super35`, `fullframe`, `mft`, `anime`, `custom` | `"super35"` |  |  |  |
| `sensorMm` | vec3 `[x, y, z]` |  |  |  | A custom sensor: [width, height, 0] in mm (sensor custom). |
| `gateFit` | `fill`, `overscan` | `"fill"` |  |  | Fill the frame with the sensor (crop) or show all of it. |
| `fStop` | number | `2.8` | 0.7 to 64 |  |  |
| `coc` | number |  | 0.001 to 0.2 mm |  | Circle of confusion (default: the sensor diagonal / 1500). |
| `dutch` | number | `0` | -90 to 90 ° |  | Dutch angle: roll about the view axis. |
| `focusDistance` | number | `3` | ≥ 0.05 m |  |  |
| `near` | number | `0.1` | ≥ 0.001 m |  |  |
| `far` | number | `500` | ≥ 0.1 m |  |  |
| `preset` | `free`, `fixed`, `orbit`, `follow`, `overShoulder`, `firstPerson` | `"free"` |  | yes | Rig preset; switchable at run time (setPreset, nextPreset). |
| `player` | number |  | 1 to 4 | yes | Split screen: this camera is that player's, takes that player's look input and draws in their viewport. |
| `rig` | object |  |  | yes | Rig overrides: distance, height, side (m); yaw, pitch (degrees): the starting view, yaw 0 looking along +Z. |
| `target` | node id |  |  |  | Follow / orbit target. |

**Signals**

| Signal |
|---|
| `madeCurrent` |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `makeCurrent` |  | Render through this camera. |
| `setPreset` | `preset` (`free`, `fixed`, `orbit`, `follow`, `overShoulder`, `firstPerson`): Rig preset |  |
| `nextPreset` |  |  |

Also, from Node3D: `show`, `hide`.

## VirtualCamera

A candidate shot: a body (where the camera is), an aim (where it looks), a lens, seeded noise and impulses. A CameraBrain picks one and renders through its Camera.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `rig` | `fixed`, `security`, `follow`, `thirdPerson`, `overShoulder`, `firstPerson`, `topDown`, `orbit`, `turntable`, `dolly`, `crane`, `closeUp`, `twoShot`, `handheld`, `shotReverse` | `"fixed"` |  | yes | Preset body / aim / lens / noise; the props below override any part. |
| `priority` | number | `10` |  | yes | Higher wins on its channel; the most recently activated wins a tie. |
| `channel` | string | `"main"` |  | yes | Which brain (output) it competes for. |
| `enabled` | boolean | `true` |  | yes |  |
| `body` | object |  |  | yes | type: fixed \| follow \| orbit \| thirdPerson \| firstPerson \| dolly \| hardLock; target; follow: offset [x, y, z] (target space), space, damping (s); orbit: radius, yaw, pitch (°), yawSpeed (°/s); thirdPerson: shoulder, arm, collide; dolly: path (a Path3D), u (0–1, else closest to the target), lead, pathDamping. |
| `aim` | object |  |  | yes | type: none \| lookAt \| composer \| groupFraming \| panTilt; target ("id" or "id#head"); offset; composer: screen [x, y] (−1…1), deadZone [w, h], softZone [w, h], damping (s); groupFraming: targets [...], size (frame-height fraction); panTilt: yaw, pitch (°). |
| `lens` | object |  |  | yes | focalLength (mm), fStop, focusDistance (m) or focusTarget, dutch (°), sensor. |
| `noise` | object |  |  | yes | profile: handheldLight \| handheldHeavy \| vehicle; amplitude, frequency multipliers. |
| `impulseDecay` | number | `0.6` | ≥ 0.05 s | yes |  |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `activate` |  | Make it the most recently activated (wins ties). |
| `impulse` | `strength` (number): Trauma added (shake ∝ trauma²); `zoom` (number): Zoom punch: a focal-length kick that eases back | Shake the shot. |

Also, from Node3D: `show`, `hide`.

## CameraBrain

Picks the live VirtualCamera on its channel and blends between them onto a Camera node: one per output (main view, picture in picture, split screen, a render job).

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Simulated | What |
|---|---|---|---|---|
| `camera` | node id |  | yes | The Camera node it drives. |
| `channel` | string | `"main"` | yes |  |
| `defaultBlend` | object |  | yes | { style: cut \| linear \| easeInOut \| easeIn \| easeOut, seconds } (or frames + fps). |
| `blends` | list of object |  | yes | Per-pair blends: [{ from, to, style, seconds }] ("*" matches any). |
| `makeCurrent` | boolean | `true` | yes | Make its Camera the one the view renders through. |

**Signals**

| Signal | Arguments |
|---|---|
| `cameraChanged` | `from` (node id); `to` (node id) |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `override` | `camera` (node id): The VirtualCamera to make live; `blend` (object): Blend to it: { style, seconds } | Force a shot (a sequence's camera track). |
| `clearOverride` |  |  |

Also, from Node3D: `show`, `hide`.

## ParticleEmitter

Shows a particle effect where it stands: steam, dust, sparks, or an effect document from the project. In the simulation by default (seeded, in the snapshot, scrubs exactly); presentation for visual-only dressing.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `effect` | string | `"steam"` |  | yes | A built-in effect (steam, dust, sparks) or a project effect document (.json). |
| `mode` | `simulation`, `presentation` | `"simulation"` |  | yes | simulation: stepped at 60 Hz, in the snapshot and the hash; presentation: stepped with the frame, visual only. |
| `autoplay` | boolean | `true` |  | yes | Start when the scene starts. |
| `speed` | number | `1` | 0 to 16 | yes | Time scale of the effect. |

**Signals**

| Signal | What |
|---|---|
| `finished` | A non-looping effect ended and its last particle died. |

Also, from Node3D: `ready`.

**Actions**

| Action | What |
|---|---|
| `play` | Start emitting from the effect's start. |
| `stop` | Stop emitting; live particles finish their lives. |
| `restart` | Clear the particles and start over. |

Also, from Node3D: `show`, `hide`.

## Path3D

A smooth path through points (Catmull-Rom, by arc length) for dollies, rails and cranes.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `points` | list of array |  |  | yes | Points in the node's space. |
| `closed` | boolean | `false` |  | yes |  |
| `tension` | number | `0.5` | 0 to 1 | yes |  |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## DirectionalLight

Sun-like light along the node's -Z. The shadow box is centred on the node.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `color` | colour `#rrggbb` | `"#ffffff"` |  |  |
| `intensity` | number | `2` | ≥ 0 |  |
| `castShadow` | boolean | `true` |  |  |
| `shadowPreset` | `low`, `medium`, `high`, `ultra` | `"medium"` |  | Map size 512 / 1024 / 2048 / 4096, with matching bias. |
| `shadowUpdate` | `always`, `once` | `"always"` |  | "once" renders the map once and keeps it (static sets). |
| `shadowExtent` | number | `8` | ≥ 0.5 m | Half the width of the shadow box. |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## PointLight

Omni light with range.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `color` | colour `#rrggbb` | `"#ffffff"` |  |  |
| `intensity` | number | `1` | ≥ 0 cd |  |
| `range` | number | `10` | ≥ 0 m |  |
| `castShadow` | boolean | `false` |  |  |
| `shadowPreset` | `low`, `medium`, `high`, `ultra` | `"medium"` |  | Map size 512 / 1024 / 2048 / 4096, with matching bias. |
| `shadowUpdate` | `always`, `once` | `"always"` |  | "once" renders the map once and keeps it (static sets). |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## SpotLight

Cone light along the node's -Z.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `color` | colour `#rrggbb` | `"#ffffff"` |  |  |
| `intensity` | number | `10` | ≥ 0 cd |  |
| `range` | number | `10` | ≥ 0 m |  |
| `angle` | number | `30` | 1 to 89 deg | Half-angle of the cone. |
| `penumbra` | number | `0.2` | 0 to 1 |  |
| `castShadow` | boolean | `false` |  |  |
| `shadowPreset` | `low`, `medium`, `high`, `ultra` | `"medium"` |  | Map size 512 / 1024 / 2048 / 4096, with matching bias. |
| `shadowUpdate` | `always`, `once` | `"always"` |  | "once" renders the map once and keeps it (static sets). |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## Environment

How the world looks around everything: background, environment lighting, ambient, fog, tone mapping, exposure, an optional ground plane. One per scene (the first wins).

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `background` | `color`, `gradient`, `environment`, `transparent` | `"color"` |  |  |
| `backgroundColor` | colour `#rrggbb` | `"#c9d3df"` |  |  |
| `skyTopColor` | colour `#rrggbb` | `"#6f9bd1"` |  |  |
| `skyHorizonColor` | colour `#rrggbb` | `"#dfe7ef"` |  |  |
| `environment` | `none`, `room` | `"room"` |  | Image-based lighting: none, or a neutral studio room. |
| `environmentIntensity` | number | `0.4` | ≥ 0 |  |
| `ambientColor` | colour `#rrggbb` | `"#ffffff"` |  |  |
| `ambientIntensity` | number | `0.6` | ≥ 0 |  |
| `fog` | `none`, `linear`, `exponential` | `"none"` |  |  |
| `fogColor` | colour `#rrggbb` | `"#c9d3df"` |  |  |
| `fogNear` | number | `10` | ≥ 0 m |  |
| `fogFar` | number | `60` | ≥ 0 m |  |
| `fogDensity` | number | `0.02` | ≥ 0 |  |
| `toneMapping` | `neutral`, `agx`, `aces`, `none` | `"neutral"` |  | Neutral keeps MToon's authored colours. |
| `exposure` | number | `1` | ≥ 0 |  |
| `post` | any |  |  | The post stack: a preset ("anime", "clean") or a list of effects [{ effect: edges \| dof \| bloom \| grade \| lut \| toneMapping \| vignette \| grain \| anime \| chromaticAberration \| smaa, …params }]. Lengths in px at 1080p. |
| `ground` | boolean | `false` |  | A shadow-receiving ground plane at y = 0. |
| `groundColor` | colour `#rrggbb` | `"#9aa3ad"` |  |  |
| `groundSize` | number | `40` | ≥ 1 m |  |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## Item

A VRMXI game item: a door, container, pickup, switch, seat or spawn point, with its states and verbs.

- **Extends:** [Node3D](#node3d)
- **Asset:** required, of type `vrmxi` (the node's `asset` names an entry in the scene's `assets`)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Simulated | What |
|---|---|---|---|
| `state` | string | yes | The state the item starts in; absent: its default (the first). |

**Signals**

| Signal | Arguments |
|---|---|
| `stateChanged` | `from` (string); `to` (string) |
| `verb` | `verb` (string); `by` (node id) |
| `entered` | `sensor` (string); `body` (node id) |
| `exited` | `sensor` (string); `body` (node id) |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `enterState` | `state` (string): One of the item's states | Move the item to a state (joints, shown meshes, morphs, animations, sensors). |
| `perform` | `verb` (string): A verb the item offers in its current state; `by` (node id): The character doing it | Do one of the item's verbs. |
| `drive` | `throttle` (number): Forward (1) to reverse (−1); `steer` (number): Right (1) to left (−1) | A vehicle's driving while a non-player sits in its driver's seat: a script or a brain. |

Also, from Node3D: `show`, `hide`.

## RigidBody

A Rapier rigid body; its Collider children give it shape.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby), [`hinge`](./behaviours#hinge), [`pickup`](./behaviours#pickup)

**Props**

| Prop | Type | Default | Range, unit | Simulated |
|---|---|---|---|---|
| `bodyType` | `dynamic`, `kinematic`, `fixed` | `"dynamic"` |  | yes |
| `mass` | number |  | ≥ 0 kg | yes |
| `linearDamping` | number | `0` | ≥ 0 | yes |

**Signals**

| Signal | Arguments |
|---|---|
| `contact` | `other` (node id) |
| `sleep` |  |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments |
|---|---|
| `applyImpulse` | `impulse` (vec3 `[x, y, z]`, N·s): Impulse in world space |

Also, from Node3D: `show`, `hide`.

## Collider

A collision shape. Under a RigidBody it moves with it; otherwise it is fixed.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `shape` | `box`, `sphere`, `capsule`, `cylinder`, `convex`, `trimesh` | `"box"` |  | yes |  |
| `size` | vec3 `[x, y, z]` |  | m | yes | Box extents. |
| `radius` | number |  | ≥ 0 m | yes |  |
| `height` | number |  | ≥ 0 m | yes |  |
| `friction` | number | `0.5` | ≥ 0 | yes |  |
| `restitution` | number | `0` | 0 to 1 | yes |  |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## Area

A sensor volume: reports bodies entering and leaving (door triggers, pickups).

- **Extends:** [Collider](#collider) → [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

None of its own.

Also, from Collider: `shape`, `size`, `radius`, `height`, `friction`, `restitution`.

**Signals**

| Signal | Arguments |
|---|---|
| `bodyEntered` | `body` (node id) |
| `bodyExited` | `body` (node id) |

Also, from Collider: `ready`.

**Actions**

None of its own.

Also, from Collider: `show`, `hide`.

## BoneAttachment

Rides on a humanoid bone of the Character it is inside (held and stowed items).

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | What |
|---|---|---|---|
| `bone` | string | `"rightHand"` | VRM humanoid bone name. |

**Signals**

None of its own.

Also, from Node3D: `ready`.

**Actions**

None of its own.

Also, from Node3D: `show`, `hide`.

## GameRules

A scene's rules: when the game is won and lost, and the flags it starts with. One per scene. Its actions change the game state and move the game to another scene.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Simulated | What |
|---|---|---|---|---|
| `win` | object |  | yes | The game is won when this holds. Absent: when every GameGoal that isn't optional is done. |
| `lose` | object |  | yes | The game is lost when this holds (a win on the same step beats it). |
| `flags` | object |  | yes | Flags and the values they start a game with. A condition may read a flag started here, set by a connection in this scene, or listed in reads. |
| `reads` | object |  | yes | What this scene's conditions read that another scene owns, by name: carried counters, flags, timers and goals, and other scenes' checkpoint slots. Reading a goal doesn't make it one of this scene's objectives. Checked against what arrives when the game changes to this scene. |
| `keepOutcome` | boolean | `false` | yes | Arriving here keeps the last win or loss (an ending screen shows it). Otherwise the scene starts undecided. |

**Signals**

| Signal | Arguments | What |
|---|---|---|
| `won` |  | The game was won. |
| `lost` |  | The game was lost. |
| `ended` | `result` (`won`, `lost`) | Won or lost. |
| `flagChanged` | `flag` (string); `value` (any) |  |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `win` |  | Ask for a win: the game is decided once, at the end of the step's rules. |
| `lose` |  | Ask for a loss (a win asked for on the same step beats it). |
| `setFlag` | `flag` (string): The flag's name; `value` (boolean,number,string): Its value (true) | Set a flag. |
| `clearFlag` | `flag` (string): The flag's name | Remove a flag. |
| `changeScene` | `to` (string): The scene to go to: its path in the project ("level.vrmxs"); `after` (number, s): Play on here this long first (0: the change is the next step); `reset` (boolean): Start a new game there: nothing is carried over | Move the game to another scene. The game state goes with it. |
| `restart` | `after` (number, s): Play on this long first | Start this scene again as a new game. |

Also, from Node3D: `show`, `hide`.

## GameCounter

A number the game counts: the score (the counter named "score"), orders taken, coins.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Simulated | What |
|---|---|---|---|---|
| `key` | string |  | yes | The counter's name in the game state (default: the node's id). |
| `start` | number | `0` | yes | What it starts at. |
| `min` | number |  | yes |  |
| `max` | number |  | yes |  |
| `label` | string |  |  | What the HUD calls it. |
| `scope` | `game`, `scene` | `"game"` | yes | game: kept across scene changes. scene: starts again each time this scene is entered. |

**Signals**

| Signal | Arguments |
|---|---|
| `changed` | `value` (number); `by` (number) |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `add` | `by` (number): How much (1) | Add to it. |
| `set` | `value` (number): The new value |  |
| `reset` |  | Back to its start. |

Also, from Node3D: `show`, `hide`.

## GameTimer

A clock counted in simulation steps: a countdown that times out, or a stopwatch (no length). It follows its node's pause and time scale, and stops when the game is won or lost.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Range, unit | Simulated | What |
|---|---|---|---|---|---|
| `key` | string |  |  | yes | The timer's name in the game state (default: the node's id). |
| `seconds` | number |  | s | yes | How long the countdown is: above zero. Absent: a stopwatch, with no limit, that never times out. |
| `autostart` | boolean | `true` |  | yes | Running from the scene's start. |
| `label` | string |  |  |  | What the HUD calls it. |
| `scope` | `game`, `scene` | `"scene"` |  | yes | game: kept across scene changes. scene: starts again each time this scene is entered. |

**Signals**

| Signal | What |
|---|---|
| `started` |  |
| `stopped` |  |
| `timeout` | The countdown reached zero. |

Also, from Node3D: `ready`.

**Actions**

| Action | Arguments | What |
|---|---|---|
| `start` |  | Run (on from where it stopped). |
| `stop` |  |  |
| `reset` |  | Back to its full length. |
| `addTime` | `seconds` (number, s): Time to add to the countdown (negative: take away; with none left it times out) | Lengthen or shorten a countdown (not a stopwatch). |

Also, from Node3D: `show`, `hide`.

## GameGoal

Something to get done: the HUD shows the first one that isn't. Done when its condition first holds, or by its action.

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Simulated | What |
|---|---|---|---|---|
| `key` | string |  | yes | The goal's name in the game state (default: the node's id). |
| `text` | string |  |  | What the HUD shows. |
| `when` | object |  | yes | The goal is done when this first holds. |
| `optional` | boolean | `false` | yes | Not needed to win. |
| `scope` | `game`, `scene` | `"scene"` | yes | game: kept across scene changes. scene: starts again each time this scene is entered. |

**Signals**

| Signal |
|---|
| `completed` |

Also, from Node3D: `ready`.

**Actions**

| Action | What |
|---|---|
| `complete` | Done, now. |

Also, from Node3D: `show`, `hide`.

## Checkpoint

A point where the game saves by itself (into a slot of the save store): when its condition first holds, or by its action (a trigger's connection).

- **Extends:** [Node3D](#node3d)
- **Behaviours it accepts:** [`switchedBy`](./behaviours#switchedby)

**Props**

| Prop | Type | Default | Simulated | What |
|---|---|---|---|---|
| `slot` | string | `"checkpoint"` | yes | The checkpoint slot it writes (in the save store: "auto-" and this name). |
| `when` | object |  | yes | Written when this becomes true. |
| `once` | boolean | `true` | yes | Only the first time. |
| `label` | string |  |  | The save's name in a slot list. |

**Signals**

| Signal | Arguments | What |
|---|---|---|
| `written` | `slot` (string) | The checkpoint was taken (the file is written after the step). Not on a step that decides the game. |

Also, from Node3D: `ready`.

**Actions**

| Action | What |
|---|---|
| `write` | Save now. |

Also, from Node3D: `show`, `hide`.
