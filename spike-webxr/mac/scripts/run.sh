#!/bin/zsh
# Runs the built wrapper on some cases under the machine's GPU lock (acceptance/gpu-lock.mjs), launched with
# `open -W --env` (the coordinator's rule: AppProbe or open), and copies what it wrote out of its sandbox container into
# spike-webxr/results/<label>/, with the home folder scrubbed from the JSON.
#   mac/scripts/run.sh <label> '<cases>' [origins] [flags]
#   mac/scripts/run.sh probe 'index.html' both default,xr
set -euo pipefail
here=${0:A:h}
spike=${here:h:h}
repo=${spike:h}
label=$1 cases=$2 origins=${3:-both} flags=${4:-default,xr}
app=$spike/mac/build/WebXRSpike.app
tmp=$HOME/Library/Containers/com.xocialize.vrmxg-webxr-spike/Data/tmp
[[ -d $app ]] || { echo "build first: mac/scripts/build.sh"; exit 1; }
mkdir -p $tmp
rm -f $tmp/wkwebview-$label.json $tmp/*.png(N)
node $repo/acceptance/gpu-lock.mjs run --who spike-webxr-$label --wait 1800 -- \
  open -W -n --env SPIKE_CASES="$cases" --env SPIKE_ORIGINS=$origins --env SPIKE_FLAGS=$flags --env SPIKE_LABEL=$label \
    --env SPIKE_TIMEOUT=${SPIKE_TIMEOUT:-300} $app
out=$spike/results/$label
mkdir -p $out
node -e '
const fs = require("fs"), [src, dst, home] = process.argv.slice(1);
const scrub = (s) => s.split(home).join("~");
fs.writeFileSync(dst, scrub(fs.readFileSync(src, "utf8")));
' $tmp/wkwebview-$label.json $out/wkwebview.json $HOME
[[ -f $tmp/webkit-features.json ]] && cp $tmp/webkit-features.json $spike/results/webkit-features.json
for f in $tmp/*.png(N); do cp $f $out/; done
echo "results in $out"
