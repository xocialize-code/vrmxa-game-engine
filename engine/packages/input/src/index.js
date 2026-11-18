// @vrmxg/input — M0 W4 (AB-T-0505). Named actions from vrmxg.json bound to keys, mouse and gamepads,
// latched once per simulation step by the "input" service, recorded and replayed as plain data; the
// player controller behaviour. Inside the determinism boundary: devices are read once per step and only
// the latched, recorded values reach the simulation.
import { InputService } from './service.js';
import { PlayerController } from './player.js';

export { ActionMap, DEFAULT_ACTIONS } from './actions.js';
export { KeyboardDevice, MouseDevice, GamepadDevice, VirtualDevice } from './devices.js';
export { InputService } from './service.js';
export { PlayerController } from './player.js';

/**
 * Give a SceneTree input: adds the "input" service (it latches first in every step) and the "player"
 * behaviour. Add devices with service.addDevice(new KeyboardDevice().attach(window)), etc.
 * @param {import('@vrmxg/core').SceneTree} tree
 * @param {{ actions?: Record<string, any> }} [config] vrmxg.json "input"
 * @returns {InputService}
 */
export function installInput(tree, config = {}) {
  tree.behaviourClasses.set('player', PlayerController);
  return tree.addService('input', new InputService(tree, config));
}
