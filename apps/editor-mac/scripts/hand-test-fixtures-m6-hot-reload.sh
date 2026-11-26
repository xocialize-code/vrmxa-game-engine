#!/bin/sh
# The hot-reload scenario's own copy of the sample project (M6 W2, HAND-TEST-M6-HOT-RELOAD): project-w2-hot-reload in the
# editor's container's temporary folder, where the shell's VRMXG_SHELL_PROJECT hook opens it, with the Morning Rush's
# game.json at its root, so the editor's play runs the game's behaviours module (game/behaviours.js, which imports the
# sample's behaviours.js), as Export Game would. Then the edit helper starts beside it (hot-reload-edits.mjs): the
# scenario's screenshots named edit-<name>.png in /tmp/vrmxg-w2-hot-reload make it save each edit into the copy, never
# into a committed file. It stops by itself after its last edit (or 20 minutes), putting the original text back.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../../.."
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
triggers=/tmp/vrmxg-w2-hot-reload
mkdir -p "$tmp"
rm -rf "$tmp/project-w2-hot-reload" "$tmp/w2-settings.json" "$tmp/w2-cache" "$triggers"
cp -R "$root/content/sample" "$tmp/project-w2-hot-reload"
cp "$tmp/project-w2-hot-reload/game/game.json" "$tmp/project-w2-hot-reload/game.json"
mkdir -p "$triggers"
nohup node "$here/hot-reload-edits.mjs" "$tmp/project-w2-hot-reload" "$triggers" > "$triggers/helper.log" 2>&1 &
echo "project in $tmp/project-w2-hot-reload; edit helper pid $! (log $triggers/helper.log)"
