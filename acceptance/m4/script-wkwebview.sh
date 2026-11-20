#!/bin/sh
# M4 W4 (AB-T-0576) in WKWebView: the script page (acceptance/m4/script-page, built by script-build.mjs) in a copy of the
# cinematics spike's harness app, over the custom scheme and loopback. Compares with Node's hashes in
# results/m4-script.json (run script-chromium.mjs first) and writes results/m4-script-wkwebview.json.
set -e
here=$(cd "$(dirname "$0")" && pwd)
src="${HARNESS:-$here/../../spike-cinematics/mac/build/CinematicsSpike.app}"
app="$here/../build/ScriptCheckHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh (or HARNESS=<path to CinematicsSpike.app>)"; exit 1; }
[ -f "$here/../results/m4-script.json" ] || { echo "run node acceptance/m4/script-chromium.mjs first"; exit 1; }
dist=$(node "$here/script-build.mjs")
rm -rf "$app"; mkdir -p "$here/../build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
SPIKE_CASES="check=script" SPIKE_ORIGINS="${ORIGINS:-both}" SPIKE_TIMEOUT="${SPIKE_TIMEOUT:-120}" "$app/Contents/MacOS/CinematicsSpike" >/dev/null
node -e '
const fs = require("fs"), [file, out] = process.argv.slice(1);
const node = JSON.parse(fs.readFileSync(`${out}/m4-script.json`, "utf8")).node;
const runs = JSON.parse(fs.readFileSync(file, "utf8")).map((r) => ({ origin: r.origin, timedOut: r.timedOut, errors: r.errors, result: r.result,
  same: r.result?.sample?.sha256 === node.sample.sha256 && r.result?.rescript?.sha256 === node.rescript.sha256 }));
fs.writeFileSync(`${out}/m4-script-wkwebview.json`, JSON.stringify({ check: "M4 W4 in WKWebView", node, runs }, null, 1) + "\n");
for (const r of runs) console.log(r.origin, r.same ? "same as Node" : "DIFFERS", r.result?.sample?.sha256, r.result?.rescript?.sha256, JSON.stringify(r.errors ?? []).slice(0, 300));
process.exit(runs.length === 2 && runs.every((r) => r.same) ? 0 : 1);
' "$tmp/wkwebview-shots.json" "$here/../results"
