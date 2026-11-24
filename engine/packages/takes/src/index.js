// @vrmxg/takes — M4 W9 (AB-T-0581). Performance takes: one character's performance recorded as a log (a puppet's input,
// a director's replies, a face from the camera), turned into ordinary sequence tracks by a pure function, kept as one
// undo step, and replayed exactly from the log with no device, model or camera.
export { TAKE_FORMAT, TAKE_KINDS, makeTake, isTake, checkTake, frameOfStep, stepOfFrame } from './take.js';
export { reduceKeys, changeKeys } from './reduce.js';
export { PUPPET_ACTIONS, PUPPET_GESTURES, PUPPET_DEFAULTS, PuppetState, puppetSetup, puppetSamples, puppetTracks, gestureClip } from './puppet.js';
export { ACTOR, directorTracks } from './director.js';
export { FACE_FIELDS, FACE_CHANNELS, FACE_DEFAULTS, FaceFilter, faceSetup, faceSamples, faceTracks, faceFromBlendshapes, faceFromFeatures } from './face.js';
export { syntheticFace } from './synth.js';
export { takeTracks, takeRef, takesOf, nextTakeId, withTake, withoutTake, keepTake, removeTake, replayDoc, describeTake } from './tracks.js';
export { TakeRecorder, startTake, takeWorldDoc, slotSeconds } from './recorder.js';
