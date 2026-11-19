#!/bin/sh
# M2 checks 2 and 5 in WKWebView: the built editor (apps/editor/dist) in a copy of the cinematics spike's harness app,
# at ?mode=check-export over the custom scheme and loopback (apps/editor/src/checkmode.js): the film exported as frame
# hashes, checked against scrubbing, and rendered forward on a fresh world. Writes results/m2-editor-wkwebview-<origin>.json.
set -e
here=$(cd "$(dirname "$0")" && pwd)
src="$here/../../spike-cinematics/mac/build/CinematicsSpike.app"
dist="$here/../../apps/editor/dist"
app="$here/../build/EditorCheckHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh"; exit 1; }
[ -d "$dist" ] || { echo "build the editor first: (cd apps/editor && npx vite build)"; exit 1; }
rm -rf "$app"; mkdir -p "$here/../build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
SPIKE_CASES="mode=check-export" SPIKE_ORIGINS="${ORIGINS:-both}" SPIKE_TIMEOUT="${SPIKE_TIMEOUT:-900}" "$app/Contents/MacOS/CinematicsSpike"
node -e '
const fs = require("fs"), [file, out] = process.argv.slice(1);
for (const r of JSON.parse(fs.readFileSync(file, "utf8"))) {
  fs.writeFileSync(`${out}/m2-editor-wkwebview-${r.origin}.json`, JSON.stringify({ runtime: `wkwebview-${r.origin}`, ua: r.ua, timedOut: r.timedOut, errors: r.errors, result: r.result }, null, 1) + "\n");
  const x = r.result ?? {};
  console.log(r.origin, r.timedOut ? "TIMED OUT" : "", "errors", JSON.stringify(r.errors ?? []).slice(0, 600));
  console.log("  scrub", JSON.stringify(x.scrub), "digest", x.digest);
  for (const row of x.rows ?? []) console.log("  ", row.frame, "scrub=export", row.same, "forward=export", row.forwardSame, "scrubWorld=export", row.worldSame, "forwardWorld=scrub", row.forwardWorld);
}' "$tmp/wkwebview-shots.json" "$here/../results"
