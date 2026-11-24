#!/bin/sh
# A fresh copy of the sample project where the sandboxed editor can open it: its container's temporary folder, which
# the shell's VRMXG_SHELL_PROJECT hook resolves relative paths against. The scenario builds built-cafe.vrmxs in it.
# Run before the scenario (the container exists after the app's first launch; this makes it if not).
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project"
cp -R "$here/../../../content/sample" "$tmp/project"
rm -f "$tmp/project/built-cafe.vrmxs" "$tmp/project/sequences/hand-test.vrmxs"
rm -rf "$tmp/exports" "$tmp/vrmxg-export" # the export scenario's output
# Export Game (M5 W0, HAND-TEST-M5-EXPORT-GAME): its builds, and a copy of the project whose game includes a file with
# no row in LICENCES.md, for the refusal
# The export scenario opens its own copy, project-game: another session's run of this script resets "project" under it
rm -rf "$tmp/builds" "$tmp/project-unlicensed" "$tmp/project-game"
cp -R "$here/../../../content/sample" "$tmp/project-game"
cp -R "$here/../../../content/sample" "$tmp/project-unlicensed"
printf 'glTF' > "$tmp/project-unlicensed/props/found-on-the-web.glb"
sed -i '' 's|"include": \["input/walk-in.json"\]|"include": ["input/walk-in.json", "props/found-on-the-web.glb"]|' "$tmp/project-unlicensed/game.json"
grep -q found-on-the-web "$tmp/project-unlicensed/game.json"
# and a folder with someone's file in it, where an export must be refused and leave the file alone
mkdir -p "$tmp/builds/game-stray" && printf 'mine' > "$tmp/builds/game-stray/notes.txt"
echo "project in $tmp/project"
