#!/bin/sh
# M4 W0 (AB-T-0572): the playground's ?mode=backends on both renderers in WKWebView, over the custom scheme and over
# loopback, each twice, in fresh web views (the acceptance harness: a copy of spike-cinematics/mac's app with the built
# playground as its web content). Writes results/backends-wkwebview.json and results/playground-wkwebview-*.png.
#   (cd apps/playground && npx vite build) && apps/playground/scripts/backends-wkwebview.sh
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
SPIKE_CASES="mode=backends&renderer=webgpu;mode=backends&renderer=webgl;mode=backends&renderer=webgpu&again=1;mode=backends&renderer=webgl&again=1" \
  SPIKE_ORIGINS=both "$app/Contents/MacOS/CinematicsSpike" > /dev/null
mkdir -p "$here/../results"
node -e '
const fs = require("fs"), [file, out] = process.argv.slice(1);
const rows = JSON.parse(fs.readFileSync(file, "utf8")), runs = [];
let bad = false;
for (const r of rows) {
  const { png, ...x } = r.result ?? {};
  if (png && !r.case.includes("again") && r.origin === "loopback") fs.writeFileSync(`${out}/playground-wkwebview-${x.backend}.png`, Buffer.from(png.split(",")[1], "base64"));
  runs.push({ ...x, origin: r.origin, case: r.case, ua: r.ua, errors: r.errors, timedOut: r.timedOut });
  console.log(r.origin, x.backend, "WebGPU backend", x.isWebGPUBackend, "distinct", x.distinct, "of", x.steps?.length, "still", x.stillHash, "errors", (r.errors ?? []).length);
  bad ||= !!(r.errors ?? []).length || r.timedOut || x.distinct !== x.steps?.length;
}
const same = (b, o) => new Set(runs.filter((r) => r.backend === b && (!o || r.origin === o)).map((r) => r.frames.join() + r.stillHash)).size === 1;
// WebGPU must repeat exactly on every load and both origins. WebGL is reported, not required: in WKWebView its frames
// come out as one of two images from load to load (seen at W0; outside W0, which leaves the WebGL path as it was)
const repeat = { webgpu: same("webgpu"), webgl: same("webgl"), webglVariants: new Set(runs.filter((r) => r.backend === "webgl").map((r) => r.stillHash)).size };
console.log("repeatable", JSON.stringify(repeat));
fs.writeFileSync(`${out}/backends-wkwebview.json`, JSON.stringify({ repeat, runs }, null, 1) + "\n");
process.exit(bad || !repeat.webgpu ? 1 : 0);
' "$tmp/wkwebview-shots.json" "$here/../results"
