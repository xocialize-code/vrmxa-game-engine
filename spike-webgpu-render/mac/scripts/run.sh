#!/bin/zsh
# Runs the wrapper (SPIKE_CASES / SPIKE_ORIGINS / SPIKE_TIMEOUT as in main.swift) and copies what it wrote out of the
# sandbox container into ../results and ../shots.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
spike=${mac:h}
out=$HOME/Library/Containers/com.xocialize.vrmxg-webgpu-render-spike/Data/tmp/webgpu-spike
rm -rf $out
$mac/build/WebGPUSpike.app/Contents/MacOS/WebGPUSpike
for f in $out/*.json(N); do cp $f $spike/results/; done
for f in $out/*.png(N); do cp $f $spike/shots/; done
echo "copied $(ls $out | wc -l | tr -d ' ') files into results/ and shots/"
