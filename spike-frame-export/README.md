# VRMXG frame-export spike

*2026-11-17. A throwaway spike for PRD §5.16 (offline render). It asks: what is the best way to get a three.js canvas in our WKWebView into a high-quality video file, rendered offline at any resolution and fps, with audio and optional transparency? Stack: Vue 3 + three r187 + `@pixiv/three-vrm` 3.5.5 in a thin sandboxed WKWebView wrapper (Swift, no Xcode project). Machine: M5 Max, macOS 27.3 (26C5047e).*

## Verdict

**Use binary frames to Swift and AVAssetWriter. WebCodecs is the browser-only fallback, nothing more.**

- **The pipeline:** render frame *n* into the canvas at export size → **asynchronous WebGL2 readback** (`readPixels` into a pixel-pack buffer, copied out one frame later) → **`fetch` POST of the raw RGBA to the wrapper's custom-scheme handler**, 2 requests in flight → Swift flips and swizzles with vImage (0.14 ms at 1080p, 0.42 ms at 4K) → **AVAssetWriter** (VideoToolbox hardware), with frame *n* stamped *n*/fps.
- **It is fast:** a 10 s shot exports in **1.0 s at 1080p30, 1.7 s at 1080p60, 2.7 s at 4K30 and 5.2 s at 4K60** (H.264, HEVC and ProRes 4444 all land within a few % of each other). The 4K numbers are limited by readback, not the encoder. HEVC with alpha is the one case limited by its encoder (4K60 takes 8.4 s).
- **Output is correct:** every file has 300 or 600 frames and is exactly 10.000 s long. H.264 and HEVC use **B-frames** (`has_b_frames=2`, 220 of 300 frames are B). Files are tagged BT.709 limited range. **A/V sync is exact:** the audio onset and the flash frame line up at 0 ms offset in all 23 exports, AAC priming included.
- **Transparency works:** use **ProRes 4444** (`yuva444p12le`, about 82 Mbps at 1080p30) or **HEVC with alpha** (`.mov`, 6 Mbps). ProRes needs un-premultiplied input (see gotchas).
- **Deterministic:** the per-frame SHA-256 of the raw pixels is identical across all of these:
  - 4 runs in separate processes, through both origins;
  - after `reset()` in the same page;
  - synchronous vs PBO readback;
  - rendering only 5 of the 300 frames;
  - a 60 fps export's even frames vs the 30 fps export.

  All 300 frames are distinct. Encoding is deterministic too: decoded frames match across encodes and across processes, and the files differ only in their container timestamps.
- **WebCodecs works inside WKWebView, but loses on everything except bytes.**
  - What works: `VideoEncoder` and `AudioEncoder` exist; avc, hevc, vp9 and av1 all report supported; H.264 is hardware-fast (222 fps at 1080p).
  - What's missing: no alpha, no B-frames.
  - H.264 problems: it **undershoots the requested bitrate by about 45%** and **drops frames** at low rates (186 of 300 frames at 2 Mbps).
  - HEVC problems: it runs at **12 fps at 1080p and 6 fps at 4K** (a 10 s 4K60 shot takes 95 s).
  - Colour: output is tagged full range with an sRGB transfer, and colour is about 2–3 code values off the source.
  - Quality at equal VMAF: on par with native for this content (WebKit HEVC even needs about 14% fewer bytes). So the 2× byte gap in AB-B-0038 is a Chrome problem, not a WebKit one.
- **Every other route is out:**
  - Base64 over `postMessage` or `callAsyncJavaScript`: about 2/3 of POST's speed sequentially, and roughly a third with PBO and 2 in flight.
  - Typed arrays over the bridge: they don't cross at all.
  - `takeSnapshot`: about 30 fps, needs the canvas on screen 1:1, no alpha.
  - `toBlob` PNG: 22 fps at 1080p, 7 fps at 4K.
  - Loopback POST: slower than the scheme and adds nothing.

## Results

Raw JSON is in `results/`: `wkwebview-*.json` from the wrapper, `quality-metrics.json`, `av-sync.json`, `determinism-summary.json`, `colour-check.json`. The test shot uses VRoid model 9096… (VRM 1.0, 106 spring joints) walking (`walk.vrma`, looped), with MToon, PCF soft shadows, a 512² generated ground texture, 12 spinning props and an orbiting camera. 4× MSAA. Rendering it costs about 2 ms per frame even at 4K, so these numbers measure transport, not rendering. A heavier scene will be limited by its render time.

### 1. Moving frames out of the web view (sink: Swift receives and discards)

Frames per second, end to end (render + readback + transfer + Swift receive), from the custom scheme origin unless noted. MB/s is raw RGBA.

| Method | 1080p fps | 1080p MB/s | 4K fps | 4K MB/s | Where the time goes (1080p / 4K) |
|---|---:|---:|---:|---:|---|
| baseline: render + 1 px read (waits for the GPU) | 415 | — | 542 | — | render 2.4 / 1.8 ms |
| baseline: render + sync `readPixels` | 210 | 1 740 | 88 | 2 920 | readback 4.0 / 11.1 ms |
| baseline: render + **PBO** readback | 476 | 3 950 | 206 | 6 850 | readback 1.5 / 4.2 ms |
| base64 (`Uint8Array.toBase64`) → `postMessage` (reply handler) | 102 | 844 | 30 | 991 | toBase64 0.5 / 2.5 ms, Swift decode 2.3 / 9.1 ms |
| base64 (FileReader, the avatar studio's bridge) → `postMessage` | 63 | 520 | 19 | 639 | FileReader 4.8 / 20.9 ms |
| Swift pulls base64 with `callAsyncJavaScript` | 91 | 759 | 30 | 984 | as above |
| `fetch` POST to custom scheme, sync `readPixels` | 140 | 1 165 | 52 | 1 710 | |
| same, 2 / 3 in flight | 167 / 183 | 1 385 / 1 520 | 62 / 66 | 2 042 / 2 173 | |
| **`fetch` POST to custom scheme, PBO readback** | 285 | 2 362 | 87 | 2 877 | |
| **same, 2 in flight** | **373** | **3 097** | **115** | **3 818** | 2.7 / 8.7 ms per frame in total |
| `fetch` POST to loopback (`http://127.0.0.1`), 1 / 2 / 3 in flight | 80 / 153 / 156 | 666 / 1 272 / 1 296 | 28 / 44 / 54 | 933 / 1 448 / 1 786 | |
| `canvas.toBlob` PNG → POST to scheme | 22 | 186 (1.1 MB PNG) | 7 | 234 (3.2 MB PNG) | PNG encode 30 / 93 ms, Swift decode 13 / 47 ms |
| `WKWebView.takeSnapshot` | 30 | 248 | 29 | 977 | 2 × rAF to composite, then snapshot: display bound |
| `postMessage(Uint8Array)` | — | — | — | — | not usable: arrives as `NSDictionary` `{"0":1,"1":2,…}` |

### 2. End-to-end exports through AVAssetWriter (10 s shot, WAV muxed as AAC)

Method: PBO readback + scheme POST with 2 in flight. Bitrates are average-bitrate targets. H.264 is set to 16/24 Mbps at 1080p and 50/80 at 4K; HEVC to 60% of that. The time is from the first render to `finishWriting` returning.

| Codec | Shot | Export time | fps | File | `finishWriting` |
|---|---|---:|---:|---:|---:|
| H.264 High | 1080p30 | **1.02 s** | 295 | 20.1 MB | 11 ms |
| HEVC Main | 1080p30 | 0.94 s | 319 | 12.7 MB | 12 ms |
| HEVC with alpha | 1080p30 | 1.25 s | 240 | 7.7 MB | 79 ms |
| ProRes 4444 (alpha) | 1080p30 | 1.00 s | 299 | 102 MB | 16 ms |
| H.264 High | 1080p60 | 1.74 s | 346 | 30.0 MB | 13 ms |
| HEVC Main | 1080p60 | 1.75 s | 343 | 19.0 MB | 12 ms |
| HEVC with alpha | 1080p60 | 2.29 s | 262 | 16.1 MB | 83 ms |
| ProRes 4444 (alpha) | 1080p60 | 1.72 s | 350 | 204 MB | 16 ms |
| H.264 High | 4K30 | 2.66 s | 113 | 54.7 MB | 35 ms |
| HEVC Main | 4K30 | 2.61 s | 115 | 34.0 MB | 34 ms |
| HEVC with alpha | 4K30 | 4.29 s | 70 | 15.5 MB | 294 ms |
| ProRes 4444 (alpha) | 4K30 | 2.71 s | 111 | 276 MB | 20 ms |
| H.264 High | 4K60 | **5.26 s** | 114 | 94.8 MB | 36 ms |
| HEVC Main | 4K60 | 5.22 s | 115 | 60.3 MB | 35 ms |
| HEVC with alpha | 4K60 | 8.41 s | 71 | 33.5 MB | 309 ms |
| ProRes 4444 (alpha) | 4K60 | 5.09 s | 118 | 552 MB | 20 ms |

The writer applied backpressure (`isReadyForMoreMediaData` false) only for HEVC with alpha: 1.6–2 ms per frame at 1080p and about 10.5 ms at 4K. VideoToolbox lists hardware encoders for H.264, HEVC, HEVC "Muxed Alpha" and ProRes 422/4444/4444 XQ (`AppleProResHW`).

**WebCodecs in WKWebView, same shot, muxed in JS with mediabunny 1.66.0, then one POST of the MP4.** `latencyMode: 'realtime'`, `bitrateMode: 'variable'`, AAC audio through mediabunny's `AudioBufferSource`.

| Codec | Shot | Asked | Got | Export time | Encode fps |
|---|---|---:|---:|---:|---:|
| H.264 (`avc1.640033`) | 1080p30 | 16 Mbps | 8.8 Mbps | 1.35 s | 236 |
| H.264 | 1080p60 | 24 | 12.5 | 2.56 s | 240 |
| H.264 | 4K30 | 50 | 35.9 | 4.99 s | 61 |
| HEVC (`hvc1.1.6.L153.B0`) | 1080p30 | 10 | 9.5 | 24.7 s | 12 |
| HEVC | 1080p60 | 15 | 14.2 | 42.7 s | 14 |
| HEVC | 4K30 | 30 | 28.5 | 51.3 s | 6 |
| HEVC | 4K60 | 48 | 45.5 | 95.3 s | 6 |
| HEVC, `alpha: 'keep'` | — | — | — | `VideoEncoder is not configured` | — |

No output chunk ever came back out of timestamp order, so neither codec produced B-frames. In ffprobe, WebKit's HEVC frames show `pict_type=B` with `has_b_frames=0`: these are low-delay B slices with no reordering.

**What WebKit's WebCodecs reports** (`isConfigSupported`, 1080p and 4K):
- avc, hevc, vp9 and av1: all `true`, including `hardwareAcceleration: 'prefer-hardware'` for VP9 and AV1, so the hint is ignored.
- `alpha: 'keep'`: `false` for every codec.
- `bitrateMode: 'quantizer'`: **throws a TypeError**.
- AudioEncoder: aac, opus and pcm-s16 are supported, flac is not. `MediaStreamTrackProcessor` is undefined.
- `latencyMode: 'quality'` **did not wedge** here: H.264 and HEVC at 1080p, 30 frames each, finished normally. AB-B-0039 saw Safari 27.2 hang at this size; WKWebView on 27.3 does not. I tried only 30 frames.

### 3. Quality at equal bytes (1080p30, 10 s)

Reference: the raw BGRA frames (2.5 GB, written by the same pipeline in raw mode), converted to 4:2:0 BT.709 limited range. Distorted: each file scaled to the same representation. Metrics from ffmpeg 9.0.2 `libvmaf` (VMAF mean / min, PSNR-Y, SSIM). *The full matrix is in `results/quality-metrics.json`.*

| Encoder | Target | Actual Mbps | Frames | VMAF | VMAF min | PSNR-Y | SSIM | B-frames |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| native H.264 | 2 | 2.05 | 300 | 81.7 | 76.0 | 35.2 | 0.9895 | 220 of 300 |
| native H.264 | 4 | 4.01 | 300 | 94.8 | 88.2 | 39.3 | 0.9969 | yes |
| native H.264 | 8 | 7.99 | 300 | 99.7 | 91.2 | 42.8 | 0.9987 | yes |
| native H.264 | 16 | 15.92 | 300 | 99.97 | 91.8 | 45.9 | 0.9992 | yes |
| native HEVC | 2 | 2.07 | 300 | 86.7 | 79.1 | 37.2 | 0.9942 | 224 of 300 |
| native HEVC | 4 | 4.03 | 300 | 96.5 | 89.0 | 40.8 | 0.9978 | yes |
| native HEVC | 8 | 7.98 | 300 | 99.75 | 90.3 | 43.7 | 0.9989 | yes |
| WebCodecs H.264 | 2 | 1.08 | **186** | *(invalid: 114 frames dropped)* | | | | none |
| WebCodecs H.264 | 4 | 2.16 | **292** | *(invalid: 8 frames dropped)* | | | | none |
| WebCodecs H.264 | 8 | 4.40 | 300 | 96.5 | 92.4 | 37.2 | 0.9968 | none |
| WebCodecs H.264 | 16 | 8.80 | 300 | 99.9 | 95.0 | 38.3 | 0.9982 | none |
| WebCodecs HEVC | 2 | 1.92 | 300 | 88.5 | 77.1 | 35.0 | 0.9940 | none |
| WebCodecs HEVC | 4 | 3.80 | 300 | 97.5 | 89.5 | 37.1 | 0.9973 | none |
| WebCodecs HEVC | 8 | 7.61 | 300 | 99.9 | 94.3 | 38.4 | 0.9984 | none |

Bitrate needed for VMAF 95, by log interpolation: native H.264 about **4.1 Mbps**, native HEVC about **3.65**, WebKit HEVC about **3.15**. WebKit H.264 reaches 96.5 at 4.4 Mbps, but below that it drops frames, so it has no valid point under 95.

PSNR tells a different story: WebCodecs output tops out at about 38–39 dB at any bitrate, while native reaches 46. `tools/colour-check.mjs` shows why. WebKit's RGB→YUV conversion is off by a systematic 2–3 code values: mean absolute error is 2.3–3.1 per channel, against native's 1.3–1.8. VMAF hardly notices; a colourist would.

Native time is about the same at every bitrate: about 0.9 s per 10 s shot.

### 4. Determinism (per-frame SHA-256 of the raw `readPixels` bytes, taken in Swift)

| Comparison | Frames identical |
|---|---|
| Run 1 vs run 2 vs run 4, each a new process, scheme origin | 300 / 300 |
| Run 3, loopback origin, vs run 1 | 300 / 300 |
| Pass B in the same page after `reset()` | 300 / 300 every run |
| PBO readback vs sync `readPixels` | 300 / 300 |
| Simulate all 300 frames, render only 0/1/75/150/299 | 5 / 5 |
| 60 fps export, even frames, vs 30 fps export | 300 / 300 |
| 4K, 60 frames, across runs | 60 / 60 |
| Encoded H.264 / HEVC / ProRes, two encodes in one process | decoded frames 90 / 90; files differ only in 7 timestamp bytes |
| Encoded H.264 / HEVC across two processes | decoded frames 90 / 90, same byte size |

The 300 frames all have different hashes, so the scene really moves.

### 5. Audio and alpha

- **Sync.** The shot lights a white square on frames where n % fps == 0, and the WAV beeps (sample-exact onset) at every whole second. In all 23 exports (native and WebCodecs, every codec, both fps, both resolutions) the audio onset minus the flash time is **0 ms**, with 10 of 10 flashes and 10 of 10 onsets found. See `results/av-sync.json`.
- **Alpha.** A transparent frame 0 of the shot as read back has 92.4% of pixels at alpha 0, 154,608 at 255, and MSAA edges in between. In the files:

| | Edge colour vs premultiplied input | Edge colour vs straight | Edge alpha error | Opaque colour error |
|---|---:|---:|---:|---:|
| ProRes 4444, un-premultiplied in Swift (shipped) | 62.1 | **0.29** | 0 (ffmpeg) | 0.08 |
| ProRes 4444 fed premultiplied BGRA | **0.11** | 61.9 | 0 | 0.08 |
| HEVC with alpha (`kVTAlphaChannelMode_PremultipliedAlpha`) | **6.5** (AVFoundation round trip) | 63.4 | 1.6 | 2.45 |

Errors are in 8-bit code values. ProRes figures come from ffmpeg decodes (`tools/alpha-compare.mjs`); HEVC figures from an AVFoundation round trip (`Exporter.alphaCheck`).

## Bugs and gotchas this spike found

1. **Typed arrays don't cross the WebKit bridge.** A `Uint8Array` sent with `postMessage` or returned from `callAsyncJavaScript` arrives as an `NSDictionary` keyed `"0"`, `"1"`, … An `ArrayBuffer` arrives as an empty dictionary. Binary data must go through `fetch`.
2. **A `Blob` POST body reaches `WKURLSchemeHandler` empty** (0 bytes). This bites `toBlob` output in particular. Send an `ArrayBuffer` or typed array instead: those arrive as `request.httpBody`, 33 MB at 4K, never as a stream.
3. **Synchronous `readPixels` is the real bottleneck**: 4.0 ms at 1080p, 11 ms at 4K, because WebGL runs in WebKit's GPU process. Reading into a `PIXEL_PACK_BUFFER` with a fence, and calling `getBufferSubData` one frame later, cuts that to 1.2 / 4.3 ms and doubles throughput. Its pixels are bit-identical to the synchronous path.
4. **Render into the canvas at export size, not into a `WebGLRenderTarget`.** In three r187, render targets get linear colour and no tone mapping; only the canvas gets `outputColorSpace`. The drawing buffer size (`setSize(w, h, false)`, `setPixelRatio(1)`) is independent of CSS size, and 4K works (`MAX_VIEWPORT_DIMS` is 16384). Read back in the same task as the render and you don't need `preserveDrawingBuffer`. `alpha: true` is needed for a transparent clear.
5. **ProRes 4444 stores whatever alpha convention you give it, and has no flag to say which.** Premultiplied BGRA from WebGL lands as premultiplied colour, which compositors and ffmpeg read as straight, giving dark fringes. Un-premultiply first (`vImageUnpremultiplyData_RGBA8888` works on BGRA, +0.2 ms at 1080p). For HEVC with alpha, set `kVTCompressionPropertyKey_AlphaChannelMode` to premultiplied instead.
6. **AVAssetReader decodes opaque alpha as 254** from both ProRes 4444 and HEVC with alpha, while ffmpeg decodes the same ProRes as 255. A test that checks `alpha == 255` gives a false failure.
7. **ffmpeg 9.0.2 doesn't see HEVC's alpha layer**: it reports `yuv420p`. Verify HEVC alpha through AVFoundation.
8. **Hash decoded frames, not files.** Two encodes of identical frames differ only in the `mvhd`/`tkhd`/`mdhd` creation and modification times. Use `ffmpeg -f framemd5`.
9. **WebKit's WebCodecs H.264 ignores the bitrate you ask for**: it delivered about 55% of the target. In `realtime` mode it **drops frames** under about 2–4 Mbps at 1080p, silently. The chunk count is the only signal, so guard it, as AB-R-0245 does. HEVC hits its target but runs at 6–14 fps.
10. **WebCodecs output is tagged `pc` range with an `iec61966-2-1` transfer**, and its colour is about 2–3 code values off the source. AVAssetWriter writes what you tag; set `AVVideoColorPropertiesKey` to BT.709 explicitly.
11. **`hardwareAcceleration` means nothing to WebKit's `isConfigSupported`.** VP9 and AV1 report `prefer-hardware: true`. Chrome treats the hint as a filter instead (AB-B-0038).
12. **mediabunny's AAC asked for 192 kbps produced 85 kbps.** Its HEVC track came out a frame short (9.967 s). Neither affects sync.
13. **`takeSnapshot` is capped by the display**: about 30 fps with the 2 rAFs needed to composite. It only captures what is on screen 1:1: the window must be at least export size in points (DPR 1 on this 7680×2160 display; a Retina screen halves that). It has no alpha, and colour goes through display colour management.
14. **The loopback server loses to the custom scheme**: 80 vs 140 fps sequentially at 1080p, 54 vs 66 fps at 4K even with 3 in flight. The scheme's IPC beats a TCP round trip. Nothing here needs loopback.
15. **SHA-256 in Swift costs 2.5 ms per frame at 1080p and 9.7 ms at 4K** on the serial sink queue, which cut throughput by a third. Hash on another queue, or only when testing.
16. **Audio:** read the WAV with `AVAssetReader`, set `timeRange` to the shot's length and append to an AAC `AVAssetWriterInput` from `requestMediaDataWhenReady` on its own queue. That keeps blocking reads off the cooperative pool (AB-L-0320). If export metadata matters (an AI disclosure comment, for example), remember AB-L-0320: macOS 26 drops iTunes metadata from `.mp4`; write `.m4v`.
17. **The sandboxed wrapper can only write inside its container** (`~/Library/Containers/com.xocialize.vrmxg-frame-export-spike/Data/tmp/vrmxg-frame-export`). The real app needs a save panel or security-scoped bookmark; `tools/collect.sh` copies results out.

## Determinism rules (what the shot does, and what would break it)

> **2026-11-17:** the 120 Hz clock below is superseded by decision AB-D-0245 ([`spike-steprate/`](../spike-steprate/README.md), AB-R-0932): keep the simulation at 60 Hz, because spring bones behave differently at 120 Hz, and render frames that fall between steps (24 fps's odd frames) by interpolating the presentation. The transport, encoder and sync results here don't depend on the step rate.

- **Time is a step counter, never the wall clock.** `SIM_HZ = 120`; frame *n* at *fps* advances to step `round(n / fps · 120)`, then renders. Animation (`AnimationMixer.update`), `vrm.update` (expressions, look-at, spring bones, MToon UV time) and anything integrated all get the fixed `1/120`. Camera, props and the sync flash are pure functions of `step / SIM_HZ`. Nothing reads `performance.now`, `Date`, rAF timestamps or `Math.random`. The export loop isn't driven by rAF at all: it awaits the transfer promises.
- **Pick a simulation rate that every export fps divides.** Then 30 and 60 fps exports are bit-identical where they overlap. With 120 Hz, 24/30/60/120 fps work. For 25 or 50 fps, use 600 Hz; for 29.97, fixed steps can't line up exactly with frames.
- **Spring bones have history, so frames must be stepped in order from `reset()`.** That means `mixer.stopAllAction`, `action.reset().play()`, `mixer.setTime(0)`, `vrm.update(0)` and `springBoneManager.reset()`. Rendering doesn't change state, which is why the sparse run matched. But "render frame 4,000" means simulating 4,000 steps first. That is the PRD's scrubbing problem: snapshot spring-bone state as well as physics state.
- **Not tested:** other GPUs or OS versions; Chrome or Safari against WKWebView for pixels (spike-physics found physics state matched across V8 and JSC); scenes with physics (Rapier is deterministic per build, per spike-physics); post-processing; `Math.sin` drift across engines (spike-physics gotcha 4 applies to anything that feeds simulation).

## What PRD §5.16 should say

> **Offline render (P0).** A shot is stepped on a fixed simulation clock (120 Hz by default; every export fps must divide it) from the shot's start, never from the wall clock. Each frame is rendered into the canvas drawing buffer at the export resolution. It is read back asynchronously (a WebGL2 pixel-pack buffer, one frame behind) and POSTed as raw RGBA to the wrapper's custom-scheme handler, with 2 frames in flight; the response is the backpressure. The wrapper flips and swizzles with vImage and encodes with AVAssetWriter, using VideoToolbox hardware:
> - **H.264 or HEVC `.mp4`/`.m4v` with B-frames** for delivery;
> - **ProRes 4444, straight alpha** (or HEVC with alpha) **`.mov`** for compositing;
> - dialogue and music muxed as AAC, or LPCM in `.mov`.
>
> Measured on an M5 Max: a 10 s shot exports in 1.0 s at 1080p30 and 5.2 s at 4K60, frame-exact A/V sync, bit-identical frames across runs. Export is far faster than real time, so a "render" button can show progress rather than a progress estimate. Verify determinism by hashing decoded frames, not files.
>
> **Browser-only fallback (P2):** WebCodecs H.264 + mediabunny (MPL-2.0). No alpha, no B-frames, about 55% of the requested bitrate, drops frames at low rates (guard the frame count), HEVC far too slow in WebKit.
>
> **Not used:** base64 frames over the message bridge, `takeSnapshot`, PNG sequences, wasm encoders (AB-B-0038: licence, patents, speed).

Two more lines are worth adding to §5.16:
- Under *Timeline scrubbing*: "spring-bone state is part of the snapshot".
- Under *Render passes*: "alpha export needs only `alpha: true` and a transparent clear; depth, normal and ID mattes would need extra render passes, each read back the same way".

**Licences and patents:** mediabunny is MPL-2.0. That is file-level copyleft: using it unmodified from npm is fine in a closed app, but changes to its own files must be published. It is actively maintained: 1.66.0 was published 2026-11-13. mp4-muxer (MIT) is deprecated in favour of mediabunny. Calling the OS's or the browser's encoder carries no codec-patent exposure (AB-B-0038).

## Run it

```bash
cd web && npm install && npm run dev                 # http://127.0.0.1:5244: preview of the shot (no wrapper, no export)
mac/scripts/build.sh                                 # web build + swiftc + ad hoc signed, sandboxed .app
APP=mac/build/FrameExportSpike.app/Contents/MacOS/FrameExportSpike
SPIKE_PLANS='probe,transfer,transferLoopback@loopback' $APP     # each plan in a fresh page load
SPIKE_PLANS='export,alpha,webcodecs' $APP
SPIKE_PLANS='determinism,determinism#2,determinism@loopback,quality,determinism#3' $APP
tools/collect.sh                                     # container → results/wkwebview-*.json, sample videos → out/
V=~/Library/Containers/com.xocialize.vrmxg-frame-export-spike/Data/tmp/vrmxg-frame-export/videos
node tools/quality.mjs $V                            # VMAF/PSNR/SSIM vs q-ref.bgra → results/quality-metrics.json
SAVE=results/av-sync.json node tools/av-sync.mjs $V/exp-*
node tools/determinism.mjs ${V:h}                    # → results/determinism-summary.json
node tools/alpha-compare.mjs $V/alpha-ref0.bgra $V/alpha-prores4444.mov
node tools/colour-check.mjs $V/q-ref.bgra 45 $V/q-*-16M.mp4
PURGE=1 tools/collect.sh                             # then delete the big videos (the quality reference is 2.5 GB)
```

Plans (`web/src/App.vue`): `probe`, `transfer`, `transferLoopback`, `export`, `alpha`, `alphaDebug`, `quality`, `determinism`, `webcodecs`. `SPIKE_QUERY='avatar=models/spec.vrm'` swaps the avatar. A plan's label (`#2`) only changes the results file name.

## Layout

| Path | What |
|---|---|
| `web/src/shot.js` | The deterministic shot: VRM + `.vrma` + spring bones + MToon + shadows + props + the sync flash. `advanceTo(t)` steps at 120 Hz; `renderFrame(n, fps)`; sync `readPixels` and the PBO pair `readToPBO` / `fromPBO`. |
| `web/src/bench.js` | A job: render N frames and hand each to Swift by one method, with per-stage timings. |
| `web/src/webcodecs.js` | WebCodecs capability probe and an encode of the shot muxed by mediabunny, with a timeout instead of a hang. |
| `web/src/native.js` | The bridge: `call()` over a `WKScriptMessageHandlerWithReply`, `post()` for binary bodies, both base64 encoders. |
| `web/src/App.vue` | The plans. |
| `web/scripts/make-wav.mjs` | The stand-in dialogue: 48 kHz stereo, a 1 kHz beep at every whole second over a noise bed. |
| `mac/Sources/main.swift` | Window, plan queue, the `native` reply handler (`begin`/`end`, base64 frames, `snapshot`, Swift-driven `pull`, `probeTypes`). |
| `mac/Sources/SchemeHandler.swift` | `vrmxg-export://` GET for files and POST for `__frame` / `__framepng` / `__save`, replying after Swift has consumed the body. Also `PostRouter`, shared with the loopback server. |
| `mac/Sources/LoopbackServer.swift` | Network.framework HTTP on 127.0.0.1 with keep-alive POST. |
| `mac/Sources/FrameSink.swift` | Reorders, hashes, converts (vImage flip+swizzle, un-premultiply for ProRes) and encodes or writes raw. |
| `mac/Sources/Exporter.swift` | AVAssetWriter: codec settings, BT.709 tags, the WAV via AVAssetReader → AAC, the alpha round-trip check, the VideoToolbox encoder list. |
| `tools/` | `quality.mjs`, `av-sync.mjs`, `determinism.mjs`, `alpha-compare.mjs`, `colour-check.mjs`, `collect.sh`. |
| `results/` | Raw JSON. |
| `out/` | Five short samples (gitignored): H.264, HEVC, HEVC with alpha and WebCodecs H.264 at 1080p30 10 s; ProRes 4444 alpha, 1 s. |

**Models:** `npm run models` copies `vroid10.vrm`, `spec.vrm`, `idle.vrma` and `walk.vrma` from `spike-physics/web/public/models/` into `web/public/models/`. That folder is not in git and must never ship (VRoid model licence: modification and corporate use allowed, credit required).

## Caveats

- One machine: an M5 Max with several media engines. A base M-series chip has fewer encoders and slower readback, so export times will be longer, though the ranking should hold. One display, at DPR 1.
- The test scene is light (about 2 ms per frame at 4K). The transport figures are a ceiling on throughput; a production shot with post-processing will be limited by its render time.
- Quality metrics come from one 10 s clip of CG content. B-frames buy less on smooth CG than on camera footage, so don't generalise the near parity between WebCodecs and native at equal VMAF beyond this kind of content.
- I tried `latencyMode: 'quality'` with only 30 frames, and checked WebCodecs only inside WKWebView, not in Safari.
- I didn't try `AVVideoQualityKey` (constant-quality VBR) or `shouldOptimizeForNetworkUse` (moov at the front, an extra pass at the end).
- I didn't try LPCM audio in `.mov`.
