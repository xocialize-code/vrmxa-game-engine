// @vrmxg/post — M2 W3 (AB-T-0526). The anime look as scene data (an Environment's `post`), behind an adapter over pmndrs
// postprocessing 6.39 (TSL later), with resolution-independent parameters; scissored viewports on one renderer.
// Presentation only: outside the determinism boundary, and time-based effects take their time from the frame.
export { PostStack, CHARACTER_LAYER, lutFromCube } from './stack.js';
export { AnimeEffect, EdgeEffect } from './effects.js';
export { EFFECTS, PRESETS, ORDER, normalizePost, structureOf } from './spec.js';
export { renderViews, gridLayout } from './views.js';
