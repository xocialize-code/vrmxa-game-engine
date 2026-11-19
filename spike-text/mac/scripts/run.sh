#!/bin/zsh
# Runs the wrapper (SPIKE_CASES / SPIKE_ORIGINS / SPIKE_TIMEOUT as in main.swift) and copies what it wrote out of the
# sandbox container into ../results (JSON) and ../results/shots (PNG). RUN=2 suffixes the JSON with -run2, for the
# second of two runs in a row.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
spike=${mac:h}
out=$HOME/Library/Containers/com.xocialize.vrmxg-text-spike/Data/tmp/text-spike
suffix=${RUN:+-run$RUN}
rm -rf $out
$mac/build/TextSpike.app/Contents/MacOS/TextSpike
mkdir -p $spike/results/shots
for f in $out/*.json(N); do cp $f $spike/results/${f:t:r}$suffix.json; done
[[ -z $suffix ]] && for f in $out/*.png(N); do cp $f $spike/results/shots/; done
echo "copied $(ls $out | wc -l | tr -d ' ') files into results/"
