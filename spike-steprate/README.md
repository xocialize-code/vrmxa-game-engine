# VRMXG step-rate spike

*2026-11-17. Answers PRD §9 question 7's open point: should the fixed simulation step be 60 Hz or 120 Hz? 120 Hz
makes every common export rate (24, 30, 60, 120 fps) land on a step; 60 Hz matches the VRM spring-bone reference but
24 fps falls between steps. Node 26 (V8), three r187, `@pixiv/three-vrm` 3.5.5, `@vrmxg/dmath` installed. Machine: M5
Max, macOS 27.3.*

## Verdict

> **Adopted 2026-11-17 as decision AB-D-0245.**

**Keep the simulation at 60 Hz. Render any frame that falls between steps by interpolating the presentation (bone
rotations, transforms), never by stepping faster.**

- **120 Hz changes how hair moves, and nothing fixes it.** Over a 10 s walk / hard stop / spin / hop shot, spring bones
  stepped at 120 Hz end up p95 **2.7–23°** away from the same shot at 60 Hz (max 55–171°), depending on the model.
  The cause is in the spec, not the library: `VRMC_springBone` applies drag once per step, adds stiffness and gravity
  as a per-step displacement, and enforces bone length and collisions per step. UniVRM (the golden reference) runs one
  step per frame, and VRoid and UniVRM authors tune hair at about 60 Hz, so 60 Hz is what the asset was made to do.
- **Rescaling the parameters doesn't rescue 120 Hz.** Rescaling drag and forces so two half steps match one 60 Hz
  step in the linear part leaves the error about where it was (p95 2.7–25°). Errors grow again at 240 Hz (p95
  4–46°). Faster stepping moves toward a different, smoother system rather than toward the authored look.
- **It is real, not chaos.** The control run, the 60 Hz shot with the root moved by 10⁻⁹ m, differs by p95 0.00–0.02°.
  The 120 Hz differences are two to four orders of magnitude above that.
- **Interpolation costs well under a degree.** Interpolating a pose between two 60 Hz steps across a 30 Hz gap lands
  p95 0.9–2.5° from the real in-between pose. The error grows 2.3–3.7× when the gap doubles (between linear and
  quadratic), so across one 60 Hz step, where 24 fps frames need it, the conservative estimate is **p95 0.4–1.1°**.
  It also never changes the simulation: it's presentation only.
- **120 Hz would also double the step cost of everything.** From the spike receipts, a busy scene at 60 Hz (20
  VRoid-class characters 3 ms, Rapier 0.4 ms, 10k particles 0.7 ms, 50 NPCs 0.2 ms) is about 4.3 ms per step, a
  quarter of a 60 Hz frame on an M5 Max. At 120 Hz that becomes half a frame, before rendering, on the fastest Mac we
  have.
- **120 Hz doesn't even cover every export rate.** 25 and 50 fps need 600 Hz, and 29.97 fps never lines up. Any output
  rate that doesn't divide the step rate needs interpolation anyway, and so do 120 Hz and 144 Hz displays in live play.
  60 Hz plus interpolation is one mechanism for every case; 120 Hz would still need it.

## Results

Raw JSON: `results/steprate.json`. Angles are between each spring bone's world orientation in a variant and in the
60 Hz reference, sampled every 1/60 s, over all joints and all 600 samples.

| Model (spring joints, drag) | Control: 10⁻⁹ m nudge | 120 Hz raw | 120 Hz compensated | 240 Hz raw | 240 Hz compensated |
|---|---|---|---|---|---|
| vroid10 (106, drag 0–0.4) | 0.011 / 0.08 | 4.4 / 82 | 5.8 / 62 | 5.7 / 93 | 11.5 / 126 |
| seed (19, drag 1.0) | 0.022 / 2.0 | 2.7 / 148 | 2.7 / 148 | 4.1 / 148 | 4.1 / 148 |
| vroid0x (43, drag 0–0.4, gravity) | 0.000 / 0.01 | 23.2 / 171 | 24.6 / 179 | 22.6 / 179 | 45.7 / 180 |
| spec (4, drag 0.05, no colliders) | 0.000 / 0.00 | 10.8 / 55 | 10.2 / 24 | 13.5 / 62 | 24.4 / 42 |

*p95 / max, degrees. seed's chains have drag 1.0 (no carried velocity), so compensation leaves them unchanged; they
still differ, because the length constraint and collisions run per substep.*

**By phase** (vroid10, p95 degrees, 120 Hz raw): walk 7.2, hard stop 4.4, spin 2.2, hop 0.5. The largest differences
are in sustained motion, where the per-step drag and push add up.

**Interpolation** (60 Hz reference, slerp at 0.5 between two steps vs the real pose between them, p95 / median, degrees):

| Model | Across a 15 Hz gap | Across a 30 Hz gap | Ratio | Estimated across a 60 Hz gap (÷2.3) |
|---|---|---|---|---|
| vroid10 | 3.10 / 0.27 | 0.92 / 0.07 | 3.4 | ≈ 0.4 |
| seed | 2.76 / 0.30 | 1.08 / 0.10 | 2.6 | ≈ 0.5 |
| vroid0x | 5.30 / 0.66 | 1.53 / 0.21 | 3.5 | ≈ 0.7 |
| spec | 5.79 / 0.30 | 2.53 / 0.09 | 2.3 | ≈ 1.1 |

The worst single joints (max) are large in every variant, interpolation included, because the 60 Hz reference itself
has single-step flips of up to 179° where a stiff chain meets a collider (the "catapult" the conformance methodology
describes for single-step UniVRM). That is reference behaviour, and interpolating across it doesn't make it worse.

## What PRD §9 Q7 and §5 should say

- **Simulation clock: fixed 60 Hz**, one spring-bone step per tick, matching `VRMC_springBone` as UniVRM runs it (the
  conformance reference, `VRMXA_Specification/.../methodology.md` "Spring bone determinism").
- **Output frames at any rate:** frame *n* at *fps* has time *t = n / fps*; the clock steps to `floor(t · 60)` and
  renders the presentation at `α = frac(t · 60)` between that step and the next. At 24 fps, even frames have α = 0
  (exact steps) and odd frames α = 0.5. Frames whose time lands on a step are bit-identical across export rates (30,
  60, 24's even frames).
- **What interpolates:** bone local rotations (slerp through `dmath`, so exports stay bit-identical everywhere), node
  transforms, expression weights. Cameras, sequencer tracks and post effects are evaluated at the exact *t*. Particles
  either keep their previous step's positions to interpolate, or render the nearest step, a per-adapter choice.
- **If a scene needs a finer physics step** (fast vehicles, thin colliders), substep Rapier inside the 60 Hz tick.
  Spring bones and the rest of the clock stay at 60 Hz.

## Run it

```bash
node run.mjs [--models vroid10,seed,vroid0x,spec] [--out results/steprate.json]
```

It borrows `spike-determinism/web`'s node_modules, loader and models, and `engine/packages/dmath`. About 2 minutes.

## Caveats

- Node only (V8). The question is about dynamics, not engines; with `dmath` installed the same runs replay in JSC.
- One shot design and four models. A model with stiffer chains or more colliders could differ more or less, but the
  mechanism (per-step drag, push and constraint) applies to every `VRMC_springBone` model.
- The 60 Hz-gap interpolation figure is extrapolated from 30 Hz and 15 Hz gaps using the smallest observed ratio,
  so it is conservative.
- Compensation was tried only in its linear form; a scheme that also matched the constraint and collision behaviour
  would be a new integrator, which is exactly what conformance to UniVRM rules out.
