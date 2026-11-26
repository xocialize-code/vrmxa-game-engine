#!/bin/sh
# HAND-TEST-M6-NEW-PROJECT (M6 W3, AB-T-0646): empty folders in the sandboxed editor's container where the scenario
# makes its projects (VRMXG_SHELL_NEW_PROJECT=m6-projects/) and exports their builds (VRMXG_SHELL_BUILD=m6-builds/).
# Relative paths resolve against the container's temporary folder. Run before the scenario.
set -e
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/m6-projects" "$tmp/m6-builds"
mkdir -p "$tmp/m6-projects" "$tmp/m6-builds"
echo "projects in $tmp/m6-projects, builds in $tmp/m6-builds"
