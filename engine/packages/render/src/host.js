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
//
// M6 W6 (AB-T-0639): a lost GPU device. WebKit kills its GPU process when a Metal command buffer fails, and every
// renderer in the page loses its device. The host notices (`GPUDevice.lost`, three's onDeviceLost, a lost WebGL context,
// or the first draw that throws for it), stops drawing, and calls `onLost`. `RenderHost.replace(old, { canvas })` makes
// a host in its place (WebGPU again, else three's WebGL2 backend, which still draws the world's node materials) with
// the same tree, camera and overlays. The simulation is never touched: drawing is outside the determinism boundary, and
// a draw that throws can't leave the interpolated pose in the simulated transforms (render's finally puts them back).
import { HalfFloatType, PCFShadowMap, PMREMGenerator, PerspectiveCamera, RGBAFormat, RenderTarget, SRGBColorSpace, Scene, Vector2, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Interpolator } from './interpolate.js';
import { Views } from './views.js';
import { renderViews } from '@vrmxg/post/views'; // three only: the post stack itself (pmndrs, TSL) loads when asked for
import { DebugDraw } from './debug.js';
import { resolveBackend, loadWebGPU, warmUpWebGPU, roomPMREM, isWebGPUBackend } from './backend.js';

/**
 * @typedef {Omit<NonNullable<ConstructorParameters<typeof RenderHost>[0]>, 'post'> & { backend?: import('./backend.js').BackendChoice, navigator?: any, fallbackRenderer?: any, post?: ((renderer: any) => any) | { loadCube?: (file: string) => Promise<string>, multisampling?: number } | null }} CreateOptions
 */

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
   *   `post` then drives it; without one, scenes render without post. RenderHost.create also takes options here
   *   (`{ loadCube }`) and makes the backend's stack itself (M4 W1: PostStack on WebGL, TSLPostStack on WebGPU)
   * @param {any} [opts.webgpu] three/webgpu, with a WebGPURenderer (its PMREMGenerator makes the room environment)
   * @param {any} [opts.mtoonMaterial] the MToon material class characters load with on this renderer (null: the loader's
   *   default, MToonMaterial for WebGL)
   * @param {any} [opts.particleRenderer] the three.quarks BatchedRenderer class particles draw with on this renderer (M4 W2):
   *   three.quarks' own for WebGL (the default there), three.quarks/webgpu's for WebGPU (RenderHost.create loads it)
   * @param {boolean} [opts.webglFallback] take a WebGPURenderer on three's WebGL2 backend (M6 W6): only a host made in
   *   place of a lost one (`RenderHost.replace`), whose world was built with node materials, asks for it ('webgl-fallback')
   * A WebGPURenderer must come initialised, on its WebGPU backend, with `webgpu` and `mtoonMaterial` (MToonNodeMaterial
   * from '@pixiv/three-vrm/nodes'): RenderHost.create does all of that. Anything less throws rather than half-work (no
   * room environment, characters on the WebGL MToonMaterial, a host that says WebGPU while drawing on WebGL2).
   */
  constructor({ canvas, renderer, dprCap = 2, antialias = true, interpolate = true, preserveDrawingBuffer = false, post = null, webgpu = null, mtoonMaterial = null, particleRenderer = undefined, webglFallback = false } = {}) {
    if (renderer?.isWebGPURenderer) {
      if (renderer._initialized === false) throw new Error('RenderHost: await renderer.init() before handing a WebGPURenderer to the host (or use RenderHost.create)');
      if (!isWebGPUBackend(renderer) && !webglFallback) throw new Error('RenderHost: this WebGPURenderer fell back to its WebGL2 backend in init(); the host draws WebGL through WebGLRenderer (use RenderHost.create with backend "auto")');
      if (!webgpu || !mtoonMaterial) throw new Error('RenderHost: a WebGPURenderer needs `webgpu` (three/webgpu, for the room environment\'s PMREM) and `mtoonMaterial` (MToonNodeMaterial from \'@pixiv/three-vrm/nodes\'), or use RenderHost.create');
    }
    this.renderer = renderer ?? new WebGLRenderer({ canvas, antialias, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer });
    /**
     * 'webgpu' (a WebGPURenderer), 'webgl' (a WebGLRenderer), 'webgl-fallback' (a WebGPURenderer on three's WebGL2
     * backend: only in place of a lost host, M6 W6) or 'stand-in' (tests).
     */
    this.backend = this.renderer.isWebGPURenderer ? (isWebGPUBackend(this.renderer) ? 'webgpu' : 'webgl-fallback') : this.renderer.isWebGLRenderer ? 'webgl' : 'stand-in';
    /** What a host made in this one's place takes again (RenderHost.replace): the constructor's own options. */
    this._options = { dprCap, antialias, interpolate, preserveDrawingBuffer };
    this._webgpu = webgpu;
    /** The MToon material class to load characters with (CharacterLibrary's `mtoonMaterial`); null: MToonMaterial. */
    this.mtoonMaterial = mtoonMaterial;
    /**
     * The three.quarks BatchedRenderer class for this renderer (M4 W2): a tree's particles service takes it on attach.
     * null: this host draws no particles (a stand-in). undefined: not loaded yet (AB-A-0335): three.quarks is fetched only
     * when a tree with a particles service attaches, or when the app asks first (`await host.loadParticleRenderer(particleRenderers)`).
     * @type {any}
     */
    this.particleRenderer = particleRenderer !== undefined ? particleRenderer : this.backend === 'stand-in' ? null : undefined;
    /** The particle renderer's load while it is under way (loadParticleRenderer); null otherwise. @type {Promise<any> | null} */
    this._particleLoad = null;
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
     * `attach(host)` / `detach()`: how one moves to a host made in this one's place (RenderHost.replace, M6 W6).
     * @type {{ update: (tree: any, camera: any, alpha: number) => void, settle?: () => Promise<void>, attach?: (host: RenderHost) => any, detach?: () => void }[]}
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
    this.post = typeof post === 'function' ? post(this.renderer) : null;
    if (this.post) this.post.dofSource = this._dofSource();
    /** Presentation time of the frame being drawn (s): (step + α) / 60. Time-based post effects use it. */
    this.time = 0;
    this.last = { steps: 0, alpha: 1, renderMs: 0 };
    /**
     * Set once this host's GPU device (or WebGL context) is lost (M6 W6): { api, reason, message }. Nothing is drawn from
     * then on; a host made by RenderHost.replace draws the tree instead. null while drawing works.
     * @type {{ api: string, reason: string | null, message: string } | null}
     */
    this.lost = null;
    this._onLost = null;
    /** RenderHost.create's options, for a host made in this one's place (not the canvas, renderer or backend). @type {any} */
    this._made = null;
    /** On a host made by RenderHost.replace: { from: the lost host's backend, lost, tried: the backends that failed first }. @type {{ from: string, lost: any, tried: string[] } | null} */
    this.replaced = null;
    this._disposed = false; this._said = false;
    /** What a failed RenderHost.replace kept for another try. @type {any} */
    this._carry = null;
    this._watchLoss();
  }

  /**
   * Called once, when the device is lost: (lost) => void. The app makes a host in this one's place. Set on a host that is
   * already lost (its device went while RenderHost.replace was still making it: the post stack, the tree's move), it is
   * called at once, so no loss goes unsaid.
   * @type {((lost: { api: string, reason: string | null, message: string }) => void) | null}
   */
  get onLost() { return this._onLost; }
  set onLost(fn) {
    this._onLost = fn ?? null;
    if (fn && this.lost && !this._disposed && !this._said) { this._said = true; try { fn(this.lost); } catch (e) { console.error(e); } }
  }

  /** Watch for a lost device: GPUDevice.lost (any reason, destroy() included), three's onDeviceLost, a lost WebGL context. */
  _watchLoss() {
    const r = this.renderer;
    if (r.isWebGPURenderer) {
      const three = typeof r.onDeviceLost === 'function' ? r.onDeviceLost.bind(r) : null; // three's own: says so, stops drawing
      r.onDeviceLost = (info) => { three?.(info); this._lose({ api: info?.api ?? 'WebGPU', reason: info?.reason ?? null, message: info?.message ?? 'the device was lost' }); };
      // three ignores a device lost by destroy() (its own dispose does that); the host doesn't, unless it is disposing
      r.backend?.device?.lost?.then?.((info) => this._lose({ api: 'WebGPU', reason: info?.reason ?? null, message: info?.message || 'the GPU device was lost' }));
    } else if (r.isWebGLRenderer) {
      this._contextLost = () => this._lose({ api: 'WebGL', reason: 'context lost', message: 'the WebGL context was lost' });
      r.domElement?.addEventListener?.('webglcontextlost', this._contextLost);
    }
  }

  /** The device is gone: stop drawing and say so, once. Not for a host being disposed (its own dispose loses it). */
  _lose(info) {
    if (this.lost || this._disposed) return;
    this.lost = { api: info.api, reason: info.reason ?? null, message: String(info.message ?? 'the device was lost') };
    if (!this._onLost) return; // said when a handler is set (onLost)
    this._said = true;
    try { this._onLost(this.lost); } catch (e) { console.error(e); }
  }

  /**
   * Whether a draw that threw did so because the device is gone (WebKit: "createCommandEncoder: Unable to make command
   * encoder" once its GPU process died, before GPUDevice.lost resolves). → true after marking the host lost
   */
  _lostBy(e) {
    if (this.lost) return true;
    const r = this.renderer, message = String(e?.message ?? e);
    const gone = r._isDeviceLost === true
      || (r.isWebGPURenderer && /command encoder|device (is |was |has been )?(lost|destroyed)|GPUDevice\b.*(lost|destroyed|invalid)/i.test(message))
      || (r.isWebGLRenderer && r.getContext?.()?.isContextLost?.() === true);
    if (gone) this._lose({ api: r.isWebGLRenderer ? 'WebGL' : 'WebGPU', reason: 'draw failed', message });
    return gone;
  }

  /** The backends a host made in place of a lost one tries, in order (M6 W6): WebGPU again, else WebGL. */
  static recoveryOrder(backend) { return backend === 'webgl' ? ['webgl'] : ['webgpu', 'webgl-fallback']; }

  /**
   * A host in place of one whose device was lost (M6 W6, AB-T-0639), on a fresh canvas (a canvas that had a WebGPU
   * context can't give a WebGL one, and a lost one's context is best left alone): the old host's options, post stack
   * and MToon kind, on the first of `backends` that works, with its tree, camera override, split-screen layout,
   * interpolation and overlays moved over. The old host is let go (its renderer disposed; that may fail on a dead
   * device, and is ignored). The tree isn't touched: the next frame draws the world from the step it is on.
   * `backends` defaults to `recoveryOrder(old.backend)`: a world built for WebGPU (node materials, TSL particles and
   * post) recovers on WebGPU or on three's WebGL2 backend, which draws the same materials; a WebGL world on WebGL.
   * Throws, naming each backend's failure, when none can be made: the app holds the game and offers Save.
   * `tree`: the world to draw, in place of the old host's (or what a failed try carried): an app whose world changed
   * meanwhile (a Load between a failed try and the next) names the one it plays now, or null for none.
   * @param {RenderHost} old @param {CreateOptions & { backends?: string[], tree?: any }} [o] the canvas to draw on, and
   *   any option to change (a test's stand-in `webgpu`)
   */
  static async replace(old, { backends = RenderHost.recoveryOrder(old.backend), tree: given = undefined, ...over } = {}) {
    // a second try after a failed one takes what the first carried (the old host has let it all go by then)
    const kept = old._carry ?? { tree: old.tree, overlays: [...old.overlays], carried: { camera: old.camera, layout: old.layout, interpolate: old.interpolate, onPresent: old.onPresent } };
    const { overlays, carried } = kept, tree = given !== undefined ? given : kept.tree;
    for (const o of overlays) if (o.host === old) o.detach?.();
    old.dispose();
    const errors = [];
    for (const backend of backends) {
      try {
        const host = await RenderHost.create({ ...old._made, ...old._options, ...over, backend: /** @type {any} */ (backend) });
        host.camera = carried.camera; host.layout = carried.layout; host.interpolate = carried.interpolate; host.onPresent = carried.onPresent;
        for (const o of overlays) o.attach?.(host);
        if (tree) host.attach(tree);
        await host.ready(); // a world with emitters draws them from the first frame on the new host
        host.replaced = { from: old.backend, lost: old.lost, tried: errors.slice() };
        return host;
      } catch (e) { errors.push(`${backend}: ${e?.message ?? e}`); }
    }
    old._carry = { tree, overlays, carried }; // for another try later (WebKit's GPU process takes a few seconds to come back)
    throw new Error(`the renderer couldn't be made again (${errors.join('; ')})`);
  }

  /**
   * A host on the backend `backend` asks for (M4 W0): 'webgl' (RenderHost's own default; apps default to 'auto' through backendFromQuery since M4 W3), 'webgpu' (throws without
   * WebGPU) or 'auto' (WebGPU where the page has it, else WebGL). `backendFromQuery(location.search)` reads the
   * `?renderer=` switch. For WebGPU it first warms the page up (warmUpWebGPU, AB-T-0554 gotcha 6), then creates and
   * initialises the view's WebGPURenderer, and loads the patched MToonNodeMaterial for characters. The other options
   * are the constructor's (preserveDrawingBuffer is WebGL's: a WebGPU canvas is read in the task that drew it).
   * three's WebGPURenderer falls back to its WebGL2 backend inside init() when WebGPU fails there (requestDevice after
   * requestAdapter succeeded, a lost device): then a forced 'webgpu' throws, and 'auto' makes a WebGL host.
   * `fallbackRenderer`: the renderer auto's WebGL path uses instead of a new WebGLRenderer (a stand-in, in tests).
   * `post`: the constructor's factory, or options for the backend's own stack (`{ loadCube }`: a .cube's text, M4 W1).
   * @param {CreateOptions} [opts]
   */
  static async create({ post = null, ...rest } = {}) {
    // what a host made in this one's place (RenderHost.replace) asks for again: the post stack, the stand-ins; never the
    // canvas (a fresh one), the renderer or the backend (replace's own order)
    const again = { ...rest };
    delete again.canvas; delete again.renderer; delete again.backend;
    // `post` as options (M4 W1): the stack for whichever backend the host got, made once its renderer exists
    if (!post || typeof post === 'function') {
      const host = await RenderHost._create({ ...rest, post: /** @type {(renderer: any) => any} */ (post || undefined) });
      host._made = { ...again, post };
      return host;
    }
    const host = await RenderHost._create(rest);
    host._made = { ...again, post };
    if (host.backend !== 'stand-in') {
      const { makePostStack } = await import('@vrmxg/post'); // pmndrs on WebGL, the TSL stack on WebGPU: only when asked for
      host.setPost(await makePostStack(host.renderer, post));
    }
    return host;
  }

  /** @param {Omit<CreateOptions, 'post'> & { post?: (renderer: any) => any }} [opts] */
  static async _create({ backend = 'webgl', navigator: nav = globalThis.navigator, webgpu = null, mtoonMaterial = null, fallbackRenderer = null, ...opts } = {}) {
    if (/** @type {string} */ (backend) === 'webgl-fallback') { // in place of a lost WebGPU host (M6 W6): node materials on WebGL2
      const W = webgpu ?? await loadWebGPU();
      const renderer = opts.renderer ?? new W.WebGPURenderer({ canvas: opts.canvas, antialias: opts.antialias ?? true, alpha: true, forceWebGL: true });
      await renderer.init();
      mtoonMaterial ??= (await import('@pixiv/three-vrm/nodes')).MToonNodeMaterial;
      return new RenderHost({ ...opts, renderer, webgpu: W, mtoonMaterial, webglFallback: true });
    }
    const chosen = await resolveBackend(backend, { navigator: nav });
    if (chosen === 'webgl') return new RenderHost({ ...opts, mtoonMaterial });
    /** WebGPU failed inside a renderer's init(): a forced WebGPU says so; auto takes the WebGL path. */
    const fellBack = (which) => {
      if (backend === 'webgpu') throw new Error(`renderer=webgpu: ${which} got three's WebGL2 fallback, not WebGPU (WebGPU failed inside init(), e.g. requestDevice); use renderer=auto to fall back to WebGL`);
      return new RenderHost({ ...opts, renderer: fallbackRenderer ?? undefined, mtoonMaterial: null });
    };
    const W = webgpu ?? await loadWebGPU();
    const warm = await warmUpWebGPU({ webgpu: W }); // before this renderer, so it isn't the page's first (gotcha 6)
    if (!warm.webgpu) return fellBack('the warm-up renderer'); // found before the view's canvas is touched
    const renderer = opts.renderer ?? new W.WebGPURenderer({ canvas: opts.canvas, antialias: opts.antialias ?? true, alpha: true, powerPreference: 'high-performance' });
    await renderer.init();
    if (!isWebGPUBackend(renderer)) {
      // rare once the warm-up got WebGPU; auto's WebGLRenderer then gets the canvas's existing WebGL2 context
      renderer.dispose?.();
      return fellBack('the view\'s renderer');
    }
    mtoonMaterial ??= (await import('@pixiv/three-vrm/nodes')).MToonNodeMaterial; // patched on install (scripts/patch-three-vrm.mjs)
    return new RenderHost({ ...opts, renderer, webgpu: W, mtoonMaterial }); // particles: three.quarks/webgpu's, on demand
  }

  /**
   * Load the particle renderer for this host's backend (AB-A-0335), once: `renderers` is @vrmxg/particles'
   * `particleRenderers` ({ webgl, webgpu }: async loaders of three.quarks' BatchedRenderer and @vrmxg/particles/webgpu's),
   * 'webgpu' on WebGPU and on 'webgl-fallback'. The host itself never imports three.quarks, so an app without particles
   * neither loads nor ships it. Sets `particleRenderer` and hands it to the attached tree's particles service before
   * resolving, so a frame drawn after this resolves has its batch. A tree's particles service starts it on attach and
   * holds its steps meanwhile; an app that wants particles in its very first frame (or checks frames against digests)
   * awaits it before attaching. A host made with a `particleRenderer` (or a stand-in) resolves with that at once.
   * @param {{ webgl: () => Promise<any>, webgpu: () => Promise<any> }} renderers
   * @returns {Promise<any>} the class, or null
   */
  loadParticleRenderer(renderers) {
    if (this.particleRenderer !== undefined) return Promise.resolve(this.particleRenderer);
    if (!this._particleLoad) {
      const load = renderers?.[this.backend === 'webgl' ? 'webgl' : 'webgpu'];
      if (typeof load !== 'function') return Promise.reject(new Error('RenderHost.loadParticleRenderer: pass @vrmxg/particles\' particleRenderers'));
      this._particleLoad = Promise.resolve().then(load).then((R) => {
        if (this.particleRenderer === undefined) this.particleRenderer = R ?? null;
        this._particleLoad = null;
        if (!this._disposed) this.tree?.services.get('particles')?.attachHost?.(this);
        return this.particleRenderer;
      }, (e) => { this._particleLoad = null; throw e; });
    }
    return this._particleLoad;
  }

  /**
   * Resolves once what this host loads on demand for its tree is in (AB-A-0335: the particle renderer). Offline frames
   * (frameAt) and stills wait for it, so no frame is drawn with emitters and no batch to draw them.
   */
  async ready() {
    if (this._particleLoad) await this._particleLoad.catch(() => {}); // a failed load draws no particles, as before it was asked
  }

  /**
   * Compile the pipelines `object` draws with before it is shown (AB-A-0335). WebKit's first WebGPU compile of the sample
   * cafe with Mira and Hana makes the first frame take 8.7 s in a fresh WKWebView (the studio measured 10–12 s for its
   * models; 0.13–0.18 s once cached), and a frame that meets an uncompiled pipeline waits for it. Two steps:
   *   1. `renderer.compileAsync`: every material's pipeline, compiled in parallel without drawing or blocking the page.
   *      In r187 it skips what the camera's layers exclude (as render does), so a model kept on a hidden layer would
   *      compile nothing: it compiles through a copy of the view's camera with every layer enabled. A model not yet in
   *      the host's scene compiles with the scene's lights and environment (compileAsync's target scene).
   *   2. WebGPU: one draw nobody sees, into a throwaway target made as three makes its framebuffer target (or through the
   *      post stack, whose last pass draws into it), through the view's camera with every layer on for that one
   *      synchronous draw (so no frame shown meanwhile sees a hidden layer), with the object in the scene for it. That
   *      compiles what compileAsync doesn't: the shadow maps' materials, the post stack's passes, the pipelines that
   *      differ only by draw state. Lights' pending shadow updates are left as they were. Then it waits for the GPU.
   * The Environment and lights are brought up to date first (tone mapping decides whether WebGPU draws through its
   * framebuffer target). WebGL takes step 1 only (WebGLRenderer's compileAsync, parallel where the context allows): a draw
   * into a target there would compile programs without the canvas's tone mapping, the wrong variants. Nothing simulated is
   * touched. A no-op on a stand-in, a lost or a disposed host.
   * @param {any} [object] a model, a node's object3d, or the whole scene (the default: everything the tree shows)
   * @param {{ camera?: any, draw?: boolean }} [o] the camera it will be seen through (the view's, by default); `draw`:
   *   step 2 (true)
   * @returns {Promise<{ ms: number, compileMs?: number, drawMs?: number, skipped?: boolean }>}
   */
  async warmUp(object = this.scene, { camera = null, draw = true } = {}) {
    const r = this.renderer;
    if (this.lost || this._disposed || typeof r.compileAsync !== 'function') return { ms: 0, skipped: true };
    const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
    const t0 = now();
    if (this.tree) this.views.update(this.tree);
    const view = camera ?? this.camera ?? this.tree?.services.get('cameras')?.current?.camera ?? this.fallbackCamera;
    const lens = view.clone();
    lens.layers.enableAll();
    const inScene = object === this.scene || !!object?.isScene;
    try { await r.compileAsync(object, lens, inScene ? null : this.scene); }
    catch (e) { if (!this._lostBy(e)) throw e; return { ms: now() - t0, skipped: true }; } // a lost device: nothing to compile for
    const compileMs = now() - t0;
    if (!draw || !r.isWebGPURenderer || this.lost || this._disposed) return { ms: compileMs, compileMs };
    try { this._warmDraw(inScene ? null : object, view); await this.finish(); }
    catch (e) { if (!this._lostBy(e)) throw e; }
    return { ms: now() - t0, compileMs, drawMs: now() - t0 - compileMs };
  }

  /** warmUp's draw nobody sees (WebGPU): the scene (with `object` in it) into a throwaway target. Synchronous. */
  _warmDraw(object, camera) {
    const r = this.renderer;
    const target = new RenderTarget(64, 64, { depthBuffer: r.depth ?? true, stencilBuffer: r.stencil ?? false, type: r._outputBufferType ?? HalfFloatType, format: RGBAFormat, samples: r.samples ?? 0 });
    const added = object && !object.parent ? (this.scene.add(object), true) : false;
    const mask = camera.layers.mask, back = r.getRenderTarget(), shadows = [];
    this.scene.traverse((o) => { if (o.isLight && o.shadow) shadows.push([o.shadow, o.shadow.needsUpdate]); });
    camera.layers.enableAll();
    try {
      r.setRenderTarget(target);
      if (this.post?.active) this.post.render(this.scene, camera, this.time);
      else r.render(this.scene, camera);
    } finally {
      r.setRenderTarget(back);
      camera.layers.mask = mask;
      if (added) this.scene.remove(object);
      for (const [shadow, pending] of shadows) shadow.needsUpdate = pending;
      target.dispose();
    }
  }

  /**
   * Install a post stack (PostStack, TSLPostStack, or null for none): it takes the current camera's lens for its depth of
   * field, the drawing buffer's size, and the scene's Environment `post` on the next frame.
   */
  setPost(stack) {
    if (this.post && this.post !== stack) this.post.dispose?.();
    this.post = stack ?? null;
    if (!this.post) return;
    this.post.dofSource = this._dofSource();
    const s = this.drawingBufferSize();
    if (s?.width && s?.height) this.post.setSize?.(s.width, s.height);
    this.views.environment.key = ''; // configure the new stack from the Environment on the next update
  }

  /** The current camera's depth of field for the post stack (its lens at the drawing buffer's height). */
  _dofSource() { return () => this.cameraNode()?.postDof?.(this.drawingBufferSize()?.height ?? 1080) ?? null; }

  /** Blend presentation at α (true), or draw the last step as simulated (false). */
  get interpolate() { return this._interpolate; }
  set interpolate(on) { this._interpolate = on; this.interpolator.version = -1; } // re-capture before blending again

  /**
   * Show a tree. Its root joins the host's scene; the tree runs as it would headless. Services that draw take what
   * they need for this renderer from the host (`attachHost`: particles take `particleRenderer`, M4 W2). The tree keeps
   * the host as `tree.renderHost`, so a service installed later can take it then.
   */
  attach(tree) {
    if (this.tree) this.detach();
    this.tree = tree;
    this.scene.add(tree.root.object3d);
    tree.renderHost = this; // a service installed after this attach finds the host here
    for (const s of tree.services.values()) s.attachHost?.(this);
    this.interpolator.version = -1;
    this.views.sync(tree);
    return this;
  }

  detach() {
    if (!this.tree) return;
    this.scene.remove(this.tree.root.object3d);
    if (this.tree.renderHost === this) this.tree.renderHost = null;
    this.tree = null;
  }

  /** The neutral studio environment (PMREM), made once with the renderer's own generator; null on a stand-in. */
  roomEnvironment() {
    if (this._room !== undefined) return this._room;
    if (this.renderer.isWebGPURenderer && this._webgpu) {
      const { pmrem, texture, target } = roomPMREM(this.renderer, this._webgpu.PMREMGenerator);
      this._roomTarget?.dispose();
      this._pmrem = pmrem; this._roomTarget = target; // kept with its texture, as the spike measured it (disposed with the host)
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

  /**
   * Wait for the GPU to finish the work submitted so far (M4 W3: timings that include the GPU, on either backend):
   * `gl.finish()` on WebGL, `device.queue.onSubmittedWorkDone()` on WebGPU (which adds its own round trip). Resolves at
   * once on a stand-in renderer that has neither.
   * @returns {Promise<void>}
   */
  async finish() {
    const r = this.renderer;
    if (r.isWebGLRenderer) { r.getContext().finish(); return; }
    const device = r.backend?.device;
    if (device) await device.queue.onSubmittedWorkDone();
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
   *
   * The first moment that can be shown is step 1 as simulated (AB-T-0595). At step 0 nothing has run: characters stand in
   * their bind pose, no rig or brain has placed the camera, and a sequence's tracks (its look, its first shot's camera
   * and overrides) apply in the step. So a blend that would reach back to step 0 (α < 1 on step 0 or 1: a film's frame 0,
   * and at 48 fps and up the frames after it that fall in the first step) draws step 1 as it is: `last.alpha` is then 1.
   * The simulation is untouched: the world steps exactly as before, and every later frame is the same. α = 1 asks for a
   * step as simulated and is drawn as asked, step 0 included (a check that draws every step).
   * @param {number} step @param {number} alpha
   * @param {(step: number) => void} [afterStep]
   */
  async frameAt(step, alpha, afterStep) {
    const tree = this.tree;
    if (alpha < 1 && step <= 1) { step = 1; alpha = 1; }
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
    if (this._particleLoad) await this.ready(); // the particle renderer, if a tree's emitters asked for it (AB-A-0335)
    this.advanceNodeFrame(); // WebGPU: this frame's passes and shadow maps redraw, though nothing yielded to rAF (gotcha 1)
    this.render(alpha, steps > 0);
    this.last.steps = steps; this.last.alpha = alpha; this.last.held = false;
    return this.last;
  }

  /**
   * Draw the tree at α (1 = the last step as simulated). On step 1 there is nothing to blend from (step 0 is the world
   * before anything ran: see frameAt), so the step is drawn as simulated whatever α says.
   */
  render(alpha = 1, stepped = true) {
    const tree = this.tree;
    if (this.lost) return; // nothing draws on a lost device: a host made in this one's place does (RenderHost.replace)
    if (alpha < 1 && tree.clock.step === 1) alpha = 1;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.views.update(tree);
    // a sequence's post tracks (M2 W1): presentation values at this frame and α, after the Environment configured the stack
    const pv = this.post ? tree.services.get('sequence')?.postValues?.(alpha) : null;
    if (pv) this.post.setParams(pv);
    this.debug.update(tree, stepped);
    const camera = this.camera ?? tree.services.get('cameras')?.current?.camera ?? this.fallbackCamera;
    const blend = this.interpolate && alpha < 1;
    if (blend) this.interpolator.apply(alpha);
    // the blend is written into the simulated transforms for the draw: whatever the draw does (a lost device throws
    // here), they go back before anything steps again (M6 W6)
    try {
      this.onPresent?.(alpha);
      const views = this.layout?.length ? this.layout.map((v) => ({ ...v, camera: /** @type {any} */ (tree.find(v.camera))?.camera })).filter((v) => v.camera) : null;
      for (const o of this.overlays) o.update(tree, views?.[0]?.camera ?? camera, alpha);
      this.time = (tree.clock.step - 1 + alpha) / 60;
      if (views?.length) renderViews(this.renderer, this.scene, views);
      else if (this.post?.active) this.post.render(this.scene, camera, this.time);
      else this.renderer.render(this.scene, camera);
    } catch (e) {
      if (!this._lostBy(e)) throw e; // a lost device is said through onLost, not thrown at the frame loop
    } finally {
      if (blend && this.interpolator.restore()) tree.root.object3d.updateMatrixWorld(true);
    }
    this.last.renderMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  /**
   * The room environment's PMREM render target on WebGPU (null before roomEnvironment() made it, and on WebGL, whose
   * generator is disposed after use): a check can read it back (AB-T-0589 hashes it per export).
   */
  get roomTarget() { return this._roomTarget ?? null; }

  /** The Camera node the view renders through (null when the host's own camera overrides it). */
  cameraNode() { return this.camera ? null : this.tree?.services.get('cameras')?.current ?? null; }

  dispose() {
    this._disposed = true; // its renderer's dispose destroys its device: that isn't a loss
    if (this._contextLost) this.renderer.domElement?.removeEventListener?.('webglcontextlost', this._contextLost);
    // on a lost device any of this may throw: the host is let go either way (M6 W6)
    const quietly = (fn) => { try { const p = fn(); p?.catch?.(() => {}); } catch (e) { if (!this.lost) throw e; } };
    quietly(() => this.post?.dispose?.());
    this.detach();
    quietly(() => { this.views.dispose(); this.debug.dispose(); });
    // the WebGPU room texture is its target's: disposing the target frees both
    quietly(() => { if (this._roomTarget) this._roomTarget.dispose(); else this._room?.dispose(); });
    this._roomTarget = null;
    quietly(() => this._pmrem?.dispose());
    quietly(() => this.renderer.dispose?.());
  }
}
