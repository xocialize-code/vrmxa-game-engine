#!/bin/sh
# The M0 checks in WKWebView: a copy of the cinematics spike's harness app (spike-cinematics/mac) with the built
# playground as its web content, re-signed ad hoc with the same sandbox entitlements; ?mode=acceptance in a fresh
# web view over the custom scheme and over loopback. Writes results/wkwebview-{scheme,loopback}.json and the
# canvas of the last frame (debug draw on) as .png.
set -e
here=$(cd "$(dirname "$0")" && pwd)
src="$here/../spike-cinematics/mac/build/CinematicsSpike.app"
dist="$here/../apps/playground/dist"
app="$here/build/AcceptanceHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh"; exit 1; }
[ -d "$dist" ] || { echo "build the playground first: (cd apps/playground && npx vite build)"; exit 1; }
rm -rf "$app"; mkdir -p "$here/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp"
rm -f "$tmp/wkwebview-shots.json" "$tmp"/mode_acceptance*.png
SPIKE_CASES="mode=acceptance" SPIKE_ORIGINS="${ORIGINS:-both}" "$app/Contents/MacOS/CinematicsSpike"
node -e '
const fs = require("fs"), [file, out, tmp] = process.argv.slice(1);
for (const r of JSON.parse(fs.readFileSync(file, "utf8"))) {
  const o = { runtime: `wkwebview-${r.origin}`, ua: r.ua, timerRes: r.timerRes, timedOut: r.timedOut, errors: r.errors, warnings: r.warnings, result: r.result };
  fs.writeFileSync(`${out}/wkwebview-${r.origin}.json`, JSON.stringify(o) + "\n");
  // The canvas readback (toDataURL) comes back blank here; the Mac wrapper window captures (AppProbe) are the visual record.
  const x = r.result ?? {};
  console.log(r.origin, "errors", (r.errors ?? []).length, "warnings", (r.warnings ?? []).length, r.timedOut ? "TIMED OUT" : "", "final", x.simulation?.final, "snapshot", x.simulation?.snapshot.rerunMatches, "rendered=headless", x.rendered?.sameAsHeadless, "debug", JSON.stringify(x.rendered?.debug));
  if ((r.errors ?? []).length) console.log(r.errors);
}' "$tmp/wkwebview-shots.json" "$here/results" "$tmp"
