// @vrmxg/voice — M1 W6 (AB-T-0518).
import { VoiceService } from './service.js';
export { VoiceService } from './service.js';
export { buildTrack, sampleMouth, wordAt, estimateWords, VOWELS, OCULUS_TO_VRM } from './lipsync.js';

/**
 * Give a SceneTree voices and faces: the "voice" service. Install after the audio service (lines are heard through it)
 * and the characters; `await voice.prepare(doc)` before instantiate.
 * @param {any} tree @param {ConstructorParameters<typeof VoiceService>[1]} opts
 */
export function installVoice(tree, opts) { return tree.addService('voice', new VoiceService(tree, opts)); }
