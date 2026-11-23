// @vrmxg/voicing — M4 W7 (AB-T-0579). Voicing a sequence: its lines spoken in each role's voice and baked into the
// dialogue track, one undo step per regeneration (voicing.js); music and sound effects on their buses (sounds.js).
// Authoring only: @vrmxg/voice plays what the bake writes, and doesn't import this.
export { voicingPlan, bakeLines, applyVoicing, voiceLines, rebakeWith, speechEnd, speechOverlaps, fitToSpeech, fitLines, TIMING_OFFSETS } from './voicing.js';
export { placeSound, addSound, soundProblems, busFor, SOUND_BUSES } from './sounds.js';
