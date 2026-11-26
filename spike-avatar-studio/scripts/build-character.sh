#!/bin/sh
# Builds a character with nothing but the studio's command-line tool (vrmxa-core's `vrmxa`), from the specification's
# minimal fixture: body and face edits, a hair piece, a fitted top and trousers worn, the 30 starter clips, a persona
# card and details. Needs vrmxa-core, vrmxa-avatar-studio (its sample items) and VRMXA_Specification beside this repository.
#   spike-avatar-studio/scripts/build-character.sh [out-dir]      (default: spike-avatar-studio/out, git-ignored)
set -e
HERE=$(cd "$(dirname "$0")" && pwd); DEV=$(cd "$HERE/../../.." && pwd); OUT=${1:-$HERE/../out}
CORE=$DEV/vrmxa-core; F=$DEV/VRMXA_Specification/fixtures
I=$DEV/vrmxa-avatar-studio/app/public/models/samples/items; P=$DEV/vrmxa-avatar-studio/app/public/models/p7
mkdir -p "$OUT"; rm -f "$OUT"/c*.vrmxa "$OUT"/aiko.vrmxa
v() { (cd "$CORE" && node bin/vrmxa.mjs "$@" --force) | grep -v '^  warning' | head -1; }
cp "$F/characters/minimal.vrmxa" "$OUT/c0.vrmxa"
v apply-edits "$OUT/c0.vrmxa" "$HERE/edits.json" "$OUT/c1.vrmxa"
v closet "$OUT/c1.vrmxa" add "$F/items/hair.vrmxw" "$OUT/c2.vrmxa"
v closet "$OUT/c2.vrmxa" hair "Short hair" "$OUT/c3.vrmxa"
v closet "$OUT/c3.vrmxa" add "$I/fitted-top.vrmxw" "$OUT/c4.vrmxa"
v closet "$OUT/c4.vrmxa" add "$I/fitted-trousers.vrmxw" "$OUT/c5.vrmxa"
v closet "$OUT/c5.vrmxa" put-on "Fitted top" "$OUT/c6.vrmxa"
v closet "$OUT/c6.vrmxa" put-on "Fitted trousers" "$OUT/c7.vrmxa"
v motion "$OUT/c7.vrmxa" starter "$OUT/c8.vrmxa"
v persona "$OUT/c8.vrmxa" import "$P/mira-card.json" "$OUT/c9.vrmxa"
v details "$OUT/c9.vrmxa" set name="Aiko (spike)" version=1 authors="VRMXG spike" "$OUT/aiko.vrmxa"
(cd "$CORE" && node bin/vrmxa.mjs validate "$OUT/aiko.vrmxa")
