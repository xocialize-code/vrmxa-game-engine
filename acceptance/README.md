# M0 acceptance

M0 W9 (AB-T-0510): the six exit checks of [M0-PLAN.md](../M0-PLAN.md) ("What M0 is done looking like"), run on the
sample cafe (`content/sample`) at one commit, in every runtime, and filed as receipts.

```sh
(cd apps/playground && npx vite build)
node acceptance/node.mjs          # the recorded walk, snapshot/restore, devices: results/node.json
node acceptance/chromium.mjs      # the playground at ?mode=acceptance in headless Chromium: results/chromium.json
acceptance/wkwebview.sh           # the same in WKWebView, scheme and loopback (needs spike-cinematics/mac/build)
node acceptance/compare.mjs       # evaluates the six checks: results/summary.json, exit 1 on a failure
```

`apps/playground/src/world.js` builds the sample world the same way everywhere; `src/acceptance.js` holds the checks
that need no renderer; the playground's acceptance mode adds the rendered pass (the walk rendered frame by frame,
every camera preset, debug draw). Check 4 re-runs the W6 harness (`engine/packages/snapshot/harness`); check 5 is a
Claude Code session with the MCP server (`results/mcp-session.json`).

## Result: M0 is done (2026-11-17, M5 Max)

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | The cafe runs in the playground in WKWebView and Chromium | Chromium, WKWebView scheme and loopback: 600 rendered frames, set, player, NPC, door opened at step 130, both lights, all six presets, no console errors; the Mac wrapper passes its AppProbe scenario | AB-R-0946 |
| 2 | Walk, run, jump through the action map with slots, blend, root motion | idle/move/jump/fall/land; 1.4 → 4 m/s with run weight 1; travel root motion; 1.02 m jump; idle-sword because Mira wears the sword; keyboard, gamepad and mouse; identical everywhere | AB-R-0947 |
| 3 | Bit for bit everywhere, snapshot and restore | 600 steps × 43 components identical in Node, Chromium, WKWebView scheme and loopback (`a44f1d6333b4b6ce`); snapshot 300 → 600 identical; the rendered world equals the headless one | AB-R-0948 |
| 4 | 20 characters + physics < 5 ms in WKWebView loopback | 2.11 ms mean, p95 2.38 (M5 Max). A base M-series Mac is still to measure: AB-T-0511 | AB-R-0949 |
| 5 | MCP describes, inspects the running engine, edits with undo | A Claude Code session: describe, engine through the walk, hinge read live at 100.1°, add / set / undo, validate, save; 10 calls, none failed | AB-R-0950 |
| 6 | Debug draw: colliders, sensors, rays, capsules | 38 of 38 colliders (33 solid, 3 door triggers, 2 capsules) and the spring-arm ray, in every browser | AB-R-0951 |

**Re-run at M1 W2 (AB-R-0955).** The files in `results/` are now that re-run: the cafe's doors are VRMXI items, and all
six checks pass, with the same final hash `f0e803b406afaa51` in Node, Chromium and WKWebView over both origins (check 5's
MCP session is still the W9 one).

**Re-run at M1 W4 (AB-R-0958).** The cafe now has the specification's sword pickup on a table, and every runtime's
world installs interaction (`@vrmxg/interact`, AB-R-0956) and the closet (`@vrmxg/closet`, AB-R-0957). All six checks
pass with the final hash `868739057945df05` in Node, Chromium and WKWebView over both origins. The sword set now asks
for a sword in hand (`held:sword`): Mira's idle is the default (her own sword is stowed) until the device run walks her
to the table and takes the sword, which check 2 now requires (idle set default → sword, the same in every runtime).
Check 6 counts four reach sensors and two rays (the spring arm's, the interaction focus's). Rebuild the playground
before the browser runs: a stale `dist/` diverges at step 0.

**Re-run at M1 W5 and W6 (AB-R-0960, AB-R-0961).** The cafe now has sound (door, switch, room tone, music on their buses), a light switch by the
counter, and Hana greets Mira when she comes close (a voice line, lip-synced, captioned). All checks pass with the final
hash `b5711aac29b64f2d` in Node, Chromium and WKWebView over both origins, and a seventh: the walk heard through a Web
Audio output hashes exactly as the silent run, and its recording mixed offline twice is the same samples (each runtime
its own mix hash). Found on the way: the `ready` signal every node declares was never emitted, so the cafe's
`door-1.ready → hana-1.lookAt` connection had never run; it does now.

Found on the way and fixed: travel root motion could never turn a walk into a run (the blend read the speed root motion
had already clamped); the sample's sword set named a tag Mira doesn't wear. Known gaps: the WKWebView harness's canvas
readback comes back blank for the playground page (the wrapper's window captures are the visual record:
`results/wkwebview-wrapper-*.png`), and the base-Mac budget (AB-T-0511).
