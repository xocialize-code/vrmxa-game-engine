#!/bin/sh
# M5 W3 (AB-T-0618) in WKWebView: the dialogue page (acceptance/m5/dialogue-page, built by dialogue-build.mjs: the real
# overlay mounted, the choice clicked) in a copy of the cinematics spike's harness app, over the custom scheme and over
# loopback, with steady and with varied loading delays. Compares every run with Node's (results/m5-dialogue-node-run.json:
# run node acceptance/m5/dialogue.mjs first) and writes results/m5-dialogue-wkwebview.json.
#   node acceptance/m5/dialogue.mjs && acceptance/m5/dialogue-wkwebview.sh
# HARNESS: a built CinematicsSpike.app elsewhere (a worktree may have no build of its own).
set -e
# Nothing here draws, but every harness run writes the same file in the app's container: take the machine's one runner
# lock for the run (acceptance/gpu-lock.mjs, acceptance/README.md), as the GPU runners do.
gpulock="$(cd "$(dirname "$0")" && pwd)/../gpu-lock.mjs"
node "$gpulock" held || exec node "$gpulock" run --who "$0" -- "$0" "$@"
here=$(cd "$(dirname "$0")" && pwd)
src="${HARNESS:-$here/../../spike-cinematics/mac/build/CinematicsSpike.app}"
app="$here/../build/DialogueCheckHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh (or HARNESS=<path to CinematicsSpike.app>)"; exit 1; }
[ -f "$here/../results/m5-dialogue-node-run.json" ] || { echo "run node acceptance/m5/dialogue.mjs first"; exit 1; }
dist=$(node "$here/dialogue-build.mjs")
rm -rf "$app"; mkdir -p "$here/../build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
SPIKE_CASES="check=dialogue&delay=steady;check=dialogue&delay=varied" SPIKE_ORIGINS="${ORIGINS:-both}" SPIKE_TIMEOUT="${SPIKE_TIMEOUT:-180}" "$app/Contents/MacOS/CinematicsSpike" >/dev/null
node "$here/dialogue-wkwebview-summary.mjs" "$tmp/wkwebview-shots.json" "$here/../results"
