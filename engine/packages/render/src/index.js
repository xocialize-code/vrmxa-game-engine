// @vrmxg/render — M0 W5 (AB-T-0506). The render host: WebGL for MToon, presentation interpolated at α
// without touching simulated state, Environment and light nodes, shadow presets and frozen maps, debug
// draw. Presentation only: outside the determinism boundary, and it never writes simulated state.
export { RenderHost } from './host.js';
export { Interpolator } from './interpolate.js';
export { Views, EnvironmentView, SHADOW_PRESETS, TONE_MAPPINGS, DEFAULT_ENVIRONMENT } from './views.js';
export { DebugDraw, DEBUG_COLORS, shapeLines } from './debug.js';
