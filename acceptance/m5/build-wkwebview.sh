#!/bin/sh
# M5 W0 (AB-T-0615): the sample's game build played in WKWebView by the runtime inside it, over the custom scheme and
# over loopback, each twice in fresh web views (the acceptance harness: a copy of spike-cinematics/mac's app with the
# build's folder as its web content, which is how the game's Mac app will wrap a build). The summary compares every
# run's per-step hashes with Node's (results/m5-build.json, from acceptance/m5/build.mjs) and writes
# results/m5-build-wkwebview.json.
#   node acceptance/m5/build.mjs && acceptance/m5/build-wkwebview.sh
# HARNESS: a built CinematicsSpike.app elsewhere (a worktree has no build of its own).
# The runtime in the build steps the world with no renderer, so this draws nothing. It still runs under the runner lock
# (acceptance/gpu-lock.mjs): every harness run writes the same file in the harness's container, and two at once would
# read each other's rows.
set -e
here=$(cd "$(dirname "$0")" && pwd)
node "$here/../gpu-lock.mjs" held || exec node "$here/../gpu-lock.mjs" run --who "$0" -- "$0" "$@"
root="$here/../.."
src="${HARNESS:-$root/spike-cinematics/mac/build/CinematicsSpike.app}"
app="$root/acceptance/build/M5BuildHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh (or set HARNESS)"; exit 1; }
[ -f "$root/acceptance/results/m5-build.json" ] || { echo "run node acceptance/m5/build.mjs first"; exit 1; }
build=$(mktemp -d)/build
node "$root/engine/packages/bundle/src/cli.js" "$root/content/sample" "$build" > /dev/null
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$build" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
SPIKE_TIMEOUT=300 SPIKE_CASES="check=input/walk-in.json&steps=600;check=input/walk-in.json&steps=600&again=1" \
  SPIKE_ORIGINS=both "$app/Contents/MacOS/CinematicsSpike" > /dev/null
node "$here/build-wkwebview-summary.mjs" "$tmp/wkwebview-shots.json" "$root/acceptance/results" "$build"
rm -rf "$(dirname "$build")"
