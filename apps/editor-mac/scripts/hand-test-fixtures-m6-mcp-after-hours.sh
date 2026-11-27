#!/bin/sh
# HAND-TEST-M6-MCP-AFTER-HOURS's own folders in the editor's container (M6 W8, AB-T-0649): project-w8-after-hours, a copy
# of the sample project whose game.json is After Hours' (after-hours/game.json, as vrmxg-export --game reads it), and an
# empty builds-w8/ for the agent's export. Only these two are touched; content/sample itself never is.
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project-w8-after-hours" "$tmp/builds-w8"
cp -R "$here/../../../content/sample" "$tmp/project-w8-after-hours"
cp "$tmp/project-w8-after-hours/after-hours/game.json" "$tmp/project-w8-after-hours/game.json"
grep -q '"id": "after-hours"' "$tmp/project-w8-after-hours/game.json"
mkdir -p "$tmp/builds-w8"
echo "project in $tmp/project-w8-after-hours, builds in $tmp/builds-w8"
