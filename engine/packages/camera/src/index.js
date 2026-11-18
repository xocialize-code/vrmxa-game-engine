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
 * @returns {CameraService}
 */
export function installCameras(tree) {
  tree.classes.set('Camera', CameraNode);
  tree.classes.set('VirtualCamera', VirtualCameraNode); // M2 W2
  tree.classes.set('CameraBrain', CameraBrainNode);
  tree.classes.set('Path3D', Path3DNode);
  return tree.addService('cameras', new CameraService(tree));
}
