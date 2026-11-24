#!/bin/zsh
# Builds the creator's web app and its Mac app on the shared shell into apps/creator-mac/build/VRMXGCreator.app
# (ad hoc signed, sandboxed). SwiftPM, no Xcode project.
# Swift Build (--build-system swiftbuild), so MLX's default.metallib is built for the shell's voice (AB-L-0319); the
# packages' resource bundles go in Contents/Resources, where Bundle lookups find them.
#   apps/creator-mac/scripts/build.sh          SKIP_WEB=1 to reuse apps/creator/dist
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/creator
app=$mac/build/VRMXGCreator.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && npx vite build); fi
swift build -c release --build-system swiftbuild --package-path $mac --product VRMXGCreator 2>&1 | { grep -v "Conflicting identity for mlx-swift" || true; }
bin=$mac/.build/out/Products/Release
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
cp $bin/VRMXGCreator $app/Contents/MacOS/VRMXGCreator
for b in $bin/*.bundle; do cp -R $b $app/Contents/Resources/; done
cp $mac/Config/Info.plist $app/Contents/Info.plist
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/VRMXGCreator.entitlements $app
echo "built $app"
