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
import { PCFShadowMap, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Interpolator } from './interpolate.js';
import { Views } from './views.js';
import { DebugDraw } from './debug.js';

export class RenderHost {
  /**
   * @param {object} [opts]
   * @param {HTMLCanvasElement} [opts.canvas]
   * @param {any} [opts.renderer] an existing renderer (or a stand-in, in tests)
   * @param {number} [opts.dprCap] largest device pixel ratio rendered (2)
   * @param {boolean} [opts.antialias]
   * @param {boolean} [opts.interpolate] blend presentation at α (true); off renders the last step
   * @param {boolean} [opts.preserveDrawingBuffer] keep the frame readable (screenshots)
   */
  constructor({ canvas, renderer, dprCap = 2, antialias = true, interpolate = true, preserveDrawingBuffer = false } = {}) {
    this.renderer = renderer ?? new WebGLRenderer({ canvas, antialias, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer });
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
    this._room = undefined;
    /** Called during render with the blend applied, before drawing: (alpha) => void. For traces and tests. */
    this.onPresent = null;
    this.last = { steps: 0, alpha: 1, renderMs: 0 };
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

  /** The neutral studio environment (PMREM), made once; null without a real WebGL renderer. */
  roomEnvironment() {
    if (this._room !== undefined) return this._room;
    if (!this.renderer.isWebGLRenderer) return (this._room = null);
    const pmrem = new PMREMGenerator(this.renderer);
    this._room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return this._room;
  }

  /** The output's size in CSS pixels; cameras fit their lens to the aspect. */
  resize(width, height) {
    this.renderer.setSize(width, height, false);
    this.tree?.services.get('cameras')?.setAspect(width / height);
    this.fallbackCamera.aspect = width / height; this.fallbackCamera.updateProjectionMatrix();
  }

  /**
   * Live play: run the steps that `elapsedSeconds` of display time buys, then draw at α.
   * @param {number} elapsedSeconds from the host's frame loop (requestAnimationFrame's timestamps)
   * @param {(step: number) => void} [afterStep] called after each simulation step (traces, hashes)
   */
  frame(elapsedSeconds, afterStep) {
    const tree = this.tree;
    const { steps, alpha } = tree.clock.advance(elapsedSeconds);
    for (let i = 0; i < steps; i++) {
      if (i === steps - 1 && this.interpolate) this.interpolator.beforeStep(tree);
      tree.step();
      afterStep?.(tree.clock.step);
    }
    if (this.interpolate) this.interpolator.afterSteps(tree, steps > 0);
    tree.present(elapsedSeconds, alpha);
    this.render(alpha, steps > 0);
    this.last.steps = steps; this.last.alpha = alpha;
    return this.last;
  }

  /** Draw the tree at α (1 = the last step as simulated). */
  render(alpha = 1, stepped = true) {
    const tree = this.tree;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.views.update(tree);
    this.debug.update(tree, stepped);
    const camera = tree.services.get('cameras')?.current?.camera ?? this.fallbackCamera;
    const blend = this.interpolate && alpha < 1;
    if (blend) this.interpolator.apply(alpha);
    this.onPresent?.(alpha);
    this.renderer.render(this.scene, camera);
    if (blend && this.interpolator.restore()) tree.root.object3d.updateMatrixWorld(true);
    this.last.renderMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  dispose() {
    this.detach();
    this.views.dispose(); this.debug.dispose();
    this._room?.dispose();
    this.renderer.dispose?.();
  }
}
