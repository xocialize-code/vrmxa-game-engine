#!/bin/sh
# HAND-TEST-M6-GUIDE-SHOTS (M6 W9, AB-T-0650): the editor guide's pictures of what the tutorial doesn't reach (a prefab
# override, the viewport's aids, the assets panel), taken at this commit. A fresh copy of the sample project,
# w9-guide-project, with w9-tour.vrmxs beside cafe.vrmxs: three instances of prefabs/door.vrmxs, a bench, an Area and a
# Camera looking at the doors. Its own settings file and thumbnail cache, so no other run's are touched.
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/w9-guide-project" "$tmp/w9-guide-cache" "$tmp/w9-guide-settings.json"
cp -R "$here/../../../content/sample" "$tmp/w9-guide-project"
# written in the scene format's canonical form (@vrmxg/scene's serialize), so the editor opens it as saved
(cd "$here/../../.." && node --input-type=module -e '
import fs from "node:fs";
import { serialize } from "@vrmxg/scene";
const [to] = process.argv.slice(1);
const doc = {
  format: "vrmxs", version: 1, id: "w9-tour",
  assets: [{ id: "door", type: "vrmxs", ref: "prefabs/door.vrmxs" }, { id: "bench", type: "glb", ref: "props/bench.glb" }],
  nodes: [
    { id: "root", type: "Node3D", name: "Tour" },
    { id: "env", type: "Environment", parent: "root", props: { ground: true } },
    { id: "sun", type: "DirectionalLight", parent: "root", transform: { q: [-0.3535534, 0.3535534, 0.1464466, 0.8535534] } },
    { id: "door-a", type: "Instance", parent: "root", asset: "door", transform: { p: [-2, 0, 0] } },
    { id: "door-b", type: "Instance", parent: "root", asset: "door" },
    { id: "door-c", type: "Instance", parent: "root", asset: "door", transform: { p: [2, 0, 0] } },
    { id: "bench", type: "Model", parent: "root", asset: "bench", transform: { p: [0, 0, 2.5] } },
    { id: "zone", type: "Area", parent: "root", name: "Trigger", transform: { p: [0, 1, 2.5] }, props: { shape: "box", size: [2, 2, 1.2] } },
    { id: "look", type: "Marker", parent: "root", transform: { p: [0, 1, 0] } },
    { id: "cam", type: "Camera", parent: "root", name: "Camera", transform: { p: [3, 2.2, 6] }, props: { preset: "fixed", target: "look", focalLength: 28 } },
  ],
  connections: [],
};
fs.writeFileSync(to, serialize(doc));
' "$tmp/w9-guide-project/w9-tour.vrmxs")
grep -q '"id":"cam"' "$tmp/w9-guide-project/w9-tour.vrmxs"
echo "project in $tmp/w9-guide-project"
