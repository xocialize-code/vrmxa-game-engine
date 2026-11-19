// PostStack (M2 W3, AB-T-0526): the adapter between a scene's post spec and pmndrs postprocessing 6.39 (a TSL adapter
// later, when MToon runs on WebGPU: research/cinematics.md §1.3). It owns one EffectComposer (MSAA 4× on HalfFloat
// buffers), builds the passes in the anime order from the spec, updates parameters in place (a post track keys them
// every frame without a rebuild), draws a character mask for the edges, and takes the frame's time from the caller so
// grain is the same in every export of a frame.
import { EffectComposer, RenderPass, EffectPass, NormalPass, DepthOfFieldEffect, BloomEffect, HueSaturationEffect, BrightnessContrastEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect, ChromaticAberrationEffect, SMAAEffect, LUT3DEffect, LUTCubeLoader, BlendFunction } from 'postprocessing';
import { HalfFloatType, WebGLRenderTarget, MeshBasicMaterial, Vector2, NoToneMapping, Color } from 'three';
import { AnimeEffect, EdgeEffect } from './effects.js';
import { normalizePost, structureOf } from './spec.js';

const TONE = { neutral: ToneMappingMode.NEUTRAL, agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC, none: ToneMappingMode.LINEAR };
/** The layer characters are on for the edge mask (the render host enables it on Character subtrees). */
export const CHARACTER_LAYER = 2;

export class PostStack {
  /**
   * @param {any} renderer a WebGLRenderer
   * @param {{ multisampling?: number, loadLut?: (file: string) => Promise<any> }} [o] loadLut: a .cube's text → a LUT texture
   */
  constructor(renderer, { multisampling = 4, loadLut } = {}) {
    this.renderer = renderer;
    this.multisampling = multisampling;
    this.loadLut = loadLut ?? null;
    /** file → the load in flight */ this.loading = new Map();
    this.composer = null;
    this.spec = [];
    this.key = '';
    this.effects = {};     // effect name → the pmndrs effect(s) built for it
    this.passes = [];
    this.scene = null; this.camera = null;
    this.mask = null; this.maskMaterial = new MeshBasicMaterial({ color: 0xffffff });
    this.size = new Vector2(1920, 1080);
    this.time = 0;
    this.toneMapping = 'neutral';
    this.exposure = 1;
    this.luts = new Map();
    /** Where the current camera's depth of field comes from: () => { focusDistance, focusRange, bokehPx } | null */
    this.dofSource = null;
  }

  get active() { return this.spec.length > 0; }

  /**
   * Set the spec (an Environment's `post`) and the environment's tone mapping. Rebuilds the passes only when the list of
   * effects changes; otherwise updates their parameters.
   */
  configure(post, { toneMapping = 'neutral', exposure = 1 } = {}) {
    const spec = normalizePost(post);
    this.toneMapping = toneMapping; this.exposure = exposure;
    const key = structureOf(spec);
    this.spec = spec;
    if (key !== this.key) { this.key = key; this.composer?.dispose(); this.composer = null; }
    this.renderer.toneMapping = spec.length ? NoToneMapping : this.renderer.toneMapping;
    if (this.composer) this.apply();
    for (const e of spec) {
      if (e.effect !== 'lut' || !e.file || this.luts.has(e.file) || this.loading.has(e.file) || !this.loadLut) continue;
      const file = e.file;
      this.loading.set(file, this.loadLut(file).then((t) => { this.luts.set(file, t); this.key = ''; this.composer?.dispose(); this.composer = null; })
        .catch((err) => { this.luts.set(file, null); console.warn(`[post] LUT ${file}: ${err?.message ?? err}`); })
        .finally(() => this.loading.delete(file)));
    }
  }

  /**
   * Wait for what the spec still loads (LUTs). A live view draws without them until they arrive; an offline frame (an
   * export, a scrub) waits, or its look depends on how the frame loop yields (M2 W12: a hash-only export never got the
   * grade, a shell export got it from its second frame).
   */
  async settle() { while (this.loading.size) await Promise.all([...this.loading.values()]); }

  /** Build the composer for a scene and camera (lazily, on the first render after a structural change). */
  build(scene, camera) {
    const { renderer } = this;
    this.scene = scene; this.camera = camera;
    const c = new EffectComposer(renderer, { multisampling: this.multisampling, frameBufferType: HalfFloatType });
    c.addPass(new RenderPass(scene, camera));
    const E = (this.effects = {});
    const has = (n) => this.spec.some((e) => e.effect === n);
    if (has('edges')) {
      const normal = new NormalPass(scene, camera, { resolutionScale: 1 }); // full resolution: at pmndrs' default half the edges come out dashed
      c.addPass(normal);
      this.mask = new WebGLRenderTarget(this.size.x / 2, this.size.y / 2);
      E.edges = new EdgeEffect({ normal: normal.texture, mask: this.mask.texture });
      c.addPass(new EffectPass(camera, E.edges));
    }
    if (has('dof')) { E.dof = new DepthOfFieldEffect(camera, { focusDistance: 3, focusRange: 2, bokehScale: 2, resolutionScale: 0.5 }); c.addPass(new EffectPass(camera, E.dof)); }
    const merged = [];
    if (has('bloom')) merged.push((E.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.9, intensity: 1, radius: 0.6 })));
    if (has('grade')) merged.push((E.hue = new HueSaturationEffect()), (E.bc = new BrightnessContrastEffect()));
    const lutSpec = this.spec.find((e) => e.effect === 'lut');
    if (lutSpec && this.luts.get(lutSpec.file)) merged.push((E.lut = new LUT3DEffect(this.luts.get(lutSpec.file))));
    merged.push((E.tone = new ToneMappingEffect({ mode: TONE[this.toneMapping] ?? ToneMappingMode.NEUTRAL }))); // always: the renderer's is off
    if (has('vignette')) merged.push((E.vignette = new VignetteEffect()));
    if (has('grain')) { E.grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN }); merged.push(E.grain); }
    if (has('anime')) merged.push((E.anime = new AnimeEffect()));
    c.addPass((this.merged = new EffectPass(camera, ...merged)));
    if (has('chromaticAberration')) { E.ca = new ChromaticAberrationEffect({ offset: new Vector2(0.001, 0.001), radialModulation: true, modulationOffset: 0.3 }); c.addPass(new EffectPass(camera, E.ca)); }
    if (has('smaa') && !this.multisampling) c.addPass(new EffectPass(camera, (E.smaa = new SMAAEffect())));
    c.setSize(this.size.x, this.size.y, false);
    this.composer = c;
    this.passes = c.passes.map((p) => { const fx = /** @type {any} */ (p).effects; return p.name + (fx ? `(${fx.map((e) => e.name).join('+')})` : ''); });
    this.apply();
  }

  /** Push the spec's values into the built effects (resolution-independent lengths scaled by the output height). */
  apply() {
    const E = this.effects, k = this.size.y / 1080, aspect = this.size.x / this.size.y;
    for (const e of this.spec) {
      switch (e.effect) {
        case 'edges': if (E.edges) { E.edges.thickness1080 = e.thickness; E.edges.uniforms.get('colour').value = new Color(e.colour).toArray(); E.edges.uniforms.get('strength').value = e.strength; E.edges.setSize(this.size.x, this.size.y); } break;
        case 'dof': if (E.dof) { const d = e.auto && this.dofSource?.(); E.dof.cocMaterial.focusDistance = d ? d.focusDistance : e.focusDistance; E.dof.cocMaterial.focusRange = Math.max(0.05, Math.min(50, d ? d.focusRange : e.focusRange)); E.dof.bokehScale = Math.min(8, (d ? d.bokehPx / 24 : e.bokehScale) * k); } break;
        case 'bloom': if (E.bloom) { E.bloom.intensity = e.intensity; E.bloom.luminanceMaterial.threshold = e.threshold; E.bloom.luminanceMaterial.smoothing = e.smoothing; E.bloom.mipmapBlurPass.radius = e.radius; } break;
        case 'grade': if (E.hue) { E.hue.saturation = e.saturation; E.hue.hue = e.hue; E.bc.brightness = e.brightness; E.bc.contrast = e.contrast; } break;
        case 'vignette': if (E.vignette) { E.vignette.offset = e.offset; E.vignette.darkness = e.darkness; } break;
        case 'grain': if (E.grain) E.grain.blendMode.opacity.value = e.amount; break;
        case 'anime': if (E.anime) { const u = E.anime.uniforms; u.get('speedLines').value = e.speedLines; u.get('focusLines').value = e.focusLines; u.get('impact').value = e.impact; u.get('seed').value = e.seed; u.get('centre').value.set(e.centre[0], e.centre[1]); E.anime.setSize(this.size.x, this.size.y); } break;
        case 'chromaticAberration': if (E.ca) { const o = e.offset / 1080; E.ca.offset.set(o / aspect, o); } break;
        default: break;
      }
    }
    if (E.tone) { E.tone.mode = TONE[this.toneMapping] ?? ToneMappingMode.NEUTRAL; this.renderer.toneMappingExposure = this.exposure; }
    void k;
  }

  /**
   * Set values by path ("anime.speedLines", "bloom.intensity", "vignette.darkness") for this frame: what a post track
   * keys. Effects not in the spec are ignored.
   * @param {Record<string, any>} values
   */
  setParams(values) {
    let changed = false;
    for (const [path, v] of Object.entries(values)) {
      const [name, key] = path.split('.');
      const e = this.spec.find((x) => x.effect === name);
      if (e && e[key] !== v) { e[key] = v; changed = true; }
    }
    if (changed && this.composer) this.apply();
  }

  setSize(w, h) {
    this.size.set(w, h);
    this.composer?.setSize(w, h, false);
    this.mask?.setSize(w / 2, h / 2);
    if (this.composer) this.apply();
  }

  /**
   * Draw a frame through the stack. `time` (seconds) is the frame's presentation time, for grain: pass the frame's own
   * time in exports so every export of a frame is the same.
   */
  render(scene, camera, time = this.time) {
    if (!this.composer || scene !== this.scene || camera !== this.camera) { this.composer?.dispose(); this.build(scene, camera); }
    if (this.effects.dof && this.spec.find((e) => e.effect === 'dof')?.auto) this.apply();
    if (this.effects.edges) this.drawMask(scene, camera);
    for (const p of this.composer.passes) if (p.fullscreenMaterial && 'time' in p.fullscreenMaterial) p.fullscreenMaterial.time = time;
    this.composer.render(0);
  }

  /** Characters (CHARACTER_LAYER) drawn white into the mask target, so the edges skip them. */
  drawMask(scene, camera) {
    const r = this.renderer, layers = camera.layers.mask, bg = scene.background, ov = scene.overrideMaterial;
    camera.layers.set(CHARACTER_LAYER);
    scene.background = null; scene.overrideMaterial = this.maskMaterial;
    const clear = r.getClearColor(new Color()), alpha = r.getClearAlpha();
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.mask); r.clear(); r.render(scene, camera); r.setRenderTarget(null);
    r.setClearColor(clear, alpha);
    camera.layers.mask = layers; scene.background = bg; scene.overrideMaterial = ov;
  }

  dispose() { this.composer?.dispose(); this.mask?.dispose(); this.composer = null; }
}

/** A LUT texture from a .cube file's text (pmndrs' loader), for PostStack's loadLut. */
export function lutFromCube(text) { return new LUTCubeLoader().parse(text); }
