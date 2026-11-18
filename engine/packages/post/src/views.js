import { Vector2 } from 'three';

// Viewports on one renderer (research/cinematics.md §1.4): split screen, picture in picture and a multi-angle preview are
// scissored regions of the one canvas, each drawn through its own camera; the shadow map is rendered once per frame,
// not once per view. Never a second WebGLRenderer: contexts can't share textures, so every VRM would upload twice.

/**
 * Draw several views into one canvas. `views`: [{ camera, x, y, w, h }] in fractions of the canvas (0–1, y from the
 * bottom, as WebGL counts). Views draw without the post stack (it costs a composer per view); give the hero view to
 * the stack yourself.
 * @param {any} renderer @param {any} scene @param {Array<{ camera: any, x: number, y: number, w: number, h: number }>} views
 */
export function renderViews(renderer, scene, views) {
  const size = renderer.getDrawingBufferSize(new Vector2());
  const pr = renderer.getPixelRatio(), W = size.x / pr, H = size.y / pr;
  const auto = renderer.shadowMap.autoUpdate;
  renderer.setScissorTest(true);
  views.forEach((v, i) => {
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = auto && i === 0;
    const x = v.x * W, y = v.y * H, w = v.w * W, h = v.h * H;
    if (v.camera.isPerspectiveCamera && Math.abs(v.camera.aspect - w / h) > 1e-6) { v.camera.aspect = w / h; v.camera.updateProjectionMatrix(); }
    renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    renderer.render(scene, v.camera);
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  renderer.shadowMap.autoUpdate = auto;
}

/** A grid layout of n views: [{ x, y, w, h }] filling the canvas. */
export function gridLayout(n) {
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => ({ x: (i % cols) / cols, y: 1 - (Math.floor(i / cols) + 1) / rows, w: 1 / cols, h: 1 / rows }));
}
