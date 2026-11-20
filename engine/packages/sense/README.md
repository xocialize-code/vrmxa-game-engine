# @vrmxg/sense

The person in front of the camera, as part of the world (M3 W5, AB-T-0544).

- **Capture** runs in the Mac shell: AVCapture and Vision, `camera.start` / `camera.stop`, `camera.frame` events. Only
  numbers reach the page. `spike-camera/README.md` has the measurements and the verdict. In a browser, `recordedFrames`
  replays a saved session.
- **`GestureDetector`** (detect.js) turns feature frames into events: presence, face (throttled), wave, nod, shake and
  point. Thresholds are in face widths, and nod and shake work with either angle sign. It runs outside the step, as a
  pure function of the frames.
- **The `sense` service** stamps each event with the step it applies on, applies it, logs it, and replays a log with
  the camera off. While someone is there it stands the scene's `viewer` node at the current camera, shifted with the
  face. Each event is a brain stimulus (kind `viewer`) and a signal on the viewer node.
- **`noticeViewer`** (a behaviour on a Character) looks at the person when they appear and away when they leave. It
  answers a wave with `greet` and a nod with `nod` (or the slots in `answers`) and says the lines in `say`. With a brain,
  each reaction runs as the brain's override.
- **Takes** carry the log as `sense` (director's `makeTake`); the playground replays it.

```js
import { installSense, withCamera, shellCamera, connectCamera } from '@vrmxg/sense';
const doc = withCamera(sceneDoc, { notice: ['hana-1'], params: { say: { wave: 'Hi there!' } } });
const sense = installSense(tree);              // before instantiate; only when the camera is used
const cam = connectCamera(sense, shellCamera({ call, on }));
await cam.start({ fps: 15 });                  // macOS asks the person once
```

A world without the service is exactly the world it was: install it only when a camera is on or a take carries
camera events.
