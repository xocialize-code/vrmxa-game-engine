#!/bin/sh
# Runs every repro in headless Chromium (web/scripts/chromium.mjs) on three r187 and, when THREE_DEV points at a
# three.js checkout, on its dev branch too. Writes results/<repro>-<build>.json. Needs `node serve.mjs` running
# (with the same THREE_DEV) on port 5242.
#   THREE_DEV=~/src/three.js sh repros/run.sh
cd "$(dirname "$0")" || exit 1
mkdir -p results
builds="r187"; [ -n "$THREE_DEV" ] && builds="r187 dev"
for page in 1-dof-first-frame 2-mrtnode-no-mrt 3-offline-nodeframe; do
  for b in $builds; do
    SPIKE_TIMEOUT=120 SPIKE_BASE="http://127.0.0.1:5242/spike-webgpu-render/repros/$page.html" \
      node ../web/scripts/chromium.mjs "three=$b" > "results/$page-$b.raw"
    # chromium.mjs prints at most 6000 characters and puts the page's console last: keep the result, drop "console"
    # (the page's own "log" field carries its errors)
    node -e '
      const fs = require("fs"), [raw, out, page] = process.argv.slice(1);
      const text = fs.readFileSync(raw, "utf8"), cut = text.indexOf("\n \"console\": [");
      const r = JSON.parse(cut < 0 ? text : text.slice(0, cut).replace(/,\s*$/, "") + "\n}");
      fs.writeFileSync(out, JSON.stringify(r, null, 1) + "\n"); fs.unlinkSync(raw);
      console.log(`${r.pass ? "PASS" : "FAIL"}  ${page}  three ${r.three}\n      ${r.observation.replace(/\n/g, "\n      ")}`);
    ' "results/$page-$b.raw" "results/$page-$b.json" "$page"
  done
done
