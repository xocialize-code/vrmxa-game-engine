#!/bin/zsh
# Builds the web app and the thin Mac wrapper into mac/build/PhysicsSpike.app (ad hoc signed, sandboxed).
# No Xcode project: swiftc + a hand-assembled bundle keeps the spike to a handful of files.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/web
app=$mac/build/PhysicsSpike.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && npm run build); fi
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
swiftc -O -swift-version 6 -target arm64-apple-macos15.0 \
  -framework AppKit -framework WebKit -framework Network \
  $mac/Sources/*.swift -o $app/Contents/MacOS/PhysicsSpike
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/PhysicsSpike.entitlements $app
echo "built $app"
