# Spike: where a face take's face comes from (M4 W9, AB-T-0581)

*Receipt AB-R-1085; decision AB-D-0281.*

**Verdict: Vision's face landmarks, in the Mac shell.** They give a face take all five things it needs (blink, mouth,
smile, brows, head) at 4 ms a frame off the page's thread, with nothing to ship: the shell already runs Vision for the
camera (`spike-camera/`). MediaPipe's 52 blendshapes are affordable natively (3 ms a frame on the CPU: the page's
problem was its main thread, not the model), and they are steadier, and stronger on a smile and on raised brows. But
they read a frown poorly on one face in four, their resting values differ from person to person as much as Vision's
do, and there is no MediaPipe build for a macOS Swift app. That last point is the cost: building MediaPipe for macOS,
or porting its three TFLite models to Core ML, is days of work the take doesn't need yet.

A face take's sample format doesn't name its source (`@vrmxg/takes` `face.js`), and both paths were scored through the
same take filter here. So switching later changes the capture, and nothing after it.

**Not measured here, and it matters:** a real person in front of a real camera. Every number below is from synthetic
faces and still pictures. Jitter over time, lag as it feels, low light, glasses, a beard, hair across an eye, and
whether a wink reads, all wait for the operator's session (AB-T-0557; steps in
`apps/creator-mac/docs/HAND-TEST-M4-TAKES.md`).

Measured 2026-11-23 on a Mac Studio M5 Max (128 GB), macOS 27.3 beta, with the machine's GPU lock held and other jobs
idle. Vision: `swiftc -O`, the shell's own `FaceShape.swift` compiled in. MediaPipe: the `mediapipe` 1.2.3 Python
package (native code, CPU delegate through XNNPACK) on Python 3.12, with `face_landmarker.task` (float16).

## What was asked

W9's plan: Vision's face landmarks in the shell, or MediaPipe's face blendshapes running natively, for blink, mouth,
smile, brows and head; latency, CPU, and how well each gives them for an anime face. The camera spike (AB-R-1029) had
ruled out MediaPipe in the page: 15 ms of the main thread per camera frame.

## The faces

No real person's face was used. `faces/make-faces.mjs` makes four synthetic people on the local Gaea: each is one
generated portrait framed as a webcam sees someone at a desk (Z-Image-Turbo), and every other picture of that person
is an edit of it that changes one thing (FLUX.2 Klein 4B): a blink, an open mouth, a smile, raised brows, a frown, the
head turned a little or a lot each way, tipped up, down, or to a shoulder. That is 56 pictures at 1024×768, scaled to
the camera's 640×480 for both detectors. Prompts, seeds and licences are in `results/faces.json`; the pictures are
git-ignored and remade by the script.

Looked at by eye (`results/faces-review.json`):
- **Every edit did the one thing asked and kept the person, except the wink.** All four came out as both eyes shut,
  so a wink is untested. One tilt was a lean, not a tilt. Those five are left out.
- **The turns are stronger than asked.** "About ten degrees" came out near 35° (a three-quarter view), and "thirty"
  near profile. Up, down and the tilt are 30° to 45°. They test the limits more than a person facing a camera would.
- **Smiles show teeth**, so the mouth is a little open in them.

Each picture also gets eight copies nudged by a pixel or two (a 3 % zoom, a shift of up to 3 px): how far a number
moves when the face didn't is its noise.

## Results

**Speed.** Both found a face in 56 of 56 pictures, near profile included.

| | ms per frame, median / p90 | CPU ms per frame | Where it would run |
|---|---|---|---|
| Vision: face rectangle (what the shell ran before) | 2.96 / 3.34 | 1.93 | the shell's capture queue |
| Vision: rectangle and landmarks (a face take) | **3.98 / 4.48** | **2.68** | the shell's capture queue |
| MediaPipe, frame by frame | 3.36 / 3.43 | 3.72 | (no macOS Swift build: see below) |
| MediaPipe, as video (tracking between frames) | **2.85 / 2.92** | **3.19** | |

At 30 frames a second either is about 12 % of one core's time, and none of the page's. The landmarks add 1 ms to what
the shell already did. For comparison, MediaPipe in the page took 2.7 ms on the GPU delegate or 14.2 ms on the CPU
delegate, on the main thread (AB-R-1029).

**What each reads.** Both outputs are made the take's face sample first, then compared. "Change" is the move in a
pose's own value from that person's neutral picture (0 to 1; the head in radians), the mean of four people, and
"least" the weakest of them. "Crosstalk" is the mean of the largest move in any other expression value in the same
picture, with the worst case named.

| Pose | Vision: change | least | crosstalk | MediaPipe: change | least | crosstalk |
|---|---|---|---|---|---|---|
| blink | 0.50 | 0.26 | 0.08 (brows up 0.13) | 0.45 | 0.24 | 0.11 (brows up −0.20) |
| mouth open | 0.93 | 0.87 | 0.18 (smile −0.21) | 0.75 | 0.63 | 0.15 (frown −0.37) |
| smile | 0.63 | 0.50 | 0.24 (mouth 0.28) | 0.92 | 0.90 | 0.13 (brows up −0.27) |
| brows up | 0.34 | 0.21 | — | 0.71 | 0.48 | — |
| frown | 0.36 | 0.29 | — | 0.42 | 0.27 | — |
| head a three-quarter turn left | 0.68 rad | 0.63 | 0.24 (brows up 0.32) | 0.55 rad | 0.53 | 0.14 (frown −0.27) |
| head a three-quarter turn right | 0.35 rad | 0.22 | 0.24 (blink −0.37) | 0.48 rad | 0.43 | 0.18 (brows up 0.24) |
| head near profile left | 1.01 rad | 0.95 | 0.24 (blink −0.35) | 0.73 rad | 0.68 | 0.28 (frown −0.39) |
| head near profile right | 0.49 rad | **0.12** | 0.46 (brows up 0.62) | 0.68 rad | 0.66 | 0.17 (brows up 0.26) |
| head up | 0.61 rad | 0.55 | 0.11 (smile 0.20) | 0.57 rad | 0.47 | 0.44 (brows up **0.83**) |
| head down | 0.38 rad | 0.27 | 0.49 (blink 0.58) | 0.38 rad | 0.29 | 0.44 (blink 0.54) |
| head tipped to a shoulder | 0.79 rad | 0.67 | 0.31 (brows up 0.48) | 0.67 rad | 0.62 | 0.59 (brows up **0.90**) |

(Brows up and frown are two ends of one measurement for Vision, so each is the other's "crosstalk" and it isn't shown.)

| Noise (sd over nudged copies) | blink | mouth | smile | brows up | frown | yaw | pitch | roll |
|---|---|---|---|---|---|---|---|---|
| Vision | 0.019 | 0.012 | 0.020 | 0.021 | 0.021 | 0.016 | 0.016 | 0.014 |
| MediaPipe | 0.009 | 0.002 | 0.001 | 0.020 | 0.010 | 0.004 | 0.004 | 0.003 |

**On her face.** Each person's pictures were played as a session (a second of neutral, then each pose held for half a
second with a rest between) through the take's `FaceFilter`, as a face take would. "Reaches" is the weight her own
expression gets (blink and mouth to 1, smile to 0.9, brows to 0.5 by the filter's weights; the head is clamped at
0.7, 0.45 and 0.4 rad), and "stray" the largest other expression weight during that pose.

| Pose | On her | Vision: reaches | least | stray | MediaPipe: reaches | least | stray |
|---|---|---|---|---|---|---|---|
| blink | `blink` | 0.93 | 0.71 | 0.05 | 0.76 | **0.02** | 0.06 |
| mouth open | `aa` | 1.00 | 1.00 | 0.06 | 0.92 | 0.79 | 0.01 |
| smile | `happy` | 0.90 | 0.90 | `aa` 0.30 | 0.90 | 0.90 | 0.03 |
| brows up | `surprised` | 0.37 | 0.20 | 0.00 | 0.46 | 0.36 | 0.00 |
| frown | `angry` | 0.44 | 0.35 | 0.00 | 0.32 | **0.15** | 0.00 |
| three-quarter turn left / right | head yaw | 0.67 / 0.38 rad | 0.64 / 0.27 | `surprised` 0.37 / 0.24 | 0.55 / 0.48 rad | 0.53 / 0.43 | `surprised` 0.10 / 0.15 |
| near profile left / right | head yaw | 0.70 / 0.48 rad | 0.70 / 0.13 | `happy` 0.34, `surprised` 0.50 | 0.70 / 0.69 rad | 0.69 / 0.66 | `surprised` 0.33 / 0.19 |
| head up | head pitch | 0.45 rad | 0.45 | `happy` 0.20 | 0.45 rad | 0.45 | `surprised` 0.48 |
| head down | head pitch | 0.36 rad | 0.26 | `blink` 1.00 | 0.34 rad | 0.30 | `blink` 1.00 |
| head tipped | head roll | 0.40 rad | 0.40 | `surprised` 0.36 | 0.40 rad | 0.40 | `surprised` 0.50 |

At rest, nothing strays past 0.03 on either.

## What the numbers say

- **Both give the five.** A blink shuts her eyes, an open mouth opens hers, a smile is a smile, brows go up and come
  down, and the head follows, on all four people, with either detector. Two exceptions, both MediaPipe's: one person's
  half-shut "blink" reads as nothing (0.02), and one person's frown barely registers (0.15: its frown score for her
  went from 0.00 to 0.04, though her brows-up score fell from 0.49 to 0).
- **A resting face is not zero, for either.** At rest Vision's brows sit at 0.25 to 0.33 eye distances, and an open
  eye at 0.18 to 0.22 of its width. MediaPipe's inner-brow score rests anywhere from 0.00 to 0.49, and its frown score
  from 0.00 to 0.44. So the take takes the rest out of every value, the eyes included (`FaceFilter`: the median of the
  first second). Without that, a smile shut Vision's eyes on the first try here: a smile narrows the eye 0.13 to 0.30
  of the way from its rest, and a blink shuts it 0.41 to 0.99 of the way.
- **Vision is noisier**: about 0.02 on everything, against MediaPipe's 0.001 to 0.02. The filter's dead zones (0.05 to
  0.08) and smoothing sit above that, and at rest nothing strays. How it looks in motion is the live session's
  question.
- **Vision is weaker on raised brows** (0.34 against 0.71 in the sample's own units), because a brow travels only
  about a tenth of the distance between the eyes. On her face that is 0.37 of a possible 0.5, against 0.46.
- **Vision reads an open-mouthed smile as some mouth** (`aa` 0.30): the lips part to show teeth and its measure is the
  gap between the lips. MediaPipe's is the jaw, which didn't drop. For an anime face that is arguably right.
- **Head turns are where both go wrong, differently.**
  - Vision measures in the picture, so a turned head changed every distance. The shell now puts heights back by the
    turn's and the tip's cosines (`FaceShape.measure(_:yaw:pitch:)`), which works when Vision's own yaw is right.
  - **Vision's yaw is poor for faces turned far to the picture's right.** On two of the four near-profile faces it
    read 0.20 and 0.38 rad where MediaPipe read 0.67 and 0.70, and on those two the brows read raised. To the left it
    reads more than MediaPipe instead (0.91 to 0.99 rad against 0.67 to 0.83). At three-quarters the two are within
    0.17 rad of each other on every face.
  - MediaPipe's brows read raised with the head tipped to a shoulder or looking up, fully on some faces (0.83 to
    0.90), though the brows hadn't moved.
  - Looking down reads as a blink on both: the lids do cover the eyes from the camera's side.

  A person facing the camera turns far less than these pictures do. The take clamps the head (0.7, 0.45 and 0.4 rad),
  and a kept take's keys are edited like any others.

## Why Vision, for now

- **It is in the shell.** `camera.start { face: true }` (shell 0.8.0) adds `face.shape` to each frame: 1 ms more than
  the shell already spent, on its capture queue, and only numbers reach the page.
- **Nothing to ship.** MediaPipe's package has builds for iOS, Android, the web and Python, and none for a macOS Swift
  app. Running it natively in the shell means building it from source for macOS, or converting its three TFLite
  models (detector, mesh, blendshapes) to Core ML and writing the glue between them, or a Python sidecar (which is how
  this spike ran it, and nothing to ship in an app).
- **The take's filter evens out most of the difference**: rest taken out, dead zones, smoothing, clamps. The table of
  what reaches her face is much closer than the table of raw values.
- **A take is edited afterwards.** What a take needs from capture is the right shape at the right time, not finished
  animation.

**When to revisit:** if the operator's session shows Vision's noise makes her face shimmer, that its yaw makes a
turned head unusable, or that winks don't read. Then the Core ML port of MediaPipe's models is the next step, and the
blendshape path is already written (`faceFromBlendshapes`) and tested against these faces.

## Run it

```sh
node acceptance/gpu-lock.mjs run -- node spike-face/faces/make-faces.mjs      # the faces, on the local Gaea (about 25 minutes)
cd spike-face && mkdir -p build
swiftc -O ../apps/shell/Sources/VRMXGShell/FaceShape.swift vision/main.swift -o build/vision-face
./build/vision-face faces/out results/vision.json --repeat 30 --jitter 8
python3.12 -m venv <scratch>/venv && <scratch>/venv/bin/pip install mediapipe numpy pillow
<scratch>/venv/bin/python -I mediapipe/run_face.py faces/out <face_landmarker.task> results/mediapipe.json --repeat 30 --jitter 8
node analysis/analyse.mjs                                                     # results/summary.json, and the tables above
```

`face_landmarker.task` is the model the camera spike fetched (`spike-camera/web/scripts/fetch-models.mjs`). Take the
timings with the GPU lock held and nothing else running. `results/` holds the manifest of the faces, the review, both
detectors' raw output and the summary.
