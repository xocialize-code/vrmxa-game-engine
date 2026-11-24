// @vrmxg/coverage — M4 W8 (AB-T-0580). Coverage cameras for the anime creator: a camera for each shot of a script's
// build, by rule from the script and the marks (an establishing wide per scene, shot / reverse shot on the 180° line
// for an exchange, close-ups on beats, two-shots for overlapping lines), each a VirtualCamera on one of M2's rig
// presets. The 180° rule as a lint, replacing a shot's camera as one undoable edit, and the storyboard's data. Pure data
// in, data out: the same script and marks give the same cameras in every engine. Thumbnails, which need a render host,
// are in '@vrmxg/coverage/thumbnails'.
export { coverByRule, planCoverage, RULES } from './rules.js';
export { lintLine, sceneAt, cameraSettings, subjectsOf, allNodes } from './lint.js';
export { replaceShotCamera, cameraOnRig, findShot } from './edit.js';
export { storyboard, thumbFrame } from './storyboard.js';
export { rotate, facing, sideOf, normal, groupPlace, singlePlace, cameraPoint, mm, EYE, inBox, segmentHitsBox, blocked, pullIn, faceOn, CLEARANCE } from './geometry.js';
export { setBlockers, loadSetBlockers } from './blockers.js';
