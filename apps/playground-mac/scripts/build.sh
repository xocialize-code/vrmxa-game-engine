#!/bin/zsh
# Builds the playground's web app and its Mac wrapper into apps/playground-mac/build/VRMXGPlayground.app
# (ad hoc signed, sandboxed). No Xcode project: swiftc and a hand-assembled bundle, as the spikes do.
#   apps/playground-mac/scripts/build.sh          SKIP_WEB=1 to reuse apps/playground/dist
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/playground
app=$mac/build/VRMXGPlayground.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && npx vite build); fi
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
swiftc -O -swift-version 6 -target arm64-apple-macos15.0 \
  -framework AppKit -framework WebKit -framework Network \
  $mac/Sources/*.swift -o $app/Contents/MacOS/VRMXGPlayground
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/VRMXGPlayground.entitlements $app
echo "built $app"
