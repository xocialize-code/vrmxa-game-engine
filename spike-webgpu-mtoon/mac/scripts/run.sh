#!/bin/zsh
# Runs the WKWebView pass and copies its output out of the sandbox container into ../results/wkwebview/
# and ../results/${SPIKE_OUT:-wkwebview}.json. Pass-through env: SPIKE_CASES, SPIKE_ORIGINS, SPIKE_TIMEOUT.
# SPIKE_OUT=wkwebview-vroid with --vroid-sample builds SPIKE_CASES from ../results/vroid-sample.json.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
res=${mac:h}/results
tmp=~/Library/Containers/com.xocialize.vrmxg-webgpu-mtoon-spike/Data/tmp
out=${SPIKE_OUT:-wkwebview}
if [[ "${1:-}" == --vroid-sample ]]; then
  export SPIKE_CASES=$(node -e "const {sample}=require('$res/vroid-sample.json');console.log(sample.flatMap(({id})=>['body','face','body&hide=transparent'].flatMap(v=>['webgl','webgpu'].map(r=>'renderer='+r+'&model=vroid-sample/'+id+'&view='+v.replace('&',\"&features=none&\")+(v.includes('&')?'':'&features=none')))).join(';'))")
fi
rm -f $tmp/*.png(N) $tmp/wkwebview.json(N)
$mac/build/WebGPUMToonSpike.app/Contents/MacOS/WebGPUMToonSpike
mkdir -p $res/wkwebview
cp $tmp/*.png(N) $res/wkwebview/
cp $tmp/wkwebview.json $res/$out.json
echo "copied to $res/$out.json and $res/wkwebview/"
