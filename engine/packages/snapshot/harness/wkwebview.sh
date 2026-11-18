#!/bin/sh
# The harness in WKWebView: a copy of the cinematics spike's harness app (spike-cinematics/mac, built by its
# scripts/build.sh) with this dist/ as its web content, re-signed ad hoc with the same sandbox entitlements.
# It runs each case in a fresh web view over the custom scheme and over loopback, and this script splits
# its output into results/wkwebview-scheme.json and results/wkwebview-loopback.json.
set -e
here=$(cd "$(dirname "$0")" && pwd)
src="$here/../../../../spike-cinematics/mac/build/CinematicsSpike.app"
app="$here/build/DeterminismHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh"; exit 1; }
[ -d "$here/dist" ] || { echo "build the page first: npx vite build (in $here)"; exit 1; }
rm -rf "$app"; mkdir -p "$here/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$here/dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
out="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp/wkwebview-shots.json"
rm -f "$out"
SPIKE_CASES="${CASES:-mode=det;mode=budget}" SPIKE_ORIGINS="${ORIGINS:-both}" "$app/Contents/MacOS/CinematicsSpike"
node "$here/wkwebview-split.mjs" "$out"
