#!/bin/zsh
# Runs the WKWebView pass and copies its output out of the sandbox container into ../results/wkwebview/
# and ../results/wkwebview.json. Pass-through env: SPIKE_CASES, SPIKE_ORIGINS, SPIKE_TIMEOUT.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
res=${mac:h}/results
tmp=~/Library/Containers/com.xocialize.vrmxg-webgpu-mtoon-spike/Data/tmp
rm -f $tmp/*.png(N) $tmp/wkwebview.json(N)
$mac/build/WebGPUMToonSpike.app/Contents/MacOS/WebGPUMToonSpike
mkdir -p $res/wkwebview
cp $tmp/*.png(N) $res/wkwebview/
cp $tmp/wkwebview.json $res/wkwebview.json
echo "copied to $res/wkwebview.json and $res/wkwebview/"
