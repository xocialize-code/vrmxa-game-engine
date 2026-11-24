#!/bin/sh
# Gives the hand test a clean start: the scenarios keep the game's saves and settings in their own folder in the app's
# container (VRMXG_SHELL_SAVES=game-w1/Saves, VRMXG_SHELL_SETTINGS=game-w1/settings.json, resolved under the container's
# temporary folder), and this empties that folder only. Run it before the first scenario; the container exists after the
# app's first launch. Another session's fixtures can't touch it: the folder name and the container (one per game) are this
# hand test's.
#   apps/game-mac/scripts/hand-test-fixtures.sh [<game id>]     (default cafe-test, the game app's test game)
set -eu
id=${1:-cafe-test}
case "$id" in *[!a-z0-9-]*|"") echo "not a game id: $id"; exit 2;; esac
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-game.$id/Data/tmp"
[ -d "$tmp" ] || { echo "no container for com.xocialize.vrmxg-game.$id yet: launch the app once"; exit 1; }
rm -rf "$tmp/game-w1"
mkdir -p "$tmp/game-w1/Saves"
echo "clean saves and settings in $tmp/game-w1"
