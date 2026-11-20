// @vrmxg/export — M1 W8 (AB-T-0520). Offline frame export (spike-frame-export, AB-R-0927): a take stepped at the
// shot's frame rate with presentation interpolated at α (AB-D-0245), rendered at export size, read back through a
// pixel-pack buffer, sent to a sink with backpressure (the Mac shell's AVAssetWriter: H.264, HEVC, ProRes 4444); the
// take's sound mixed offline (@vrmxg/audio) and muxed; stills and thumbnails. Presentation only: it steps a world but
// never changes what a step does.
// M4 W2 (AB-T-0574): WebGPU beside WebGL. readbackFor(host, w, h) gives the backend's readback (gpu-readback.js: an output
// target per size, a ring of 3 map buffers, rows top-down); exportTake and captureStill draw and read through it.
export { exportTake, mixTake } from './export.js';
export { shellSink, hashSink, hashFrame } from './sinks.js';
export { Readback, toImageRGBA } from './readback.js';
export { GPUReadback, readbackFor } from './gpu-readback.js';
export { captureStill, encodePNG, toBase64 } from './still.js';
export { SIZES, RATES, CODECS, framesFor, secondsOf, stepsFor, audioSamples, framePlan } from './plan.js';
