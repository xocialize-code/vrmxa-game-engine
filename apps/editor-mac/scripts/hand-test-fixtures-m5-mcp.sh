#!/bin/sh
# HAND-TEST-M5-MCP's own folders in the editor's container (M5 W9, AB-T-0619): a fresh copy of the sample project,
# project-w9-mcp, and an empty builds-w9/ for the agent's export. Only these two are touched: other scenarios'
# folders (project, project-game, builds/) belong to runs that may be going on beside this one.
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project-w9-mcp" "$tmp/builds-w9"
cp -R "$here/../../../content/sample" "$tmp/project-w9-mcp"
mkdir -p "$tmp/builds-w9"
echo "project in $tmp/project-w9-mcp, builds in $tmp/builds-w9"
