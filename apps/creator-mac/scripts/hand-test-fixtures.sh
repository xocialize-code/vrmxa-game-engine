#!/bin/sh
# A fresh copy of the sample project where the sandboxed creator can open it, and the files the hand test opens from
# outside it: the container's temporary folder, which the shell's VRMXG_SHELL_PROJECT / _OPEN / _SAVE hooks resolve
# relative paths against. Run before the scenario (the container exists after the app's first launch; this makes it if
# not). Prints the inbox folder, which the scenario's `open` step reads as ${fixtures}.
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp="$HOME/Library/Containers/com.xocialize.vrmxg-creator/Data/tmp"
mkdir -p "$tmp"
rm -rf "$tmp/project" "$tmp/inbox" "$tmp/exports" "$tmp/vrmxg-export"
cp -R "$here/../../../content/sample" "$tmp/project"
mkdir -p "$tmp/inbox" "$tmp/exports"
cp "$here/../docs/hand-test/fixtures/first-light.fountain" "$tmp/inbox/first-light.fountain"
cp "$here/../../../content/sample/characters/mira.vrmxa" "$tmp/inbox/mira-guest.vrmxa"   # a character to cast, from outside the project
echo "project in $tmp/project; inbox $tmp/inbox"
