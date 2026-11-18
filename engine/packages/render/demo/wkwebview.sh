#!/bin/sh
# The render demo in WKWebView: a copy of the cinematics spike's harness app with this dist/ as its web
# content (re-signed ad hoc with the same sandbox entitlements), each case in a fresh web view, over the
# custom scheme and over loopback. Rows (and canvas screenshots) land in results/.
set -e
here=$(cd "$(dirname "$0")" && pwd)
src="$here/../../../../spike-cinematics/mac/build/CinematicsSpike.app"
app="$here/build/RenderDemo.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh"; exit 1; }
[ -d "$here/dist" ] || { echo "build the page first: npx vite build (in $here)"; exit 1; }
rm -rf "$app"; mkdir -p "$here/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$here/dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json" "$tmp"/mode_trace*.png
SPIKE_CASES="${CASES:-mode=trace;mode=trace&debug=1}" SPIKE_ORIGINS="${ORIGINS:-both}" "$app/Contents/MacOS/CinematicsSpike"
cp "$tmp/wkwebview-shots.json" "$here/results/wkwebview.json"
for f in "$tmp"/mode_trace*.png; do [ -f "$f" ] && cp "$f" "$here/results/wkwebview-$(basename "$f")"; done
node -e '
const rows = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
for (const r of rows) { const x = r.result ?? {}; console.log(r.origin, r.case, "errors", (r.errors ?? []).length, "warnings", (r.warnings ?? []).length, r.timedOut ? "TIMED OUT" : "", JSON.stringify({ hashes: x.hashes, smooth: x.smoothness120 && { on: x.smoothness120.interpolated.cv, onStill: x.smoothness120.interpolated.stillFrames, off: x.smoothness120.plain.cv, offStill: x.smoothness120.plain.stillFrames }, live: x.live, debug: x.debug, renderMs: x.renderMs })); if ((r.errors ?? []).length) console.log(r.errors); }
' "$here/results/wkwebview.json"
