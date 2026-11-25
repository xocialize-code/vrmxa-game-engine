// The edit view's frame and its aids together, for a WebGPU frame drawn through the post stack (M5 W5, the
// coordinator's review of AB-T-0604).
//
// On three r187's WebGPURenderer every pass that draws to the canvas must draw the whole frame: the TSL post stack's
// pipeline writes its frame to the canvas in one pass, and a later pass (the overlay, the outline's quad, the preview)
// doesn't keep those pixels, so the edit view went black under its aids. (Without post, and on WebGL, the frame is in a
// framebuffer that later passes draw over, and the aids draw straight over the frame as before.)
//
// So while the stack is active on WebGPU: the frame is drawn into a target (`frame`, which the pipeline's last pass
// draws to as it would to the canvas, sRGB encoded), the aids into another (`aids`, cleared to transparent, linear,
// premultiplied), and one pass draws both to the canvas: the frame as it is, the aids encoded to sRGB and blended over
// it by their alpha. The output is set to linear with no tone mapping for that pass, so nothing is converted twice.
// The world and the render host's scene are untouched; exports, stills and checks draw on other hosts.
import { Color, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, NoToneMapping, OrthographicCamera, PlaneGeometry, RenderTarget, Scene, Vector2 } from 'three';

const _size = new Vector2(), _clear = new Color();

export class FrameComposite {
  constructor() {
    this.frame = null; this.aids = null;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = null;
    this.loading = null;
    /** True between beginFrame and present: this frame is being drawn into the targets. */ this.active = false;
  }

  /** The pass's node material is WebGPU's (three/webgpu, three/tsl): loaded on first use. → ready now? */
  ready() {
    if (this.quad) return true;
    this.loading ??= Promise.all([import('three/webgpu'), import('three/tsl')]).then(([gpu, tsl]) => {
      const { texture, screenUV, sRGBTransferOETF, max, vec4, mix } = tsl;
      this.frameNode = texture(null, screenUV); this.aidsNode = texture(null, screenUV);
      const f = this.frameNode, o = this.aidsNode, a = max(o.a, 1e-4);
      this.material = new gpu.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
      this.material.colorNode = vec4(mix(f.rgb, sRGBTransferOETF(o.rgb.div(a)), o.a), 1);
      this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
      this.quad.frustumCulled = false;
      this.scene.add(this.quad);
    }).catch((e) => { this.failed = e; });
    return false;
  }

  /** A target the size of the drawing buffer (made again when the size changes). */
  sized(t, renderer, depthBuffer) {
    renderer.getDrawingBufferSize(_size);
    const w = Math.max(1, _size.x), h = Math.max(1, _size.y);
    if (t && t.width === w && t.height === h) return t;
    t?.dispose();
    return new RenderTarget(w, h, { depthBuffer });
  }

  /** Before the host draws the frame: draw it into the frame target. → whether this frame goes through the targets */
  beginFrame(renderer) {
    if (!this.ready()) return false;
    this.frame = this.sized(this.frame, renderer, true);
    this.frameNode.value = this.frame.texture;
    this.prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.frame);
    this.active = true;
    return true;
  }

  /** After the frame: the aids go into their own target, cleared to transparent. */
  beginAids(renderer) {
    this.aids = this.sized(this.aids, renderer, true);
    this.aidsNode.value = this.aids.texture;
    this.prevAlpha = renderer.getClearAlpha(); this.prevColor = renderer.getClearColor(_clear).clone();
    renderer.setRenderTarget(this.aids);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
  }

  /** Draw the frame and the aids to the canvas in one pass. */
  present(renderer) {
    this.active = false;
    renderer.setRenderTarget(this.prevTarget ?? null);
    if (this.prevColor) renderer.setClearColor(this.prevColor, this.prevAlpha);
    const out = renderer.outputColorSpace, tone = renderer.toneMapping, auto = renderer.autoClear;
    try {
      renderer.outputColorSpace = LinearSRGBColorSpace; renderer.toneMapping = NoToneMapping; renderer.autoClear = true;
      renderer.render(this.scene, this.camera);
    } finally { renderer.outputColorSpace = out; renderer.toneMapping = tone; renderer.autoClear = auto; }
  }

  /**
   * The camera preview into the aids' target: drawn whole into a target of its own (a target draws through its own
   * viewport, so the renderer's can't place it), then laid in its corner as a quad. `r` is pipRect's (CSS pixels from the
   * bottom left), `w` × `h` the viewport's size.
   */
  drawInset(renderer, scene, camera, r, w, h) {
    const pr = renderer.getPixelRatio(), pw = Math.max(1, Math.round(r.width * pr)), ph = Math.max(1, Math.round(r.height * pr));
    if (!this.inset || this.inset.width !== pw || this.inset.height !== ph) {
      this.inset?.dispose();
      this.inset = new RenderTarget(pw, ph, { depthBuffer: true });
      this.insetQuad ??= new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
      this.insetQuad.frustumCulled = false;
      this.insetQuad.material.map = this.inset.texture;
      this.insetQuad.material.map.repeat.set(1, -1); this.insetQuad.material.map.offset.set(0, 1); // a WebGPU target's rows run top down
      this.insetScene ??= new Scene();
      this.insetScene.add(this.insetQuad);
    }
    // its place in clip space: centre and size as fractions of the viewport, y up
    this.insetQuad.position.set(((r.x + r.width / 2) / w) * 2 - 1, ((r.y + r.height / 2) / h) * 2 - 1, 0);
    this.insetQuad.scale.set((r.width / w) * 2, (r.height / h) * 2, 1);
    const auto = renderer.autoClear, shadows = renderer.shadowMap?.autoUpdate, back = renderer.getRenderTarget();
    try {
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
      if (camera.isPerspectiveCamera && Math.abs(camera.aspect - pw / ph) > 1e-6) { camera.aspect = pw / ph; camera.updateProjectionMatrix(); }
      renderer.setRenderTarget(this.inset); renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.setRenderTarget(back); renderer.autoClear = false;
      renderer.render(this.insetScene, this.camera);
    } finally { renderer.setRenderTarget(back); renderer.autoClear = auto; if (renderer.shadowMap) renderer.shadowMap.autoUpdate = shadows; }
  }

  /** Something went wrong between beginFrame and present: draw to the canvas again next frame. */
  abort(renderer) { if (this.active) { this.active = false; renderer.setRenderTarget(this.prevTarget ?? null); } }

  dispose() {
    this.frame?.dispose(); this.aids?.dispose(); this.inset?.dispose(); this.quad?.geometry.dispose(); this.material?.dispose();
    this.insetQuad?.geometry.dispose(); this.insetQuad?.material.dispose();
  }
}
