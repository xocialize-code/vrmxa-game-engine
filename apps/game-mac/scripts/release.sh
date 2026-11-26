#!/bin/zsh
# A game's Mac app, signed for other Macs (M6 W7, AB-T-0648): the operator's steps, from an app scripts/build.sh made to
# a zip they can hand out. RELEASE.md beside this folder says what each step needs. Nothing here runs unless the
# operator runs it: the identity and the notary profile are theirs.
#
#   apps/game-mac/scripts/release.sh --check <app>
#       the checks alone, on the app as it is (an ad hoc build from build.sh): the hardened runtime is on, the
#       entitlements are the sandbox's and the loopback server's only, nothing outside the system is linked, and
#       codesign --verify --deep --strict passes
#   apps/game-mac/scripts/release.sh --identity "Developer ID Application: <name> (<team>)" <app>
#       sign with that identity, the hardened runtime and a secure timestamp, then the checks
#   apps/game-mac/scripts/release.sh --identity "…" --notarize --keychain-profile <profile> <app>
#       and then: zip it, send it to Apple's notary service and wait (xcrun notarytool), staple the ticket, check
#       Gatekeeper accepts it (spctl), and zip the stapled app as <app>-<version>.zip beside it
set -euo pipefail
here=${0:A:h}
mac=${here:h}
entitlements=$mac/Config/VRMXGGame.entitlements

identity="" profile="" notarize=0 check=0 app=""
while (( $# )); do
  case $1 in
    --identity) identity=$2; shift 2 ;;
    --keychain-profile) profile=$2; shift 2 ;;
    --notarize) notarize=1; shift ;;
    --check) check=1; shift ;;
    -h|--help) sed -n '2,17p' $0; exit 0 ;;
    *) app=${1:A}; shift ;;
  esac
done
[[ -n "$app" && -d "$app/Contents/MacOS" ]] || { echo "release.sh: name an app scripts/build.sh made (apps/game-mac/build/<game id>.app)"; exit 2; }
if (( check )); then
  [[ -z "$identity" && $notarize == 0 ]] || { echo "release.sh: --check signs nothing; leave out --identity and --notarize"; exit 2; }
else
  [[ -n "$identity" ]] || { echo "release.sh: --identity \"Developer ID Application: …\" (security find-identity -v -p codesigning lists yours), or --check"; exit 2; }
  [[ "$identity" != "-" ]] || { echo "release.sh: '-' is an ad hoc signature, which build.sh already makes; a Developer ID is needed for other Macs"; exit 2; }
  (( ! notarize )) || [[ -n "$profile" ]] || { echo "release.sh: --notarize needs --keychain-profile <profile> (xcrun notarytool store-credentials makes one)"; exit 2; }
fi

if (( ! check )); then
  xattr -cr $app
  # one executable, no frameworks or helpers inside: signing the bundle signs it, and seals the web content as resources
  codesign --force --sign "$identity" --options runtime --timestamp --entitlements $entitlements $app
fi

# ---- the checks (also the acceptance's, on an ad hoc build)
fail() { echo "release.sh: $*"; exit 1; }
codesign --verify --deep --strict --verbose=2 $app 2>&1 | sed 's/^/  /'
info=$(codesign -d --verbose=4 $app 2>&1)
print -r -- "$info" | grep -Eq '^CodeDirectory .*flags=0x[0-9a-f]*\(.*runtime.*\)' || fail "the hardened runtime is not on (codesign -d shows no runtime flag)"
ents=$(codesign -d --entitlements :- $app 2>/dev/null | plutil -convert json -o - - 2>/dev/null || echo '{}')
want='{"com.apple.security.app-sandbox":true,"com.apple.security.network.client":true,"com.apple.security.network.server":true}'
[[ "$(print -r -- $ents | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{const o=JSON.parse(s||"{}");process.stdout.write(JSON.stringify(Object.fromEntries(Object.keys(o).sort().map((k)=>[k,o[k]]))))})')" == "$want" ]] \
  || fail "the entitlements are not the sandbox's and the loopback server's only: $ents"
exe=$app/Contents/MacOS/VRMXGGame
others=$(otool -L $exe | tail -n +2 | awk '{print $1}' | grep -Ev '^(/usr/lib/|/System/Library/)' || true)
[[ -z "$others" ]] || fail "links libraries outside the system, which library validation refuses unless they are signed by the same team: $others"
[[ -f $app/Contents/Resources/web/THIRD-PARTY-LICENCES.txt ]] || fail "the game's build carries no THIRD-PARTY-LICENCES.txt"
team=$(print -r -- "$info" | sed -n 's/^TeamIdentifier=//p' | grep -v "^not set$" || true)
echo "release.sh: $app is signed ($(print -r -- "$info" | sed -n 's/^Signature=//p' | head -1)${team:+, team $team}), hardened runtime on, sandboxed, system libraries only"
(( notarize )) || exit 0

# ---- notarise, staple, check, package
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' $app/Contents/Info.plist)
zip=${app:r}-notarize.zip
ditto -c -k --keepParent $app $zip
xcrun notarytool submit $zip --keychain-profile "$profile" --wait
rm -f $zip
xcrun stapler staple $app
xcrun stapler validate $app
spctl --assess --type execute --verbose=4 $app
out=${app:r}-$version.zip
ditto -c -k --keepParent $app $out
echo "release.sh: notarised and stapled; hand out $out"
