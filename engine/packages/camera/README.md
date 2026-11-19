# @vrmxg/camera

M0 W4 (AB-T-0505), M2 W2 (AB-T-0525). The physical Camera node, gameplay rig presets stepped with the simulation,
a spring arm, cinematic VirtualCameras and CameraBrains, Path3D, the `cameras` service, and picking.

```js
import { installCameras, pickPhysics, MeshPicker } from '@vrmxg/camera';
installCameras(tree);                                     // after physics: rigs step after the physics world
tree.find('cam').call('setPreset', { preset: 'follow' });
pickPhysics(physics, cam, ndcX, ndcY);                    // → { node, colliderNode, point, normal, distance }
new MeshPicker().pick(cam, ndcX, ndcY, [character]);      // exact triangles, skinned pose included
```

| Piece | What |
|---|---|
| `CameraNode` | A `PerspectiveCamera` (looks down its node's -Z, as three.js cameras do) driven by a physical lens: `focalLength` (mm), `sensor` (super35, fullframe, mft), `fStop`, `focusDistance`; field of view fitted to the output aspect; `dof()` gives thin-lens near / far / hyperfocal / circle of confusion, focus following the target. Actions `makeCurrent`, `setPreset`, `nextPreset` |
| Presets | `free` (stays), `fixed` (stays, looks at its target), `orbit` (around the target's eyes; look input turns it, zoom changes distance), `follow` (3.2 m behind, 1.5 m up, spring arm), `overShoulder` (1.6 m, 0.45 m to the right), `firstPerson` (at the target's eyes). `rig` prop overrides distance / height / side. Switching carries the view direction over |
| Spring arm | A ray from the pivot back along the boom, ignoring the target's own body: pulls in at once to 0.2 m off whatever is in the way, eases back out at 4 m/s |
| `CameraService` (`cameras`) | Registers cameras, keeps the current one, sets the output aspect, steps every rig in the `afterNodes` phase (after physics), feeds look input to the current camera only, `camera_next` cycles its preset |
| Picking | `pickPhysics`: a ray from the camera through the pointer into the physics world (gameplay). `MeshPicker`: exact mesh picks through three-mesh-bvh, the skinned pose baked with `StaticGeometryGenerator` (skeletons updated first, so picks between renders see the current pose) and the BVH refit per pick |

**Rigs are simulated.** Player movement is camera-relative, so a rig's yaw, pitch, distance and spring-arm length step
deterministically at 60 Hz from recorded input (AB-D-0248, clarified). Only interpolating the rendered camera between
steps is presentation (the render host, W5).

Tests (`npm test`): the lens; every preset switched at run time and placed as it should be; the spring arm against a
wall and easing back; look input on the current camera only, `camera_next`; physics picks (target, floor, sky); mesh
picks on a skinned mesh in a bent pose and after it straightens. Integration (skips without the VRMs): 10 s of keyboard
and gamepad drive Mira through the player controller and a follow camera, switching preset mid-run, and the replay
reaches the identical character and camera state; the mesh picker hits her skinned VRM.

## Cinematic cameras (M2 W2)

`research/cinematics.md` §1.2: a physical `Camera`, Cinemachine-style `VirtualCamera`s, and a `CameraBrain` per output.

```json
{ "id": "ots", "type": "VirtualCamera", "props": { "rig": "overShoulder", "body": { "target": "mira" }, "aim": { "target": "hana-1" } } },
{ "id": "brain", "type": "CameraBrain", "props": { "camera": "cam", "defaultBlend": { "style": "easeInOut", "seconds": 1 } } }
```

| Piece | What |
|---|---|
| Lens | `sensor` (super35, fullframe, mft, anime, or custom `sensorMm`), `gateFit` (fill crops, overscan shows the whole sensor), `dutch` (roll), `coc`. `thinLens` (CoC 0.025 mm by default: the research's worked example, 50 mm f/1.8 at 3.9 m, gives 3.65–4.19 m), `focalForFov`, and `postDof` / `Camera.postDof()`: focus distance, sharp range and bokeh in pixels for the post stack (W3) |
| `VirtualCamera` | A candidate shot, stepped at 60 Hz: **body** fixed, follow (offset, damping), orbit (radius, yaw, pitch, yawSpeed: a turntable), thirdPerson (shoulder, arm, spring arm), firstPerson, dolly (on a `Path3D`: a u, or the point closest to the target, damped), hardLock. **Aim** none, lookAt, composer (keeps the target at a screen point: holds in the dead zone, damped beyond it, never outside the soft zone), groupFraming (centres several targets and sets the focal length so they fill `size` of the frame), panTilt. **Lens** per shot (focal length, f-stop, focus distance or target, dutch). **Noise** profiles (seeded smooth noise: handheldLight, handheldHeavy, vehicle). **Impulses** (`impulse { strength, zoom }`: trauma shake ∝ trauma², a zoom punch, decaying) |
| Rig presets | `rig`: fixed, security, follow, thirdPerson, overShoulder, firstPerson, topDown, orbit, turntable, dolly, crane, closeUp, twoShot, handheld, shotReverse; the node's own body / aim / lens / noise override any part. `shotReverse(a, b, { side, reverse })` places a shot and its reverse on one side of the 180° line |
| `CameraBrain` | One per output: the live vcam on its `channel` (highest priority; the most recently `activate`d wins a tie), blending from the previous one (both still stepping) by `defaultBlend` or a per-pair entry in `blends` (cut, linear, easeInOut, easeIn, easeOut; seconds, or frames at an fps). `override { camera, blend }` forces a shot (a sequence's camera track, W1). It writes the pose and lens to its `camera` and makes it current unless `makeCurrent: false`; that camera's own rig stays out of the way. Signal `cameraChanged` |
| `Path3D` | Catmull-Rom through `points` by arc length (`pointAt(u)`, `closestU(p)`), open or closed |

All of it is simulation: damping, noise and shake step with the clock, and vcam and brain state are in the snapshot,
so a camera move or a blend replays identically (acceptance check 10: identical at every step in Node, Chromium and
WKWebView, with a snapshot taken mid-blend). The gameplay presets above stay on `Camera` for the player's camera
(camera-relative movement and look input).

Tests (`test/cinematic.test.mjs`): the lens numbers; every body (follow settles at its offset, orbit at its radius, a
turntable turns, a dolly rides its path); lookAt, the composer and group framing checked by projecting the targets to
the screen; shot / reverse on one side of the line; seeded noise and an impulse that decays; the brain (priority, ties,
an eased blend halfway at t = 0.5, a per-pair cut, an override, the lens on the camera); replay and a restore mid-blend.
Not yet: camera-controls for the editor's viewport navigation (moved to W5, the timeline).

**The output aspect is a simulation input** (M2 W12). The composer and group framing work in screen space, so a
VirtualCamera's move depends on the aspect it frames at. `setAspect` (from `RenderHost.resize`) refits every lens for
drawing. Unless the world called `fixAspect(a)`, it also sets the aspect the step frames with. A sequence fixes 16:9
(`SequenceService.prepare`), so its world steps the same in a viewport of any shape, a still or an export. Before this,
an editor still that resized the preview world and gave it back the viewport's aspect moved a scrubbed shot away from
the frames its snapshots were taken at. A camera restored from a snapshot re-derives its lens (`setState` ends with
`applyLens`). Tests: a fixed aspect holds through a resize; a free one follows it.

## The aspect is fixed from the start (M3 W4, AB-T-0538)

`installCameras(tree, { aspect })` fixes the aspect the simulation frames at, 16:9 by default:
- a window's resize (`RenderHost.resize` → `setAspect`) only refits the lenses for drawing;
- so a play take steps the same in any window, and its export, replay and saves match it step for step;
- `exportTake` refuses an export at another shape rather than reframe it;
- `aspect: null` restores M2's behaviour, where the composer follows the output.

Tested in `test/cinematic.test.mjs`: a composer scene in a 4:3 window, resized mid-run, equals the 16:9 export at every
step.
