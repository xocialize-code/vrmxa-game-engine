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

# the game's id, and the app's Info.plist from the template with the game's name, id and version (its game.json's
# "release", else 1.0; escaped for XML), made before
# anything of an earlier app is removed, so a title that can't go in stops here and leaves the earlier app whole
id=$(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1] + "/vrmxg-build.json", "utf8")); process.stdout.write(m.game.id)' $build)
[[ "$id" =~ '^[a-z0-9][a-z0-9-]*$' ]] || { echo "not a game id: $id"; exit 1; }
plist=$(node -e '
  const fs = require("fs"), m = JSON.parse(fs.readFileSync(process.argv[1] + "/vrmxg-build.json", "utf8"));
  const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const t = fs.readFileSync(process.argv[2], "utf8");
  process.stdout.write(t.replaceAll("__GAME_ID__", m.game.id).replaceAll("__GAME_TITLE__", xml(m.game.title)).replaceAll("__GAME_RELEASE__", xml(m.game.release ?? "1.0")));
' $build $mac/Config/Info.plist)
title=$(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1] + "/vrmxg-build.json", "utf8")); process.stdout.write(m.game.title)' $build)
app=$mac/build/$id.app

swift build -c release --package-path $mac --product VRMXGGame
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
cp "$(swift build -c release --package-path $mac --show-bin-path)/VRMXGGame" $app/Contents/MacOS/VRMXGGame
print -r -- "$plist" > $app/Contents/Info.plist
cp -R $build $app/Contents/Resources/web
codesign --force --sign - --entitlements $mac/Config/VRMXGGame.entitlements $app
echo "built $app ($title, com.xocialize.vrmxg-game.$id)"
