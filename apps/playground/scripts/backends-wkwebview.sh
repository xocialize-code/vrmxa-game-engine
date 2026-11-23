#!/bin/sh
# M4 W0 (AB-T-0572): the playground's ?mode=backends on both renderers in WKWebView, over the custom scheme and over
# loopback, LOADS times each (16 by default), every load in a fresh web view (the acceptance harness: a copy of
# spike-cinematics/mac's app with the built playground as its web content). Writes results/backends-wkwebview.json
# (with the two backends' stills compared) and results/playground-wkwebview-*.png. Both backends must repeat exactly on
# every load and both origins (AB-T-0587: WebGL's two image sets were the check drawing at the page's layout size).
#   (cd apps/playground && npx vite build) && LOADS=16 apps/playground/scripts/backends-wkwebview.sh
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
cases=""; i=0
while [ $i -lt "${LOADS:-16}" ]; do
  again=""; [ $i -eq 0 ] || again="&again=$i"
  for r in webgpu webgl; do cases="$cases${cases:+;}mode=backends&renderer=$r$again"; done
  i=$((i + 1))
done
SPIKE_CASES="$cases" SPIKE_ORIGINS=both SPIKE_TIMEOUT=300 "$app/Contents/MacOS/CinematicsSpike" > /dev/null
mkdir -p "$here/../results"
node -e '
const fs = require("fs"), [file, out, want] = process.argv.slice(1);
const rows = JSON.parse(fs.readFileSync(file, "utf8")), runs = [];
let bad = false;
for (const r of rows) {
  const { png, ...x } = r.result ?? {};
  if (png && !r.case.includes("again") && r.origin === "loopback") fs.writeFileSync(`${out}/playground-wkwebview-${x.backend}.png`, Buffer.from(png.split(",")[1], "base64"));
  runs.push({ ...x, origin: r.origin, case: r.case, ua: r.ua, errors: r.errors, timedOut: r.timedOut });
  console.log(r.origin, x.backend, "WebGPU backend", x.isWebGPUBackend, "distinct", x.distinct, "of", x.steps?.length, "still", x.stillHash, "errors", (r.errors ?? []).length);
  bad ||= !!(r.errors ?? []).length || r.timedOut || x.distinct !== x.steps?.length;
}
const same = (b, o) => new Set(runs.filter((r) => r.backend === b && (!o || r.origin === o)).map((r) => [r.stillHash, ...r.frames, r.glStill ?? "", ...(r.glFrames ?? [])].join())).size === 1;
// both backends must repeat exactly on every load and both origins; on WebGL the gl.readPixels hashes (glFrames, glStill)
// must repeat with the toDataURL ones
const variants = (b) => new Set(runs.filter((r) => r.backend === b).map((r) => [r.stillHash, ...r.frames, r.glStill ?? "", ...(r.glFrames ?? [])].join())).size;
const loads = (b, o) => runs.filter((r) => r.backend === b && r.origin === o).length;
const repeat = { webgpu: same("webgpu"), webgl: same("webgl"), webgpuVariants: variants("webgpu"), webglVariants: variants("webgl"),
  loads: { webgpu: { scheme: loads("webgpu", "scheme"), loopback: loads("webgpu", "loopback") }, webgl: { scheme: loads("webgl", "scheme"), loopback: loads("webgl", "loopback") } } };
console.log("repeatable", JSON.stringify(repeat));
fs.writeFileSync(`${out}/backends-wkwebview.json`, JSON.stringify({ repeat, runs }, null, 1) + "\n");
// every backend and origin must have run all LOADS loads: a load that never reported could hide a second image
const short = Object.values(repeat.loads).some((o) => Object.values(o).some((n) => n < +want));
if (short) console.log("fewer than", want, "loads ran for a backend and origin:", JSON.stringify(repeat.loads));
process.exitCode = bad || short || !repeat.webgpu || !repeat.webgl ? 1 : 0;
' "$tmp/wkwebview-shots.json" "$here/../results" "${LOADS:-16}"
# the two backends' loopback stills, compared as backends-chromium.mjs compares Chromium's
diff=$(node "$here/compare-stills.mjs" "$here/../results/playground-wkwebview-webgl.png" "$here/../results/playground-wkwebview-webgpu.png")
echo "WebGL vs WebGPU stills: $diff"
node -e 'const fs = require("fs"), f = process.argv[1], o = JSON.parse(fs.readFileSync(f, "utf8")); o.diff = JSON.parse(process.argv[2]); fs.writeFileSync(f, JSON.stringify(o, null, 1) + "\n");' "$here/../results/backends-wkwebview.json" "$diff"
