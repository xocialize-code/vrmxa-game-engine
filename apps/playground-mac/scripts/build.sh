#!/bin/zsh
# Builds the playground's web app and its Mac app on the shared shell into
# apps/playground-mac/build/VRMXGPlayground.app (ad hoc signed, sandboxed). SwiftPM, no Xcode project.
# Swift Build (--build-system swiftbuild), so MLX's default.metallib is built (AB-L-0319); the packages' resource
# bundles (MLX's metallib, Nemotron's, the tokenizer hub's) go in Contents/Resources, where Bundle lookups find them.
#   apps/playground-mac/scripts/build.sh          SKIP_WEB=1 to reuse apps/playground/dist
set -euo pipefail
here=${0:A:h}
mac=${here:h}
web=${mac:h}/playground
app=$mac/build/VRMXGPlayground.app

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $web && npx vite build); fi
swift build -c release --build-system swiftbuild --package-path $mac --product VRMXGPlayground 2>&1 | { grep -v "Conflicting identity for mlx-swift" || true; }
bin=$mac/.build/out/Products/Release
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
cp $bin/VRMXGPlayground $app/Contents/MacOS/VRMXGPlayground
for b in $bin/*.bundle; do cp -R $b $app/Contents/Resources/; done
cp $mac/Config/Info.plist $app/Contents/Info.plist
# the third-party notices Help › Third-Party Notices opens (shell 0.15.0, M6 W7): every package's licence text and fdlibm's
node ${mac:h:h}/scripts/check-notices.mjs playground
cp -R $web/dist $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/VRMXGPlayground.entitlements $app
echo "built $app"
