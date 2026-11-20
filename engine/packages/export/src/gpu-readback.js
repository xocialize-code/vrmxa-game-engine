// Reading frames back from WebGPU (M4 W2, AB-T-0574; spike-webgpu-render, AB-R-1007). A WebGPU canvas can't be read
// with readPixels, and in WebKit drawImage of it gives the last presented frame (AB-L-0372), so a frame to read is drawn
// into an output render target instead and copied out of it:
//   - draw: renderer.setOutputRenderTarget(target) around the render. Not setRenderTarget: with that, a plain render
//     skips the output transform (no tone mapping, no sRGB) and depth-tests against the target's own depth buffer; the
//     output target gets exactly what the canvas would (spike gotcha 2)
//   - read: copyTextureToBuffer into one of a ring of 3 MAP_READ buffers, then mapAsync; nothing waits yet
//   - take: wait for that buffer's map, copy it out, unmap. The export loop takes frame n − 1 after reading frame n
// One output target per renderer and size, kept for the renderer's life: in r187 output targets made after the first
// one never received the draws (spike gotcha 3), so readbackFor() keeps them and release() frees only the buffers.
// The bytes are RGBA, row 0 at the TOP (a texture's order, unlike WebGL's drawing buffer), premultiplied alpha as the
// canvas would hold them. `topDown` says so; toImageRGBA(…, { topDown }) and the shell's writer read it.
// Costs (spike, M5 Max): WKWebView 2.46 / 9.68 ms at 1080p / 4K after a finished frame (WebKit's mapAsync is a copy
// across from the GPU process at about 3.4 GB/s however it is pipelined); Chromium 0.5 / 1.3 ms.
import { RenderTarget } from 'three';
import { Readback } from './readback.js';

// WebGPU's constants (GPUBufferUsage.MAP_READ | COPY_DST, GPUMapMode.READ): the globals exist only where WebGPU does
const MAP_READ = 0x0001, COPY_DST = 0x0008, MAP_MODE_READ = 0x0001;

export class GPUReadback {
  /**
   * @param {any} renderer an initialised three WebGPURenderer on its WebGPU backend
   * @param {number} width @param {number} height the drawing buffer's size (draw at that size: the host's resize)
   * @param {{ ring?: number }} [o] ring: map buffers (3: frame n drawing, n − 1 mapping, n − 2 being copied out)
   */
  constructor(renderer, width, height, { ring = 3 } = {}) {
    if (!renderer?.isWebGPURenderer || !renderer.backend?.device) throw new Error('GPUReadback needs an initialised WebGPURenderer on its WebGPU backend');
    this.renderer = renderer; this.width = width; this.height = height;
    /** Rows come top-down (a texture's order). */
    this.topDown = true;
    /** Map buffers in the ring: at most this many frames read and not yet taken. */
    this.ring = ring;
    this.size = width * height * 4;
    /** copyTextureToBuffer rows are padded to 256 bytes (none at 1080p or 4K: width × 4 is already a multiple). */
    this.bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    this.target = new RenderTarget(width, height, { depthBuffer: false });
    renderer.initRenderTarget(this.target); // the GPU texture exists before the first draw (and that draw must fill it)
    /** @type {Array<{ buf: any, map: Promise<void> | null }>} */
    this.slots = [];
  }

  get device() { return this.renderer.backend.device; }

  /** Draw `fn` (a render, or host.frameAt) into the output target as if to the canvas. */
  async draw(fn) {
    const r = this.renderer, prev = r.getOutputRenderTarget?.() ?? null;
    r.setOutputRenderTarget(this.target);
    try { return await fn(); } finally { r.setOutputRenderTarget(prev); }
  }

  /** Start copying the target, as the last draw left it, into ring slot `slot` (after that draw was submitted). */
  read(slot) {
    if (!(slot >= 0 && slot < this.ring)) throw new Error(`readback slot ${slot} is outside the ring of ${this.ring}`);
    const s = this.slots[slot] ??= { buf: this.device.createBuffer({ size: this.bytesPerRow * this.height, usage: MAP_READ | COPY_DST }), map: null };
    if (s.map) throw new Error(`readback slot ${slot} still holds a frame nobody took (the ring of ${this.ring} is full)`);
    const tex = this.renderer.backend.get(this.target.texture)?.texture;
    if (!tex) throw new Error(`the ${this.width}×${this.height} readback target has no GPU texture: draw into it (draw()) before reading`);
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: s.buf, bytesPerRow: this.bytesPerRow }, [this.width, this.height, 1]);
    this.device.queue.submit([enc.finish()]);
    s.map = s.buf.mapAsync(MAP_MODE_READ);
  }

  /** Wait for slot `slot`'s copy and write it into `out` (tightly packed RGBA, row 0 at the top). */
  async take(slot, out) {
    const s = this.slots[slot];
    if (!s?.map) throw new Error(`readback slot ${slot} has no frame to take (read() it first)`);
    const map = s.map; s.map = null;
    await map;
    const src = new Uint8Array(s.buf.getMappedRange()), row = this.width * 4;
    if (this.bytesPerRow === row) out.set(src.subarray(0, this.size));
    else for (let y = 0; y < this.height; y++) out.set(src.subarray(y * this.bytesPerRow, y * this.bytesPerRow + row), y * row);
    s.buf.unmap();
    return out;
  }

  /** The target as the last draw left it, now (a still): read and take one slot. */
  async readNow(out) {
    const slot = this.slots.findIndex((s) => !s?.map);
    const free = slot === -1 ? this.slots.length : slot;
    this.read(free);
    return this.take(free, out);
  }

  /** Free the map buffers (the target stays: it is this renderer's for this size, see the top). */
  release() {
    for (const s of this.slots) s?.buf.destroy();
    this.slots = [];
  }

  /** Free everything, the target too (a renderer about to go). */
  dispose() { this.release(); this.target.dispose(); }
}

/** renderer → size → its readback (one output target per size for the renderer's life: gotcha 3). */
const kept = new WeakMap();

/**
 * The readback for a host's backend at a size: WebGPU's (kept per renderer and size) or WebGL's pixel-pack one (new
 * each time). Both have draw(fn), read(slot), take(slot, out) (a promise on WebGPU), readNow(out), release(), `ring`
 * and `topDown`.
 * @param {any} host a RenderHost @param {number} width @param {number} height
 * @returns {GPUReadback | Readback}
 */
export function readbackFor(host, width, height) {
  const r = host.renderer;
  if (!r.isWebGPURenderer) return new Readback(r.getContext(), width, height);
  let sizes = kept.get(r);
  if (!sizes) kept.set(r, (sizes = new Map()));
  const k = `${width}x${height}`;
  if (!sizes.has(k)) sizes.set(k, new GPUReadback(r, width, height));
  return sizes.get(k);
}
