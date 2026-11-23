#!/bin/sh
# AB-T-0589: the film exported several times per page (?mode=frames&parts=filmRepeat), on several loads, in WKWebView
# (fresh web views, the acceptance harness), WebGPU. Every export's frames must equal its page's first export's, and
# every load's digests must be the same. A differing frame's images go to results/repeat/ (git-ignored).
# Writes results/<name>.json (no paths in it). Exit 1 on a timeout, a page error or any differing frame.
#   (cd apps/playground && npx vite build) && apps/playground/scripts/repeat-wkwebview.sh [loads] [name] [query extras] [origins]
#   e.g. apps/playground/scripts/repeat-wkwebview.sh 6 repeat-wkwebview 'frames=1080&repeat=3&audio=1&tiles=1' loopback
set -e
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../../.."
loads=${1:-6}; name=${2:-repeat-wkwebview}; extra=${3:-frames=1080&repeat=3&audio=1&tiles=1}; origins=${4:-loopback}
src="$root/spike-cinematics/mac/build/CinematicsSpike.app"
dist="$here/../dist"
# an app and a bundle id of its own per run name, so its own sandbox container: frames-wkwebview.sh and the other runners
# use the harness's, and two runs at once (with different names) can't delete each other's app or results
slug=$(printf %s "$name" | tr -c 'A-Za-z0-9-' '-' | tr 'A-Z' 'a-z')
app="$root/acceptance/build/repeat-$slug.app"
bundle="com.xocialize.vrmxg-cinematics-spike.repeat.$slug"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh"; exit 1; }
[ -d "$dist" ] || { echo "build the playground first: (cd apps/playground && npx vite build)"; exit 1; }
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$dist" "$app/Contents/Resources/web"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $bundle" "$app/Contents/Info.plist"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/$bundle/Data/tmp"
rm -f "$tmp/wkwebview-shots.json"
cases=""
i=1; while [ "$i" -le "$loads" ]; do cases="${cases}${cases:+;}mode=frames&renderer=webgpu&parts=filmRepeat&${extra}&load=$i"; i=$((i + 1)); done
# what else uses the GPU meanwhile: a snapshot every 15 s (gpu-load.mjs), summarised per load below
mkdir -p "$here/../results/repeat"; loadlog="$here/../results/repeat/gpu-load-$slug.jsonl"; rm -f "$loadlog" # git-ignored
node "$here/gpu-load.mjs" sample "$loadlog" 15 & sampler=$!
trap 'kill $sampler 2>/dev/null' EXIT
SPIKE_CASES="$cases" SPIKE_ORIGINS="$origins" SPIKE_TIMEOUT=5400 "$app/Contents/MacOS/CinematicsSpike" > /dev/null
kill $sampler 2>/dev/null
mkdir -p "$here/../results/repeat"
node --input-type=module -e '
import fs from "node:fs";
const [file, out, name, extra, loadlog, lib] = process.argv.slice(1);
const { summarise } = await import(lib);
const rows = JSON.parse(fs.readFileSync(file, "utf8")), loads = [];
const samples = fs.existsSync(loadlog) ? fs.readFileSync(loadlog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
for (const [n, row] of rows.entries()) {
  const r = row.result ?? {}, fr = r.filmRepeat ?? {};
  for (const [i, run] of (fr.runs ?? []).entries()) for (const d of run.diffs) {
    fs.writeFileSync(`${out}/repeat/${name}-${row.origin}-load${n + 1}-export${i}-frame${d.frame}.png`, Buffer.from(d.png.split(",")[1], "base64")); delete d.png;
    for (const [k, suffix] of [["tilePng", "tile"], ["refTilePng", "tile-first"]]) if (d[k]) { fs.writeFileSync(`${out}/repeat/${name}-${row.origin}-load${n + 1}-export${i}-frame${d.frame}-${suffix}.png`, Buffer.from(d[k].split(",")[1], "base64")); delete d[k]; }
  }
  for (const [k, s] of Object.entries(fr.refShots ?? {})) { fs.writeFileSync(`${out}/repeat/${name}-${row.origin}-load${n + 1}-ref-frame${k}.png`, Buffer.from(s.png.split(",")[1], "base64")); delete s.png; }
  const wall = fr.wall ?? r.sameFrame?.wall;
  loads.push({ load: n + 1, origin: row.origin, case: row.case, timedOut: row.timedOut, errors: row.errors ?? [], backend: r.backend, ms: r.ms, gpuLoad: wall ? summarise(samples, wall.start, wall.end) : null, ...fr });
  console.log(row.origin, n + 1, row.timedOut ? "TIMED OUT" : "", (fr.runs ?? []).map((x) => `${x.digest}${x.diffs.length ? ` (${x.diffs.length} differ: ${x.diffs.map((d) => `${d.frame}[${d.tiles}]`).join(" ")})` : ""}${x.wgsl ? ` wgsl ${x.wgsl.digest}/${x.wgsl.modules}${x.wgsl.notInFirst.length ? ` +${x.wgsl.notInFirst.length}` : ""}` : ""}`).join(" | "), (row.errors ?? []).slice(0, 2).join(" | "));
}
const byOrigin = {};
for (const l of loads) (byOrigin[l.origin] ??= []).push(...(l.runs ?? []).map((x) => x.digest));
const exports = loads.reduce((n, l) => n + (l.runs?.length ?? 0), 0);
const allIdentical = exports > 0 && Object.values(byOrigin).every((d) => new Set(d).size === 1) && loads.every((l) => !l.timedOut && !l.errors.length);
const run = samples.length ? summarise(samples, samples[0].at, samples.at(-1).at) : null;
fs.writeFileSync(`${out}/${name}.json`, JSON.stringify({ query: extra, ua: rows[0]?.ua, exports, allIdentical, gpuLoad: run, loads }, null, 1) + "\n");
console.log(`${exports} exports, all identical per origin: ${allIdentical}`);
process.exitCode = allIdentical ? 0 : 1;
' "$tmp/wkwebview-shots.json" "$here/../results" "$name" "$extra" "$loadlog" "$here/gpu-load.mjs"
