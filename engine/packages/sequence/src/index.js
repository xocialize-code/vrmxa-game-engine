// @vrmxg/sequence — M2 W1 (AB-T-0524; decision AB-D-0257). Sequences: a .vrmxs of its own that includes the set
// scene, with shots and their overrides, markers, and tracks (the @vrmxg/tracks types plus camera, lookAt, dialogue,
// post and simulation), played inside the simulation step; exact scrubbing from snapshots; baking a simulation span to
// a pose cache; SRT subtitles from the dialogue.
import { SequenceService } from './service.js';
export { composeSequence, isSequence } from './compose.js';
export { SEQUENCE_TRACK_TYPES, clipAt, shotAt, samplePost, linesBetween, checkSequence, subtitles } from './evaluate.js';
export { SequenceService } from './service.js';
export { SequencePlayer } from './player.js';
export { bake, useBake, bakeToJSON, bakeFromJSON, isBaked } from './bake.js';

/** Give a tree the "sequence" service. Install after voice, audio, cameras and tracks. */
export function installSequence(tree) { return tree.addService('sequence', new SequenceService(tree)); }
