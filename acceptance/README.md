# M0, M1, M2 and M3 acceptance

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

## M3 so far (2026-11-19, M5 Max)

M3 adds checks as its workstreams land. The M3 acceptance (W13) runs all ten of its exit checks at the M3 commit.
- **Check 17** (W4, AB-T-0543): a recorded conversation replays with no model. `takes/conversation.json`, made by
  `tools/make-conversation.mjs`, is two minutes of Mira talking with Hana (the host), with the director's split turn on
  a scripted model; its ai log holds 30 events, 12 of them decisions. Replayed from its input and log alone:
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 605004a4a0349dde;
  - a snapshot at step 3,600, restored with the log's later entries, plays to the same end;
  - checks 1–16 are unchanged, so 17 of 17 pass.
- **The baked conversation** (`node acceptance/m3/conversation-export.mjs`, `results/m3-conversation-export.json`):
  - the take baked into `sequences/conversation.vrmxs` (12 lines baked to audio with `tools/bake-lines.mjs`) exports
    in the editor at 1080p24 with sound twice, to the same 2,929 frames (digest e8cfde98e135a744, audio 3d65d16c);
  - jumping to 27 frames of its shot, lines and decisions from snapshots draws exactly the exported frames.

- **The dialogue UI** (W6, `node acceptance/m3/dialogue-chromium.mjs` against the playground's dev server,
  `results/m3-dialogue-chromium.json` and `m3-dialogue-*.png`):
  - a typed line to Hana (`?director=demo`) shows her "…" bubble, then her reply word by word over her head, with the
    caption;
  - a picked reply ("Could I get a latte, please?") sets her `takeOrder` goal;
  - the recorded conversation replayed for 3,000 steps with the bubbles and captions read every step hashes the same
    at every 300th step as with both off;
  - the bubbles are drawn in the canvas (`@vrmxg/text`, troika, the text spike's verdict AB-T-0536): a frame with
    Hana's bubble hashes the same drawn twice and on another load of the page.

- **Check 18** (W7, AB-T-0546): ragdolls. Mira and Hana stand on a landing 0.9 m up at the top of four steps outside the
  cafe (`apps/playground/src/stairs.js`: box colliders added to the sample scene, which itself is unchanged); both are
  knocked down the stairs at step 30 (45 N·s on the torso):
  - each falls as a ragdoll from the one humanoid mapping (eleven parts, sized from the skeleton, nothing per model),
    lies still, and gets up at the foot of the stairs, blending back into animation (Mira: down at step 244, up at 356;
    Hana: down at 144, up at 256);
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 2a28db30b92d6f78;
  - a snapshot 40 steps into the fall re-simulates to the same end;
  - checks 1–17 are unchanged, so 18 of 18 pass.
- **The fall seen** (`node acceptance/m3/ragdoll-chromium.mjs` against the playground's dev server, `?fall`):
  `results/m3-ragdoll-{tumbling,lying,rising,up}.png`, with the stairs in debug draw until W12 brings visible ones.

## Result: M2 is done (2026-11-18, M5 Max)

M2's ten exit checks ([M2-PLAN.md](../M2-PLAN.md) "What M2 is done looking like") were run at the M2 commit 2df012b in
every runtime and in the editor's Mac app. Each is filed as a receipt:

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | A sequence is authored in the editor | AppProbe in the Mac app (`apps/editor-mac/docs/HAND-TEST-M2-ACCEPTANCE.md`). "Morning at the cafe" opens with 5 shots on a 24 fps ruler and 13 tracks, one of every kind. An edit is one undo step, undo restores the document exactly, and save then reopen gives the same bytes and validates | AB-R-0994 |
| 2 | Scrubbing is exact | Check Against Scrub jumps to 26 frames, every shot, line and cue, from snapshots. All 26 equal the export's frames in Chromium, WKWebView scheme and loopback (digest 30245c02a5ca6afd) and the Mac app. A still between scrubs leaves the shot where it was (`editor-chromium.mjs` stillThenScrub) | AB-R-0995 |
| 3 | Cameras are cinematic | Check 10: CameraBrain blends are identical everywhere, with a snapshot mid-blend. The film's 8 camera changes are identical everywhere. The aspect the composer frames with is fixed per sequence world | AB-R-0996 |
| 4 | It looks like anime | Check 11: 4K against 1080p SSIM 0.9861 (0.9507 with grain); costs in every browser. Check 13: particles identical, with a snapshot mid-effect. Offline frames wait for the LUT grade | AB-R-0997 |
| 5 | It exports | The 45 s film from the Mac editor, to H.264 1080p24 twice and to ProRes 4444. Each has 1,080 frames at n/24 s, the sound at lag 0 (correlation 1) and an .srt with 4 lines. The frames are identical across the three files and equal to the scrubs. 6.9–7.5 s per export | AB-R-0998 |
| 6 | The cafe lives | Check 14: Hana serves Mira on the navmesh from behaviour trees, identical everywhere, with a snapshot mid-order (final 5cda8e0f430bba8f). The film's cast runs the same brains | AB-R-0999 |
| 7 | Bodies move better | G10 layers, foot IK and hand reach in the character tests. The items take with the sword held is identical everywhere (check 8). Emotes are snapshot state | AB-R-1000 |
| 8 | Save and load | Check 15: a load continues with the unbroken run's per-step hashes in every runtime. In the Mac editor a game saves through the shell and loads "the world as saved" | AB-R-1001 |
| 9 | Agents can direct | A Claude Code session used only the editor's MCP tools: it added a shot, a camera, expression keys, a line and a behaviour tree, rendered frame 1120 and read Hana's brain. The editor's Undo named both edits and walked them back to the saved bytes. 20 tools ≈ 1,773 tokens (21 ≈ 1,902 for the editor) | AB-R-1002 |
| 10 | M0 and M1 still hold | `compare.mjs` 16/16 in Node, Chromium and WKWebView scheme and loopback. The NPC run (check 14) and the sequence (checks 12 and 16) hash identically everywhere | AB-R-1003 |

The acceptance found six bugs, all fixed at 2df012b with tests:
- a closure timer for emotes, which snapshots can't hold;
- a camera lens that wasn't re-derived on restore;
- the interpolator's pair, which survived a restore;
- LUT loads that offline frames didn't wait for;
- the viewport's aspect leaking into a sequence world's simulation through a still;
- the shell's save handlers, which were released while captured unowned, a crash.

It also found two gaps, closed at the same commit: an agent couldn't read a track to edit it (`sequence {path}`), and the session could reach past the editor's tools. Lessons AB-L-0360 to 0363.

The editor's checks:

```sh
npm --prefix apps/editor run dev -- --port 5182 &   # then:
node acceptance/m2/editor-chromium.mjs       # export + Check Against Scrub + stillThenScrub: results/m2-editor-chromium.json
acceptance/m2/editor-wkwebview.sh            # the same in WKWebView (?mode=check-export): results/m2-editor-wkwebview-*.json
apps/editor-mac/scripts/hand-test-fixtures.sh   # then AppProbe: apps/editor-mac/docs/hand-test/HAND-TEST-M2-ACCEPTANCE.scenario.md
node apps/editor-mac/scripts/check-sequence-exports.mjs
node apps/editor-mac/scripts/mcp-session.mjs --m2   # with the film open in the Mac editor
```

## Result: M1 is done (2026-11-18, M5 Max)

M1's seven exit checks ([M1-PLAN.md](../M1-PLAN.md) "What M1 is done looking like"), run at the M1 commits b48351a (the
runtimes) and 0067c0a (the editor's Mac app), each filed as a receipt:

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | The editor builds a scene | AppProbe 7/7 in the Mac app: the cafe built from the asset list; inspector, tree, undo and redo; Save, reopen, same bytes, valid; Play / Stop | AB-R-0967 |
| 2 | Play in place, with items | The items take (`content/sample/input/play-items.json`, 1,668 steps) played in the editor: the prompts Take sword, Open cupboard and Switch off showed in turn, then the sword went into Mira's closet (held), the cupboard opened, she sat on a stool and the lights went off. Stop restored the scene's hash (`apps/editor-mac/docs/hand-test/shots/play-items/`) | AB-R-0968 |
| 3 | Hana talks | Her line starts as Mira passes. Mouth up to 1.0, lip sync +20 ms against the clip; she looks at Mira, blinks 6 times, and the caption shows. Identical everywhere (check 9) | AB-R-0969 |
| 4 | It sounds right | The take with sound hashes as the silent run; the doors and the switch are positional, ambience and music are on their buses, and Hana's voice is heard; the offline mix renders identically twice (check 7) | AB-R-0970 |
| 5 | Agents can drive it | A Claude Code session drove the open editor: 16 calls, none failed. Its edit was undone from the editor's Edit › Undo; 18 tools ≈ 1,446 tokens | AB-R-0971 |
| 6 | It exports a shot | H.264 1080p30 with sound: 300 frames, each at n/30 s, the sound at lag 0. Rendered frames are identical across exports, ProRes decodes identically. 1.9–2.1 s (4K60 7.8 s) | AB-R-0972 |
| 7 | M0 still holds | `compare.mjs` 9/9 in Node, Chromium and WKWebView scheme and loopback. Walk f2371e0ef65e9f16; items take f105d15ede18d945, with the snapshot after the equip identical | AB-R-0973 |

`compare.mjs` now has nine checks: M0's six, plus 7 (audio, on the items take), 8 (the items take everywhere, with
the snapshot across the equip) and 9 (Hana). Before running it, run
`VRMXG_LIPSYNC_OUT=$PWD/acceptance/results/lipsync.json node --test engine/packages/voice/test/` to record the lip-sync lag.

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
