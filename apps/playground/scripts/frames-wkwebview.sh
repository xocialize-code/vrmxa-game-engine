#!/bin/sh
# M4 W2 (AB-T-0574): the playground's ?mode=frames on both renderers in WKWebView, over the custom scheme and over
# loopback, each on two loads, in fresh web views (the acceptance harness: a copy of spike-cinematics/mac's app with the
# built playground as its web content). Per run: check 13 drawn on the host's own particle renderer and restored
# mid-effect, the morning film exported twice, captureStill against the canvas, the readback's cost (take timings from
# loopback: the scheme origin's timer resolves 1 ms). WebGPU must repeat exactly across loads and both origins; WebGL's
# repeat is reported (WebGL in WKWebView gives one of two images from load to load, AB-T-0587).
# Writes results/frames-wkwebview.json and results/frames-wkwebview-*.png (loopback's first load).
#   (cd apps/playground && npx vite build) && apps/playground/scripts/frames-wkwebview.sh
set -e
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
SPIKE_CASES="mode=frames&renderer=webgpu;mode=frames&renderer=webgl;mode=frames&renderer=webgpu&again=1;mode=frames&renderer=webgl&again=1" \
  SPIKE_ORIGINS=both SPIKE_TIMEOUT=1800 "$app/Contents/MacOS/CinematicsSpike" > /dev/null
mkdir -p "$here/../results"
node --input-type=module -e '
import fs from "node:fs";
const [file, out, lib] = process.argv.slice(1);
const { verdicts, sameKey, keepShots } = await import(lib);
const rows = JSON.parse(fs.readFileSync(file, "utf8")), runs = [];
let bad = false;
for (const row of rows) {
  const r = { ...(row.result ?? {}), errors: row.errors ?? [] };
  keepShots(r, "frames-wkwebview", !row.case.includes("again") && row.origin === "loopback" ? out : null); // scheme draws the same bytes
  const v = verdicts(r);
  runs.push({ ...r, origin: row.origin, case: row.case, ua: row.ua, timedOut: row.timedOut, verdicts: v });
  console.log(row.origin, r.backend, row.case.includes("again") ? "again" : "first", JSON.stringify(v), row.timedOut ? "TIMED OUT" : "", (r.errors ?? []).slice(0, 2).join(" | "));
  bad ||= row.timedOut || Object.values(v).some((x) => x === false);
}
const same = (b, o) => new Set(runs.filter((r) => r.backend === b && (!o || r.origin === o)).map(sameKey)).size === 1;
// WebGPU must repeat on every load and across both origins; WebGL is reported (AB-T-0587)
const repeat = { webgpu: same("webgpu"), webgpuScheme: same("webgpu", "scheme"), webgpuLoopback: same("webgpu", "loopback"), webgl: same("webgl"), webglScheme: same("webgl", "scheme"), webglLoopback: same("webgl", "loopback") };
console.log("repeatable", JSON.stringify(repeat));
for (const r of runs.filter((x) => x.origin === "loopback")) console.log(r.backend, r.case.includes("again") ? "again" : "first", "readback", JSON.stringify(Object.fromEntries(Object.entries(r.readback ?? {}).filter(([, v]) => v.exportLoopMs).map(([k, v]) => [k, { loop: v.exportLoopMs.median, after: v.afterFrameMs.median, render: v.renderMs.median }]))), "film ms/frame", JSON.stringify(r.film?.first.perFrameMs));
fs.writeFileSync(`${out}/frames-wkwebview.json`, JSON.stringify({ repeat, runs }, null, 1) + "\n");
process.exitCode = bad || !repeat.webgpu ? 1 : 0;
' "$tmp/wkwebview-shots.json" "$here/../results" "$here/frames-verdicts.mjs"
