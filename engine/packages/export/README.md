# @vrmxg/export

M1 W8 (AB-T-0520). Offline frame export, the pipeline spike-frame-export chose (AB-R-0927):

```js
import { exportTake, shellSink, SIZES, RATES, framesFor } from '@vrmxg/export';
const host = new RenderHost({ canvas: document.createElement('canvas'), dprCap: 1 });   // its own drawing buffer
world.input.replay(take.input);                                                          // the take, from step 0
const r = await exportTake({ tree: world.tree, host, fps: RATES['30'], frames: framesFor(10, RATES['30']),
  width: 1920, height: 1080, sink: shellSink({ call }), job: { codec: 'h264', suggestedName: 'cafe.mp4', hash: true } });
```

| Piece | What |
|---|---|
| The clock | Frame n shows `frameToStep(n, fps)` (core): the step and α, in integer arithmetic, so 24, 25, 29.97, 30, 50 and 60 fps land exactly. `RenderHost.frameAt(step, α)` runs the steps (waiting out held ones) and draws the blend live play would have shown |
| Readback | `readPixels` into a pixel-pack buffer with a fence, copied out one frame later (WebGL2); the bytes are the drawing buffer's, RGBA bottom-up, premultiplied |
| Sinks | `shellSink`: `export.begin` (save panel or `VRMXG_SHELL_EXPORT`), raw frames by `fetch` POST to the custom scheme (or the page's origin), the WAV, `export.end` (AVAssetWriter, VideoToolbox; the WAV muxed as AAC afterwards). `hashSink`: a hash per frame |
| Sound | The audio service records from step 0; after the frames the take runs on to the end of the last frame and `mixTake` mixes offline, one step later than the recording's steps (live play hears a sound begun on step k from (k + 1) / 60 s), cut to exactly the frames' length |
| Stills | `captureStill(host, { width, height })` draws the host's view at a size and puts its own back; `encodePNG`, `toBase64` for the shell's `file.save` / `project.write` |

Determinism: the frames depend only on the take and the frame rate, so two exports give the same pixels frame for
frame; the shell hashes each frame as it arrives (`hash: true`). Decoded H.264 / HEVC frames can still differ between
encodes of the same pixels (VideoToolbox's rate control answers append timing, AB-L-0013; measured in
`apps/shell/Tests/VRMXGShellTests/DeterminismExperiment.swift`); ProRes 4444, intra only, decodes the same.

Tests: `node --test test/` (the frame plan, the loop against a stand-in renderer and sink, the mix shift).
