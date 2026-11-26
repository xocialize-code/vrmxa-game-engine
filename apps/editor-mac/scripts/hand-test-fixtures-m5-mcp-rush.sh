#!/bin/sh
# HAND-TEST-M5-MCP-RUSH's own folders in the editor's container (M5 W11, AB-T-0621): project-w11-rush, a copy of the
# sample project whose game.json is the sample game's (game/game.json, "The Morning Rush": as vrmxg-export --game and
# projectWithGame read it), and an empty builds-w11/ for the agent's export. Only these two are touched.
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project-w11-rush" "$tmp/builds-w11"
cp -R "$here/../../../content/sample" "$tmp/project-w11-rush"
cp "$tmp/project-w11-rush/game/game.json" "$tmp/project-w11-rush/game.json"
grep -q '"id": "morning-rush"' "$tmp/project-w11-rush/game.json"
mkdir -p "$tmp/builds-w11"
echo "project in $tmp/project-w11-rush, builds in $tmp/builds-w11"
