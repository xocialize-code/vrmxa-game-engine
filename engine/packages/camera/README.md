# @vrmxg/camera

M0 W4 (AB-T-0505). The physical Camera node, rig presets stepped with the simulation, a spring arm, the `cameras`
service, and picking.

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
