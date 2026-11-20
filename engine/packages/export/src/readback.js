// Reading frames back from WebGL (spike-frame-export, AB-R-0927, gotcha 3): synchronous readPixels waits on WebKit's
// GPU process (4 ms at 1080p, 11 ms at 4K); readPixels into a pixel-pack buffer with a fence, copied out one frame
// later, costs 1.2 / 4.3 ms and gives the same bytes. WebGL2 only; WebGL1 falls back to readPixels.
// The bytes are RGBA, row 0 at the bottom, premultiplied alpha, exactly as the drawing buffer holds them.
// M4 W2 (AB-T-0574): WebGPU's readback is gpu-readback.js, with the same shape (draw, read, take, readNow, release,
// `ring`, `topDown`); readbackFor(host, …) picks one by backend.

export class Readback {
  /** @param {WebGL2RenderingContext | WebGLRenderingContext} gl @param {number} width @param {number} height */
  constructor(gl, width, height) {
    this.gl = gl; this.width = width; this.height = height;
    this.async = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.size = width * height * 4;
    /** Rows come bottom-up (the drawing buffer's order). */
    this.topDown = false;
    /** Colours come premultiplied by alpha (the drawing buffer's). */
    this.premultiplied = true;
    /** Slots are made as they are used: no limit on frames read and not yet taken. */
    this.ring = Infinity;
    /** @type {Array<{ buf: WebGLBuffer | null, fence: WebGLSync | null, bytes?: Uint8Array }>} */
    this.slots = [];
  }

  /** Draw `fn` (WebGL reads the drawing buffer itself: nothing to set up). */
  draw(fn) { return fn(); }

  /** Start reading the drawing buffer as it is now into `slot` (call in the same task as the render). */
  read(slot) {
    const gl = /** @type {WebGL2RenderingContext} */ (this.gl);
    if (!this.async) { this.slots[slot] = { buf: null, fence: null, bytes: this.readNow(new Uint8Array(this.size)) }; return; }
    let s = this.slots[slot];
    if (!s) {
      s = this.slots[slot] = { buf: gl.createBuffer(), fence: null };
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.buf);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.size, gl.STREAM_READ);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.buf);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    s.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }

  /** Copy `slot`'s pixels out into `out` (waits for its fence if the GPU isn't done). */
  take(slot, out) {
    const gl = /** @type {WebGL2RenderingContext} */ (this.gl), s = /** @type {any} */ (this.slots[slot]);
    if (!this.async) { out.set(s.bytes); return out; }
    gl.clientWaitSync(s.fence, 0, 0);
    gl.deleteSync(s.fence); s.fence = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return out;
  }

  /** The drawing buffer now, synchronously. */
  readNow(out) {
    this.gl.readPixels(0, 0, this.width, this.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out);
    return out;
  }

  /** Free the buffers (WebGL keeps nothing else). */
  release() { this.dispose(); }

  dispose() {
    const gl = /** @type {WebGL2RenderingContext} */ (this.gl);
    for (const s of this.slots) { if (s?.fence) gl.deleteSync(s.fence); if (s?.buf) gl.deleteBuffer(s.buf); }
    this.slots = [];
  }
}

/**
 * Read-back RGBA, premultiplied → RGBA top-down straight alpha (what ImageData, PNG and people expect). WebGL's rows
 * come bottom-up and are flipped; WebGPU's come top-down (`topDown`: the readback's own flag) and stay as they are.
 * @param {Uint8Array} bytes @param {number} width @param {number} height @param {{ topDown?: boolean }} [o]
 */
export function toImageRGBA(bytes, width, height, { topDown = false } = {}) {
  const out = new Uint8ClampedArray(width * height * 4), row = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (topDown ? y : height - 1 - y) * row, dst = y * row;
    for (let i = 0; i < row; i += 4) {
      const a = bytes[src + i + 3];
      if (a === 255 || a === 0) { out[dst + i] = bytes[src + i]; out[dst + i + 1] = bytes[src + i + 1]; out[dst + i + 2] = bytes[src + i + 2]; }
      else { const k = 255 / a; out[dst + i] = bytes[src + i] * k; out[dst + i + 1] = bytes[src + i + 1] * k; out[dst + i + 2] = bytes[src + i + 2] * k; }
      out[dst + i + 3] = a;
    }
  }
  return out;
}
