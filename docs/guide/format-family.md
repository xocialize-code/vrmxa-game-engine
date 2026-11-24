---
title: "The format family"
description: "The VRMX formats and what each one holds: characters, wearables, game items and scenes, and the project files around them."
order: 5
---

# The format family

VRMXG is built around a family of formats. Two of them, for characters and wearables, exist outside the engine and are
specified in the VRMXA specification. Two are the engine's own.

| Format | Letter | What it holds | Specified in |
|---|---|---|---|
| `.vrmxa` | A, avatar | A character: appearance, a closet of things to wear, animation sets, voice, persona | The VRMXA specification (a separate project) |
| `.vrmxw` | W, wearable | Something a character wears or holds, fitted to the base model. It may carry states and animations | The VRMXA specification |
| `.vrmxi` | I, item | A game item that isn't worn: a door, a container, a switch, a seat, a vehicle, a pickup. A model with colliders, joints, sensors, states and the verbs a character can do to it | A draft in the VRMXA specification, under review |
| `.vrmxs` | S, scene | A scene: a saved tree of nodes. Sets, prefabs and sequences are all scenes | This engine: [The scene format](./scene-format) |

Geometry that is none of these (a set, a prop) is plain glTF, a `.glb` file.

## Worn or not

The split between a wearable and an item is whether a character puts it on.

- A **VRMXW** is worn or held, and is fitted to the character's body.
- A **VRMXI** is everything else in the world that has behaviour.

One case crosses over: something lying in the world that a character can pick up and then wear, like a sword on a
table. That is a VRMXI *pickup* that carries its VRMXW. The item gives the world behaviour (a collider, a prompt, the
`take` verb). Taking it puts the wearable into the character's closet, and from then on it is the character's.

## How a scene uses them

A scene lists the files it uses under `assets`, each with a type, and nodes refer to them:

| Asset type | Used by the node type |
|---|---|
| `vrmxa` | [Character](../reference/nodes#character) |
| `vrmxi` | [Item](../reference/nodes#item) |
| `vrmxs` | [Instance](../reference/nodes#instance), a prefab |
| `glb` | [Model](../reference/nodes#model) |
| `audio` | [AudioPlayer](../reference/nodes#audioplayer), [AudioPlayer3D](../reference/nodes#audioplayer3d) |

The scene schema also accepts the asset types `vrmxw`, `vrma` (a VRM animation clip) and `texture`.

A character's wearables don't appear in the scene: they are in the character's own closet, inside its `.vrmxa`.

## glTF's part

- **Geometry** for sets and props is `.glb`.
- **Colliders inside an asset** are read from the glTF physics extensions, so a set's colliders can be authored in a
  modelling tool and come through with the model.
- **Scenes are not glTF.** [The scene format](./scene-format#why-not-gltf-for-scenes) says why.

## A project

A project is a folder. Asset paths in its scenes are relative to it. Besides scenes and assets, a project can hold:

| File | What |
|---|---|
| `shorts.json` | The creator's list of shorts: [reference](../reference/shorts-json) |
| `scripts/*.fountain` | Scripts, in [the Fountain subset](../reference/fountain) |
| `scripts/*-marks.json` | Marks: named places where a script's cast stands |
| `sequences/*.vrmxs` | Sequences: scenes that film a set |
| `deliveries/<name>/` | Rendered deliveries, each with a [delivery.json](../reference/delivery-json) |
| `animations.json` | Fallback animation sets for characters |
| `personas.json` | Who each character is, for NPC behaviour and conversation |
| `brains/`, `effects/`, `takes/`, `input/` | NPC behaviour trees, particle effects, recorded performances, recorded input |
| `behaviours.js` | The project's own behaviours, by the names its scenes use |

Only the first, the Fountain subset and `delivery.json` have reference pages so far. The sample project
(`content/sample/`) has a working example of each: see [Running the apps and the sample](./running#the-sample-project).
