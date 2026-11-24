---
title: "The .vrmxs scene file"
description: "Every field of a .vrmxs scene document, with the JSON Schema it is checked against."
order: 50
---

# The .vrmxs scene file

> Generated from `@vrmxg/scene` (`documentSchema`) over the registry by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

A `.vrmxs` file is a scene: a saved node tree, as JSON. A set, a prefab and a sequence are all `.vrmxs` files.
This page lists what the document schema checks. For the ideas behind the format, see [The scene format](../guide/scene-format).

The whole schema, as JSON Schema 2020-12: [`vrmxs-1.schema.json`](/schemas/vrmxs-1.schema.json). It is generated from the node registry, so it
checks every [node type](./nodes) and [behaviour](./behaviours) listed in this reference. Unknown node types, props and
behaviours pass the schema and are kept when a scene is read and written back; lint reports them as warnings.

## The document

| Field | Required | Type | What |
|---|---|---|---|
| `format` | yes | always `"vrmxs"` |  |
| `version` | yes | always `1` |  |
| `id` | yes | string | The scene's id. |
| `assets` |  | array | The files the scene uses: see below. |
| `nodes` | yes | array | The nodes, as a flat list: see below. Order in the list is sibling order. |
| `connections` |  | array | Signals wired to actions: see below. |
| `settings` |  | object | Scene settings (physics, personas and others), an open object. |

Other top-level keys are allowed and kept. A sequence adds `set` (the set scene it films) and a `sequence` block;
those are checked by `@vrmxg/sequence`'s `checkSequence`, not by this schema.

## An asset

One entry of `assets`. Nodes name an asset by its `id`.

| Field | Required | Type | What |
|---|---|---|---|
| `id` | yes | string | The id nodes name it by. |
| `type` | yes | `vrmxa`, `vrmxw`, `vrmxi`, `vrmxs`, `glb`, `vrma`, `audio`, `texture` | What kind of file it is. |
| `ref` | yes | string | Path relative to the project root. |
| `sha256` |  | string | The file's SHA-256, as 64 hex digits. |

## A node

One entry of `nodes`. Every node has these fields; its type adds the props listed under [Node types](./nodes).

| Field | Required | Type | What |
|---|---|---|---|
| `id` | yes | string | Stable node id; "/" separates instance levels. |
| `type` | yes | string | A node type from the registry. |
| `parent` |  | string | The parent node's id; none for a root. |
| `name` |  | string | A display name. |
| `transform` |  | object | Local transform: metres, Y up, right-handed, +Z forward (VRM 1.0 frame). |
| `tags` |  | array | Free-form tags, each once. |
| `props` |  | object | The type's props. |
| `behaviours` |  | array | A list of `{ "use": "<behaviour>", …params }`. |

- A node id matches `^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$`.
- A node whose type takes an asset also has `asset`: the id of an entry in `assets`.

**`transform`**

Local transform: metres, Y up, right-handed, +Z forward (VRM 1.0 frame).

| Field | Type | What |
|---|---|---|
| `p` | 3 numbers | Position (m). |
| `q` | 4 numbers | Rotation quaternion x, y, z, w. |
| `s` | 3 numbers | Scale. |

**`overrides`** (an `Instance` node only)

Partial nodes keyed by inner node id ("hinge", or "frame/hinge" for nested prefabs), deep-merged over the prefab.

An override may set `name`, `transform`, `props`, `behaviours`, `tags`, and nothing else.

## A connection

One entry of `connections`: when `from` emits `signal`, `call` runs on `to`.

| Field | Required | Type | What |
|---|---|---|---|
| `from` | yes | string | Stable node id; "/" separates instance levels. |
| `signal` | yes | string | A signal the `from` node has (its type's, or a behaviour's). |
| `to` | yes | string | Stable node id; "/" separates instance levels. |
| `call` | yes | string | An action the `to` node has. |
| `args` |  | object | Arguments for the action. |

## An example

The sample project's door prefab (`content/sample/prefabs/door.vrmxs`), in the canonical form `@vrmxg/scene` writes:
one asset, node and connection per line, keys in a fixed order, so one edit is a one-line diff.

```json
{
  "format": "vrmxs",
  "version": 1,
  "id": "prefab-door",
  "assets": [
    {"id":"frame-glb","type":"glb","ref":"props/door-frame.glb"},
    {"id":"panel-glb","type":"glb","ref":"props/door-panel.glb"}
  ],
  "nodes": [
    {"id":"door","type":"Node3D","name":"Door"},
    {"id":"frame","type":"Model","parent":"door","asset":"frame-glb"},
    {"id":"hinge","type":"RigidBody","parent":"door","transform":{"p":[-0.45,0,0]},"props":{"bodyType":"dynamic","mass":12},"behaviours":[{"locked":false,"openAngle":100,"use":"hinge"}]},
    {"id":"panel","type":"Collider","parent":"hinge","transform":{"p":[0.45,1,0]},"props":{"shape":"box","size":[0.88,2,0.04]}},
    {"id":"panel-model","type":"Model","parent":"hinge","asset":"panel-glb","transform":{"p":[0.45,1,0]},"props":{"castShadow":true,"colliders":"none"}},
    {"id":"trigger","type":"Area","parent":"door","transform":{"p":[0,1,0.8]},"props":{"shape":"box","size":[1.2,2,1]}}
  ],
  "connections": [
    {"from":"trigger","signal":"bodyEntered","to":"hinge","call":"open"},
    {"from":"trigger","signal":"bodyExited","to":"hinge","call":"close"}
  ]
}
```
