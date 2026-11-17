#!/bin/zsh
# Builds the web page and the thin Mac wrapper into mac/build/CinematicsSpike.app (ad hoc signed, sandboxed).
# Same shape as spike-physics/mac: swiftc + a hand-assembled bundle, no Xcode project.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/web
app=$mac/build/CinematicsSpike.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && node scripts/copy-models.mjs && npx vite build); fi
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
swiftc -O -swift-version 6 -target arm64-apple-macos15.0 \
  -framework AppKit -framework WebKit -framework Network \
  $mac/Sources/*.swift -o $app/Contents/MacOS/CinematicsSpike
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/CinematicsSpike.entitlements $app
echo "built $app"
