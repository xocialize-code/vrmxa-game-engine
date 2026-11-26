#!/bin/sh
# M6 W6 (AB-T-0639) in WKWebView: the unbroken session device-loss.mjs played in Chromium
# (acceptance/results/m6-device-loss/lose.json) replayed by the game app (?replay=) in WKWebView, drawn, while its device
# is lost under it (the app's own ?lose= switch): device.destroy() and WebKit's failing createCommandEncoder on WebGPU
# (made again on WebGPU), device.destroy() with ?recover=webgl-fallback (three's WebGL2 backend), and a lost WebGL
# context on WebGL; over the custom scheme and over loopback, each in a fresh web view (the acceptance harness: a copy
# of spike-cinematics/mac's app with the build's folder as its web content, as rush-wkwebview.sh). The summary compares
# every run's per-step hashes with the log's and writes results/m6-device-loss-wkwebview.json.
#   node acceptance/m6/device-loss.mjs && acceptance/m6/device-loss-wkwebview.sh
# HARNESS: a built CinematicsSpike.app elsewhere (a worktree has no build of its own). It draws: it holds the GPU lock.
set -e
here=$(cd "$(dirname "$0")" && pwd)
node "$here/../gpu-lock.mjs" held || exec node "$here/../gpu-lock.mjs" run --who "$0" -- "$0" "$@"
root="$here/../.."
src="${HARNESS:-$root/spike-cinematics/mac/build/CinematicsSpike.app}"
app="$root/acceptance/build/M6DeviceLossHarness.app"
log="$root/acceptance/results/m6-device-loss/lose.json"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh (or set HARNESS)"; exit 1; }
[ -f "$log" ] || { echo "run node acceptance/m6/device-loss.mjs first"; exit 1; }
build=$(mktemp -d)/build
node "$root/engine/packages/bundle/src/cli.js" "$root/content/sample" "$build" --game game/game.json > /dev/null
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$build" "$app/Contents/Resources/web"
mkdir -p "$app/Contents/Resources/web/logs"; cp "$log" "$app/Contents/Resources/web/logs/"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
# the level starts at the step the summary reads from the log; the losses fall well inside it
lvl=$(node -e "const l=require('$log');console.log(l.hashes.find((h)=>h.scene==='game/level.vrmxs').step)")
cases="replay=logs/lose.json&renderer=webgpu&lose=60:destroy,$((lvl + 600)):destroy,$((lvl + 1800)):encoder"
cases="$cases;replay=logs/lose.json&renderer=webgpu&recover=webgl-fallback&lose=$((lvl + 900)):destroy"
cases="$cases;replay=logs/lose.json&renderer=webgl&lose=$((lvl + 900)):context"
SPIKE_TIMEOUT=600 SPIKE_CASES="$cases" SPIKE_ORIGINS=both "$app/Contents/MacOS/CinematicsSpike" > /dev/null
node "$here/device-loss-wkwebview-summary.mjs" "$tmp/wkwebview-shots.json" "$root/acceptance/results" "$build" 6
rm -rf "$(dirname "$build")"
