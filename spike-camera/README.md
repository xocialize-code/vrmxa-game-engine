# Spike: where camera capture runs (M3 W5, AB-T-0544)

**Verdict: capture runs in the Mac shell.** It is confirmed live in the playground's Mac app: wave and nod answered (low light, 2026-11-19). AVCapture and Apple's Vision run on a background queue and send only
numbers to the page, as `camera.frame` events (shell 0.5.0, `camera.start` / `camera.stop`). In-page MediaPipe works
too, but it costs the page's main thread about a frame's budget per camera frame. It stays a browser-only option,
built here and not shipped. Both paths give the same feature frames, so `@vrmxg/sense` doesn't care which one ran.

Measured 2026-11-19 on a Mac Studio M5 Max (128 GB), macOS 27.3, Release builds, other jobs idle. The clip is a 540×960
stock clip of a person, 300 frames. It sits in a local training corpus and is not copied here (as in the avatar studio's
trial AB-R-0911).

## What was asked

1. Does the shell's custom scheme count as a secure context for `getUserMedia`? The plan feared it wouldn't.
2. Native (AVCapture with Vision in the shell) or the page (MediaPipe `tasks-vision`, the avatar studio's choice in
   AB-D-0241)?

## Results

**The scheme is a secure context.** In a fresh sandboxed WKWebView (this spike's `mac/`, the shell's shape):

| Origin | `isSecureContext` | `navigator.mediaDevices` | `getUserMedia` | devices listed |
|---|---|---|---|---|
| `vrmxg-camera://app` (custom scheme) | true | object | function | audioinput, videoinput |
| `http://127.0.0.1:<port>` (loopback) | true | object | function | audioinput, videoinput |

The web view grants capture through `WKUIDelegate.requestMediaCapturePermissionFor`, and only for its own two origins.
That still needs the camera entitlement and `NSCameraUsageDescription`. Whether a stream actually arrives needs a person
to accept macOS's prompt: the live session below.

**Cost per frame**, median and p90 in ms on the clip:

| Path | Face | Hands | Body | Where |
|---|---|---|---|---|
| MediaPipe 1.2.2, GPU delegate, WKWebView loopback | 2.7 / 5.7 | 12.4 / 18.3 | 7.3 / 10.2 | the page's main thread, blocking |
| MediaPipe 1.2.2, GPU delegate, Chromium 156 | 2.7 / 2.9 | 11.7 / 12.4 | 8.0 / 8.5 | the page's main thread, blocking |
| MediaPipe 1.2.2, CPU delegate, WKWebView loopback | 14.2 / 22.0 | 41.6 / 53.6 | 28.1 / 33.6 | the page's main thread, blocking |
| Vision (macOS 27.3), in the app | 4.1 / 4.8 | 6.3 / 6.9 | 4.2 / 4.5 | a background queue; **7.9 ms of CPU per frame for all three** |

The scheme origin's timer resolves only 1 ms (AB-L-0346), so its rows read in whole milliseconds. They agree with
loopback: face 3, hands 13, pose 9 on the GPU delegate.

- **Faces at a distance.** MediaPipe's face landmarker found no face in this clip or in 12 other full-body clips: its
  detector is the short-range one, for faces near the camera. Vision found a face in all 300 frames. At a desk both will
  see you; Vision also sees you from across the room.
- **Hands.** Vision found 334 hands in 300 frames, MediaPipe 600 (two every frame). There is no truth for this clip, so
  this counts detections, not accuracy.
- **What it costs the game.** Face and hands through MediaPipe take about 15 ms of the page's main thread (p90 about
  24 ms) per camera frame, almost a whole 60 Hz frame beside the renderer. A worker might move that off the main thread;
  it wasn't measured. Vision costs the page nothing, and the work it does is about half a core's frame time at
  15 frames a second.

## Why native

- the page's frame budget stays the game's;
- no downloads: Vision is part of macOS, while MediaPipe is a 31 MB package and 12 MB of models fetched from Google;
- yaw, pitch and roll come straight from Vision (VNFaceObservation, revision 3), and hand chirality too;
- a face is found farther away;
- no image ever reaches the page: the shell sends positions, so "no frame leaves the device" holds by construction.

The page path stays possible for a browser with no shell: `web/src/main.js` emits the same frames. M3 ships the
recorded-frames source for browsers (`?camera&frames=…`), not MediaPipe.

## The live session (2026-11-19, the operator, low light)

In the playground's Mac app at `?camera`, the operator saw:
- Hana look at them when they appeared;
- her answer to a wave (`greet` and "Oh, hi there!");
- her nod back after a nod.

The scene they saved afterwards had the viewer node at the camera, shifted with their face. Two things turned up:

- **Launched by another process, the app is refused the camera with no prompt.** AppProbe's `launch` starts the
  executable as its own child, so TCC weighs the request against the launching process (no camera usage description)
  and refuses silently. No prompt appears and the app isn't listed in Settings › Privacy & Security › Camera. Launched
  through LaunchServices (`open --env VRMXG_QUERY=camera …app`, or from Finder), the app asks for itself and the
  prompt appears.
- **The system's default camera can be a capture card.** On this Mac `AVCaptureDevice.default(for: .video)` picked a
  USB capture card over the monitor's camera. So the shell has `camera.devices` and `camera.start { device }`, and the
  playground has a camera picker that remembers the choice. A device that lacks 640×480 gets the nearest preset.

The light was too low to trust timings, and the session file wasn't saved (Save as… saved the scene; the button is
now "Save camera session"). Live latency, the frame rate kept, CPU, and the detector's thresholds on a real person
wait for a re-test in better light.

## Run it

```
cd spike-camera/web && npm install && node scripts/fetch-models.mjs   # the approved downloads (git-ignored)
mkdir -p public/clips && cp <a person clip>.mp4 public/clips/clip.mp4 && npx vite build
node scripts/chromium.mjs                                            # results/chromium.json
spike-camera/mac/scripts/build.sh                                    # mac/build/CameraSpike.app
SPIKE_NATIVE=clip   mac/build/CameraSpike.app/Contents/MacOS/CameraSpike   # Vision on the clip
                    mac/build/CameraSpike.app/Contents/MacOS/CameraSpike   # probe + MediaPipe, scheme and loopback
SPIKE_NATIVE=camera SPIKE_SECONDS=20 mac/build/CameraSpike.app/Contents/MacOS/CameraSpike   # live (asks for the camera)
```

The output goes to the app's container: `~/Library/Containers/com.xocialize.vrmxg-camera-spike/Data/tmp/camera-spike.json`.
`results/` holds the copies, with sample frames trimmed.
