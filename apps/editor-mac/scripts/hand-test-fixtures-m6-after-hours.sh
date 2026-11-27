#!/bin/sh
# HAND-TEST-M6-AFTER-HOURS (M6 W10, AB-T-0651): empty folders in the sandboxed editor's container where the scenario makes
# its project (VRMXG_SHELL_NEW_PROJECT=w10-projects/) and exports its build (VRMXG_SHELL_BUILD=w10-builds/), its own
# settings file and thumbnail caches (so another session's fixtures never change them under a run, and the operator's
# editor settings are never touched), and an empty trigger folder for the files helper
# (apps/editor-mac/scripts/after-hours-files.mjs, started beside the scenario). Run before the scenario.
set -e
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/w10-projects" "$tmp/w10-builds" "$tmp/w10-ah-settings.json" "$tmp/w10-ah-cache" "$tmp/w10-ah-cache-webgl"
mkdir -p "$tmp/w10-projects" "$tmp/w10-builds"
rm -rf /tmp/vrmxg-w10-after-hours
mkdir -p /tmp/vrmxg-w10-after-hours
echo "projects in $tmp/w10-projects, builds in $tmp/w10-builds; start: node apps/editor-mac/scripts/after-hours-files.mjs"
