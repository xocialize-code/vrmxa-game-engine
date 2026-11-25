#!/bin/sh
# HAND-TEST-M5-VIEWPORT's own folder in the editor's container (M5 W5): a fresh copy of the sample project,
# project-w5-viewport, with cafe-post.vrmxs beside cafe.vrmxs: the same scene with the anime post stack on its
# Environment, so the edit view is drawn through the post stack (on WebGPU, the case where the aids and the frame are
# drawn to the canvas together). Only this folder is touched: other scenarios' folders belong to runs beside this one.
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project-w5-viewport"
cp -R "$here/../../../content/sample" "$tmp/project-w5-viewport"
# written in the scene format's canonical form (@vrmxg/scene's serialize), so the editor opens it as saved
(cd "$here/../../.." && node --input-type=module -e '
import fs from "node:fs";
import { parse, serialize } from "@vrmxg/scene";
const [from, to] = process.argv.slice(1);
const doc = parse(fs.readFileSync(from, "utf8"));
const env = doc.nodes.find((n) => n.type === "Environment");
env.props = { ...(env.props ?? {}), post: "anime" };
doc.id = "sample-cafe-post";
fs.writeFileSync(to, serialize(doc));
' "$tmp/project-w5-viewport/cafe.vrmxs" "$tmp/project-w5-viewport/cafe-post.vrmxs")
grep -q '"post":"anime"' "$tmp/project-w5-viewport/cafe-post.vrmxs"
echo "project in $tmp/project-w5-viewport"
