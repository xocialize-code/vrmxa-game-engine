# Feedback Assistant report FB25710847 (AB-T-0589)

*Filed by the operator from their own account on 2026-11-24 as **FB25710847** (decision AB-D-0278). This is the text
as drafted; what was filed may differ in small ways. Later findings are added to the report only when significant: the
re-test on the release macOS (AB-T-0591) is the next one expected.
The numbers come from `results/metal-machine-*.json`; the attachments are listed at the end.*

---

**Title:** Metal: the same 4× MSAA draw sometimes renders differently (the first-draw result comes back) when other GPU work is running

**Area:** Metal / GPU driver (graphics)

**Type:** Incorrect / unexpected behaviour

**macOS:** 27.3 beta (26C5047e)

**Hardware:** Mac Studio, Apple M5 Max, 40-core GPU (Mac17,14)

## Description

Drawing the same indexed mesh into the same render target, with identical state, buffers and textures every time,
doesn't always give the same pixels. While another process is using the GPU, a draw now and then comes out slightly
different: a handful of pixels, by 1 to 10 levels. Two copies of the attached tool running at once make it easy to see.

- **With 4× MSAA (resolved at the end of the pass):** two copies at once gave 40 and 51 odd draws in 40,000 each, about
  1 in 900. The odd images come in about a dozen variants; the most common appears in both processes (29 and 32 times).
- **With one sample:** two copies at once gave 5 and 4 odd draws in 40,000 each.
- **The first MSAA draw** into freshly created targets always differs from every later draw. Under lighter load, the odd
  draws were exactly this first-draw image.

We found this through WebGPU, in WKWebView (WebKit) and in Chromium (Dawn): exports of an animation that must be
identical on every render had a frame differing in a few pixels, while other GPU work was running. The same mesh drawn
through WebGPU reproduces it in both engines. The attached native Metal tool reproduces it without WebKit or Dawn, and
gives the identical odd image that WebGPU gives.

## Steps to reproduce

1. Unzip the attachment (one folder) and build the tool: `swiftc -O machine.swift -o machine`.
2. In two terminals at the same time, run
   `./machine --glb espresso-machine.glb --camera 5-machine-frame72.json --iters 40000 --out a.json` and the same with
   `--out b.json`.
   Each iteration draws the mesh (39,782 triangles, no culling, depth32Float, the same shading every time) at
   1920×1080, in two modes:
   - `msaa`: 4 samples, `storeAction = .multisampleResolve` into an rgba8Unorm texture.
   - `one`: 1 sample.

   After each draw the tool blits the result to a shared buffer, waits for completion, hashes it, and compares the hash
   with the first steady-state draw. `modes.<mode>.differ` in the JSON counts the draws that differed; `--png dir` also
   writes the reference and the first odd draw as PPM files.
3. One copy alone, on an otherwise idle Mac, shows it rarely (1–2 in 60,000 MSAA draws).

## Expected results

Every draw after the first, in both modes, gives the same bytes. The first MSAA draw gives the same bytes as the rest.

## Actual results

| Run | MSAA draws that differed | One-sample draws that differed |
|---|---|---|
| Two copies at once (GPU ~27% busy) | 40 / 40,000 and 51 / 40,000; ~12 distinct odd images each | 5 / 40,000 and 4 / 40,000 |
| One copy, a WKWebView app rendering with WebGPU at the same time | 13 / 120,000, all the first-draw image (hash `709bdc31`) | 0 / 120,000 |
| One copy, nothing else deliberately running (GPU ~18% busy, the tool included) | 1 / 60,000 and 2 / 60,000, the first-draw image | 0 / 120,000 |
| The same mesh through WebGPU in Chromium 156, with the WKWebView app running | 4 / 120,000, the same first-draw image | 0 / 120,000 |
| The same through WebGPU, two copies of the native tool running | Chromium 12 / 60,000; WKWebView 7 / 60,000 | 0 / 60,000 each |

In every run, the first MSAA draw into new targets differed from the steady state; the first one-sample draw didn't.

The odd pixels are on the mesh's top surface, around small parts close to it (the cups on top of the machine): the same
small region in every odd draw of this tool, with slightly different values, as if those samples were shaded or covered
differently. Under the lighter load, every odd MSAA draw was exactly the first-draw image; with two copies at once there
are a dozen or so variants in that region.

## Configuration

- One `MTLDevice` (`MTLCreateSystemDefaultDevice`) and one queue. A new command buffer per draw: render pass, then a blit
  to a shared buffer, then `waitUntilCompleted`.
- The render targets are created once and reused. The MSAA colour texture is rgba8Unorm with 4 samples and private
  storage; the depth is depth32Float with 4 samples and `storeAction = .dontCare`; both are cleared on load.
- Front-facing counter-clockwise, cull mode none.
- The fragment shader samples a mipmapped texture (implicit derivatives), uses `dfdx`/`dfdy` of the normal, and flips the
  normal on back faces (`[[front_facing]]`).

## Attachments

- `machine.swift`: the native repro (one file, no dependencies).
- `espresso-machine.glb` and `5-machine-frame72.json`: the mesh and the camera. The mesh was generated with TRELLIS.2
  (MIT), whose DINOv3 conditioner asks for the credit "Built with DINOv3".
- Three image sets (`results/metal-images/`), each with `reference.png` and `odd.png` at 1920×1080, the same region at 8×
  (`reference-crop-8x.png`, `odd-crop-8x.png`), and `diff-crop-8x.png` with the differing pixels in white:
  - `load-msaa`: MSAA with the WKWebView app running, where the odd draw is the first-draw image (39 values differ).
  - `pair-msaa`: MSAA with two copies at once (22 values differ).
  - `pair-one`: one sample with two copies at once (11 values differ).
- `metal-machine-*.json`: each run's counts.
- `5-machine-under-load.html` and `under-load.mjs`: the same repro in WebGPU, with its headless Chromium runner.

To regenerate the images: `node metal/images.mjs <reference.ppm> <odd.ppm> <out dir>`.
