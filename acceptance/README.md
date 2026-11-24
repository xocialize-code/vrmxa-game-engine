# M0, M1, M2 and M3 acceptance, and M4's backend matrix

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

## M4 W3: the backend matrix (AB-T-0575)

Every rendering check runs on both backends, WebGPU and WebGL, in headless Chromium and in WKWebView over the custom
scheme and over loopback: 3 runtimes × 2 backends, 6 cells. One entry point runs the matrix and writes one results JSON
per cell.

```sh
(cd apps/playground && npx vite build) && (cd apps/editor && npx vite build)   # and spike-cinematics/mac/scripts/build.sh once
node acceptance/matrix.mjs                  # the whole matrix: results/m4-w3/<runtime>-<backend>.json and summary.json
node acceptance/matrix.mjs --runtimes chromium --backends webgpu --checks backends,post --loads 2   # a part: summary-partial.json
node acceptance/matrix.mjs --bless          # write acceptance/canonical.json from this run (every load must agree)
node acceptance/matrix.mjs --keep-going     # record a failure and carry on (diagnosis only: the run still fails)
```

**The checks** are the playground's and the editor's own check modes, so the same code runs in every cell:

| Check | Mode | Loads per cell | What one load must show | What its digest covers |
|---|---|---|---|---|
| acceptance | playground `?mode=acceptance` | 1 | M0–M3's exit checks; scored by `compare.mjs` per backend against the one Node run | every check's simulation final (backend-independent: the same in all six cells and Node) |
| backends | `?mode=backends` | 3 | five distinct offline frames and a still at 1280×720 | each frame and the still (and on WebGL the `gl.readPixels` hashes) |
| frames | `?mode=frames` | 2 | particles as headless and restored, the film exported twice the same, stills, readback at every size, alpha | particles, both films, sound, still, readback per size, alpha; the film frame by frame (`canonical.json`) |
| post | `?mode=post` | 2 | every look at 1080p (a new pipeline's first frame = its next), two exports the same | every look (first and again) and both exports' frames |
| coverage | `?mode=coverage` | 2 | a thumbnail per shot, the same from snapshots in either order | the sequence and every thumbnail |
| budget | `?mode=budget` | 1 (Chromium, WKWebView loopback) | 20 characters, each step drawn at 1080p; the step under 5 ms (mean) | none (timings) |
| editor | editor `?mode=check-export` | 2 | the film exported, then 26 frames scrubbed to from snapshots and drawn forward: all equal to the export | the export's digest, sound and the checked frames |

Every cell asks for its backend explicitly (`&renderer=webgpu|webgl`). The budget runs where timings mean something: the
scheme origin's timer resolves 1 ms (AB-L-0346), and each WKWebView load is a fresh web view.

### Exactness (AB-D-0278, AB-T-0589)

- **The GPU lock.** Exact frames only hold on a quiet GPU: on macOS 27.3 beta, Metal draws a rare odd MSAA frame while
  another process loads the GPU (AB-T-0589). [`gpu-lock.mjs`](gpu-lock.mjs) is a machine-level lock: `mkdir
  /tmp/vrmxg-gpu.lock` (atomic) with `owner.json` (pid, who, since). A lock whose pid is gone is stale and is taken over;
  one without `owner.json` is stale after a minute. **Every runner that draws for a result takes it, from any repository
  or session:**
  ```sh
  node acceptance/gpu-lock.mjs run --who my-runner -- <command> [args…]   # hold it while a command runs
  node acceptance/gpu-lock.mjs status                                     # who holds it
  ```
  or `import { acquireGpuLock } from '…/acceptance/gpu-lock.mjs'; const release = await acquireGpuLock({ who });`. A
  child of a holder (`VRMXG_GPU_LOCK_HELD` names the holder's pid) doesn't take it again, so a locked runner can call
  other locked runners (`node acceptance/gpu-lock.mjs held` exits 0 when `VRMXG_GPU_LOCK_HELD` names the live owner;
  the shell runners check that before re-running themselves under the lock). Taking over a stale lock is serialised by
  `<lock>.takeover`, and a taker reads `owner.json` back, so two waiters that saw the same dead owner can't both hold it
  (`acceptance/test/gpu-lock.test.mjs`). The matrix takes it per cell, starting its Chromium only once it holds it, and
  again for the SSIM step. Every runner here that draws takes it too: `acceptance/chromium.mjs`, `wkwebview.sh`, `m2/`,
  `m3/`, and `apps/playground/scripts/` (`chromium-check.mjs`, every `*-chromium.mjs`, and every `*-wkwebview.sh`).
  `VRMXG_GPU_LOCK` moves the directory.
- **A quiet GPU before each cell.** With the lock held and nothing of the matrix's running, it waits for three samples in
  a row (5 s apart) with the GPU's utilisation ≤ 30 % and no GPU-using process at ≥ 5 % CPU. It waits up to
  `--quiet-wait` minutes (20), then stops; `--allow-load` carries on, records the cell in `notQuiet`, and the run can't
  pass. Each cell's JSON has its `preflight`. (On 2026-11-23 the person's own Chrome, with a busy "Google Chrome Helper
  (Aperitif)", held the GPU at ~65 % with nothing else running; gpu-load.mjs didn't know that helper's name until then.)
- **The GPU's load in every result.** Each load records `gpuLoad` (`apps/playground/scripts/gpu-load.mjs`, sampled
  every 3 s): the GPU's utilisation (min, median, max) and every GPU-using process seen (WebKit, Chrome for Testing, the
  person's own browsers with every helper, python, MLX, the harnesses, the native Metal repro, other apps' busy GPU
  helpers), names only. Utilisation counts our own drawing
  too (a quiet post load in Chromium sits at a median 30–55 %), so it is recorded, not judged. A load ran **under load**
  when another GPU-using process was at ≥ 5 % CPU: anything but our own runtime's processes (Chromium in a Chromium
  cell; WebKit and the harness this runner started in a WKWebView cell, so a busy Safari would pass unseen: close it).
- **Every load must match the canonical digest** for its backend and runtime ([`canonical.json`](canonical.json)). Every
  entry is written by `--bless`, and only for a check in which every load passed and agreed; each entry records its own
  `made` (time, commit, whether the tree was dirty, loads, runtime and backend). Outside `--bless`, a check with no
  canonical entry is **unpinned**: its first passing load is the reference for that run, it is listed in the summary's
  `unpinned`, and the matrix can't pass.
- **A load that isn't clean is rerun once** (a clean load passes every verdict and matches the canonical digest). The
  failed load is logged in its cell's JSON (`incidents` or `failure`): the items that differ, its verdicts, its GPU load,
  and the frames that differ from the canonical frame hashes (the film checks every frame against `canonical.json` in the
  page and keeps the odd frames' images). The rerun keeps the same frames, and the runner compares the two images: the
  16 × 9 tiles that differ, how many pixels, the largest difference and the first 32 pixels. Images go to
  `results/m4-w3/odd/` (git-ignored). Then ([`classify.mjs`](classify.mjs), tested in `test/classify.test.mjs`):
  - **A functional verdict failed** (an error, a time-out, the wrong backend or a silent fall-back to WebGL, frames that
    repeat, a flat frame, the scrub, the budget): a **failure**, whatever the rerun did.
  - **Only pixels differed** (the digest, or the verdicts that compare a load's own frames with each other: the film's two
    exports, the post exports, a look's first frame and its next, a restored or reused host's frames), the rerun is clean
    and the failed load ran under load: **AB-T-0589** (the beta's Metal issue), one incident per load in the summary's
    `incidents`; that load counts.
  - Otherwise (the rerun isn't clean, or the GPU was quiet): a **failure**. The matrix stops there (`--keep-going` records
    it and carries on) and exits 1. A quiet-GPU odd frame whose rerun matches is a failure, not AB-T-0589, by decision
    **AB-D-0279** (the operator, 2026-11-23), even though repro 5 shows the beta's issue on a quiet GPU too; the re-test
    on the macOS release build is AB-T-0591.

### The look between backends: SSIM ≥ 0.98 at 1080p, translucency aside

The post check draws every look on the same frame of the recorded walk (step 420) at 1920×1080 on each backend; the
matrix compares each look's WebGPU frame with its WebGL frame (`apps/playground/scripts/post-compare.mjs`: SSIM on
luma, 8×8 windows every 4 px).
- **What is masked:** the pixels where translucency shows. The post check draws the frame twice with no post, once as it
  is and once with every visible object whose material blends (`transparent`, or blending other than normal or none;
  alpha cut-outs are opaque) hidden. The pixels that differ are the mask: translucent surfaces in view (not those hidden
  behind opaque ones) and the shadows they cast. Each backend makes its own mask; their union is left out, and every 8×8
  window that touches it is dropped from the SSIM. A mask over 1 % of the frame is an error (a broken mask mustn't hide
  the look). On the walk's frame that is the VRoid characters' eye iris and
  highlight, eyebrows, eyelashes and eyeliner (blended face materials), 0.017 % of the frame. Mask previews:
  `results/m4-w3/mask-*.png`.
- **Why:** translucency blends in linear light on WebGPU, which is three's design and the physically correct blend, and
  in sRGB on WebGL where no post runs (AB-D-0273, M4 decision 4). Translucent pixels differ by design.
- **Grain** is per-pixel noise each backend's stack draws differently, so the `anime` look (grain 0.18) is judged at ¼ size
  (4×4 means), where noise averages out and the look doesn't. Every other look is judged at full size.

### Result (2026-11-23, M5 Max, macOS 27.3 beta 26C5047e, Chrome for Testing 156.0.8078.4 headless on Metal)

Two full runs at 73d48dd with a clean tree, on a quiet GPU (every cell's pre-flight passed). First a bless pass
(`--bless --keep-going`), which wrote every entry of `canonical.json`, each with its own `made`. Then a verify pass
against it (`--keep-going`). The verify pass's files are `results/m4-w3/`, and the bless pass's summary is
`results/m4-w3/bless/summary.json`. Receipts: AB-R-1070 (the matrix), AB-R-1071 (the look), AB-R-1072 (the budget),
AB-R-1073 (repro 5 on this beta). **The verify summary has `ok: false`**, for the two reasons under "Not green".

| Cell | acceptance | backends (3 loads) | frames (2) | post (2) | coverage (2) | budget | editor (2) |
|---|---|---|---|---|---|---|---|
| Chromium, WebGPU | ✔ | ✔ `d34ebf75` | ✔ `31fd2949` | ✔ `c6a9dc4b` | ✔ `a1fb8342` | ✔ | ✖ scrub 24/26, unpinned |
| Chromium, WebGL | ✔ | ✔ `4c6c9ea7` | ✔ `70a6468d` | ✔ `321c6f7b` | ✔ `a99d0123` | ✔ | ✔ `59bbb42b` |
| WKWebView scheme, WebGPU | ✔ | ✔ `72ee1422` | ✔ `48000a47` | ✔ `8defe4bd` | ✔ `de0ac1cd` | — | ✖ scrub 24/26, unpinned |
| WKWebView scheme, WebGL | ✔ | ✔ `1cd4c92e` | ✔ `0911935a` | ✔ `2327291e` | ✔ `104c9bf9` | — | ✔ `b6f43f98` |
| WKWebView loopback, WebGPU | ✔ | ✔ `72ee1422` | ✖ one quiet odd frame | ✔ `8defe4bd` | ✔ `de0ac1cd` | ✔ | ✖ scrub 24/26, unpinned |
| WKWebView loopback, WebGL | ✔ | ✔ `1cd4c92e` | ✔ `0911935a` | ✔ `2327291e` | ✔ `104c9bf9` | ✔ | ✔ `b6f43f98` |

- **Every other load matched its canonical digest.** The bless pass gave the same digests as two earlier full runs, and
  scheme and loopback give the same digests on both backends. No load was AB-T-0589 (0 incidents).
- **The simulation doesn't depend on the renderer.** `compare.mjs` passes 20 of 20 on each backend against the one Node
  run, and every check's final is the same in all six cells and Node (simulation `fe69bad3406ab5f6`).
- **The films** digest to `af463f8e404b4e2b` (Chromium) and `aa30672928beb2b1` (WebKit) on WebGPU, W2's values. On WebGL
  they digest to `46a23bf918eb4da7` and `64caa818cf9d37ef`. W2's file (recorded before W1's merge) has `4c2265c8` and
  `696295fc`; what moved them since isn't traced. Particles' final is `09ef4d21b00189d1` everywhere.
- **The look:** every look's masked SSIM is 0.994–0.997 in all three runtimes. The anime look with grain is 0.961 at
  full size and 0.993 at ¼. The mask is 0.017 % of the frame.
- **The budget** (20 characters, the cafe plus 18 wanderers, each step drawn at 1080p):

  | Runtime | Backend | Step ms (mean, p95) | Draw, CPU ms (mean) | Frame with the GPU's work, ms (mean, p95, max) |
  |---|---|---|---|---|
  | WKWebView loopback | WebGPU | 2.12, 2.38 | 6.77 | 13.04, 16.46, 20.34 |
  | WKWebView loopback | WebGL | 1.68, 1.96 | 2.55 | 4.23, 4.90, 5.62 |
  | Chromium | WebGPU | 2.19, 2.5 | 5.73 | 11.82, 12.5, 13.5 |
  | Chromium | WebGL | 1.97, 2.3 | 3.02 | 4.99, 5.4, 6.0 |

  The step stays under M0's 5 ms on both backends (a verdict now). WebGPU's draw costs more than twice WebGL's CPU time
  in both engines. Its frame time includes `onSubmittedWorkDone`'s own round trip, so it overstates the GPU time. A base
  M-series Mac is still unmeasured (AB-T-0511).
- **Not green:**
  - **The editor's Check Against Scrub on WebGPU:** 24 of 26 in all three runtimes, on every load and rerun (frames 735
    and 869). Their world hash matches, and drawing forward matches the export. It happens only with the TSL post stack
    on and on frames with the espresso's steam (`apps/editor/README.md`). It's a functional failure, never blessed, so
    the check is unpinned. WebGL gives 26 of 26, and the export itself is exact on WebGPU. Fixed and pinned by AB-T-0590
    (below).
  - **One quiet odd frame:** WKWebView over loopback on WebGPU, load 1, the film's second export, **frame 656**. It
    differed in tiles 89–90 (x 1080–1320, y 600–720): 630 pixels, by at most 8 levels, on the espresso machine's base
    (`results/m4-w3/odd-frame656.png`: the failed frame, the rerun's and their difference ×30, at 2×). The rerun was
    clean. The GPU was quiet: the pre-flight passed at 0 %, and no other GPU-using process was over 5 % CPU (Microsoft
    Edge was open at under 3 %). By decision AB-D-0279 that is a failure, not AB-T-0589. It fits the beta's Metal issue:
    it's the same mesh, and repro 5 re-run quietly on this beta (26C5047e) gave 1 odd MSAA draw in 19,999. The re-test
    on the macOS release build is AB-T-0591.
- **Earlier runs, for the record:**
  - Two earlier full runs gave the same digests.
  - Their "quiet" odd film frames (frame 670 in WKWebView, one in Chromium) ran while the operator's Chrome held the GPU
    at about 65 %. Its "Google Chrome Helper (Aperitif)" wasn't in gpu-load.mjs's list then.

### AB-T-0590: the editor's scrub on WebGPU fixed and pinned (2026-11-23, same machine and beta)

- **The cause:** three.quarks' WebGPU materials decode a particle's colour (sRGB to linear) only when compiled for an
  sRGB output. r187 keeps the first compile for every later draw: its cache key has no colour space. An export draws
  frame 0 without its look (AB-T-0595), so the steam was compiled decoded and kept that inside the TSL scene pass. The
  scrub compiled it inside the pass, undecoded.
- **The fix:** `@vrmxg/particles/webgpu` decodes per draw, with a uniform that follows `renderer.outputColorSpace`
  (`engine/packages/particles/README.md`).
- **The check's warm-up:** Check Against Scrub also draws one throwaway frame on its fresh host first. Under GPU load, a
  fresh WebGPU host's first post frame could differ: frame 1079, the scrub's first row, in 7 of 8 loads. The cause is
  AB-T-0596.
- **The bless:** one runtime at a time (`--bless --runtimes <r> --backends webgpu`) for every WebGPU digest check, at
  f7d971f (main 171b262 with the fix), clean tree, quiet GPU. Every load agreed.
- **The verify pass:** the whole matrix but the budget (`--checks editor,acceptance,backends,frames,post,coverage`),
  same commit, quiet GPU.
- **Results:** **`ok: true`**. Every load matched its canonical digest with no rerun, and there were 0 AB-T-0589
  incidents. `compare.mjs` gives 20/20 on each backend, the simulation is `fe69bad3406ab5f6` in all six cells, and every
  look's masked SSIM is ≥ 0.98. Files: `results/ab-t-0590/` (`verify/`, and `bless/` for the WebGPU cells).
- **What moved:**
  - The editor check on WebGPU is pinned: 26 of 26 on every load. Chromium `c069a63f`; WKWebView `db9d4ace` over the
    scheme and over loopback.
  - The `frames` check's film on WebGPU moved in exactly frames 701–869, the espresso steam's life (its event fires at
    699). Chromium `31fd2949` → `189535cb`; WKWebView `48000a47` → `053b9501`.
  - Nothing else moved: acceptance, backends, post and coverage are the same entries on both backends, and WebGL is
    unchanged.

## M4's checks as they land

- **Check 1, scripts** (W4, AB-T-0576): the same script gives the same sequence, byte for byte, in every runtime.
  `acceptance/m4/script-scenario.js` builds the sample script (`content/sample/scripts/cafe-order.fountain`) over the
  cafe, and re-scripts a small script after hand edits (a gesture moved, a smile keyed bigger, a look turned to the
  camera, a track deleted; then a line added above and words changed). Each runtime hashes the canonical `.vrmxs` text:
  ```sh
  node acceptance/m4/script-chromium.mjs     # Node and headless Chromium over loopback: results/m4-script.json
  acceptance/m4/script-wkwebview.sh          # WKWebView, scheme and loopback: results/m4-script-wkwebview.json
  ```
  Node, Chromium, WKWebView scheme and loopback all give sample 58cebece…f902 (11,207 bytes) and re-script
  7d761dd9…9180 (6,183 bytes). The package's tests hold the sample's hash too (`engine/packages/script/test/golden.json`).

- **Check 3, the lines are voiced** (W7, AB-T-0579): every line of the sample script's sequence
  (`sequences/cafe-order.vrmxs`) is baked into its dialogue track in its character's voice: Hana in `af_heart`, Mira in
  `af_bella`, through `content/sample/tools/bake-lines.mjs --fit` (`@vrmxg/voicing`, Kokoro through the loopback
  stand-in). Three lines were lengthened to their speech and re-scripted, so nobody talks over anybody. The sequence
  then replays from the baked track, with no renderer, for 1,951 steps. It checks:
  - each step's world hashes and both mouths' weights;
  - the line each character starts;
  - a snapshot taken mid-line, restored into a fresh world;
  - no line's speech running into another's.

  Regenerating one line or one character is one undo step: `engine/packages/voicing/test/voicing.test.mjs`.
  ```sh
  (cd apps/playground && npx vite build) && node acceptance/m4/voicing.mjs   # Node and headless Chromium: results/m4-voicing.json
  acceptance/m4/voicing-wkwebview.sh                                         # WKWebView, scheme and loopback: results/m4-voicing-wkwebview.json
  ```
  Node, Chromium and WKWebView (scheme and loopback, two loads each) all give final e68bfb9a96f255c5 and mouths
  58b2c9d48f735177, and the mid-line restore ends the same (AB-R-1077; Kokoro's audio isn't byte-reproducible, AB-L-0375).

- **Check 5, a performance can be acted** (W9, AB-T-0581): a take is a log, and it replays exactly from it. The sample
  has three take logs over "The Regular" (`content/sample/performances/the-regular/`, recorded in Node by
  `tools/make-takes.mjs` with the real recorder: a puppet take of Mira from scripted keys, a director take of Hana
  answered by a scripted model, a face take of Mira from a synthetic face session). `apps/playground/src/takes-check.js`
  makes each log into tracks (`@vrmxg/takes`' pure function), keeps all three in the film, and plays it with no
  renderer for 2,079 steps. It checks:
  - each take's tracks and the film's canonical text, hashed;
  - each step's world hashes (90 components);
  - a snapshot taken while Mira walks, restored into a fresh world;
  - that the takes do what was performed: Mira walks from her mark, hops and turns her eyes; Hana says the two
    directed lines on their frames and walks over to her; Mira's face blinks, smiles, talks and turns.

  Each kind recorded live, kept as one undo step and edited: `engine/packages/takes/test/`, `apps/creator/test/takes.test.mjs`
  and the Mac app's `apps/creator-mac/docs/HAND-TEST-M4-TAKES.md`.
  ```sh
  (cd apps/playground && npx vite build) && node acceptance/m4/takes.mjs   # Node and headless Chromium: results/m4-takes.json
  acceptance/m4/takes-wkwebview.sh                                         # WKWebView, scheme and loopback: results/m4-takes-wkwebview.json
  ```
  Node, Chromium and WKWebView (scheme and loopback, two loads each) all give the same tracks from each log, film
  2fde5736d2e7edee (43,177 bytes), final e50ac8a7e928dc3f and the same per-step run, and the restore ends the
  same (AB-R-1086 has the numbers as first recorded: film 7314d57e8b7a5b5c, final 42bc50c5a9e11f0f. The Regular's
  cameras after the window-table move changed with AB-T-0597, so the three logs were recorded again on purpose
  on 2026-11-23: only the film's hash in each log changed, and each log gives the same tracks as before). The face take's source is the spike's verdict (`spike-face/README.md`, AB-R-1085, AB-D-0281); a
  real camera waits on AB-T-0557.

- **Check 7, delivery** (W10, AB-T-0582): the creator's render queue renders each delivery preset (H.264, HEVC and
  ProRes 4444 with alpha, at 1080p24 and 4K24) in the Mac app (WKWebView on the shell, AVAssetWriter): the film with
  its sound and `.srt`, a still and a thumbnail per shot, a turntable per character and `delivery.json`, into the
  project's `deliveries/`. Each preset is rendered twice in one app run, and the runs must agree on the film's frames
  (the shell hashes each frame before encoding), its sound, every still and thumbnail, and the turntables' frames:
  ```sh
  apps/creator-mac/scripts/build.sh && acceptance/m4/delivery-wkwebview.sh    # every preset, WebGPU, loopback: results/m4-delivery/
  RENDERER=webgl acceptance/m4/delivery-wkwebview.sh                          # the same on WebGL
  SHORT=the-regular PRESETS=prores-4k24 acceptance/m4/delivery-wkwebview.sh   # the one-minute sample short
  node acceptance/m4/delivery-summary.mjs                                     # results/m4-delivery/summary.json
  ```
  Measured 2026-11-23 on the M5 Max (macOS 27.3 beta 26C5047e): 56 films in 24 pairs of runs: sound, stills, thumbnails
  and turntables agree in all 24, and the films' frames in 22. Both odd pairs are WebGPU, on a quiet GPU, and in the
  first export after the app launched (one frame, frame 66 of the-regular, in the one with per-frame hashes): the
  odd-frame case AB-D-0279 counts as a failure, rerun clean. WebGL's 16 films never differed. The frame digests per
  backend: cafe-order 1080p `2b22bd5a4a461080` / 4K `8ef069d9fe5648e7` (WebGPU), `48e228afa392d691` / `bd329ec3c8922ca0`
  (WebGL); the-regular 4K `459255e681a6087d` (WebGPU), `198615bc571ad04e` (WebGL, the same whether the view or only the
  export is on WebGL). The one-minute short at 4K: the film in 26–27 s, the whole delivery in 34–37 s, against the
  4-minute target. The redraw check (each frame drawn twice) costs 1.98× a frame at 4K, and the one-minute 4K delivery
  takes 66 s with it. It found no odd draw in these 4,593 frames, and in the creator's hand test it outvoted one (frame
  58, the first draw) and delivered the canonical film (AB-R-1081 timing, AB-R-1082 identity). Since AB-D-0280 a
  delivery preset drawn on WebGPU checks by default, until AB-T-0591's release-OS re-test; these results were taken
  before that, with the check off unless `CHECK=redraw` (`delivery-wkwebview.sh` now takes `CHECK=off` for a
  single draw).

- **W2, particles and readback on WebGPU** (AB-T-0574): check 13 drawn on both backends, the morning film exported
  twice, stills and the readback's cost, in the playground's `?mode=frames` (`apps/playground/README.md`, "Particles and
  readback"). The WebGL acceptance re-run at W2 (`node.mjs`, `chromium.mjs`, `wkwebview.sh`, `compare.mjs`) passes 20 of
  20 in every runtime, and every final, every per-step run, the draw calls, triangles, debug counts, presets and post
  SSIM equal the committed M3 results (`results/m4-w2-rerun-summary.json`; the other result files are kept as M3 left
  them). One field moved: check 13's headless `batches` is 0, because since W2 the particles' batch renderer comes from a
  render host and nothing draws headless.

## Result: M3 is done (2026-11-19, M5 Max)

M3's ten exit checks ([M3-PLAN.md](../M3-PLAN.md) "What M3 is done looking like") were run at the M3 commit 37ca5e3 in
every runtime, in the playground's Mac app and in the companion app. Each is filed as a receipt:

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | A persona drives the character | Hana's VRMXA persona becomes a role profile that weights her utility, stored as app persona, and the director's prompt, layered in §11's order. Tools are filtered per character and moment: emotions she is allowed, gestures her set fills, targets she has seen. 15 bad-reply fixtures and 6 in-world faults are each rejected, and her tree carries on (AB-R-1010) | AB-R-1038 |
| 2 | You talk, she answers | In the playground's Mac app, the shell's voice goes from microphone and VAD through STT, the director and TTS with word timings, with lip sync. From end of speech to her first audio: median 1.26 s, max 1.43 s over 10 steady turns (AB-R-1037). She nods while you speak, looks away as she thinks and says a filler past 1.5 s. In a browser the same conversation works typed, through the loopback stand-in (AB-R-1022) | AB-R-1039 |
| 3 | Her decisions act in the world | An order she hears becomes her serving goal, and M2's server tree makes and brings it. A follower waits by the door when asked, then follows (`takes/follow.json`). Goal choice runs on salient events. Two directors share one model: the character spoken to goes first, and at most two requests are at the model (`director/test/queue.test.mjs`) | AB-R-1040 |
| 4 | It replays exactly | Check 17: the two-minute conversation replays with no model, identical at every step in every runtime, final 605004a4a0349dde. A save halfway continues to the same end (AB-R-1020) | AB-R-1041 |
| 5 | A conversation becomes a shot | The take baked into a sequence exports at 1080p24 with sound twice, to the same 2,929 frames, and 27 scrubs draw exactly the exported frames (AB-R-1021). Regenerating a line is one undo step. A take's aspect is fixed at 16:9 (AB-T-0538) | AB-R-1042 |
| 6 | She sees you | Native Vision in the shell, off until turned on; no frame leaves the device (AB-R-1029). She notices the viewer and looks, and answers a wave and a nod. The stimuli are logged by step and replay hash for hash, also from a snapshot. Live in the Mac app, wave and nod worked in low light; a re-test in good light is AB-T-0557 | AB-R-1043 |
| 7 | Bodies and play | Checks 18 to 20: a ragdoll fall down the stairs and a get-up, a cart driven and parked, and two-player split screen. Each is identical in every runtime, and its replay and mid-run snapshot are exact (AB-R-1028, 1030, 1031) | AB-R-1044 |
| 8 | The companion app starts | `../vrmxa-companion` v0 at 87ef3e2, on the shell and the engine's packages by path. She idles with variety (the three extras; after a stroll she faces the camera, within 4°), looks at you while attending, and holds a spoken conversation through the shell's voice and the director. After a quit and relaunch she says "Welcome back, Sam.", from memory encrypted at rest. At 20 fps idle she uses 19.6 % of a core and 2.9 % GPU, against 35.0 % and 8.2 % engaged (AB-R-1047). Hand test 7/9 scripted (the room checked by eye; the glance half of look-at not clear in a still), voice 4/4 | AB-R-1048 |
| 9 | Agents can direct a conversation | A Claude Code session with only the editor's MCP tools read Hana's director state, talked to her, injected a decision, played a conversation and edited her profile. The editor's Undo walked both edits back. 19 calls, none failed; 20 tools ≈ 1,857 tokens (AB-R-1027) | AB-R-1045 |
| 10 | M0, M1 and M2 still hold | `npm run check` is green. `compare.mjs` passes 20 of 20 in Node, Chromium and WKWebView scheme and loopback. Every final but the conversation's moved at 37ca5e3 when the default idle became three weighted variants | AB-R-1046 |

The acceptance found two things to fix, both fixed at 37ca5e3:
- check 2 asserted the idle clip by name, which no longer holds once the default set picks among variants;
- the conversation preset's option type lacked `face`.

## M3's checks as they landed

M3 added checks as its workstreams landed.
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
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 2a28db30b92d6f78
    (09ba2116fa74e9f2 since W12: the stairs are a drawn model, `sets/stairs.glb`, and getting up plays the `getUp` clip;
    the same falls, to the step and the millimetre);
  - a snapshot 40 steps into the fall re-simulates to the same end;
  - checks 1–17 are unchanged, so 18 of 18 pass.
- **Check 19** (W8, AB-T-0547): vehicles. A two-seat cart (`items/cart.vrmxi`, a VRMXI `vehicle`: the section proposed in
  `VRMXI-vehicle-proposal.md`) stands on the pavement outside the cafe (`apps/playground/src/vehicle.js`):
  - Mira gets in with the interact key at step 31, drives a recorded route (along the pavement, a lane change, the
    brakes) and gets out at step 421 with the cart parked; it goes from x 4 to x −1.96 and 1.2 m across, at up to
    4.15 m/s; the camera chases it for 390 steps;
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 3eb1af557e12014c;
  - the input recording replays into a fresh world with the same hashes, and a snapshot mid-drive re-simulates to the
    end;
  - checks 1–18 are unchanged, so 19 of 19 pass.
- **Check 20** (W9, AB-T-0548): split screen. Two players on one keyboard and one gamepad (`apps/playground/src/split.js`,
  input's `twoPlayerActions`): Mira is player 1 on WASD and the mouse, Hana player 2 on the arrows and the gamepad, each
  with a follow camera of their own:
  - each walks relative to their own camera and they run apart (Mira 4.67 m left, Hana 4.67 m right); Hana jumps; the
    gamepad's right stick turns player 2's camera (−0.89 rad) and leaves player 1's alone;
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 85c5829125340355;
    the recording of both players (9 axes, 8 buttons) replays into a fresh world with the same hashes, and a snapshot
    re-simulates;
  - checks 1–19 are unchanged, so 20 of 20 pass.
- **Split screen's cost** (`node acceptance/m3/split-chromium.mjs` against the playground's dev server, `?split`,
  `results/m3-split-chromium.json` and `m3-split.png`). At 1920×1080 in Chromium, two views take 1.0 ms a frame against
  0.5 ms for one (the median of 40; a second run gave 0.8 against 0.5). That is 241 draw calls against 178: the shadow
  map is drawn once (M2's `renderViews`), where two full views would be about 356.
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
