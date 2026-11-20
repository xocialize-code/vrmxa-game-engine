// Stills and thumbnails: what a host draws now, at any size, as a PNG. Uses the host's own renderer: the drawing buffer
// is resized for the shot and put back, so the editor's viewport blinks for one frame at most.
// M4 W2 (AB-T-0574): on both backends. WebGL reads the drawing buffer at once; WebGPU draws into its readback's output
// target and maps it (asynchronously, so captureStill returns a promise on both).
import { toImageRGBA } from './readback.js';
import { readbackFor } from './gpu-readback.js';

/**
 * @param {any} host a RenderHost with a tree attached
 * @param {{ width: number, height: number, alpha?: number, camera?: any }} o
 * @returns {Promise<{ width: number, height: number, rgba: Uint8ClampedArray }>} straight-alpha RGBA, row 0 at the top
 */
export async function captureStill(host, { width, height, alpha = 1 }) {
  const r = host.renderer;
  const prevRatio = r.getPixelRatio(), was = host.drawingBufferSize();
  const cssW = was.width / prevRatio, cssH = was.height / prevRatio;
  r.setPixelRatio(1);
  host.resize(width, height);
  const bytes = new Uint8Array(width * height * 4);
  let topDown = false;
  try {
    if (r.isWebGPURenderer) {
      const rb = readbackFor(host, width, height);
      host.advanceNodeFrame(); // a frame of its own: passes and shadow maps redraw at this size (AB-T-0554 gotcha 1)
      await rb.draw(() => host.render(alpha, false));
      await rb.readNow(bytes);
      rb.release();
      topDown = rb.topDown;
    } else {
      const gl = r.getContext();
      host.render(alpha, false);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    }
  } finally {
    r.setPixelRatio(prevRatio);
    host.resize(cssW, cssH);
    host.advanceNodeFrame();
    host.render(alpha, false);
  }
  return { width, height, rgba: toImageRGBA(bytes, width, height, { topDown }) };
}

/** A still as PNG bytes (a browser: OffscreenCanvas or a canvas element). */
export async function encodePNG({ width, height, rgba }) {
  const img = new ImageData(rgba, width, height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(width, height);
    c.getContext('2d').putImageData(img, 0, 0);
    return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
  }
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  c.getContext('2d').putImageData(img, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Bytes as base64 (the shell's file.save / project.write take binary that way). */
export function toBase64(bytes) {
  if (typeof (/** @type {any} */ (bytes)).toBase64 === 'function') return (/** @type {any} */ (bytes)).toBase64();
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
