#!/bin/zsh
# Builds a game's Mac app on the shared shell (M5 W1, AB-D-0286): one game build's folder as the app's web content,
# the bundle named after the game (its manifest's title and id), ad hoc signed and sandboxed. SwiftPM, no Xcode project.
#   apps/game-mac/scripts/build.sh                    the game app's test game, exported here first (build/game)
#   apps/game-mac/scripts/build.sh <build folder>     a build vrmxg-export or the editor's Export Game wrote
#   apps/game-mac/scripts/build.sh --project <folder> a project with a game.json (content/sample), exported here first
# SKIP_WEB=1 reuses apps/game/dist (the runtime a build made here gets). The app is apps/game-mac/build/<game id>.app.
set -euo pipefail
here=${0:A:h}
mac=${here:h}
root=${mac:h:h}

if [[ "${SKIP_WEB:-0}" != 1 ]]; then (cd $root && npm run build -w @vrmxg/game-app > /dev/null); fi
mkdir -p $mac/build
if [[ "${1:-}" == "--project" ]]; then
  build=$mac/build/game
  node $root/engine/packages/bundle/src/cli.js "$2" $build --runtime $root/apps/game/dist > /dev/null
elif [[ -n "${1:-}" ]]; then
  build=${1:A}
else
  build=$mac/build/game
  node $root/apps/game/scripts/test-game.mjs $build > /dev/null
fi
node $root/engine/packages/bundle/src/cli.js --verify $build > /dev/null || { echo "$build is not a whole game build"; exit 1; }

# the game's name and id, from its manifest
id=$(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1] + "/vrmxg-build.json", "utf8")); process.stdout.write(m.game.id)' $build)
title=$(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1] + "/vrmxg-build.json", "utf8")); process.stdout.write(m.game.title.replace(/[<>&]/g, ""))' $build)
version=$(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1] + "/vrmxg-build.json", "utf8")); process.stdout.write(m.runtime.version)' $build)
app=$mac/build/$id.app

swift build -c release --package-path $mac --product VRMXGGame
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
cp "$(swift build -c release --package-path $mac --show-bin-path)/VRMXGGame" $app/Contents/MacOS/VRMXGGame
sed -e "s|__GAME_ID__|$id|g" -e "s|__GAME_TITLE__|$title|g" -e "s|__RUNTIME_VERSION__|$version|g" $mac/Config/Info.plist > $app/Contents/Info.plist
cp -R $build $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/VRMXGGame.entitlements $app
echo "built $app ($title, com.xocialize.vrmxg-game.$id)"
