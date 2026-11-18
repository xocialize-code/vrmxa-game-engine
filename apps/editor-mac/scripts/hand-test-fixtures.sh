#!/bin/sh
# A fresh copy of the sample project where the sandboxed editor can open it: its container's temporary folder, which
# the shell's VRMXG_SHELL_PROJECT hook resolves relative paths against. The scenario builds built-cafe.vrmxs in it.
# Run before the scenario (the container exists after the app's first launch; this makes it if not).
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project"
cp -R "$here/../../../content/sample" "$tmp/project"
rm -f "$tmp/project/built-cafe.vrmxs"
echo "project in $tmp/project"
