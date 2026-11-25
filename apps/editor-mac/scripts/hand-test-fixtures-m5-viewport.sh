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
node -e '
const fs = require("fs"), [from, to] = process.argv.slice(1);
const doc = JSON.parse(fs.readFileSync(from, "utf8"));
const env = doc.nodes.find((n) => n.type === "Environment");
env.props = { ...(env.props ?? {}), post: "anime" };
doc.id = "sample-cafe-post";
fs.writeFileSync(to, JSON.stringify(doc, null, 2) + "\n");
' "$tmp/project-w5-viewport/cafe.vrmxs" "$tmp/project-w5-viewport/cafe-post.vrmxs"
grep -q '"post": "anime"' "$tmp/project-w5-viewport/cafe-post.vrmxs"
echo "project in $tmp/project-w5-viewport"
