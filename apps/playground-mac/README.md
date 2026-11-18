# VRMXG playground for the Mac

M0 W8 (AB-T-0509). The playground's web build in the spikes' sandboxed WKWebView shell, served from the app bundle over
loopback (the default: the origin with a fine timer, AB-L-0346) or the custom scheme (`PLAYGROUND_ORIGIN=scheme`). No
Xcode project: `scripts/build.sh` runs the Vite build, `swiftc` and an ad hoc signature.

```sh
apps/playground-mac/scripts/build.sh                     # build/VRMXGPlayground.app (SKIP_WEB=1 reuses apps/playground/dist)
open apps/playground-mac/build/VRMXGPlayground.app
appprobe checklist scenario=apps/playground-mac/docs/hand-test/HAND-TEST-M0.scenario.md
```

The shared wrapper for M1's apps is still open (M0-PLAN Q4); this one is the spike shell with a menu and a window
that remembers its frame.

**Hand test (AppProbe, AB-R-0945, 2026-11-17).** [`docs/HAND-TEST-M0.md`](docs/HAND-TEST-M0.md) and its scenario: the
cafe loads; Play turns into Pause, the step count climbs and the frame-time readout shows "16.7 ms · 60 fps" (a 60 Hz
display); Pause holds the count and Step moves it on: 3 rows passed. Debug draw and the demo walk are `judge: human`
rows; their screenshots are in `docs/hand-test/shots/`.
