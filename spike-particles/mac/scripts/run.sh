#!/bin/zsh
# Runs the wrapper headless and copies what it wrote out of the sandbox container.
#   mac/scripts/run.sh suite     -> results/wkwebview-scheme.json, results/wkwebview-loopback.json
#   mac/scripts/run.sh shots     -> shots/*.png
set -uo pipefail
here=${0:A:h}; root=${here:h:h}
app=$root/mac/build/ParticlesSpike.app/Contents/MacOS/ParticlesSpike
box=~/Library/Containers/com.xocialize.vrmxg-particles-spike/Data/tmp/spike-out
rm -rf $box
case ${1:-suite} in
  suite) SPIKE_AUTORUN=1 timeout ${SPIKE_TIMEOUT:-900} $app | grep -v '^\[results' ; cp $box/*.json $root/results/ ;;
  shots) SPIKE_SHOTS=1 timeout ${SPIKE_TIMEOUT:-300} $app ; mkdir -p $root/shots; cp $box/*.png $root/shots/ ;;
esac
ls -la $box
