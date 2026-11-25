#!/bin/sh
# M5 W10 (AB-T-0620), exit check 7 in WKWebView: the sample game's recorded sessions (acceptance/results/m5-rush/, made
# by acceptance/m5/rush.mjs in the game app in Chromium) played back by the game app (?replay=) in WKWebView, drawn, on
# WebGPU and on WebGL, over the custom scheme and over loopback, each in a fresh web view (the acceptance harness: a copy
# of spike-cinematics/mac's app with the build's folder as its web content, as the game's Mac app wraps a build, and the
# logs beside it under logs/). The summary compares every run's per-step hashes with the log's own (the app's in
# Chromium, which rush.mjs replayed in Node) and writes results/m5-rush-wkwebview.json.
#   node acceptance/m5/rush.mjs && acceptance/m5/rush-wkwebview.sh [win|lose|both]
# HARNESS: a built CinematicsSpike.app elsewhere (a worktree has no build of its own). It draws: it holds the GPU lock.
set -e
here=$(cd "$(dirname "$0")" && pwd)
node "$here/../gpu-lock.mjs" held || exec node "$here/../gpu-lock.mjs" run --who "$0" -- "$0" "$@"
root="$here/../.."
which=${1:-both}
src="${HARNESS:-$root/spike-cinematics/mac/build/CinematicsSpike.app}"
app="$root/acceptance/build/M5RushHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh (or set HARNESS)"; exit 1; }
[ -f "$root/acceptance/results/m5-rush/win.json" ] || { echo "run node acceptance/m5/rush.mjs first"; exit 1; }
build=$(mktemp -d)/build
node "$root/engine/packages/bundle/src/cli.js" "$root/content/sample" "$build" --game game/game.json > /dev/null
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$build" "$app/Contents/Resources/web"
mkdir -p "$app/Contents/Resources/web/logs"; cp "$root"/acceptance/results/m5-rush/*.json "$app/Contents/Resources/web/logs/"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
cases=""
for s in win lose; do
  [ "$which" = both ] || [ "$which" = "$s" ] || continue
  for b in webgpu webgl; do cases="$cases${cases:+;}replay=logs/$s.json&renderer=$b"; done
done
SPIKE_TIMEOUT=900 SPIKE_CASES="$cases" SPIKE_ORIGINS=both "$app/Contents/MacOS/CinematicsSpike" > /dev/null
node "$here/rush-wkwebview-summary.mjs" "$tmp/wkwebview-shots.json" "$root/acceptance/results" "$build"
rm -rf "$(dirname "$build")"
