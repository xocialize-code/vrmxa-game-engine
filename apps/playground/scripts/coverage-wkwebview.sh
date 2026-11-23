#!/bin/sh
# M4 W8 (AB-T-0580): the playground's ?mode=coverage on both renderers in WKWebView, over the custom scheme and over
# loopback, each twice, in fresh web views (the acceptance harness: a copy of spike-cinematics/mac's app with the built
# playground as its web content). Writes results/coverage-wkwebview.json (every thumbnail's hash per run, and whether
# they repeat across loads and origins, and match Chromium's) and the thumbnails as
# results/coverage/wkwebview-<backend>-<shot>.png (loopback, first load; git-ignored).
#   (cd apps/playground && npx vite build) && apps/playground/scripts/coverage-wkwebview.sh
set -e
# M4 W3: one GPU runner at a time on this machine: re-run under acceptance/gpu-lock.mjs (acceptance/README.md)
gpulock="$(cd "$(dirname "$0")" && pwd)/../../../acceptance/gpu-lock.mjs"
node "$gpulock" held || exec node "$gpulock" run --who "$0" -- "$0" "$@" # held: VRMXG_GPU_LOCK_HELD names the live owner
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../../.."
src="$root/spike-cinematics/mac/build/CinematicsSpike.app"
dist="$here/../dist"
app="$root/acceptance/build/AcceptanceHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh"; exit 1; }
[ -d "$dist" ] || { echo "build the playground first: (cd apps/playground && npx vite build)"; exit 1; }
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
SPIKE_TIMEOUT=900 SPIKE_CASES="mode=coverage&renderer=webgpu;mode=coverage&renderer=webgl;mode=coverage&renderer=webgpu&again=1;mode=coverage&renderer=webgl&again=1" \
  SPIKE_ORIGINS=both "$app/Contents/MacOS/CinematicsSpike" > /dev/null
mkdir -p "$here/../results/coverage"
node "$here/coverage-wkwebview-summary.mjs" "$tmp/wkwebview-shots.json" "$here/../results"
