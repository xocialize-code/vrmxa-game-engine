#!/bin/sh
# AB-A-0335: the first frame's pipeline compile in WKWebView, with and without the render host's warm-up
# (host.warmUp: renderer.compileAsync through a camera with every layer on). The playground's ?mode=warmup
# (apps/playground/src/warmup-check.js) builds the sample cafe with Mira and Hana on an offline host and times the warm-up
# and the first three frames. Each case runs in its own launch of the harness app over loopback only (AB-L-0346: the
# scheme origin's timer is coarse), and WebKit's compiled-shader caches are cleared before each launch (COLD=0 keeps
# them, for the cached numbers: run it with RUNS=2, and the summary takes each case's second run). The summary writes acceptance/results/m6-warmup-wkwebview.json.
#   (cd apps/playground && npx vite build) && acceptance/m6/warmup-wkwebview.sh
# HARNESS: a built CinematicsSpike.app elsewhere (a worktree has no build of its own). RUNS: repeats per case (2).
set -e
gpulock="$(cd "$(dirname "$0")" && pwd)/../gpu-lock.mjs"
node "$gpulock" held || exec node "$gpulock" run --who "$0" -- "$0" "$@"
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../.."
src="${HARNESS:-$root/spike-cinematics/mac/build/CinematicsSpike.app}"
dist="$root/apps/playground/dist"
app="$root/acceptance/build/WarmupHarness.app"
[ -d "$src" ] || { echo "build the harness app first: spike-cinematics/mac/scripts/build.sh (or set HARNESS)"; exit 1; }
[ -d "$dist" ] || { echo "build the playground first: (cd apps/playground && npx vite build)"; exit 1; }
rm -rf "$app"; mkdir -p "$root/acceptance/build"; cp -R "$src" "$app"
rm -rf "$app/Contents/Resources/web"; cp -R "$dist" "$app/Contents/Resources/web"
codesign --force --sign - --preserve-metadata=entitlements "$app" 2>/dev/null
id=com.xocialize.vrmxg-cinematics-spike
container="$HOME/Library/Containers/$id/Data"
tmp="$container/tmp"
out="$tmp/warmup-runs"; rm -rf "$out"; mkdir -p "$out"
# WebKit's compiled shaders: its GPU process keeps Metal's cache for each app that hosts web views, in the user cache
# folder as com.apple.WebKit.GPU+<app id> (found by what a run wrote); the web view's own caches go too
clear_caches() {
  ucache=$(getconf DARWIN_USER_CACHE_DIR)
  rm -rf "$ucache/com.apple.WebKit.GPU+$id" "$container/Library/Caches/WebKit" "$container/Library/WebKit" 2>/dev/null || true
}
runs=${RUNS:-2}
cases="${CASES:-renderer=webgpu&warm=0&post=0 renderer=webgpu&warm=1&post=0 renderer=webgpu&warm=0&post=1 renderer=webgpu&warm=1&post=1 renderer=webgl&warm=0&post=0 renderer=webgl&warm=1&post=0 renderer=webgl&warm=0&post=1 renderer=webgl&warm=1&post=1}"
n=0
for k in $(seq 1 "$runs"); do
  for c in $cases; do
    n=$((n + 1))
    [ "${COLD:-1}" = 1 ] && clear_caches
    rm -f "$tmp/wkwebview-shots.json"
    SPIKE_TIMEOUT="${SPIKE_TIMEOUT:-600}" SPIKE_CASES="mode=warmup&$c" SPIKE_ORIGINS=loopback "$app/Contents/MacOS/CinematicsSpike" > /dev/null
    cp "$tmp/wkwebview-shots.json" "$out/run-$n.json"
    echo "run $n: $c"
  done
done
node "$here/warmup-wkwebview-summary.mjs" "$out" "$root/acceptance/results" "${COLD:-1}"
