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
| Readback | `readbackFor(host, w, h)` picks it by backend. WebGL: `readPixels` into a pixel-pack buffer with a fence, copied out one frame later (WebGL2); the bytes are the drawing buffer's, RGBA bottom-up, premultiplied. WebGPU (M4 W2): `GPUReadback`, below |
| Sinks | `shellSink`: `export.begin` (save panel or `VRMXG_SHELL_EXPORT`), raw frames by `fetch` POST to the custom scheme (or the page's origin), the WAV, `export.end` (AVAssetWriter, VideoToolbox; the WAV muxed as AAC afterwards). `hashSink`: a hash per frame |
| Sound | The audio service records from step 0; after the frames the take runs on to the end of the last frame and `mixTake` mixes offline, one step later than the recording's steps (live play hears a sound begun on step k from (k + 1) / 60 s), cut to exactly the frames' length |
| Stills | `await captureStill(host, { width, height })` draws the host's view at a size and puts its own back, on either backend (a promise since M4 W2: WebGPU maps its readback asynchronously); `encodePNG`, `toBase64` for the shell's `file.save` / `project.write` |

Determinism: the frames depend only on the take and the frame rate, so two exports give the same pixels frame for
frame; the shell hashes each frame as it arrives (`hash: true`). Decoded H.264 / HEVC frames can still differ between
encodes of the same pixels (VideoToolbox's rate control answers append timing, AB-L-0013; measured in
`apps/shell/Tests/VRMXGShellTests/DeterminismExperiment.swift`); ProRes 4444, intra only, decodes the same.

`exportTake` also takes `onFrame(n, step, alpha)`, called after each frame is drawn (the editor records the world's
hash there to place a difference between export and scrub). Each frame's bytes are copied before they go to the
shell's sink, because the readback reuses its buffer. A world with a fixed aspect (a sequence: 16:9) refuses an export
size of another aspect, rather than export a shot framed differently from the one scrubbed (M2 W12).

## WebGPU readback (M4 W2, AB-T-0574)

A WebGPU canvas can't be read with `readPixels`, and in WebKit `drawImage` of it gives the last presented frame
(AB-L-0372). `GPUReadback` (`src/gpu-readback.js`, from spike-webgpu-render, AB-R-1007) draws the frame into an output
render target instead and copies it out:

| Piece | What |
|---|---|
| `draw(fn)` | `renderer.setOutputRenderTarget(target)` around the render (`host.frameAt` or `host.render`), and the previous output put back, even when the draw throws. Not `setRenderTarget`: that skips tone mapping and sRGB and depth-tests against the target's own depth |
| `read(slot)` | `copyTextureToBuffer` into one of a ring of 3 `MAP_READ` buffers (rows padded to 256 bytes; none at 1080p or 4K), then `mapAsync`. A slot still holding a frame nobody took is refused |
| `take(slot, out)` | Waits for the map, copies the rows out tightly packed, unmaps. `readNow(out)` reads and takes one free slot (stills) |
| Rows | Top-down (a texture's order), premultiplied like the canvas. `topDown` says so on both readbacks (WebGL's is `false`); `toImageRGBA(bytes, w, h, { topDown })` flips only WebGL's. The export's job carries `topDown`, and the shell's writer (`ExportSettings.topDown`) flips only WebGL's rows |
| One target per size | `readbackFor` keeps one `GPUReadback` per renderer and size for the renderer's life: in r187, output targets made after the first one never received the draws (the spike's gotcha 3). `release()` frees the map buffers and keeps the target |
| In `exportTake` | `await rb.draw(() => host.frameAt(step, α))`, read frame n, take n − 1 (`lag` up to 2 fits the ring of 3), `host.advanceNodeFrame()` per frame as `frameAt` does. `backend` is in the result and the shell's page timings |

In Chromium a WebGPU canvas still at the browser's default 300×150 when an output target was drawn on its renderer
stopped following resizes (`toDataURL` kept giving 300×150). A view with a real size kept drawing after any number of
stills. The playground's still check gives the view a size first, and checks that the view follows a resize after the
stills.

Tests: `node --test test/` (the frame plan, the loop against a stand-in renderer and sink, the mix shift;
`test/readback.test.mjs`: WebGPU's row order, padding and ring against a stand-in device that keeps WebGPU's rules,
one target per size, `exportTake` and `captureStill` on a WebGPU host). Real WebGPU: the playground's `?mode=frames`.
