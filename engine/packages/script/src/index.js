// @vrmxg/script — M4 W4 (AB-T-0576; decision AB-D-0275). Scripts for the anime creator: a Fountain subset read by our
// own parser into beats with stable ids, and built into a sequence over a set (numbered shots, the cast on marks, a
// dialogue track per speaker, look-at, a default performance, a coverage hook for W8), re-scripted without losing
// hand edits. Pure data in, data out: the same script gives the same sequence in every engine.
export { parseScript, plain } from './parse.js';
export { assignIds, readRow, writeRow } from './ids.js';
export { layout } from './plan.js';
export { generate, numberShots, defaultCoverage } from './generate.js';
export { merge, handLengths, BAKE_FIELDS } from './merge.js';
export { buildSequence, formatErrors, SCRIPT_RECORD_VERSION } from './build.js';
export { applyScript } from './editor.js';
export { GESTURES, EXPRESSIONS, PAREN_WORDS, TIMING } from './vocab.js';
export { fnv, canonical, fingerprint } from './hash.js';
