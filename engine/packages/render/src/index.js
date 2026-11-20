// @vrmxg/render — M0 W5 (AB-T-0506). The render host: WebGL for MToon, presentation interpolated at α
// without touching simulated state, Environment and light nodes, shadow presets and frozen maps, debug
// draw. Presentation only: outside the determinism boundary, and it never writes simulated state.
// M4 W0 (AB-T-0572): WebGPU beside WebGL (backend.js), chosen by RenderHost.create and the ?renderer= switch.
export { RenderHost } from './host.js';
export { backendFromQuery, webgpuAvailable, resolveBackend, warmUpWebGPU, loadWebGPU, roomPMREM } from './backend.js';
export { Interpolator } from './interpolate.js';
export { Views, EnvironmentView, SHADOW_PRESETS, TONE_MAPPINGS, DEFAULT_ENVIRONMENT } from './views.js';
export { DebugDraw, DEBUG_COLORS, shapeLines } from './debug.js';
