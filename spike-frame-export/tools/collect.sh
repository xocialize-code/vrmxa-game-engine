#!/bin/zsh
# Copies the wrapper's results out of its sandbox container into results/, keeps a few short sample
# videos in out/ (gitignored) and deletes the rest (ProRes 4444 at 4K60 is ~550 MB per 10 s).
set -euo pipefail
here=${0:A:h}; spike=${here:h}
c=~/Library/Containers/com.xocialize.vrmxg-frame-export-spike/Data/tmp/vrmxg-frame-export
mkdir -p $spike/results $spike/out
for f in $c/results/*.json; do cp $f $spike/results/wkwebview-${f:t}; done
for f in exp-h264-1080p30.mp4 exp-hevc-1080p30.mp4 exp-hevc-alpha-1080p30-alpha.mov exp-wc-avc-high-1080p30.mp4 alpha-prores4444.mov; do
  [[ -f $c/videos/$f ]] && cp $c/videos/$f $spike/out/
done
if [[ "${PURGE:-0}" == 1 ]]; then rm -rf $c/videos; fi
ls -la $spike/results $spike/out
