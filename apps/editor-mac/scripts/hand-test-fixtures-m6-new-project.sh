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
# the recent-projects scenario (HAND-TEST-M6-NEW-PROJECT-recent): a folder outside the container, reached only through
# the save panel (VRMXG_SHELL_PANEL_DIR starts the panel there; the scenario presses Create), as a person's would be
rm -rf /private/tmp/vrmxg-m6-outside
mkdir -p /private/tmp/vrmxg-m6-outside
echo "outside the container: /private/tmp/vrmxg-m6-outside"
