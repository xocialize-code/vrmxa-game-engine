#!/bin/zsh
# Builds the creator's web app and its Mac app on the shared shell into apps/creator-mac/build/VRMXGCreator.app
# (ad hoc signed, sandboxed). SwiftPM, no Xcode project.
#   apps/creator-mac/scripts/build.sh          SKIP_WEB=1 to reuse apps/creator/dist
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/creator
app=$mac/build/VRMXGCreator.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && npx vite build); fi
swift build -c release --package-path $mac --product VRMXGCreator
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
cp "$(swift build -c release --package-path $mac --show-bin-path)/VRMXGCreator" $app/Contents/MacOS/VRMXGCreator
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/VRMXGCreator.entitlements $app
echo "built $app"
