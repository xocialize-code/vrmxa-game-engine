#!/bin/sh
# Fetches Noto Sans JP (variable, wght 100–900, TrueType outlines) from google/fonts, OFL 1.1 (OFL.txt here).
# Fetched 2026-11-19: 9,589,900 bytes, sha256 c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f.
set -e
cd "$(dirname "$0")"
curl -sSL -o NotoSansJP-wght.ttf 'https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf'
curl -sSL -o OFL.txt 'https://github.com/google/fonts/raw/main/ofl/notosansjp/OFL.txt'
shasum -a 256 NotoSansJP-wght.ttf
