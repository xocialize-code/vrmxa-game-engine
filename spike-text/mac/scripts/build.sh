#!/bin/zsh
# Builds the web page and the thin Mac wrapper into mac/build/TextSpike.app (ad hoc signed, sandboxed), as
# spike-physics does: swiftc + a hand-assembled bundle, no Xcode project.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/web
app=$mac/build/TextSpike.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && ../../node_modules/.bin/vite build); fi
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
swiftc -O -swift-version 6 -target arm64-apple-macos15.0 \
  -framework AppKit -framework WebKit -framework Network \
  $mac/Sources/*.swift -o $app/Contents/MacOS/TextSpike
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/TextSpike.entitlements $app
echo "built $app"
