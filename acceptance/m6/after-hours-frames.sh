#!/bin/sh
# M6 W10 (AB-T-0651), M6's exit check 12 for the second game: ten minutes of "After Hours" in the Mac game app at 1080p,
# with the web process's memory sampled once a second. The play is the recorded sessions (acceptance/results/
# m6-after-hours/: a win and a loss, made by the game app in Chromium) played back by the app itself
# (?replay=…&loop=600&stats), drawn, one after the other for ten minutes: Mira walking through the cafe and the back room,
# the doors, the dialogues, Hana, three scene changes a loop. Modelled on acceptance/m5/rush-frames.sh.
#
#   acceptance/m6/after-hours-frames.sh build       the Mac game app from a fresh export of the game:
#                                                   apps/game-mac/build/after-hours.app
#   acceptance/m6/after-hours-frames.sh prepare     a copy of it with the logs beside its build (web/logs/), signed again:
#                                                   acceptance/build/M6AfterHoursFrames.app
#   acceptance/m6/after-hours-frames.sh poll <out>  the app's own frame-time readout (#frame-stats) every five seconds,
#                                                   through AppProbe, into <out>/readout.log, until the app quits
#   acceptance/m6/after-hours-frames.sh sample <out> its web processes once a second until the app quits
#                                                   (apps/editor-mac/scripts/web-footprint.py), into <out>/footprint.json
#
# Between prepare and the two samplers, AppProbe launches the copy at 1920×1112 pt (a 1920×1080 canvas) with
#   appprobe launch app=acceptance/build/M6AfterHoursFrames.app width=1920 height=1112 \
#     'env={"VRMXG_QUERY":"replay=logs/win.json,logs/lose.json&loop=600&stats"}'
# (the env as JSON: the CLI splits env=K=V on commas, and the query has one) under the GPU lock; after ten minutes it is
# quit (kill -9: an app AppProbe launched ignores SIGTERM), and acceptance/m5/rush-frames-summary.mjs <out> sums it up.
# The poll reads the readout's text through `find text=fps` (`text=frames in` matches nothing).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../.."
src="$root/apps/game-mac/build/after-hours.app"
app="$root/acceptance/build/M6AfterHoursFrames.app"
case "${1:-}" in
  build)
    (cd "$root" && npm run build -w @vrmxg/game-app > /dev/null)
    rm -rf "$root/apps/game-mac/build/after-hours-build"
    node "$root/engine/packages/bundle/src/cli.js" "$root/content/sample" "$root/apps/game-mac/build/after-hours-build" --game after-hours/game.json --runtime "$root/apps/game/dist" > /dev/null
    SKIP_WEB=1 exec "$root/apps/game-mac/scripts/build.sh" "$root/apps/game-mac/build/after-hours-build";;
  prepare)
    [ -d "$src" ] || { echo "build the app first: acceptance/m6/after-hours-frames.sh build"; exit 1; }
    [ -f "$root/acceptance/results/m6-after-hours/win.json" ] || { echo "run node acceptance/m6/after-hours.mjs first"; exit 1; }
    rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
    mkdir -p "$app/Contents/Resources/web/logs"; cp "$root"/acceptance/results/m6-after-hours/*.json "$app/Contents/Resources/web/logs/"
    codesign --force --sign - --entitlements "$root/apps/game-mac/Config/VRMXGGame.entitlements" "$app"
    node -e 'const m = require(process.argv[1] + "/Contents/Resources/web/vrmxg-build.json"), l = require(process.argv[2]); if (m.digest !== l.game.digest) { console.error(`the app wraps build ${m.digest.slice(0, 12)}; the logs were played on ${l.game.digest.slice(0, 12)}: export, build and record again`); process.exit(1); }' "$app" "$root/acceptance/results/m6-after-hours/win.json"
    echo "$app";;
  poll)
    out=${2:?usage: after-hours-frames.sh poll <out>}; mkdir -p "$out"
    ap=${APPPROBE:-$(command -v appprobe || echo /Volumes/Satechi/Development/AppProbe/.build/release/appprobe)}   # APPPROBE, else appprobe on PATH, else the fleet's release build
    while pid=$(pgrep -f M6AfterHoursFrames.app/Contents/MacOS | head -1) && [ -n "$pid" ]; do
      raw=$("$ap" find "app=$pid" 'text=fps' 2>&1 || true)
      line=$(printf '%s' "$raw" | grep -o '[0-9]* frames in [^"]*[0-9] scene[^"]*' | head -1 | sed 's/ scene[^"]*$/ scene changes/' || true)   # AppProbe cuts a long text at ~120 characters, and later in the run (longer counts) "scene changes" itself: "27 scene cha…"
      if [ -n "$line" ]; then echo "$(date +%s) $line" >> "$out/readout.log"; else echo "$(date +%s) no readout: $(printf '%s' "$raw" | head -3 | tr '\n' ' ')"; fi
      sleep 5
    done;;
  sample)
    out=${2:?usage: after-hours-frames.sh sample <out>}; mkdir -p "$out"
    exec /usr/bin/python3 "$root/apps/editor-mac/scripts/web-footprint.py" --app M6AfterHoursFrames.app --out "$out/footprint.json" --every 1 --breakdown-every 15;;
  *) echo "usage: after-hours-frames.sh build | prepare | poll <out> | sample <out>"; exit 2;;
esac
