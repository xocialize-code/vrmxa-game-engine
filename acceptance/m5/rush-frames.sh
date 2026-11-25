#!/bin/sh
# M5 W10 (AB-T-0620), exit check 10's frame rate for the sample game: ten minutes of play in the Mac game app at 1080p,
# with the web process's memory sampled once a second. The play is the recorded sessions (acceptance/results/m5-rush/:
# a win and a loss, made by the game app in Chromium) played back by the app itself (?replay=…&loop=600&stats), drawn,
# one after the other for ten minutes: Mira walking, carrying, the dialogues, the regulars, four scene changes a loop.
#
#   acceptance/m5/rush-frames.sh prepare      a copy of apps/game-mac/build/morning-rush.app with the logs beside its
#                                             build (web/logs/), signed again: acceptance/build/M5RushFrames.app
#   acceptance/m5/rush-frames.sh sample <out> sample its web processes once a second until the app quits
#                                             (apps/editor-mac/scripts/web-footprint.py), into <out>/footprint.json
#
# Between the two, AppProbe launches the copy at 1920×1080 with VRMXG_QUERY="replay=logs/win.json,logs/lose.json&loop=600&stats"
# under the GPU lock, reads #frame-stats after ten minutes and quits it (see apps/game-mac/docs/HAND-TEST-M5-RUSH.md).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../.."
src="$root/apps/game-mac/build/morning-rush.app"
app="$root/acceptance/build/M5RushFrames.app"
case "${1:-}" in
  prepare)
    [ -d "$src" ] || { echo "build the app first: apps/game-mac/scripts/build.sh apps/game-mac/build/rush"; exit 1; }
    [ -f "$root/acceptance/results/m5-rush/win.json" ] || { echo "run node acceptance/m5/rush.mjs first"; exit 1; }
    rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
    mkdir -p "$app/Contents/Resources/web/logs"; cp "$root"/acceptance/results/m5-rush/*.json "$app/Contents/Resources/web/logs/"
    codesign --force --sign - --entitlements "$root/apps/game-mac/Config/VRMXGGame.entitlements" "$app"
    node -e 'const m = require(process.argv[1] + "/Contents/Resources/web/vrmxg-build.json"), l = require(process.argv[2]); if (m.digest !== l.game.digest) { console.error(`the app wraps build ${m.digest.slice(0, 12)}; the logs were played on ${l.game.digest.slice(0, 12)}: export, build and record again`); process.exit(1); }' "$app" "$root/acceptance/results/m5-rush/win.json"
    echo "$app";;
  sample)
    out=${2:?usage: rush-frames.sh sample <out>}; mkdir -p "$out"
    exec /usr/bin/python3 "$root/apps/editor-mac/scripts/web-footprint.py" --app M5RushFrames.app --out "$out/footprint.json" --every 1 --breakdown-every 15 --until-gone;;
  *) echo "usage: rush-frames.sh prepare | sample <out>"; exit 2;;
esac
