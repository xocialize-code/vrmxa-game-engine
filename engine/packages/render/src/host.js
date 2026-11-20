// The render host (M0 W5, AB-T-0506): draws a SceneTree with three.js's WebGLRenderer, set up for MToon
// characters (sRGB output, Neutral tone mapping, a pixel-ratio cap, PCF shadows), and runs live play:
//
//   host.frame(elapsedSeconds)   the clock's due steps, presentation hooks, then one render at α
//
// Per frame: the simulation steps (0, 1 or a few) exactly as it would headless; the interpolator copies
// transforms around the last step; tree.present() runs nodes' presentation hooks; views (lights, the
// Environment, debug draw) catch up; the blend at α is written in, the frame is drawn from the current
// camera, and the simulated values go straight back. Simulation hashes are the same with the host or
// without it, with interpolation on or off (test/render.test.mjs, the demo in every runtime).
//
// M4 W0 (AB-T-0572): the host also takes a WebGPURenderer. `await RenderHost.create({ backend })` picks the backend
// (backend.js: 'webgl', 'webgpu' or 'auto'), warms the page's WebGPU up once, and initialises the renderer. On WebGPU
// the room environment comes from three/webgpu's PMREM, sizes come from the drawing buffer, offline frames advance
// three's node frame, and characters load with the patched MToonNodeMaterial (`host.mtoonMaterial`).
import { PCFShadowMap, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, Scene, Vector2, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Interpolator } from './interpolate.js';
import { Views } from './views.js';
import { renderViews } from '@vrmxg/post';
import { DebugDraw } from './debug.js';
import { resolveBackend, loadWebGPU, warmUpWebGPU, roomPMREM } from './backend.js';

export class RenderHost {
  /**
   * @param {object} [opts]
   * @param {HTMLCanvasElement} [opts.canvas]
   * @param {any} [opts.renderer] an existing renderer (or a stand-in, in tests)
   * @param {number} [opts.dprCap] largest device pixel ratio rendered (2)
   * @param {boolean} [opts.antialias]
   * @param {boolean} [opts.interpolate] blend presentation at α (true); off renders the last step
   * @param {boolean} [opts.preserveDrawingBuffer] keep the frame readable (screenshots)
   * @param {(renderer: any) => any} [opts.post] makes the post stack (@vrmxg/post's PostStack): the scene's Environment
   *   `post` then drives it; without one, scenes render without post
   * @param {any} [opts.webgpu] three/webgpu, with a WebGPURenderer (its PMREMGenerator makes the room environment)
   * @param {any} [opts.mtoonMaterial] the MToon material class characters load with on this renderer (null: the loader's
   *   default, MToonMaterial for WebGL)
   */
  constructor({ canvas, renderer, dprCap = 2, antialias = true, interpolate = true, preserveDrawingBuffer = false, post = null, webgpu = null, mtoonMaterial = null } = {}) {
    if (renderer?.isWebGPURenderer && renderer._initialized === false) throw new Error('RenderHost: await renderer.init() before handing a WebGPURenderer to the host (or use RenderHost.create)');
    this.renderer = renderer ?? new WebGLRenderer({ canvas, antialias, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer });
    /** 'webgpu' (a WebGPURenderer), 'webgl' (a WebGLRenderer) or 'stand-in' (tests). */
    this.backend = this.renderer.isWebGPURenderer ? 'webgpu' : this.renderer.isWebGLRenderer ? 'webgl' : 'stand-in';
    this._webgpu = webgpu;
    /** The MToon material class to load characters with (CharacterLibrary's `mtoonMaterial`); null: MToonMaterial. */
    this.mtoonMaterial = mtoonMaterial;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.renderer.setPixelRatio?.(Math.min(dpr, dprCap));
    this.renderer.outputColorSpace = SRGBColorSpace;
    if (this.renderer.shadowMap) { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFShadowMap; }
    this.scene = new Scene();
    this.scene.name = 'render-host';
    this.interpolator = new Interpolator();
    this._interpolate = interpolate;
    this.views = new Views(this);
    this.debug = new DebugDraw(this);
    this.fallbackCamera = new PerspectiveCamera(50, 16 / 9, 0.05, 500);
    this.fallbackCamera.position.set(0, 1.6, 6);
    this.tree = null;
    /** A camera that overrides the scene's (the editor's viewport camera); null draws from the scene's current camera. */
    this.camera = null;
    this._room = undefined;
    /** Called during render with the blend applied, before drawing: (alpha) => void. For traces and tests. */
    this.onPresent = null;
    /**
     * Presentation drawn over the world (M3 W6: @vrmxg/text's speech bubbles): { update(tree, camera, alpha), settle?() }.
     * Updated as each frame is presented, with the blend applied; an offline frame waits for settle() before drawing.
     * They hang in this host's scene, never the tree.
     * @type {{ update: (tree: any, camera: any, alpha: number) => void, settle?: () => Promise<void> }[]}
     */
    this.overlays = [];
    /**
     * Split screen (M3 W9): viewports, each through a Camera node ({ camera: node id, x, y, w, h }, fractions of the
     * output, y from the bottom), drawn with @vrmxg/post's renderViews (the shadow map once per frame, no post stack).
     * null: one view through the current camera.
     * @type {Array<{ camera: string, x: number, y: number, w: number, h: number }> | null}
     */
    this.layout = null;
    /** The post stack (M2 W3), configured from the scene's Environment `post`; null renders straight to the canvas. */
    this.post = post ? post(this.renderer) : null;
    if (this.post) this.post.dofSource = () => this.cameraNode()?.postDof?.(this.drawingBufferSize()?.height ?? 1080) ?? null;
    /** Presentation time of the frame being drawn (s): (step + α) / 60. Time-based post effects use it. */
    this.time = 0;
    this.last = { steps: 0, alpha: 1, renderMs: 0 };
  }

  /**
   * A host on the backend `backend` asks for (M4 W0): 'webgl' (the default until M4 W3), 'webgpu' (throws without
   * WebGPU) or 'auto' (WebGPU where the page has it, else WebGL). `backendFromQuery(location.search)` reads the
   * `?renderer=` switch. For WebGPU it first warms the page up (warmUpWebGPU, AB-T-0554 gotcha 6), then creates and
   * initialises the view's WebGPURenderer, and loads the patched MToonNodeMaterial for characters. The other options
   * are the constructor's (preserveDrawingBuffer is WebGL's: a WebGPU canvas is read in the task that drew it).
   * @param {ConstructorParameters<typeof RenderHost>[0] & { backend?: import('./backend.js').BackendChoice, navigator?: any }} [opts]
   */
  static async create({ backend = 'webgl', navigator: nav = globalThis.navigator, webgpu = null, mtoonMaterial = null, ...opts } = {}) {
    const chosen = await resolveBackend(backend, { navigator: nav });
    if (chosen === 'webgl') return new RenderHost({ ...opts, mtoonMaterial });
    const W = webgpu ?? await loadWebGPU();
    await warmUpWebGPU({ webgpu: W }); // before this renderer, so it isn't the page's first (gotcha 6)
    const renderer = opts.renderer ?? new W.WebGPURenderer({ canvas: opts.canvas, antialias: opts.antialias ?? true, alpha: true, powerPreference: 'high-performance' });
    await renderer.init();
    mtoonMaterial ??= (await import('@pixiv/three-vrm/nodes')).MToonNodeMaterial; // patched on install (scripts/patch-three-vrm.mjs)
    return new RenderHost({ ...opts, renderer, webgpu: W, mtoonMaterial });
  }

  /** Blend presentation at α (true), or draw the last step as simulated (false). */
  get interpolate() { return this._interpolate; }
  set interpolate(on) { this._interpolate = on; this.interpolator.version = -1; } // re-capture before blending again

  /** Show a tree. Its root joins the host's scene; the tree runs as it would headless. */
  attach(tree) {
    if (this.tree) this.detach();
    this.tree = tree;
    this.scene.add(tree.root.object3d);
    this.interpolator.version = -1;
    this.views.sync(tree);
    return this;
  }

  detach() {
    if (!this.tree) return;
    this.scene.remove(this.tree.root.object3d);
    this.tree = null;
  }

  /** The neutral studio environment (PMREM), made once with the renderer's own generator; null on a stand-in. */
  roomEnvironment() {
    if (this._room !== undefined) return this._room;
    if (this.renderer.isWebGPURenderer && this._webgpu) {
      const { pmrem, texture } = roomPMREM(this.renderer, this._webgpu.PMREMGenerator);
      this._pmrem = pmrem; // kept with its texture, as the spike measured it (disposed with the host)
      return (this._room = texture);
    }
    if (!this.renderer.isWebGLRenderer) return (this._room = null);
    const pmrem = new PMREMGenerator(this.renderer);
    this._room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return this._room;
  }

  /**
   * The drawing buffer's size in device pixels: WebGL's context reports it; WebGPU has no GL context, so the renderer's
   * getDrawingBufferSize. null on a stand-in renderer that has neither.
   * @returns {{ width: number, height: number } | null}
   */
  drawingBufferSize() {
    const r = this.renderer;
    if (r.isWebGLRenderer) { const gl = r.getContext(); return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }; }
    if (r.getDrawingBufferSize) { const v = r.getDrawingBufferSize(new Vector2()); return { width: v.x, height: v.y }; }
    return null;
  }

  /**
   * WebGPU (AB-T-0554 gotcha 1): advance three's node frame. A RenderPipeline's passes and the shadow maps update once
   * per `nodeFrame.frameId`, and only the renderer's own requestAnimationFrame loop advances it, so an offline loop that
   * never yields (an export) would draw every frame over the first one's pass textures. r187 has no public call for it.
   * A no-op on WebGL; throws if a three upgrade moved the private field (so the workaround can't silently stop working).
   */
  advanceNodeFrame() {
    if (!this.renderer.isWebGPURenderer) return;
    const nf = this.renderer._nodes?.nodeFrame;
    if (typeof nf?.update !== 'function') throw new Error('RenderHost: WebGPURenderer._nodes.nodeFrame.update is gone (three upgraded?): offline frames would repeat; see AB-T-0554 gotcha 1');
    nf.update();
  }

  /** The output's size in CSS pixels; cameras fit their lens to the aspect. */
  resize(width, height) {
    this.renderer.setSize(width, height, false);
    if (this.post) { const s = this.drawingBufferSize(); this.post.setSize(s.width, s.height); }
    this.tree?.services.get('cameras')?.setAspect(width / height);
    this.fallbackCamera.aspect = width / height; this.fallbackCamera.updateProjectionMatrix();
    if (this.camera?.isPerspectiveCamera) { this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); }
  }

  /**
   * Live play: run the steps that `elapsedSeconds` of display time buys, then draw at α.
   * @param {number} elapsedSeconds from the host's frame loop (requestAnimationFrame's timestamps)
   * @param {(step: number) => void} [afterStep] called after each simulation step (traces, hashes)
   */
  frame(elapsedSeconds, afterStep) {
    const tree = this.tree;
    const { steps, alpha } = tree.clock.advance(elapsedSeconds);
    let stepped = 0;
    for (let i = 0; i < steps; i++) {
      if (i === steps - 1 && this.interpolate) this.interpolator.beforeStep(tree);
      if (!tree.step()) break; // a service holds the step (pending work): try again next frame
      stepped++;
      afterStep?.(tree.clock.step);
    }
    if (this.interpolate) this.interpolator.afterSteps(tree, stepped > 0);
    tree.present(elapsedSeconds, alpha);
    this.render(stepped < steps ? 1 : alpha, stepped > 0);
    this.last.steps = stepped; this.last.alpha = alpha; this.last.held = stepped < steps;
    return this.last;
  }

  /**
   * Offline (frame export, scrubbing forward): run the tree up to `step`, waiting out any step a service holds (a
   * closet redraw), then draw at α, exactly as live play would have shown that moment: the blend of the last two
   * steps. `frameToStep(n, fps)` from @vrmxg/core gives frame n's step and α. Nothing here reads a clock.
   * @param {number} step @param {number} alpha
   * @param {(step: number) => void} [afterStep]
   */
  async frameAt(step, alpha, afterStep) {
    const tree = this.tree;
    if (step < tree.clock.step) throw new Error(`frameAt(${step}): the tree is already at step ${tree.clock.step}; offline frames only go forward`);
    const steps = step - tree.clock.step;
    for (let i = 0; i < steps; i++) {
      if (i === steps - 1 && this.interpolate) this.interpolator.beforeStep(tree);
      while (!tree.step()) await tree.settle();
      afterStep?.(tree.clock.step);
    }
    if (this.interpolate) this.interpolator.afterSteps(tree, steps > 0);
    const t = (step + alpha) / 60, dt = this._offlineT === undefined || t < this._offlineT ? 0 : t - this._offlineT; // presentation gets the frame's delta, as in live play
    this._offlineT = t;
    tree.present(dt, alpha);
    // an offline frame waits for the post stack's loads (a LUT), so its look never depends on timing (M2 W12)
    if (this.post?.settle) { this.views.update(tree); await this.post.settle(); }
    // and for its overlays' typesetting (speech bubbles, M3 W6): the text this frame shows, laid out before it draws
    if (this.overlays.length) {
      const camera = this.camera ?? tree.services.get('cameras')?.current?.camera ?? this.fallbackCamera;
      for (const o of this.overlays) { o.update(tree, camera, alpha); if (o.settle) await o.settle(); }
    }
    this.advanceNodeFrame(); // WebGPU: this frame's passes and shadow maps redraw, though nothing yielded to rAF (gotcha 1)
    this.render(alpha, steps > 0);
    this.last.steps = steps; this.last.alpha = alpha; this.last.held = false;
    return this.last;
  }

  /** Draw the tree at α (1 = the last step as simulated). */
  render(alpha = 1, stepped = true) {
    const tree = this.tree;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.views.update(tree);
    // a sequence's post tracks (M2 W1): presentation values at this frame and α, after the Environment configured the stack
    const pv = this.post ? tree.services.get('sequence')?.postValues?.(alpha) : null;
    if (pv) this.post.setParams(pv);
    this.debug.update(tree, stepped);
    const camera = this.camera ?? tree.services.get('cameras')?.current?.camera ?? this.fallbackCamera;
    const blend = this.interpolate && alpha < 1;
    if (blend) this.interpolator.apply(alpha);
    this.onPresent?.(alpha);
    const views = this.layout?.length ? this.layout.map((v) => ({ ...v, camera: /** @type {any} */ (tree.find(v.camera))?.camera })).filter((v) => v.camera) : null;
    for (const o of this.overlays) o.update(tree, views?.[0]?.camera ?? camera, alpha);
    this.time = (tree.clock.step - 1 + alpha) / 60;
    if (views?.length) renderViews(this.renderer, this.scene, views);
    else if (this.post?.active) this.post.render(this.scene, camera, this.time);
    else this.renderer.render(this.scene, camera);
    if (blend && this.interpolator.restore()) tree.root.object3d.updateMatrixWorld(true);
    this.last.renderMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  /** The Camera node the view renders through (null when the host's own camera overrides it). */
  cameraNode() { return this.camera ? null : this.tree?.services.get('cameras')?.current ?? null; }

  dispose() {
    this.post?.dispose?.();
    this.detach();
    this.views.dispose(); this.debug.dispose();
    this._room?.dispose(); this._pmrem?.dispose();
    this.renderer.dispose?.();
  }
}
