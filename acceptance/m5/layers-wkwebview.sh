#!/bin/sh
# M5 W7 (AB-T-0609): character layers (the playground's ?mode=layers) in WKWebView, over the custom scheme and over
# loopback, each twice in fresh web views (the acceptance harness: a copy of spike-cinematics/mac's app with the built
# playground as its web content). The summary compares every run with Node's (results/m5-layers.json, from
# acceptance/m5/layers.mjs) and writes results/m5-layers-wkwebview.json.
#   (cd apps/playground && npx vite build) && node acceptance/m5/layers.mjs && acceptance/m5/layers-wkwebview.sh
# HARNESS: a built CinematicsSpike.app elsewhere (a worktree has no build of its own).
set -e
# one GPU runner at a time on this machine: re-run under acceptance/gpu-lock.mjs (acceptance/README.md)
gpulock="$(cd "$(dirname "$0")" && pwd)/../gpu-lock.mjs"
node "$gpulock" held || exec node "$gpulock" run --who "$0" -- "$0" "$@"
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../.."
src="${HARNESS:-$root/spike-cinematics/mac/build/CinematicsSpike.app}"
dist="$root/apps/playground/dist"
app="$root/acceptance/build/LayersHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh (or set HARNESS)"; exit 1; }
[ -d "$dist" ] || { echo "build the playground first: (cd apps/playground && npx vite build)"; exit 1; }
[ -f "$root/acceptance/results/m5-layers.json" ] || { echo "run node acceptance/m5/layers.mjs first"; exit 1; }
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
SPIKE_TIMEOUT="${SPIKE_TIMEOUT:-600}" SPIKE_CASES="mode=layers&renderer=webgl;mode=layers&renderer=webgl&again=1" \
  SPIKE_ORIGINS="${ORIGINS:-both}" "$app/Contents/MacOS/CinematicsSpike" > /dev/null
node "$here/layers-wkwebview-summary.mjs" "$tmp/wkwebview-shots.json" "$root/acceptance/results"
