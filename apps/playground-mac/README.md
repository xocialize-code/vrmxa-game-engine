# VRMXG playground for the Mac

M0 W8 (AB-T-0509), on the shared shell since M1 W0 (AB-T-0512). The playground's web build in `apps/shell`, served
from the app bundle over loopback (the default) or the custom scheme (`VRMXG_ORIGIN=scheme`); in the app the
playground also opens and saves scenes through the system panels (File › Open…, Save As…). No Xcode project:
`scripts/build.sh` runs the Vite build, `swift build` and an ad hoc signature.

```sh
apps/playground-mac/scripts/build.sh                     # build/VRMXGPlayground.app (SKIP_WEB=1 reuses apps/playground/dist)
open apps/playground-mac/build/VRMXGPlayground.app
apps/playground-mac/scripts/hand-test-fixtures.sh
appprobe checklist scenario=apps/playground-mac/docs/hand-test/HAND-TEST-M0.scenario.md
```

`scripts/hand-test-fixtures.sh` puts the scenario's `open.vrmxs` in the app's sandbox for the shell's automation hooks.

**Hand test (AppProbe, AB-R-0945, 2026-11-17).** [`docs/HAND-TEST-M0.md`](docs/HAND-TEST-M0.md) and its scenario: the
cafe loads; Play turns into Pause, the step count climbs and the frame-time readout shows "16.7 ms · 60 fps" (a 60 Hz
display); Pause holds the count and Step moves it on: 3 rows passed. Debug draw and the demo walk are `judge: human`
rows; their screenshots are in `docs/hand-test/shots/`.
