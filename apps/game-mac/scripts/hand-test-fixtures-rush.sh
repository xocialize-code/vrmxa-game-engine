#!/bin/sh
# The sample game's hand test (M5 W10, HAND-TEST-M5-RUSH): its own saves and settings folder in the app's container
# (VRMXG_SHELL_SAVES=game-w10/Saves, VRMXG_SHELL_SETTINGS=game-w10/settings.json, resolved under the container's temporary
# folder), emptied, with one save in Slot 1: the recorded win session (acceptance/results/m5-rush/win.json) replayed in
# Node until Mira stands at the open till, then saved as the app's Save Game saves (acceptance/m5/rush-save.mjs). The save
# is made with the build the app wraps (apps/game-mac/build/rush), so its digest is the app's.
#   apps/game-mac/scripts/hand-test-fixtures-rush.sh       (after scripts/build.sh apps/game-mac/build/rush and one launch)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../../.."
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-game.morning-rush/Data/tmp"
[ -d "$tmp" ] || { echo "no container for com.xocialize.vrmxg-game.morning-rush yet: launch the app once"; exit 1; }
[ -f "$root/apps/game-mac/build/rush/vrmxg-build.json" ] || { echo "export the game first: node engine/packages/bundle/src/cli.js content/sample apps/game-mac/build/rush --game game/game.json"; exit 1; }
rm -rf "$tmp/game-w10"
mkdir -p "$tmp/game-w10/Saves"
node "$root/acceptance/m5/rush-save.mjs" "$root/apps/game-mac/build/rush" "$tmp/game-w10/Saves" --slot slot-1
echo "saves and settings in $tmp/game-w10"
