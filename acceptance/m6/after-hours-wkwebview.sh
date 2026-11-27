#!/bin/sh
# M6 W10 (AB-T-0651), exit check 6 in WKWebView: "After Hours"' recorded sessions (acceptance/results/m6-after-hours/, made
# by acceptance/m6/after-hours.mjs in the game app in Chromium) played back by the game app (?replay=) in WKWebView, drawn, on
# WebGPU and on WebGL, over the custom scheme and over loopback, each in a fresh web view (the acceptance harness: a copy
# of spike-cinematics/mac's app with the build's folder as its web content, as the game's Mac app wraps a build, and the
# logs beside it under logs/). The summary compares every run's per-step hashes with the log's own (the app's in
# Chromium, which after-hours.mjs replayed in Node) and writes results/m6-after-hours-wkwebview.json.
#   node acceptance/m6/after-hours.mjs && acceptance/m6/after-hours-wkwebview.sh [win|lose|both]
# HARNESS: a built CinematicsSpike.app elsewhere (a worktree has no build of its own). It draws: it holds the GPU lock.
set -e
here=$(cd "$(dirname "$0")" && pwd)
node "$here/../gpu-lock.mjs" held || exec node "$here/../gpu-lock.mjs" run --who "$0" -- "$0" "$@"
root="$here/../.."
which=${1:-both}
src="${HARNESS:-$root/spike-cinematics/mac/build/CinematicsSpike.app}"
app="$root/acceptance/build/M6AfterHoursHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh (or set HARNESS)"; exit 1; }
[ -f "$root/acceptance/results/m6-after-hours/win.json" ] || { echo "run node acceptance/m6/after-hours.mjs first"; exit 1; }
build=$(mktemp -d)/build
node "$root/engine/packages/bundle/src/cli.js" "$root/content/sample" "$build" --game after-hours/game.json > /dev/null
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$build" "$app/Contents/Resources/web"
mkdir -p "$app/Contents/Resources/web/logs"; cp "$root"/acceptance/results/m6-after-hours/*.json "$app/Contents/Resources/web/logs/"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
cases=""
for s in win lose; do
  [ "$which" = both ] || [ "$which" = "$s" ] || continue
  for b in webgpu webgl; do cases="$cases${cases:+;}replay=logs/$s.json&renderer=$b"; done
done
SPIKE_TIMEOUT=900 SPIKE_CASES="$cases" SPIKE_ORIGINS=both "$app/Contents/MacOS/CinematicsSpike" > /dev/null
n=$(printf '%s' "$cases" | tr ';' '\n' | grep -c .)
node "$here/after-hours-wkwebview-summary.mjs" "$tmp/wkwebview-shots.json" "$root/acceptance/results" "$build" $((n * 2))
rm -rf "$(dirname "$build")"
