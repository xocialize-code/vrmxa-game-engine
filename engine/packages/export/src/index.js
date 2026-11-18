// @vrmxg/export — M1 W8 (AB-T-0520). Offline frame export (spike-frame-export, AB-R-0927): a take stepped at the
// shot's frame rate with presentation interpolated at α (AB-D-0245), rendered at export size, read back through a
// pixel-pack buffer, sent to a sink with backpressure (the Mac shell's AVAssetWriter: H.264, HEVC, ProRes 4444); the
// take's sound mixed offline (@vrmxg/audio) and muxed; stills and thumbnails. Presentation only: it steps a world but
// never changes what a step does.
export { exportTake, mixTake } from './export.js';
export { shellSink, hashSink, hashFrame } from './sinks.js';
export { Readback, toImageRGBA } from './readback.js';
export { captureStill, encodePNG, toBase64 } from './still.js';
export { SIZES, RATES, CODECS, framesFor, secondsOf, stepsFor, audioSamples, framePlan } from './plan.js';
