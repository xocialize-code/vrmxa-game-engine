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
# The voice (AB-T-0614): Kokoro where the sandboxed app can read it, for VRMXG_SHELL_MODELS=models (a hand test can't
# answer voice.chooseModels's folder panel). Copied once from the machine's model folder (VRMXG_MODELS; the Mac Studio's
# by default); without it there, the scenarios that voice a line wait at that panel.
models="${VRMXG_MODELS:-/Volumes/DEV_VOL1/Models}"
for m in models--mlx-community--Kokoro-82M-bf16 models--beshkenadze--kitten-tts-g2p; do
  if [ -d "$models/$m" ] && [ ! -d "$tmp/models/$m" ]; then mkdir -p "$tmp/models"; cp -R "$models/$m" "$tmp/models/$m"; fi
done
[ -d "$tmp/models/models--mlx-community--Kokoro-82M-bf16" ] || echo "no Kokoro in $models: set VRMXG_MODELS to the folder that holds the voice models"
echo "project in $tmp/project; inbox $tmp/inbox; voice models in $tmp/models"
