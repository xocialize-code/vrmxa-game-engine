#!/bin/zsh
# Builds the web page (STOCK_STUB=1: the stock three-vrm/nodes can't be bundled on r187) and the thin Mac
# wrapper copied from spike-physics/mac into mac/build/WebGPUMToonSpike.app (ad hoc signed, sandboxed).
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/web
app=$mac/build/WebGPUMToonSpike.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && node scripts/copy-models.mjs && node scripts/patch-three-vrm.mjs && STOCK_STUB=1 npx vite build); fi
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
swiftc -O -swift-version 6 -target arm64-apple-macos15.0 \
  -framework AppKit -framework WebKit -framework Network \
  $mac/Sources/*.swift -o $app/Contents/MacOS/WebGPUMToonSpike
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/WebGPUMToonSpike.entitlements $app
echo "built $app"
