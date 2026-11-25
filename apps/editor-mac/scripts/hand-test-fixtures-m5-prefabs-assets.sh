#!/bin/sh
# HAND-TEST-M5-PREFABS-ASSETS's own folders in the editor's container (M5 W6): a fresh copy of the sample project,
# project-w6-prefabs, with w6-doors.vrmxs beside cafe.vrmxs: three instances of prefabs/door.vrmxs (door-a, door-b,
# door-c, never overridden) and a bench Model, for the override, Apply and asset slot rows. The scenario's own settings
# file (panel sizes) and thumbnail cache are reset too (w6-settings.json, w6-cache: the scenario points the shell at them,
# so the operator's editor settings are never touched). Only these are touched: other scenarios' folders belong to runs
# beside this one.
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project-w6-prefabs" "$tmp/w6-cache" "$tmp/w6-cache-webgl" "$tmp/w6-settings.json"
cp -R "$here/../../../content/sample" "$tmp/project-w6-prefabs"
# written in the scene format's canonical form (@vrmxg/scene's serialize), so the editor opens it as saved
(cd "$here/../../.." && node --input-type=module -e '
import fs from "node:fs";
import { serialize } from "@vrmxg/scene";
const [to] = process.argv.slice(1);
const doc = {
  format: "vrmxs", version: 1, id: "w6-doors",
  assets: [{ id: "door", type: "vrmxs", ref: "prefabs/door.vrmxs" }, { id: "bench", type: "glb", ref: "props/bench.glb" }],
  nodes: [
    { id: "root", type: "Node3D", name: "Doors" },
    { id: "env", type: "Environment", parent: "root", props: { ground: true } },
    { id: "sun", type: "DirectionalLight", parent: "root", transform: { q: [-0.3535534, 0.3535534, 0.1464466, 0.8535534] } },
    { id: "door-a", type: "Instance", parent: "root", asset: "door", transform: { p: [-2, 0, 0] } },
    { id: "door-b", type: "Instance", parent: "root", asset: "door" },
    { id: "door-c", type: "Instance", parent: "root", asset: "door", transform: { p: [2, 0, 0] } },
    { id: "bench", type: "Model", parent: "root", asset: "bench", transform: { p: [0, 0, 2.5] } },
  ],
  connections: [],
};
fs.writeFileSync(to, serialize(doc));
' "$tmp/project-w6-prefabs/w6-doors.vrmxs")
grep -q '"id":"door-c"' "$tmp/project-w6-prefabs/w6-doors.vrmxs"
echo "project in $tmp/project-w6-prefabs"
