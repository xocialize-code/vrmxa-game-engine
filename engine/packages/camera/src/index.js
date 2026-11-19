// @vrmxg/camera — M0 W4 (AB-T-0505), M2 W2 (AB-T-0525). The physical Camera node (focal length, sensor, gate fit,
// focus, f-stop, dutch, thin-lens depth of field), gameplay rig presets with a spring arm, VirtualCameras (bodies, aims,
// seeded noise, impulses, rig presets), CameraBrains that pick and blend them onto a Camera, Path3D for dollies, the
// "cameras" service, and picking.
import { CameraNode } from './camera.js';
import { CameraService } from './service.js';
import { VirtualCameraNode } from './virtual.js';
import { CameraBrainNode } from './brain.js';
import { Path3DNode } from './path.js';

export { CameraNode, PRESETS } from './camera.js';
export { CameraService } from './service.js';
export { SENSORS, sensorSize, verticalFov, focalForFov, thinLens, postDof, defaultCoc } from './lens.js';
export { VirtualCameraNode, NOISE, noise1, lookAtQ } from './virtual.js';
export { CameraBrainNode } from './brain.js';
export { Path3DNode } from './path.js';
export { RIGS, rigDefaults, shotReverse } from './rigs.js';
export { pickPhysics, MeshPicker, rayFrom } from './pick.js';

/**
 * Give a SceneTree cameras: registers the Camera class and adds the "cameras" service. Install after
 * physics (rigs step after the physics world, in afterNodes).
 * @param {import('@vrmxg/core').SceneTree} tree
 * @param {{ aspect?: number | null }} [opts] aspect: the aspect the simulation frames at, fixed (16:9); null follows the
 *   output (the M2 behaviour: a resize changes a composer's framing)
 * @returns {CameraService}
 */
export function installCameras(tree, { aspect = 16 / 9 } = {}) {
  tree.classes.set('Camera', CameraNode);
  tree.classes.set('VirtualCamera', VirtualCameraNode); // M2 W2
  tree.classes.set('CameraBrain', CameraBrainNode);
  tree.classes.set('Path3D', Path3DNode);
  const cams = tree.addService('cameras', new CameraService(tree));
  // the aspect the simulation frames at is fixed from the start (M3 W4, AB-T-0538): a window's resize refits the lenses
  // for drawing but never changes a step, so a play take exports, replays and loads framing-exact. null: follow the output
  if (aspect !== null) cams.fixAspect(aspect);
  return cams;
}
