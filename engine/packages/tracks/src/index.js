// @vrmxg/tracks — M2 W0 (AB-T-0523). The track core: keyed tracks evaluated as a pure function of the frame, held on
// ones / twos / threes, and the AnimationPlayer node that plays them inside the simulation step. Sequences (W1) build
// on the same evaluation.
import { AnimationPlayerNode, TracksService } from './player.js';
export { TRACK_TYPES, evaluateTrack, sampleKeys, sampleAnimation, sampleAudio, eventsBetween, heldFrame, blend, blendTransform, checkTrack } from './evaluate.js';
export { EASES, eased, cubicBezier } from './ease.js';
export { AnimationPlayerNode, TracksService, applyTrack, setNodePath, withinKeys, overAnimation, beginTracks } from './player.js';

/** Give a tree AnimationPlayers and the "tracks" service. Install after audio (audio tracks are one of its sources). */
export function installTracks(tree) {
  tree.classes.set('AnimationPlayer', AnimationPlayerNode);
  return tree.addService('tracks', new TracksService(tree));
}
