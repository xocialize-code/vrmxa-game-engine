#!/bin/sh
# AB-T-0589: repro 5 (5-machine-under-load.html) in WKWebView (the acceptance harness: a sandboxed WKWebView over
# loopback), `runs` fresh web views in a row, the GPU load recorded meanwhile (apps/playground/scripts/gpu-load.mjs).
# Writes results/<name>.json (no paths in it). Run alone for the quiet numbers, or beside a load.
#   spike-webgpu-render/repros/wkwebview.sh [runs] [name] [query]
#   e.g. spike-webgpu-render/repros/wkwebview.sh 3 5-machine-wkwebview-quiet 'iters=20000'
set -e
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../.."
runs=${1:-3}; name=${2:-5-machine-wkwebview}; extra=${3:-iters=20000}
src="$root/spike-cinematics/mac/build/CinematicsSpike.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh"; exit 1; }
slug=$(printf %s "$name" | tr -c 'A-Za-z0-9-' '-' | tr 'A-Z' 'a-z')
app="$root/acceptance/build/repro-$slug.app"; bundle="com.xocialize.vrmxg-cinematics-spike.repro.$slug"
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
web="$app/Contents/Resources/web"; rm -rf "$web"; mkdir -p "$web"
cp "$here/5-machine-under-load.html" "$web/index.html"; cp "$here/5-machine-frame72.json" "$web/"; cp "$root/content/sample/props/espresso-machine.glb" "$web/"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $bundle" "$app/Contents/Info.plist"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/$bundle/Data/tmp"; rm -f "$tmp/wkwebview-shots.json"
cases=""; i=1; while [ "$i" -le "$runs" ]; do cases="${cases}${cases:+;}${extra}&glb=espresso-machine.glb&camera=5-machine-frame72.json&run=$i"; i=$((i + 1)); done
loadlog="$root/apps/playground/results/repeat/gpu-load-$slug.jsonl"; mkdir -p "$(dirname "$loadlog")"; rm -f "$loadlog"
node "$root/apps/playground/scripts/gpu-load.mjs" sample "$loadlog" 15 & sampler=$!
trap 'kill $sampler 2>/dev/null' EXIT
SPIKE_CASES="$cases" SPIKE_ORIGINS=loopback SPIKE_TIMEOUT=3600 "$app/Contents/MacOS/CinematicsSpike" > /dev/null
kill $sampler 2>/dev/null
mkdir -p "$here/results"
node --input-type=module -e '
import fs from "node:fs";
const [file, out, loadlog, lib] = process.argv.slice(1);
const { summarise } = await import(lib);
const rows = JSON.parse(fs.readFileSync(file, "utf8"));
const samples = fs.existsSync(loadlog) ? fs.readFileSync(loadlog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
// each run is matched to the samples taken while it ran: the harness runs them in order, so split the sampled span by run time
let t = samples[0]?.at ?? 0;
const runs = rows.map((row) => { const r = row.result ?? {}; const span = (r.ms ?? 0) + 5000, g = samples.length ? summarise(samples, t, t + span) : null; t += span;
  return { case: row.case, timedOut: row.timedOut, errors: row.errors ?? [], ua: row.ua, gpuLoad: g, ...r }; });
for (const r of runs) console.log(r.timedOut ? "TIMED OUT" : r.pass ? "PASS" : "FAIL", r.observation ?? r.error ?? "", JSON.stringify(r.firstDrawDiffers ?? {}));
fs.writeFileSync(out, JSON.stringify({ engine: "WKWebView", runs }, null, 1) + "\n");
' "$tmp/wkwebview-shots.json" "$here/results/$name.json" "$loadlog" "$root/apps/playground/scripts/gpu-load.mjs"
