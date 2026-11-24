#!/bin/sh
# M4 W10 (AB-T-0582), M4 check 7: deliveries from the creator's render queue in the Mac app (apps/creator-mac: WKWebView
# on the shell, the loopback origin unless ORIGIN=scheme), through the shell's AVAssetWriter. For each preset in PRESETS
# the app opens a fresh copy of the sample project, opens SHORT, and renders the preset REPEAT times (?deliver=…, the
# creator's delivermode.js): two exports of the same short must agree frame for frame, and so must their sound, stills,
# thumbnails and turntables. Writes results/m4-delivery/<preset>-<backend>[-check]-<origin>.json ($HOME paths cut to
# ~; when two films differ, the frames that differ, from the shell's per-frame hashes) and prints each run's timings and
# the comparison. Each preset's per-frame hashes and manifests are kept in the container's tmp/delivery-keep/.
#   apps/creator-mac/scripts/build.sh && acceptance/m4/delivery-wkwebview.sh
#   PRESETS="h264-4k24" SECONDS_=60 REPEAT=1 EXTRAS=none acceptance/m4/delivery-wkwebview.sh   # the one-minute 4K timing
#   RENDERER=webgl (the view and its exports on WebGL); BACKEND=webgl (the export alone on WebGL); TAG=x
#   CHECK=redraw (always) or CHECK=off (never); left out, the preset decides: a delivery on WebGPU checks (AB-D-0280)
#   OUT=<folder>: where the result files go (default results/m4-delivery); FILES=1: also check each delivery's files
#   from outside the app (acceptance/m4/delivery-files.mjs, needs ffprobe and ffmpeg) into <OUT>/files.json
set -e
# one GPU runner at a time on this machine: re-run under acceptance/gpu-lock.mjs (acceptance/README.md)
gpulock="$(cd "$(dirname "$0")" && pwd)/../gpu-lock.mjs"
node "$gpulock" held || exec node "$gpulock" run --who "$0" -- "$0" "$@"
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
app="$root/apps/creator-mac/build/VRMXGCreator.app"
[ -d "$app" ] || { echo "build the creator first: apps/creator-mac/scripts/build.sh"; exit 1; }
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-creator/Data/tmp"
out="${OUT:-$root/acceptance/results/m4-delivery}"   # OUT: another results folder (M4 W13 keeps its runs apart from W10's)
mkdir -p "$tmp" "$out"
PRESETS="${PRESETS:-h264-1080p24 hevc-1080p24 prores-1080p24 h264-4k24 hevc-4k24 prores-4k24}"
renderer="${RENDERER:-webgpu}"
for preset in $PRESETS; do
  rm -rf "$tmp/delivery-project" "$tmp/delivery-exports"
  cp -R "$root/content/sample" "$tmp/delivery-project"
  mkdir -p "$tmp/delivery-exports"
  q="deliver=$preset&renderer=$renderer&repeat=${REPEAT:-2}&short=${SHORT:-cafe-order}"
  [ -n "$SECONDS_" ] && q="$q&seconds=$SECONDS_"
  [ -n "$EXTRAS" ] && q="$q&extras=$EXTRAS"
  [ -n "$BACKEND" ] && q="$q&backend=$BACKEND"
  [ -n "$CHECK" ] && q="$q&check=$CHECK"
  origin="${ORIGIN:-loopback}"
  envs="--env VRMXG_SHELL_PROJECT=delivery-project --env VRMXG_SHELL_EXPORT=delivery-exports/ --env VRMXG_QUERY=$q"
  [ "$origin" = scheme ] && envs="$envs --env VRMXG_ORIGIN=scheme"
  echo "== $preset ($renderer, $origin): $q"
  started=$(date +%s)
  # shellcheck disable=SC2086
  open -n $envs "$app"
  run=""
  while [ -z "$run" ]; do
    run=$(ls "$tmp/delivery-project/deliveries/"run-*.json 2>/dev/null | head -1 || true)
    [ -n "$run" ] && break
    if [ $(( $(date +%s) - started )) -gt "${TIMEOUT:-1800}" ]; then echo "timed out"; break; fi
    sleep 2
  done
  # stop this build's instance only: another session's creator (same bundle id, same container) may be open
  pkill -f "$app/Contents/MacOS/VRMXGCreator" 2>/dev/null || true
  sleep 2
  [ -n "$run" ] || continue
  name=$(basename "$run" .json | sed 's/^run-//')
  name="$name${TAG:+-$TAG}" # TAG: runs of the same preset kept apart (a timing run, a re-run)
  keep="$tmp/delivery-keep/$name-$origin"; rm -rf "$keep"; mkdir -p "$keep"
  (cd "$tmp/delivery-project/deliveries" && find . -name '*.json' | cpio -pdm "$keep" 2>/dev/null) || true
  (cd "$tmp/delivery-exports" && find . -name '*.json' | cpio -pdm "$keep/exports" 2>/dev/null) || true
  node -e '
const fs = require("fs"), path = require("path"), [file, out, home, origin, keep] = process.argv.slice(1);
const text = fs.readFileSync(file, "utf8").split(home).join("~");
const r = JSON.parse(text);
r.origin = origin;
// the films frame by frame (the shell keeps each frame hash beside the file under automation)
const framesOf = (j) => { const p = j.result?.path ?? j.result?.began?.path; if (!p) return null; const n = path.basename(p) + ".frames.json"; const hit = [...fs.readdirSync(keep, { recursive: true })].map(String).find((f) => path.basename(f) === n); return hit ? JSON.parse(fs.readFileSync(path.join(keep, hit), "utf8")).frames : null; };
const fr = r.jobs.map(framesOf);
if (fr.length > 1 && fr.every(Boolean)) r.same.frameDiffs = fr.slice(1).map((f) => f.map((h, i) => (h === fr[0][i] ? -1 : i)).filter((i) => i >= 0));
fs.writeFileSync(out, JSON.stringify(r, null, 1) + "\n");
for (const j of r.jobs) {
  const x = j.result ?? {}, d = x.delivery;
  console.log(`  ${j.id} ${j.state}${j.error ? ` (${j.error})` : ""}: ${x.frames ?? "?"} frames ${x.name ?? ""} film ${((x.ms ?? 0) / 1000).toFixed(1)} s frames ${x.hashesDigest} audio ${x.audioHash ?? "-"}${d ? ` · ${d.stills} stills ${d.thumbnails} thumbs ${d.turntables} turntables · total ${(d.ms.total / 1000).toFixed(1)} s (stills ${(d.ms.stills / 1000).toFixed(1)}, turntables ${(d.ms.turntables / 1000).toFixed(1)})` : ""}${x.check ? ` · check ${x.check.frames} frames, ${x.check.odd.length} odd` : ""}`);
}
console.log("  same:", JSON.stringify(r.same));
' "$run" "$out/$name-$origin.json" "$HOME" "$origin" "$keep"
  # FILES=1 (M4 W13): the delivered files read from outside the app (ffprobe: frames, sound at lag 0, the .srt, stills,
  # thumbnails, turntables), before the next preset clears the project: $out/files.json
  if [ -n "$FILES" ]; then node "$here/delivery-files.mjs" "$tmp/delivery-project/deliveries" --sequence "content/sample/sequences/${SHORT:-cafe-order}.vrmxs" --out "$out/files.json" --append || true; fi
done
