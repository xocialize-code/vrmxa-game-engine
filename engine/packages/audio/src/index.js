// @vrmxg/audio — M1 W5 (AB-T-0517).
import { AudioService } from './service.js';
import { AudioPlayerNode, AudioPlayer3DNode } from './node.js';
export { AudioService } from './service.js';
export { AudioOutput, BUSES } from './output.js';
export { AudioLibrary } from './library.js';
export { AudioPlayerNode, AudioPlayer3DNode } from './node.js';
export { mixOffline, hashSamples } from './mix.js';
export { wavInfo, wavSamples, writeWav } from './wav.js';

/**
 * Give a SceneTree sound: the AudioPlayer node types and the "audio" service. `output` (an AudioOutput) is where it is
 * heard; without one the tree is silent and simulates exactly the same. `await audio.prepare(doc)` before instantiate.
 * @param {any} tree @param {ConstructorParameters<typeof AudioService>[1]} opts
 */
export function installAudio(tree, opts) {
  tree.classes.set('AudioPlayer', AudioPlayerNode);
  tree.classes.set('AudioPlayer3D', AudioPlayer3DNode);
  return tree.addService('audio', new AudioService(tree, opts));
}
