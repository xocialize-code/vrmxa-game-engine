#!/bin/zsh
# Builds the spike page and the Mac wrapper into mac/build/CameraSpike.app (ad hoc signed, sandboxed, camera entitlement).
# Same shape as spike-cinematics/mac: swiftc and a hand-assembled bundle, no Xcode project.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/web
app=$mac/build/CameraSpike.app
if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && node scripts/fetch-models.mjs && npx vite build); fi
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
swiftc -O -swift-version 6 -target arm64-apple-macos15.0 \
  -framework AppKit -framework WebKit -framework Network -framework AVFoundation -framework Vision -framework CoreVideo \
  $mac/Sources/*.swift -o $app/Contents/MacOS/CameraSpike
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/CameraSpike.entitlements $app
echo "built $app"
