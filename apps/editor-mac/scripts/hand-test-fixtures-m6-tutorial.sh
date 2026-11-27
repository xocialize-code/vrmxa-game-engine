#!/bin/sh
# HAND-TEST-M6-TUTORIAL (M6 W9, AB-T-0650): the tutorial "Coin Run" (docs/guide/tutorial.md) followed in the Mac editor.
# Empty folders in the sandboxed editor's container where the scenario makes the project (VRMXG_SHELL_NEW_PROJECT) and
# exports its build (VRMXG_SHELL_BUILD), one pair per backend, then the scenario's text editor in the background:
# acceptance/m6/tutorial.mjs files, which writes the page's behaviours.js into the new project when the scenario's
# step 5 writes its trigger screenshot. Relative paths resolve against the container's temporary folder.
#
#   apps/editor-mac/scripts/hand-test-fixtures-m6-tutorial.sh [webgpu|webgl]    (default webgpu)
set -e
backend="${1:-webgpu}"
case "$backend" in webgpu) suffix="" ;; webgl) suffix="-webgl" ;; *) echo "usage: $0 [webgpu|webgl]" >&2; exit 2 ;; esac
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
projects="$tmp/w9-projects$suffix"
builds="$tmp/w9-builds$suffix"
triggers="/private/tmp/vrmxg-w9-tutorial$suffix"
mkdir -p "$tmp"
rm -rf "$projects" "$builds" "$tmp/w9-settings$suffix.json" "$tmp/w9-cache$suffix" "$triggers"
mkdir -p "$projects" "$builds" "$triggers"
echo "projects in $projects, builds in $builds"
nohup node "$root/acceptance/m6/tutorial.mjs" files "$projects" "$triggers" > "$triggers/files.log" 2>&1 &
echo "the scenario's text editor: pid $!, log $triggers/files.log"
