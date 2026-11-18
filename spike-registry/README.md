# VRMXG node-registry spike

*2026-11-17. Tests the PRD's claim (§4.1, §5.21) that one node registry can generate the `.vrmxs` JSON Schema,
validation, the inspector's data and the MCP tool schemas, now that `.vrmxs` is decided (AB-D-0246) and behaviours
are scripts on nodes (AB-D-0247). Node 26, ajv 8.20.0, `@modelcontextprotocol/sdk` 1.32.2. Machine: M5 Max, macOS 27.3.*

## Verdict

> **2026-11-17:** lifted into `engine/packages/registry` and `engine/packages/scene` (M0 W0, AB-T-0501). This folder stays as the spike's record; the MCP server moved to `engine/packages/mcp` in W7 (AB-T-0508).

**It works, and it is the right shape for M0.** One file of definitions ([src/nodes.js](src/nodes.js): 11 node types,
3 behaviours) drives everything below; adding a type touches nothing else.

- **Schema and validation.** The registry generates a JSON Schema 2020-12 for the whole document (node items dispatch
  on `type` with `if`/`then`) and one per node type and behaviour. Typed errors come back as one-line messages an agent
  can act on (`cam-2/props/focalLength must be >= 4`, `preset must be equal to one of the allowed values (free, orbit,
  …)`). A lint pass covers what a schema can't: missing parents, parent cycles, asset types, node references, signals
  and actions on connections, override targets.
- **Round-trip keeps what it doesn't understand.** Unknown node types, props and behaviours validate, survive
  save/load byte for byte, and are reported as warnings. A scene from a newer engine opens in an older one without
  losing data.
- **Prefabs.** Instances flatten with path ids (`entrance/left/hinge`), overrides by inner id at any depth, and
  connections inside each copy. 10,000 nodes flatten to 20,000 in 2.1 ms.
- **Edits.** add, remove (with subtree and connections), set at a dotted path, reparent, connect: each is checked
  against the registry before it applies and returns its inverse. Undoing everything restores the original bytes.
- **Diffs stay small.** The canonical form has one asset, node and connection per line with a fixed key order. One
  property edit is one line out and one in; adding a node mid-list is one added line. (Appending at the end of a list
  also rewrites the previous line, for its comma.)
- **MCP.** 12 generic tools (describe, tree, get_node, add_node, set, remove_node, reparent, connect, validate, undo,
  redo, save) with schemas built from the registry cost **≈ 900 tokens** of tool list. Calls take 0.1–4 ms.
  Driven through the official MCP client, a scripted agent session made three typical mistakes, read each error and
  recovered.
- **Per-type tools are a dead end.** One `add_<Type>` tool per type with its full schema costs ≈ 8,800 tokens for 12
  types, about 660 per type: 40–55k tokens for the 60–80 types a full engine will have. Keep the tools generic and let
  `describe` return a type's schema on demand.

## What the spike changed in the format (PRD §4.1)

1. **Overrides are partial nodes**, deep-merged over the prefab's node: `{"hinge": {"props": {"mass": 20}}}`. The PRD
   sketch's `{"hinge": {"locked": true}}` was ambiguous about where `locked` lives.
2. **Behaviours merge by `use`, never by position.** Overriding `{"use": "hinge", "locked": true}` changes only
   `locked` and keeps the prefab's other params; an unknown `use` appends; `"remove": true` drops one. The first
   version replaced the whole list, which quietly lost `openAngle`. Other arrays (vectors, tags) replace whole.
3. **Connections can address nodes inside instances by path** (`door-1/hinge`), like Godot's paths into instanced
   scenes. Without it a scene can't wire anything to a prefab's inner signals or actions: the door's `open` action
   lives on its inner hinge, not on the Instance.
4. **Canonical serialization is part of the spec**: one asset, node and connection per line, fixed key order, unknown
   keys sorted after known ones, nested objects with sorted keys.

## Results

**Scale** (`results/bench.json`; Node, generated scenes of mixed types with prefab instances and connections):

| Nodes (flattened) | File | Validate + lint | Serialize | Parse | Flatten | One checked edit |
|---|---|---|---|---|---|---|
| 1,008 (2,026) | 140 KB, 1,231 lines | 1.0 ms | 1.1 ms | 0.4 ms | 0.3 ms | 0.02 ms |
| 10,008 (20,026) | 1.4 MB, 12,031 lines | 6.8 ms | 9.5 ms | 4.0 ms | 2.1 ms | 0.14 ms |

Compiling the validator from the registry: 40 ms, once.

**MCP session** (`results/mcp-session.json`): describe, describe Camera (6 KB: schema, units, signals, actions,
behaviours), tree, add a camera with `focalLength: 2` (rejected: `must be >= 4`), add it correctly, add a light,
get_node, connect to the Instance's `open` (rejected: `Instance "door-1" has no action "open" (has: show, hide)`),
flattened tree, connect to `door-1/hinge.open` (accepted), override the hinge, set `fStop: "wide"` (rejected: `must be
number`), set it right, undo, validate, save: +6 −3 lines.

**Tests** (`npm test`): 8 tests: examples valid and canonical; typed errors; lint references; unknown data round-trip;
flatten with nested overrides and behaviour merge; edits, undo/redo to the exact bytes and diff sizes; connections into
instances; describe.

## What M0 should take from it

- `engine/packages/registry` (the define API and prop types), `engine/packages/scene` (schema, canonical I/O, lint,
  flatten, edits with undo) and `engine/packages/mcp` (the generic tools) are this spike's three files, hardened.
- **The same edit ops serve the editor UI, MCP and undo.** One command log, no separate paths.
- **The runtime node classes register themselves** with the same `define` call, so the schema can't drift from the code.
- **Still to design:** connections that pass signal args into action args (mapping), per-instance behaviour removal in
  the inspector, `vrmxg.json` (project file: behaviour registry, autoloads, asset roots), packed `.vrmxs` (ZIP with
  assets), sha256 verification against real files, and the inspect / drive tools that need a running engine
  (screenshot, step, input).

## Run it

```bash
npm install
npm test                    # 8 tests
node scripts/mcp-client.mjs # the scripted MCP session against a temp copy of examples/
node scripts/bench.mjs      # scale
node src/mcp-server.js examples cafe.vrmxs   # the server itself, for an MCP client (writes the file on save)
```

## Caveats

- The scenes are synthetic and the assets don't exist (sha256 values are placeholders), so asset verification wasn't
  tested.
- The "agent" is a scripted client, not a model. It shows the errors are specific enough to act on, not that a model
  always acts on them.
- Token counts are bytes / 4 of the tool list JSON, an approximation.
