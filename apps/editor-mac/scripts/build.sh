#!/bin/zsh
# Builds the editor's web app and its Mac app on the shared shell into apps/editor-mac/build/VRMXGEditor.app
# (ad hoc signed, sandboxed). SwiftPM, no Xcode project.
#   apps/editor-mac/scripts/build.sh          SKIP_WEB=1 to reuse apps/editor/dist
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/editor
app=$mac/build/VRMXGEditor.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && npx vite build); fi
swift build -c release --package-path $mac --product VRMXGEditor
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
cp "$(swift build -c release --package-path $mac --show-bin-path)/VRMXGEditor" $app/Contents/MacOS/VRMXGEditor
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/VRMXGEditor.entitlements $app
echo "built $app"
