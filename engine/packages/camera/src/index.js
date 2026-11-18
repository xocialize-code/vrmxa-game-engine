// @vrmxg/camera — M0 W4 (AB-T-0505). The physical Camera node (focal length, sensor, focus, f-stop,
// thin-lens depth of field), rig presets stepped with the simulation (free, fixed, orbit, follow,
// overShoulder, firstPerson) with a spring arm, the "cameras" service, and picking.
import { CameraNode } from './camera.js';
import { CameraService } from './service.js';

export { CameraNode, PRESETS } from './camera.js';
export { CameraService } from './service.js';
export { SENSORS, verticalFov, thinLens } from './lens.js';
export { pickPhysics, MeshPicker, rayFrom } from './pick.js';

/**
 * Give a SceneTree cameras: registers the Camera class and adds the "cameras" service. Install after
 * physics (rigs step after the physics world, in afterNodes).
 * @param {import('@vrmxg/core').SceneTree} tree
 * @returns {CameraService}
 */
export function installCameras(tree) {
  tree.classes.set('Camera', CameraNode);
  return tree.addService('cameras', new CameraService(tree));
}
