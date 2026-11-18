#!/bin/sh
# Puts the hand test's files where the sandboxed app can read them: its container's temporary folder, which the
# shell's VRMXG_SHELL_OPEN / VRMXG_SHELL_SAVE hooks resolve relative paths against. Run once before the scenario
# (the container exists after the app's first launch).
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-playground/Data/tmp"
mkdir -p "$tmp"
cp "$here/../../../content/sample/cafe.vrmxs" "$tmp/open.vrmxs"
rm -f "$tmp/saved.vrmxs"
echo "fixtures in $tmp"
