#!/bin/sh
# The level-building scenario's own copy of the sample project (M5 W10, HAND-TEST-M5-LEVEL): project-w10-level in the
# editor's container's temporary folder, where the shell's VRMXG_SHELL_PROJECT hook opens it, with game/rush-built.vrmxs:
# the sample game's level with its game layer taken out (acceptance/m5/rush-level.mjs base), which the scenario builds
# back by hand. Its own folder, settings file and thumbnail caches (VRMXG_SHELL_SETTINGS, VRMXG_SHELL_CACHE), so another
# session's fixtures never change them under a run and the operator's editor settings are never touched.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../../.."
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project-w10-level" "$tmp/w10-settings.json" "$tmp/w10-cache" "$tmp/w10-cache-webgl"   # its own settings and thumbnail caches too
cp -R "$root/content/sample" "$tmp/project-w10-level"
node "$root/acceptance/m5/rush-level.mjs" base "$tmp/project-w10-level/game/rush-built.vrmxs"
echo "project in $tmp/project-w10-level"
