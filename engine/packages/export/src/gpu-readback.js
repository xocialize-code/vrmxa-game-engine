// Reading frames back from WebGPU (M4 W2, AB-T-0574; spike-webgpu-render, AB-R-1007). A WebGPU canvas can't be read
// with readPixels, and in WebKit drawImage of it gives the last presented frame (AB-L-0372), so a frame to read is drawn
// into an output render target instead and copied out of it:
//   - draw: renderer.setOutputRenderTarget(target) around the render. Not setRenderTarget: with that, a plain render
//     skips the output transform (no tone mapping, no sRGB) and depth-tests against the target's own depth buffer; the
//     output target gets exactly what the canvas would (spike gotcha 2)
//   - read: copyTextureToBuffer into one of a ring of 3 MAP_READ buffers, then mapAsync; nothing waits yet
//   - take: wait for that buffer's map, copy it out, unmap. The export loop takes frame n − 1 after reading frame n
// ONE output target per renderer, resized for each size. In r187 a second output target on a renderer never receives
// an output draw: it comes back zeros, even with the first disposed, though setRenderTarget draws and clears do land in
// it (measured in Chromium, M4 W2; the spike's gotcha 3 was this). Resizing the one target works at every size and back.
// readbackFor() keeps one GPUReadback per renderer, and a new or resized target is checked with a probe draw (an empty
// scene with a white background through the output path, one pixel read back) before the first real draw, so a target
// that doesn't receive draws throws instead of exporting transparent black frames.
// The bytes are RGBA, row 0 at the TOP (a texture's order, unlike WebGL's drawing buffer). `topDown` says so;
// toImageRGBA(…, { topDown }) and the shell's writer read it. Alpha is premultiplied, as on WebGL: a red quad at opacity
// 0.5 over nothing reads back [127, 0, 0, 128] on both backends (the playground's alpha check), so toImageRGBA and the
// shell's ProRes 4444 unpremultiply treat both the same (the spike's note that WebGPU readback is straight was wrong).
// Costs (spike, M5 Max): WKWebView 2.46 / 9.68 ms at 1080p / 4K after a finished frame (WebKit's mapAsync is a copy
// across from the GPU process at about 3.4 GB/s however it is pipelined); Chromium 0.5 / 1.3 ms.
import { RenderTarget, Scene, Color, PerspectiveCamera } from 'three';
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
    this.renderer = renderer;
    /** Rows come top-down (a texture's order). */
    this.topDown = true;
    /** Colours come premultiplied by alpha, as the canvas holds them (measured: see the top). */
    this.premultiplied = true;
    /** Map buffers in the ring: at most this many frames read and not yet taken. */
    this.ring = ring;
    this.target = new RenderTarget(width, height, { depthBuffer: false });
    renderer.initRenderTarget(this.target); // the GPU texture exists before the first draw (and that draw must fill it)
    /** @type {Array<{ buf: any, state: 'idle' | 'mapping' | 'taking', map: Promise<void> | null, gone?: boolean }>} */
    this.slots = [];
    /** The probe's scene and camera (verify), made when first needed. @type {any} */ this._probe = null;
    /** @type {any} */ this._probeCamera = null;
    this._size(width, height);
  }

  _size(width, height) {
    this.width = width; this.height = height;
    this.size = width * height * 4;
    /** copyTextureToBuffer rows are padded to 256 bytes (none at 1080p or 4K: width × 4 is already a multiple). */
    this.bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    /** The target has received a probe draw at this size (see the top). */
    this.verified = false;
  }

  get device() { return this.renderer.backend.device; }

  /** Another size: the same target, resized (never a second target, see the top); the buffers go and come back at the new size. */
  setSize(width, height) {
    if (width === this.width && height === this.height) return this;
    if (this.slots.some((s) => s && s.state !== 'idle')) throw new Error(`the readback can't change size (${this.width}×${this.height} → ${width}×${height}) while it holds frames nobody took`);
    this.release();
    this.target.setSize(width, height);
    this._size(width, height);
    return this;
  }

  /**
   * Check that the target receives output draws: an empty scene with a white background drawn through the output path,
   * its middle pixel read back. Throws if it stayed empty. draw() does this once per new or resized target.
   */
  async verify() {
    const r = this.renderer, prev = r.getOutputRenderTarget?.() ?? null;
    const scene = (this._probe ??= Object.assign(new Scene(), { name: 'readback-probe', background: new Color(1, 1, 1) }));
    r.setOutputRenderTarget(this.target);
    try { r.render(scene, (this._probeCamera ??= new PerspectiveCamera())); } finally { r.setOutputRenderTarget(prev); }
    const tex = this.renderer.backend.get(this.target.texture)?.texture;
    const buf = this.device.createBuffer({ size: 256, usage: MAP_READ | COPY_DST });
    try {
      const enc = this.device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: tex, origin: { x: this.width >> 1, y: this.height >> 1 } }, { buffer: buf, bytesPerRow: 256 }, [1, 1, 1]);
      this.device.queue.submit([enc.finish()]);
      await buf.mapAsync(MAP_MODE_READ);
      const px = new Uint8Array(buf.getMappedRange(), 0, 4), got = [...px];
      buf.unmap();
      if (got.every((v) => v === 0)) throw new Error(`the ${this.width}×${this.height} readback target received no output draw (a probe drew white and read back [${got}]): frames read from it would be empty. A second output target on one renderer does this in three r187; readbackFor keeps one per renderer`);
    } finally { buf.destroy(); }
    this.verified = true;
  }

  /** Draw `fn` (a render, or host.frameAt) into the output target as if to the canvas. */
  async draw(fn) {
    if (!this.verified) await this.verify();
    const r = this.renderer, prev = r.getOutputRenderTarget?.() ?? null;
    r.setOutputRenderTarget(this.target);
    try { return await fn(); } finally { r.setOutputRenderTarget(prev); }
  }

  /** Start copying the target, as the last draw left it, into ring slot `slot` (after that draw was submitted). */
  read(slot) {
    if (!(slot >= 0 && slot < this.ring)) throw new Error(`readback slot ${slot} is outside the ring of ${this.ring}`);
    const s = this.slots[slot] ??= { buf: this.device.createBuffer({ size: this.bytesPerRow * this.height, usage: MAP_READ | COPY_DST }), state: 'idle', map: null };
    if (s.state !== 'idle') throw new Error(`readback slot ${slot} still holds a frame nobody took (the ring of ${this.ring} is full)`);
    const tex = this.renderer.backend.get(this.target.texture)?.texture;
    if (!tex) throw new Error(`the ${this.width}×${this.height} readback target has no GPU texture: draw into it (draw()) before reading`);
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: s.buf, bytesPerRow: this.bytesPerRow }, [this.width, this.height, 1]);
    this.device.queue.submit([enc.finish()]);
    s.map = s.buf.mapAsync(MAP_MODE_READ);
    s.map.catch(() => {}); // a map that release() cuts short (a cancelled export) rejects; take() still sees it, nothing else must
    s.state = 'mapping';
  }

  /** Wait for slot `slot`'s copy and write it into `out` (tightly packed RGBA, row 0 at the top). */
  async take(slot, out) {
    const s = this.slots[slot];
    if (s?.state !== 'mapping') throw new Error(`readback slot ${slot} has no frame to take (read() it first)`);
    s.state = 'taking'; // not free until it is unmapped: a readNow meanwhile takes another slot
    let mapped = false;
    try {
      await s.map;
      mapped = true;
      const src = new Uint8Array(s.buf.getMappedRange()), row = this.width * 4;
      if (this.bytesPerRow === row) out.set(src.subarray(0, this.size));
      else for (let y = 0; y < this.height; y++) out.set(src.subarray(y * this.bytesPerRow, y * this.bytesPerRow + row), y * row);
      return out;
    } finally {
      if (mapped && !s.gone) s.buf.unmap();
      s.map = null; s.state = 'idle';
    }
  }

  /** The target as the last draw left it, now (a still): read and take one free slot. */
  async readNow(out) {
    let free = -1;
    for (let i = 0; i < this.ring && free < 0; i++) if (!this.slots[i] || this.slots[i].state === 'idle') free = i;
    if (free < 0) throw new Error(`every readback slot holds a frame nobody took (the ring of ${this.ring} is full)`);
    this.read(free);
    return this.take(free, out);
  }

  /** Free the map buffers (the target stays: it is this renderer's, see the top). A map still pending rejects, handled. */
  release() {
    for (const s of this.slots) if (s) { s.buf.destroy(); s.gone = true; }
    this.slots = [];
  }

  /** Free everything, the target too (a renderer about to go). */
  dispose() { this.release(); this.target.dispose(); }
}

/** renderer → its readback (one output target per renderer, resized: see the top). */
const kept = new WeakMap();

/**
 * The readback for a host's backend at a size: WebGPU's (one per renderer, resized to the size asked for) or WebGL's
 * pixel-pack one (new each time). Both have draw(fn), read(slot), take(slot, out) (a promise on WebGPU), readNow(out),
 * release(), `ring` and `topDown`.
 * @param {any} host a RenderHost @param {number} width @param {number} height
 * @returns {GPUReadback | Readback}
 */
export function readbackFor(host, width, height) {
  const r = host.renderer;
  if (!r.isWebGPURenderer) return new Readback(r.getContext(), width, height);
  const rb = kept.get(r);
  if (rb) return rb.setSize(width, height);
  const made = new GPUReadback(r, width, height);
  kept.set(r, made);
  return made;
}
