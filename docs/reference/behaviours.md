---
title: "Behaviours"
description: "The 8 behaviours the registry declares, with their params and the signals and actions they add."
order: 20
---

# Behaviours

> Generated from `@vrmxg/registry` (`m0Registry`) by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

A behaviour is a named script attached to a node: an entry in the node's `behaviours` list, `{ "use": "<name>", …params }`.
The scene holds the name and the params; the project maps the name to code. A scene never carries code, and an
unknown name keeps its data and runs nothing.

A behaviour can add signals and actions to the node it is on. These are the behaviours the registry declares; a
project can add its own (the sample project's `behaviours.js`).

| Behaviour | Attaches to | What |
|---|---|---|
| [`wander`](#wander) | [Character](./nodes#character) | Walk to random reachable points within a radius. |
| [`greet`](#greet) | [Character](./nodes#character) | Says a line to someone who comes close (looking at them), then waits a while before greeting again. |
| [`switchedBy`](#switchedby) | [Node3D](./nodes#node3d) | Shown while an item is in a state (a lamp lit while its switch is on), hidden otherwise. |
| [`hinge`](#hinge) | [RigidBody](./nodes#rigidbody) | A door hinge: a revolute joint with limits and a motor. |
| [`noticeViewer`](#noticeviewer) | [Character](./nodes#character) | Sees the person at the camera (@vrmxg/sense): looks at them when they appear and away when they leave, answers a wave and a nod with animation slots, and can say lines. Needs the sense service and the scene's viewer node. |
| [`brain`](#brain) | [Character](./nodes#character) | An NPC brain: perception, memory, a behaviour tree with utility choices, and the action vocabulary. A role preset (server, customer, wanderer; host, conversationPartner, follower, which a director can talk with), a brain document in the project (brains/hana.json) or a preset object; vars override its blackboard plan. |
| [`player`](#player) | [Character](./nodes#character) | Drives a Character from the move / jump / run actions, relative to the current camera (split screen: its player's actions and camera). |
| [`pickup`](#pickup) | [Instance](./nodes#instance), [Model](./nodes#model), [RigidBody](./nodes#rigidbody) | Can be picked up; equips a VRMXW if the item names one. |

## wander

Walk to random reachable points within a radius.

- **Attaches to:** [Character](./nodes#character) (and types that extend them)

**Params**

| Param | Type | Default | Range, unit |
|---|---|---|---|
| `radius` | number | `4` | ≥ 0 m |
| `pause` | number | `2` | ≥ 0 s |

## greet

Says a line to someone who comes close (looking at them), then waits a while before greeting again.

- **Attaches to:** [Character](./nodes#character) (and types that extend them)

**Params**

| Param | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `target` | node id |  |  | Who to greet (the player). |
| `radius` | number | `2` | ≥ 0 m |  |
| `clip` | string |  |  | A voice line (.wav) with its timings beside it. |
| `text` | string |  |  | The caption (or the line, without a clip). |
| `cooldown` | number | `20` | ≥ 0 s |  |

## switchedBy

Shown while an item is in a state (a lamp lit while its switch is on), hidden otherwise.

- **Attaches to:** [Node3D](./nodes#node3d) (and types that extend them)

**Params**

| Param | Type | Default | What |
|---|---|---|---|
| `item` | node id |  | The item (a switch). |
| `state` | string | `"on"` |  |

## hinge

A door hinge: a revolute joint with limits and a motor.

- **Attaches to:** [RigidBody](./nodes#rigidbody) (and types that extend them)

**Params**

| Param | Type | Default | Range, unit |
|---|---|---|---|
| `axis` | vec3 `[x, y, z]` | `[0,1,0]` |  |
| `openAngle` | number | `100` | -180 to 180 ° |
| `locked` | boolean | `false` |  |

**Signals it adds**

| Signal |
|---|
| `opened` |
| `closed` |

**Actions it adds**

| Action |
|---|
| `open` |
| `close` |
| `toggle` |

## noticeViewer

Sees the person at the camera (@vrmxg/sense): looks at them when they appear and away when they leave, answers a wave and a nod with animation slots, and can say lines. Needs the sense service and the scene's viewer node.

- **Attaches to:** [Character](./nodes#character) (and types that extend them)

**Params**

| Param | Type | Default | What |
|---|---|---|---|
| `answers` | object | `{"wave":"greet","nod":"nod"}` | Camera event (wave, nod, shake, point) → the animation slot that answers it. |
| `say` | object |  | Camera event (appeared, wave, nod, shake, point) → a line to say. |
| `smile` | string | `"happy"` | The expression shown when someone appears. |

## brain

An NPC brain: perception, memory, a behaviour tree with utility choices, and the action vocabulary. A role preset (server, customer, wanderer; host, conversationPartner, follower, which a director can talk with), a brain document in the project (brains/hana.json) or a preset object; vars override its blackboard plan.

- **Attaches to:** [Character](./nodes#character) (and types that extend them)

**Params**

| Param | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `preset` | any | `"wanderer"` |  | A role preset, a brain document's path, or a preset object ({ plan, senses, tree }). |
| `vars` | object |  |  | Blackboard values over the preset's plan. |
| `tickEvery` | number | `1` | ≥ 1 | Think every n steps (four times slower far from the player). |
| `lodDistance` | number | `25` | ≥ 0 m |  |
| `senses` | object |  |  | Perception settings over the preset's: sight { range, fov, every }, hearing { sensitivity }, proximity { radius }, maxAge, decay. |

## player

Drives a Character from the move / jump / run actions, relative to the current camera (split screen: its player's actions and camera).

- **Attaches to:** [Character](./nodes#character) (and types that extend them)

**Params**

| Param | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `walkSpeed` | number | `1.4` | ≥ 0 m/s |  |
| `runSpeed` | number | `4` | ≥ 0 m/s |  |
| `player` | number | `1` | 1 to 4 | Which player: 2 reads the p2.* actions and player 2's camera. |

## pickup

Can be picked up; equips a VRMXW if the item names one.

- **Attaches to:** [Instance](./nodes#instance), [Model](./nodes#model), [RigidBody](./nodes#rigidbody) (and types that extend them)

**Params**

| Param | Type |
|---|---|
| `item` | string |

**Signals it adds**

| Signal | Arguments |
|---|---|
| `pickedUp` | `by` (node id) |
