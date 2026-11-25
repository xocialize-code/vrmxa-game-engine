// The selection outline (M5 W5, AB-T-0604): a ring of a few pixels round the selected nodes' meshes, drawn over the
// edit view after its frame. Nothing is added to the world or the render host's scene: the outline draws stand-ins
// (meshes that share the selected meshes' geometry, skeleton and morph weights, placed from their world matrices each
// frame) into a render target of its own, then lays that target over the canvas.
//
// The ring is made without shaders of our own, so it is the same code on WebGL and WebGPU: the stand-ins are drawn in
// the outline colour eight times with the projection nudged a few pixels each way, then once more in place writing
// transparent black with blending off, which cuts the inside out. What is left is the silhouette's outer edge, seen
// through whatever is in front of it (as PlayCanvas's outline is).
import { DoubleSide, Matrix4, Mesh, MeshBasicMaterial, NearestFilter, NoBlending, OrthographicCamera, PerspectiveCamera, PlaneGeometry, RenderTarget, Scene, SkinnedMesh, Vector2, Color, WebGLRenderTarget } from 'three';

const OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
const _size = new Vector2(), _t = new Matrix4(), _clear = new Color();

export class SelectionOutline {
  /** @param {{ color?: number, width?: number }} [o] width in CSS pixels */
  constructor({ color = 0xff9a1f, width = 2 } = {}) {
    this.width = width;
    this.scene = new Scene();
    this.scene.matrixWorldAutoUpdate = false; // the stand-ins take their source's world matrix as it is
    this.ring = new MeshBasicMaterial({ color, side: DoubleSide, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    this.hole = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: NoBlending, side: DoubleSide, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    this.camera = new PerspectiveCamera();
    this.camera.matrixWorldAutoUpdate = false;
    this.quadScene = new Scene();
    this.quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    /** @type {{ src: any, proxy: any }[]} */ this.pairs = [];
    this.key = null;
    this.target = null;
  }

  /** Outline these objects' meshes (each with what is under it); `key` says when the set changed. */
  setObjects(objects, key) {
    if (key === this.key) return;
    this.key = key;
    for (const { proxy } of this.pairs) this.scene.remove(proxy);
    this.pairs = [];
    const seen = new Set();
    for (const root of objects) root?.traverse((src) => {
      if (!src.isMesh || src.isInstancedMesh || seen.has(src) || !src.geometry) return;
      seen.add(src);
      let proxy;
      if (src.isSkinnedMesh && src.skeleton) { proxy = new SkinnedMesh(src.geometry, this.ring); proxy.bind(src.skeleton, src.bindMatrix); proxy.bindMode = src.bindMode; }
      else proxy = new Mesh(src.geometry, this.ring);
      if (src.morphTargetInfluences) { proxy.morphTargetInfluences = src.morphTargetInfluences; proxy.morphTargetDictionary = src.morphTargetDictionary; }
      proxy.matrixAutoUpdate = false; proxy.matrixWorldAutoUpdate = false; proxy.frustumCulled = false;
      proxy.name = `outline:${src.name}`;
      this.scene.add(proxy);
      this.pairs.push({ src, proxy });
    });
  }

  get active() { return this.pairs.length > 0; }

  /** A mesh drawn in the edit view: it and everything above it visible. */
  static shown(o) { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }

  /** Draw the outline over what the canvas holds now, as seen by `camera`. */
  render(renderer, camera) {
    if (!this.pairs.length) return;
    let any = false;
    for (const { src, proxy } of this.pairs) {
      proxy.visible = SelectionOutline.shown(src);
      if (!proxy.visible) continue;
      any = true;
      proxy.matrixWorld.copy(src.matrixWorld);
      proxy.layers.mask = src.layers.mask;
      // a skinned mesh's bind matrices: 'attached' refreshes the inverse from its world matrix in updateMatrixWorld,
      // which a stand-in never runs, so it takes the source's own each frame (else the character's placement counts twice)
      if (proxy.isSkinnedMesh) { proxy.bindMode = src.bindMode; proxy.bindMatrix.copy(src.bindMatrix); proxy.bindMatrixInverse.copy(src.bindMatrixInverse); }
    }
    if (!any) return;
    renderer.getDrawingBufferSize(_size);
    const w = Math.max(1, _size.x), h = Math.max(1, _size.y);
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose();
      const T = renderer.isWebGPURenderer ? RenderTarget : WebGLRenderTarget;
      this.target = new T(w, h, { depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter });
      this.quad.material.map = this.target.texture; this.quad.material.needsUpdate = true;
      // a WebGPU target's rows run top down where WebGL's run bottom up: the quad reads it the right way up on either
      this.quad.material.map.repeat.set(1, renderer.isWebGPURenderer ? -1 : 1); this.quad.material.map.offset.set(0, renderer.isWebGPURenderer ? 1 : 0);
      this.quad.material.map.matrixAutoUpdate = true;
    }
    const c = this.camera;
    c.matrixWorld.copy(camera.matrixWorld); c.matrixWorldInverse.copy(camera.matrixWorldInverse);
    c.layers.mask = camera.layers.mask;
    c.coordinateSystem = camera.coordinateSystem; // WebGPU: the projection is already in its clip space; don't remake it
    const before = { target: renderer.getRenderTarget(), auto: renderer.autoClear, alpha: renderer.getClearAlpha(), shadows: renderer.shadowMap?.autoUpdate };
    renderer.getClearColor(_clear);
    try {
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false);
      renderer.autoClear = false;
      const px = (this.width * renderer.getPixelRatio()) * 2; // NDC spans 2
      this.setMaterial(this.ring);
      for (const [dx, dy] of OFFSETS) {
        c.projectionMatrix.copy(camera.projectionMatrix).premultiply(_t.makeTranslation((dx * px) / w, (dy * px) / h, 0));
        c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
        renderer.render(this.scene, c);
      }
      c.projectionMatrix.copy(camera.projectionMatrix); c.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      this.setMaterial(this.hole);
      renderer.render(this.scene, c);
      renderer.setRenderTarget(before.target);
      renderer.render(this.quadScene, this.quadCamera);
    } finally {
      renderer.setRenderTarget(before.target);
      renderer.setClearColor(_clear, before.alpha);
      renderer.autoClear = before.auto;
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = before.shadows;
    }
  }

  setMaterial(m) { for (const { proxy } of this.pairs) proxy.material = m; }

  dispose() {
    this.setObjects([], null);
    this.target?.dispose(); this.target = null;
    this.ring.dispose(); this.hole.dispose(); this.quad.geometry.dispose(); this.quad.material.dispose();
  }
}
