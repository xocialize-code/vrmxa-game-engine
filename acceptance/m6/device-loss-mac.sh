#!/bin/sh
# M6 W6 (AB-T-0639) in the Mac game app, with the real failure: WebKit's GPU process killed under the game, as WebKit
# itself kills it when a Metal command buffer fails. The app (apps/game-mac's build of The Morning Rush, with
# device-loss.mjs's unbroken session beside its build under logs/) is started through LaunchServices with
# VRMXG_QUERY="replay=logs/lose.json&stats", so it is its own responsible process; its GPU process is the one WebKit
# process whose responsible process is the app and that started after it (gpu-of.py), and only that one is killed,
# twice, 22 s apart. The app stays open when the replay ends: read #frame-stats with AppProbe ("GPU lost 2×, made again
# on …; replay ended: <steps> steps, final <hash>", to compare with the log's last hash), then kill -9 the app; this
# script waits for it to go, holding the GPU lock throughout.
#   node engine/packages/bundle/src/cli.js content/sample apps/game-mac/build/rush --game game/game.json
#   SKIP_WEB=1 apps/game-mac/scripts/build.sh apps/game-mac/build/rush
#   node acceptance/m6/device-loss.mjs && acceptance/m6/device-loss-mac.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
node "$here/../gpu-lock.mjs" held || exec node "$here/../gpu-lock.mjs" run --who "$0" -- "$0" "$@"
root="$here/../.."
src="$root/apps/game-mac/build/morning-rush.app"; app="$root/acceptance/build/M6DeviceLoss.app"; log="$root/acceptance/results/m6-device-loss/lose.json"
[ -d "$src" ] || { echo "build the app first (see the top of this file)"; exit 1; }
[ -f "$log" ] || { echo "run node acceptance/m6/device-loss.mjs first"; exit 1; }
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
mkdir -p "$app/Contents/Resources/web/logs"; cp "$log" "$app/Contents/Resources/web/logs/"
codesign --force --sign - --entitlements "$root/apps/game-mac/Config/VRMXGGame.entitlements" "$app" 2>/dev/null
node -e 'const m = require(process.argv[1] + "/Contents/Resources/web/vrmxg-build.json"), l = require(process.argv[2]); if (m.digest !== l.game.digest) { console.error(`the app wraps build ${m.digest.slice(0, 12)}; the log was played on ${l.game.digest.slice(0, 12)}`); process.exit(1); } console.log(`log: ${l.hashes.length} steps, final ${l.hashes.at(-1).hash}`)' "$app" "$log"
open -n --env VRMXG_QUERY="replay=logs/lose.json&stats" "$app"
pid=""; for i in $(seq 1 60); do pid=$(pgrep -nf "$app/Contents/MacOS/" || true); [ -n "$pid" ] && break; sleep 0.5; done
[ -n "$pid" ] || { echo "the app didn't start"; exit 1; }
echo "app $pid"
sleep 22; gpu=$(/usr/bin/python3 "$here/gpu-of.py" "$pid"); kill -9 "$gpu"; echo "killed its GPU process $gpu at $(date +%T)"
sleep 22; gpu=$(/usr/bin/python3 "$here/gpu-of.py" "$pid"); kill -9 "$gpu"; echo "killed its GPU process $gpu at $(date +%T)"
echo "read #frame-stats with AppProbe once the replay has ended (about a minute), then: kill -9 $pid"
while kill -0 "$pid" 2>/dev/null; do sleep 2; done
