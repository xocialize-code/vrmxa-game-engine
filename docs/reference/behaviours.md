---
title: "Behaviours"
description: "The 8 behaviours the registry declares, with their params and the signals and actions they add, and how a project declares its own."
order: 20
---

# Behaviours

> Generated from `@vrmxg/registry` (`m0Registry`) by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

A behaviour is a named script attached to a node: an entry in the node's `behaviours` list, `{ "use": "<name>", …params }`.
The scene holds the name and the params; the project maps the name to code. A scene never carries code, and an
unknown name keeps its data and runs nothing.

A behaviour can add signals and actions to the node it is on. These are the behaviours the registry declares; a
project can add its own, and [declare them](#project-behaviours) so the editor, validation and MCP know them.

| Behaviour | Attaches to | What |
|---|---|---|
| [`wander`](#wander) | [Character](./nodes#character) | Walk to random reachable points within a radius. |
| [`greet`](#greet) | [Character](./nodes#character) | Says a line to someone who comes close (looking at them), then waits a while before greeting again. |
| [`switchedBy`](#switchedby) | [Node3D](./nodes#node3d) | Shown while an item is in a state (a lamp lit while its switch is on), hidden otherwise. |
| [`hinge`](#hinge) | [RigidBody](./nodes#rigidbody) | A door hinge: a revolute joint with limits and a motor. |
| [`noticeViewer`](#noticeviewer) | [Character](./nodes#character) | Sees the person at the camera (@vrmxg/sense): looks at them when they appear and away when they leave, answers a wave and a nod with animation slots, and can say lines. Needs the sense service and the scene's viewer node. |
| [`brain`](#brain) | [Character](./nodes#character) | An NPC brain: perception, memory, a behaviour tree with utility choices, and the action vocabulary. A role preset (server, customer, wanderer; host, conversationPartner, follower, which a director can talk with; actor, who does only what she is directed to), a brain document in the project (brains/hana.json) or a preset object; vars override its blackboard plan. |
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

An NPC brain: perception, memory, a behaviour tree with utility choices, and the action vocabulary. A role preset (server, customer, wanderer; host, conversationPartner, follower, which a director can talk with; actor, who does only what she is directed to), a brain document in the project (brains/hana.json) or a preset object; vars override its blackboard plan.

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

## Project behaviours

A project's behaviours module (`behaviours` in [game.json](./game-json)) exports behaviour classes under the names its
scenes use. A class declares itself with a static `describe`: the same definition the registry's own behaviours
have, `{ description, on, params, signals, actions, state }`. Params and arguments are JSON Schema; beside a
schema's own keywords a param may say `unit`, `widget`, `step`, `precision`, `visibleIf`, `enabledIf`, and
`nodeRef: true` (a node id) or `assetTypes` (an asset reference). `state` is the JSON Schema of what the behaviour's
`getState` returns: a behaviour without it hasn't declared its state, and `{ "type": "null" }` declares that it keeps
none. Saves are checked against it: what they compare is its shape, the schema with its annotations (`description`,
`title`, `examples`, `$comment`) taken out and its keys sorted, so rewording a description or reordering keys
changes nothing (`stateShape` in `@vrmxg/registry`).

When a project loads (the editor, the game runtime, the MCP server), its declarations sit in the registry beside
the engine's: their params are checked against their schemas, a scene may connect their signals and call their
actions, and MCP's `describe` lists them (marked `project`). A declaration with the name of one of the engine's
behaviours is an error, and so is a schema that isn't JSON Schema or a key a definition doesn't have. A class with
no `describe` of its own is code only (a subclass doesn't inherit its parent's): a scene that uses it validates with
a warning.

A build takes only the module `game.json` names, so name it (the editor's Project Settings › Behaviours writes it).
The editor's Play in place also runs a `behaviours.js` at the project's root that `game.json` doesn't name, and its
Export Game refuses such a project rather than build it without its behaviours. The editor reads the module when the
project opens and again before a Play when it has changed; while it plays, saving the module reloads it in place,
a behaviour keeping its state when its declared state has the same shape and starting again on its node when it
hasn't. The [tutorial](../guide/tutorial) writes one, attaches it and wires its signal.

```js
import { Behaviour } from '@vrmxg/core';
export class tableZone extends Behaviour {
  static describe = {
    on: ['Area'],
    params: { customer: { type: 'string', nodeRef: true }, points: { type: 'integer', minimum: 0, default: 10 } },
    signals: { served: { args: { right: { type: 'boolean' } } } },
    state: { type: 'object', properties: { done: { type: 'boolean' } } },
  };
  // ready(), physicsProcess(), getState(), setState() …
}
```

The sample game, "The Morning Rush", declares 2 (`content/sample/game/behaviours.js`):

### pressToStart

On a title screen: the step one of its input actions goes down, asks the game to change to a scene.

- **Attaches to:** any node (and types that extend them)

**Params**

| Param | Type | Default | What |
|---|---|---|---|
| `actions` | list of string | `["interact"]` | The input actions that start (the game's action map names them). |
| `to` | string |  | The scene the game changes to, as game.json names it. |

**State it keeps**

`null`: Nothing: it reads the input of the step it runs on.

### tableZone

Beside a regular's table (an Area): starts her order's conversation while the player stands there, and takes her tray from the player when it is hers, scoring it.

- **Attaches to:** [Area](./nodes#area) (and types that extend them)

**Params**

| Param | Type | Default | Range, unit | What |
|---|---|---|---|---|
| `customer` | node id |  |  | The regular at this table (a Character with a brain). |
| `dialogue` | node id |  |  | Her order's Dialogue node. |
| `item` | string |  |  | The VRMXI id of her tray. |
| `ordered` | string |  |  | The game flag her order sets once it is taken. |
| `right` | string |  |  | The game flag her choice sets when the order was taken right. |
| `player` | node id | `"mira"` |  | Who serves (the player's Character). |
| `points` | integer | `10` | ≥ 0 | Added to the score counter for a right order. |
| `served` | string | `"served"` |  | The counter a delivery adds 1 to. |
| `score` | string | `"score"` |  | The counter a right order adds its points to. |
| `mistakes` | string | `"mistakes"` |  | The counter a wrong order adds 1 to. |

**Signals it adds**

| Signal | Arguments | What |
|---|---|---|
| `served` | `customer` (node id): The regular served; `right` (boolean): Whether her order was taken right | The tray was handed over (once): the regular has it and the counters are added to. |

**State it keeps**

| Field | Type | What |
|---|---|---|
| `inside` | boolean | The player stands in the area. |
| `next` | integer | The step it may next try to start the order's conversation on. |
| `done` | boolean | The tray was handed over. |
