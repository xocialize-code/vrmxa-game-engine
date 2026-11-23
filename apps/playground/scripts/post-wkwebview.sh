#!/bin/sh
# M4 W1 (AB-T-0573): the playground's ?mode=post on both renderers in WKWebView, over the custom scheme and over
# loopback, each twice, in fresh web views (the acceptance harness: a copy of spike-cinematics/mac's app with the built
# playground as its web content). Writes results/post-wkwebview.json (exports per engine, first frames, costs over
# loopback, and each look on WebGPU against WebGL: SSIM) and results/post/wkwebview-<backend>-<look>.png (loopback).
#   (cd apps/playground && npx vite build) && apps/playground/scripts/post-wkwebview.sh
set -e
# M4 W3: one GPU runner at a time on this machine: re-run under acceptance/gpu-lock.mjs (acceptance/README.md)
[ -n "$VRMXG_GPU_LOCK_HELD" ] || exec node "$(cd "$(dirname "$0")" && pwd)/../../../acceptance/gpu-lock.mjs" run --who "$0" -- "$0" "$@"
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
SPIKE_TIMEOUT=600 SPIKE_CASES="mode=post&renderer=webgpu;mode=post&renderer=webgl;mode=post&renderer=webgpu&again=1;mode=post&renderer=webgl&again=1" \
  SPIKE_ORIGINS=both "$app/Contents/MacOS/CinematicsSpike" > /dev/null
mkdir -p "$here/../results/post"
node "$here/post-wkwebview-summary.mjs" "$tmp/wkwebview-shots.json" "$here/../results"
