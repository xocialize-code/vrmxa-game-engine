#!/bin/sh
# The inspector scenario's own copy of the sample project (M5 W4, HAND-TEST-M5-INSPECTOR): project-inspector in the
# editor's container's temporary folder, where the shell's VRMXG_SHELL_PROJECT hook opens it. Its own folder, so another
# session's fixtures (hand-test-fixtures.sh resets "project") never change it under a run.
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project-inspector"
cp -R "$here/../../../content/sample" "$tmp/project-inspector"
rm -f "$tmp/project-inspector/inspector.vrmxs"
echo "project in $tmp/project-inspector"
