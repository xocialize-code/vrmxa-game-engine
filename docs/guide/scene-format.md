---
title: "The scene format"
description: "How a .vrmxs scene is put together: a flat list of typed nodes, assets by path, prefabs with overrides, connections, and sequences."
order: 4
---

# The scene format

A scene is a JSON document with the extension `.vrmxs`. It is the source of truth: the editor, the creator, the MCP
tools and a text editor all read and write the same file. This page explains the ideas. The field-by-field list is in
the reference: [The .vrmxs scene file](../reference/vrmxs).

## A small scene

```json
{
  "format": "vrmxs",
  "version": 1,
  "id": "corner-cafe",
  "assets": [
    {"id":"cafe","type":"glb","ref":"sets/cafe.glb"},
    {"id":"hana","type":"vrmxa","ref":"characters/hana.vrmxa"},
    {"id":"door","type":"vrmxs","ref":"prefabs/door.vrmxs"}
  ],
  "nodes": [
    {"id":"root","type":"Node3D","name":"Cafe"},
    {"id":"set","type":"Model","parent":"root","asset":"cafe"},
    {"id":"door-1","type":"Instance","parent":"root","asset":"door","transform":{"p":[2,0,-3]},"overrides":{"hinge":{"behaviours":[{"locked":true,"use":"hinge"}]}}},
    {"id":"hana-1","type":"Character","parent":"root","asset":"hana","behaviours":[{"radius":4,"use":"wander"}]},
    {"id":"cam","type":"Camera","parent":"root","transform":{"p":[0,1.6,4]},"props":{"focalLength":35}}
  ],
  "connections": [
    {"from":"door-1/hinge","signal":"opened","to":"hana-1","call":"lookAt","args":{"target":"door-1"}}
  ]
}
```

This is the form the engine writes (see [below](#written-the-same-way-every-time)), and it passes the engine's own
validator against the sample project's door prefab.

## The ideas

**A flat list of nodes.** Each node has an `id`, a `type` and, unless it is a root, a `parent`. The order of the list
is the order of siblings. Because nodes are addressed by id, never by position, an edit is a small diff, and undo, MCP
and snapshots can all name a node the same way.

**Types come from the registry.** A node's `type` decides which `props` it takes, which signals it emits and which
actions it accepts. The registry is the one declaration; the schema that checks a scene, the editor's inspector and the
MCP tools are generated from it. See [Node types](../reference/nodes).

**Assets are files, named once.** `assets` lists the files a scene uses, each with an id, a type and a path relative to
the project folder. Nodes name an asset by its id. Geometry stays in glTF (`.glb`); characters are `.vrmxa`; items are
`.vrmxi`; another scene is `.vrmxs`.

**A prefab is a scene placed in a scene.** An `Instance` node places another `.vrmxs`. Its `overrides` change the
prefab's inner nodes by their ids, as partial nodes merged over the originals. Behaviours merge by their `use` name
(`"remove": true` drops one); other lists replace whole. Inside a running scene, an inner node's id is
`<instance>/<inner>`: `door-1/hinge`.

**Connections wire signals to actions.** When `from` emits `signal`, `call` runs on `to`. A connection can reach inside
an instance by path.

**Behaviours are named, not embedded.** A node's `behaviours` list says which scripts run on it and with what params:
`{ "use": "wander", "radius": 4 }`. The scene holds the name; the project maps the name to code. A scene from someone
else is data only: nothing in it runs. See [Behaviours](../reference/behaviours).

**Unknown data survives.** A node type, prop or behaviour the engine doesn't know is kept when the scene is read and
written back, and reported as a warning, not dropped.

**One frame of reference.** Metres, Y up, right-handed, +Z forward: the same as VRM 1.0. A transform is a position
`p`, a rotation quaternion `q` (x, y, z, w) and a scale `s`.

## Written the same way every time

`@vrmxg/scene` writes a scene in one canonical form: a fixed key order, one asset, node and connection per line, and
unknown keys kept, sorted after the known ones. Changing one prop of one node changes one line. The same scene always
gives the same bytes, which is what lets tests and the acceptance compare scenes by hash.

## Checked, and undoable

- **Validate** checks a scene against the schema and checks its references (a parent that doesn't exist, an asset id
  that isn't in `assets`, a connection to a signal the node doesn't have). Unknown data comes back as warnings.
- **Every edit is checked first.** The editing layer checks an edit against the node type's schema before applying it,
  and keeps its inverse. Edits by a person in the editor and by an agent over MCP go on the same undo stack.
- **Save refuses a scene with errors.**

## Why not glTF for scenes

glTF stays the format for geometry. A scene is our own JSON because a scene has to point at things glTF can't
(character bundles, items, other scenes, with overrides), because most of a scene isn't geometry (behaviours,
connections, cameras, shots), and because glTF refers to things by index, which changes when a tool rewrites the file.
A scene needs ids that stay put.

## Sequences

A sequence is a `.vrmxs` that films a set. It names the set scene with `set`, adds its own nodes (cameras, mostly),
and carries a `sequence` block:

| Part | What |
|---|---|
| `fps`, `duration` | The film's frame rate and its length in frames |
| `shots` | `{ id, name, start, end, camera, overrides }`. A shot's overrides apply while it is live and are put back when it ends |
| `markers` | Named frames |
| `tracks` | Keyed values and clips over frames: `property`, `transform`, `expression`, `event`, `audio`, `animation`, and for film `camera`, `lookAt`, `dialogue`, `post` and `simulation` |
| `cast` | Changes to the set's own nodes for this film (who stands where, with which behaviours), without touching the set's file |

One set can have many sequences, and editing shots never changes the set.

A sequence plays inside the simulation step, so a shot replays and exports bit for bit, and scrubbing to a frame gives
exactly the world a straight play reaches ([Determinism](./determinism)). The creator builds a sequence from a script;
the build and its vocabulary are in [The Fountain subset](../reference/fountain).

The `sequence` block is checked by code (`@vrmxg/sequence`'s `checkSequence`), not yet by a schema, so it has no
generated reference page. `engine/packages/sequence/README.md` and `engine/packages/tracks/README.md` describe it in full.

## Not built yet

- A packed form: one file holding a scene and its assets, for sharing.
- A specification of the project file (the input map, services that start with the project, physics layers).
