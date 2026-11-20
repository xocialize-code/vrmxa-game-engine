// @vrmxg/post — M2 W3 (AB-T-0526). The anime look as scene data (an Environment's `post`), behind an adapter over pmndrs
// postprocessing 6.39 on WebGL and a TSL RenderPipeline on WebGPU (M4 W1, '@vrmxg/post/tsl'), with
// resolution-independent parameters; scissored viewports on one renderer.
// Presentation only: outside the determinism boundary, and time-based effects take their time from the frame.
import { PostStack, lutFromCube } from './stack.js';
export { PostStack, CHARACTER_LAYER, lutFromCube } from './stack.js';
export { AnimeEffect, EdgeEffect } from './effects.js';
export { EFFECTS, PRESETS, ORDER, normalizePost, structureOf } from './spec.js';
export { renderViews, gridLayout } from './views.js';

/**
 * The post stack for a renderer (M4 W1): PostStack (pmndrs) on a WebGLRenderer, TSLPostStack on a WebGPURenderer. The TSL
 * stack (and three/webgpu) loads only on WebGPU, so a WebGL page never fetches it. `loadCube`: a project .cube's text.
 * @param {any} renderer @param {{ loadCube?: (file: string) => Promise<string>, multisampling?: number }} [o]
 */
export async function makePostStack(renderer, { loadCube, multisampling } = {}) {
  if (renderer?.isWebGPURenderer) {
    const { TSLPostStack } = await import('./tsl.js');
    return new TSLPostStack(renderer, { multisampling, loadLut: loadCube });
  }
  return new PostStack(renderer, { multisampling, loadLut: loadCube ? async (file) => lutFromCube(await loadCube(file)) : undefined });
}
