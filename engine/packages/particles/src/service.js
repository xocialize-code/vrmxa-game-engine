// The "particles" service (M2 W4): three.quarks behind the adapter spike-particles proved (AB-R-0926).
//
// The adapter, not the library, owns what makes it deterministic:
//   - randomness: quarks draws from Math.random, so each emitter's step runs with Math.random swapped for a stream seeded
//     from (scene seed, emitter id, step) alone; a frame's randomness never depends on history, so no RNG state needs
//     saving, and a restored world draws what a straight run draws
//   - maths: @vrmxg/dmath is installed over Math (sin, cos, pow …), so V8 and JavaScriptCore agree to the bit
//   - the step: simulation emitters advance 1/60 s in physicsProcess, before the nodes; presentation emitters advance with
//     the presented frame
//   - snapshots: each emitter's particles and emission state are its node state (ParticleEmitterNode.getState)
// One BatchedRenderer per tree draws every emitter (one draw per material and render mode). quarks disposes a system
// whose emitter's root isn't a Scene, so a tree outside a render host (Node, an offline export) hangs under a private
// Scene; a render host's scene takes the root over when it attaches.
//
// M4 W2 (AB-T-0574): the BatchedRenderer comes from the render host, never from here. three.quarks draws WebGL with its
// own BatchedRenderer and WebGPU with three.quarks/webgpu's (TSL node materials), so a host hands over the class that
// matches its renderer (`host.particleRenderer`) when a tree attaches (attachHost), and the batch is rebuilt if the tree
// moves to a host on the other backend. Headless, nothing draws, so there is no batch. The batch only draws: quarks'
// simulation never reads it (a system tells its renderer when its look changes, and that's all), so the particles hash
// the same with WebGL's batch, WebGPU's or none.
import { Scene, MeshBasicMaterial, DataTexture, RGBAFormat, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter, AdditiveBlending, NormalBlending } from 'three';
import { DT, RandomStream } from '@vrmxg/core';
import { atlasPixels } from './atlas.js';
import { BUILTIN, buildSystems, checkEffect } from './effect.js';


/** Run fn with Math.random drawing from a stream (synchronous fn only: single-threaded JS makes the swap safe). */
export function withRandom(stream, fn) {
  // eslint-disable-next-line vrmxg/deterministic -- the adapter swaps the library's Math.random for a seeded stream
  const prev = Math.random;
  // eslint-disable-next-line vrmxg/deterministic -- (the swap)
  Math.random = () => stream.float();
  try { return fn(); } finally {
    // eslint-disable-next-line vrmxg/deterministic -- and puts the original back
    Math.random = prev;
  }
}

/** The stream an emitter's step k draws from: a function of (seed, id, k) only. */
export const stepStream = (seed, id, k) => new RandomStream((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0, `particles:${id}`);

export class ParticlesService {
  /**
   * @param {any} tree
   * @param {{ resolve?: (ref: string) => Promise<Uint8Array>, BatchedRenderer?: any }} [o] BatchedRenderer: a three.quarks
   *   BatchedRenderer class to draw with before any host attaches (tests); a host's replaces it
   */
  constructor(tree, { resolve = null, BatchedRenderer = null } = {}) {
    this.tree = tree;
    this.resolve = resolve;
    /** Effect documents by name or ref: the built-ins, and project files read in prepare(). */
    this.effects = new Map(Object.entries(BUILTIN));
    /** @type {any[]} */ this.emitters = [];
    /** The batch renderer drawing every emitter, from the host (null: nothing draws). @type {any} */ this.batch = null;
    this._materials = new Map();
    this._presented = 0;
    this._scene = null;
    /** @type {any} */ this._atlas = null;
    /** A clock the caller may give (acceptance timing): the step's own cost accumulates in stepMs. @type {(() => number) | null} */ this.timer = null;
    this.stepMs = 0;
    if (BatchedRenderer) this.useRenderer(BatchedRenderer);
  }

  /** A render host attached the tree: draw with its BatchedRenderer (null on a host that can't draw particles). */
  attachHost(host) { this.useRenderer(host.particleRenderer ?? null); }

  /**
   * Draw with this three.quarks BatchedRenderer class (WebGL's, or three.quarks/webgpu's), or with none. The same class
   * keeps its batch; another one moves every system to a new batch.
   */
  useRenderer(BatchedRenderer) {
    if ((this.batch?.constructor ?? null) === (BatchedRenderer ?? null)) return this;
    const systems = this.emitters.flatMap((e) => e.systems);
    if (this.batch) {
      for (const s of systems) { this.batch.deleteSystem(s); s._renderer = null; }
      this.batch.parent?.remove(this.batch);
      for (const b of this.batch.batches) b.dispose?.();
    }
    this.batch = BatchedRenderer ? new BatchedRenderer() : null;
    if (this.batch) {
      this.batch.name = 'particles';
      for (const s of systems) this.batch.addSystem(s);
      if (systems.length) this.ensureStage();
    }
    return this;
  }

  /** Read the effect files the scene's emitters name (refs ending in .json) before instantiate. */
  async prepare(doc) {
    for (const n of doc.nodes ?? []) {
      const e = n.type === 'ParticleEmitter' ? n.props?.effect : null;
      if (typeof e === 'string' && /\.json$/i.test(e) && !this.effects.has(e) && this.resolve) {
        const effect = JSON.parse(new TextDecoder().decode(await this.resolve(e)));
        const problems = checkEffect(effect);
        if (problems.length) throw new Error(`${e}: ${problems.join('; ')}`);
        this.effects.set(e, effect);
      }
    }
    return this;
  }

  material(blending) {
    if (!this._materials.has(blending)) {
      this._atlas ??= (() => {
        const { data, width, height } = atlasPixels();
        const t = new DataTexture(data, width, height, RGBAFormat);
        Object.assign(t, { colorSpace: SRGBColorSpace, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, flipY: false, needsUpdate: true });
        return t;
      })();
      this._materials.set(blending, new MeshBasicMaterial({ map: this._atlas, transparent: true, depthWrite: false, blending: blending === 'additive' ? AdditiveBlending : NormalBlending }));
    }
    return this._materials.get(blending);
  }

  /** Root the tree under a Scene if nothing else does, and put the batch renderer in it. */
  ensureStage() {
    const root = this.tree.root.object3d;
    if (!root.parent) { this._scene ??= new Scene(); this._scene.add(root); }
    if (this.batch && this.batch.parent !== root) root.add(this.batch);
  }

  register(node) {
    const doc = this.effects.get(node.effect);
    if (!doc) throw new Error(`${node.id}: unknown effect "${node.effect}" (built in: ${Object.keys(BUILTIN).join(', ')}; or a project .json named in the scene)`);
    this.ensureStage();
    node.systems = withRandom(stepStream(this.tree.rng.seed, node.id, -1), () => {
      const systems = buildSystems(doc, (b) => this.material(b));
      // quarks' per-particle value generators learn their slot in a particle's memory on the first spawn: spawn one
      // throwaway particle now, so a world restored before it ever emitted reads the restored memories as a run does
      for (const s of systems) { s.spawn(1, { ...s.emissionState }, s.emitter.matrixWorld); s.particleNum = 0; }
      return systems;
    });
    for (const s of node.systems) { node.object3d.add(s.emitter); this.batch?.addSystem(s); }
    this.emitters.push(node);
  }

  unregister(node) {
    for (const s of node.systems) { this.batch?.deleteSystem(s); s.emitter.parent?.remove(s.emitter); }
    node.systems = [];
    this.emitters = this.emitters.filter((x) => x !== node);
  }

  physicsProcess() {
    if (!this.emitters.length) return;
    this.ensureStage();
    const t0 = this.timer?.() ?? 0;
    const k = this.tree.clock.step, seed = this.tree.rng.seed;
    for (const e of this.emitters) {
      const scale = this.tree.scaleOf(e);
      if (e.mode !== 'simulation' || scale === 0) continue;
      e.object3d.updateWorldMatrix(true, true);
      withRandom(stepStream(seed, e.id, k), () => e.advance(DT * scale * (e.props.speed ?? 1)));
    }
    if (this.timer) this.stepMs += this.timer() - t0;
  }

  /** Presentation: visual-only emitters advance with the frame; every batch rebuilds its buffers from the particles. */
  present(dt) {
    if (!this.emitters.length) return;
    const seed = this.tree.rng.seed, d = Math.min(Math.max(dt, 0), 0.1);
    for (const e of this.emitters) {
      if (e.mode !== 'presentation' || this.tree.scaleOf(e) === 0 || d === 0) continue;
      e.object3d.updateWorldMatrix(true, true);
      withRandom(stepStream(seed ^ 0x5bd1e995, e.id, this._presented), () => e.advance(d * (e.props.speed ?? 1)));
    }
    this._presented++;
    for (const b of this.batch?.batches ?? []) b.update();
  }

  /** Live particles in the tree. */
  count() { return this.emitters.reduce((n, e) => n + e.count, 0); }
}
