// @vrmxg/voice — M1 W6 (AB-T-0518). Voicing a sequence (M4 W7) is authoring: @vrmxg/voicing.
import { VoiceService } from './service.js';
export { VoiceService } from './service.js';
export { LiveLines, shellTTS, httpTTS } from './live.js';
export { EnergyVAD, listenTo, microphone, encodeWav, decodeWav, wavFrames, shellSTT, shellListen, httpSTT } from './listen.js';
export { bakePlan, applyBake } from './bake.js';
export { DialogueService, DialogueNode, installDialogue, readDialogue, checkDialogue, CHOOSE, ADVANCE, END, VOICED_TAIL } from './dialogue.js'; // M5 W3: conversations with choices
export { buildTrack, sampleMouth, wordAt, estimateWords, VOWELS, OCULUS_TO_VRM } from './lipsync.js';

/**
 * Give a SceneTree voices and faces: the "voice" service. Install after the audio service (lines are heard through it)
 * and the characters; `await voice.prepare(doc)` before instantiate.
 * @param {any} tree @param {ConstructorParameters<typeof VoiceService>[1]} opts
 */
export function installVoice(tree, opts) { return tree.addService('voice', new VoiceService(tree, opts)); }
