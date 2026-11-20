// The anime post stack (research/cinematics.md §1.3) as a TSL RenderPipeline for WebGPURenderer: the same spec, order
// and parameters as @vrmxg/post's PostStack (pmndrs on WebGL), behind the same interface, so RenderHost drives either.
//
//   scene pass (MSAA 4×, HalfFloat; MRT: output, emissive, normal with the character mask in alpha)
//   → edges (custom TSL: depth + normal, characters masked) → DOF (three's dof()) → selective bloom (bloom() on the
//   emissive MRT) → grade (hue(), saturation(), brightness/contrast) → LUT (lut3D()) → tone mapping (toneMapping())
//   → vignette → grain → speed lines / focus lines / impact (custom TSL) → chromatic aberration (custom TSL)
//   → sRGB (the pipeline's output transform).
//
// What three's node set gives and what is custom here is listed per effect in MAPPING (and the README).
import { RenderPipeline, PassNode, Layers, MeshBasicNodeMaterial, Vector2, Color, UnsignedByteType, HalfFloatType, NeutralToneMapping, AgXToneMapping, ACESFilmicToneMapping, NoToneMapping, LinearToneMapping } from 'three/webgpu';
import {
  pass, mrt, output, emissive, normalView, packNormalToRGB, uniform, vec2, vec3, vec4, float, Fn, uv, texture3D,
  perspectiveDepthToViewZ, cameraNear, cameraFar, smoothstep, mix, max, abs, dot, length, atan, floor, fract, sin, step, clamp,
  hue, saturation, toneMapping, convertToTexture, luminance,
} from 'three/tsl';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js';
import { normalizePost, structureOf } from '@vrmxg/post';

/** The layer RenderHost puts characters on while a post stack runs (@vrmxg/post CHARACTER_LAYER). */
export const CHARACTER_LAYER = 2;

/**
 * The character mask: characters only (their layer), drawn white with no background, at half resolution, as
 * @vrmxg/post's drawMask does. (A per-material mrtNode would be cheaper, but in r187 a material's mrtNode replaces its
 * output in every pass without an MRT that draws it: the canvas framebuffer and plain render targets then fail to
 * compile, "struct OutputType {}" with no members. Shadow maps are fine (override material). Upstream #35373, fixed
 * on dev by #35376, so r188 can use mrtNode.)
 */
class MaskPassNode extends PassNode {
  updateBefore(frame) {
    const s = this.scene, bg = s.background, env = s.environment;
    s.background = null; s.environment = null;
    try { super.updateBefore(frame); } finally { s.background = bg; s.environment = env; }
  }
}

const TONE = { neutral: NeutralToneMapping, agx: AgXToneMapping, aces: ACESFilmicToneMapping, none: LinearToneMapping };

/** Each @vrmxg/post effect → what it is under TSL in r187. */
export const MAPPING = {
  edges: { tsl: 'custom', with: 'pass() MRT normal (packNormalToRGB(normalView)) + depth texture; character mask from a half-res pass of layer 2 (PassNode.setLayers + overrideMaterial); material.mrtNode breaks non-MRT passes in r187 (#35373, fixed for r188)', note: 'three has sobel() (luminance only) and outline() (a selection outline); neither is depth+normal set edges with a mask' },
  dof: { tsl: 'dof()', with: 'scenePass.getViewZNode(); focusDistance and range in world units as pmndrs', note: 'bokehScale is not the same unit as pmndrs\' (visual match not tuned)' },
  bloom: { tsl: 'bloom()', with: 'on the emissive MRT target: selective by construction', note: 'pmndrs path is luminance-threshold bloom; bloomMode=threshold here runs bloom() on the colour with the same threshold for a like-for-like cost' },
  grade: { tsl: 'hue(), saturation() + custom brightness/contrast', note: 'two lines of TSL' },
  lut: { tsl: 'lut3D()', with: 'three/addons LUTCubeLoader → texture3D', note: 'same .cube files' },
  toneMapping: { tsl: 'toneMapping()', note: 'mid-chain as in pmndrs; the pipeline\'s own output transform does only sRGB (renderer.toneMapping = NoToneMapping)' },
  vignette: { tsl: 'custom', note: 'no vignette node in r187 (a few lines)' },
  grain: { tsl: 'custom', note: 'film() exists but takes its noise from the renderer\'s global time; custom grain takes the frame\'s presentation time as a uniform (deterministic exports)' },
  anime: { tsl: 'custom', note: 'speed lines, focus lines, impact frame: a port of the GLSL Effect' },
  chromaticAberration: { tsl: 'custom', note: 'three\'s chromaticAberration() is a stepped radial scale with no px unit; custom keeps px-at-1080p, radial' },
  smaa: { tsl: 'smaa()', note: 'not in the anime preset (MSAA on); fxaa(), traa() also exist' },
};

// GLSL h1: fract(sin(n * 12.9898) * 43758.5453)
const h1 = (n) => fract(sin(n.mul(12.9898)).mul(43758.5453));
const PI = 3.14159, TAU = 6.28318;

export class TSLPostStack {
  /**
   * @param {any} renderer a WebGPURenderer
   * @param {{ multisampling?: number, loadLut?: (file: string) => Promise<string>, bloomMode?: 'selective' | 'threshold' }} [o]
   *   loadLut: a .cube file's text
   */
  constructor(renderer, { multisampling = 4, loadLut, bloomMode = 'selective', disposeOld = false } = {}) {
    this.renderer = renderer;
    this.disposeOld = disposeOld;
    /** structure key → { pipeline, passes } */ this.cache = new Map();
    this.multisampling = multisampling;
    this.loadLut = loadLut ?? null;
    this.bloomMode = bloomMode;
    this.loading = new Map();
    this.luts = new Map();
    this.pipeline = null;
    this.spec = []; this.key = '';
    this.scene = null; this.camera = null;
    this.toneMapping = 'neutral'; this.exposure = 1;
    this.dofSource = null;
    this.time = 0;
    this.passes = [];
    // uniforms: made once, values pushed by apply()
    this.u = {
      texel: uniform(new Vector2(1 / 1920, 1 / 1080)), thickness: uniform(1), edgeColour: uniform(new Color(0.05, 0.03, 0.04)), edgeStrength: uniform(1),
      focus: uniform(3), range: uniform(2), bokeh: uniform(2),
      bloomStrength: uniform(1), bloomRadius: uniform(0.6), bloomThreshold: uniform(0.9),
      hue: uniform(0), sat: uniform(0), bright: uniform(0), contrast: uniform(0), lutIntensity: uniform(1),
      exposure: uniform(1), vigOffset: uniform(0.3), vigDark: uniform(0.55), grain: uniform(0.25), time: uniform(0),
      speed: uniform(0), focusLines: uniform(0), impact: uniform(0), seed: uniform(3), centre: uniform(new Vector2(0.5, 0.5)), aspect: uniform(16 / 9),
      ca: uniform(new Vector2(0.001, 0.001)),
    };
  }

  get active() { return this.spec.length > 0; }

  configure(post, { toneMapping = 'neutral', exposure = 1 } = {}) {
    const spec = normalizePost(post);
    this.toneMapping = toneMapping; this.exposure = exposure;
    const key = structureOf(spec) + `|tone:${toneMapping}`;
    this.spec = spec;
    if (key !== this.key) { this.key = key; this.disposePipeline(); }
    if (spec.length) this.renderer.toneMapping = NoToneMapping;
    this.apply();
    for (const e of spec) {
      if (e.effect !== 'lut' || !e.file || this.luts.has(e.file) || this.loading.has(e.file) || !this.loadLut) continue;
      const file = e.file;
      this.loading.set(file, this.loadLut(file).then((text) => { this.luts.set(file, new LUTCubeLoader().parse(text)); this.key = ''; this.disposePipeline(); })
        .catch((err) => { this.luts.set(file, null); console.warn(`[post] LUT ${file}: ${err?.message ?? err}`); })
        .finally(() => this.loading.delete(file)));
    }
  }

  async settle() { while (this.loading.size) await Promise.all([...this.loading.values()]); }

  build(scene, camera) {
    const { u } = this;
    this.scene = scene; this.camera = camera;
    const has = (n) => this.spec.some((e) => e.effect === n);
    const passes = [];
    const scenePass = pass(scene, camera, { samples: this.multisampling });
    const outs = { output };
    const edges = has('edges'), selective = has('bloom') && this.bloomMode === 'selective';
    if (selective) outs.emissive = vec4(emissive, 1);
    if (edges) outs.normal = vec4(packNormalToRGB(normalView), 1);
    if (Object.keys(outs).length > 1) scenePass.setMRT(mrt(outs));
    if (edges) scenePass.getTexture('normal').type = UnsignedByteType;
    if (selective) scenePass.getTexture('emissive').type = HalfFloatType;
    passes.push(`scene(MSAA${this.multisampling}${Object.keys(outs).length > 1 ? `, MRT ${Object.keys(outs).join('+')}` : ''})`);
    let maskTex = null;
    if (edges) {
      const maskPass = new MaskPassNode(PassNode.COLOR, scene, camera, { samples: 0, depthBuffer: true });
      const layers = new Layers(); layers.set(CHARACTER_LAYER);
      maskPass.setLayers(layers);
      maskPass.overrideMaterial = (this.maskMaterial ??= new MeshBasicNodeMaterial({ color: 0xffffff }));
      maskPass.setResolutionScale(0.5);
      maskTex = maskPass.getTextureNode('output');
      passes.push('characterMask(layer 2, ½ res)');
    }

    let col = scenePass.getTextureNode('output');
    if (edges) {
      const nTex = scenePass.getTextureNode('normal'), dTex = scenePass.getTextureNode('depth'), src = col;
      col = Fn(() => {
        const p = uv();
        const lin = (q) => perspectiveDepthToViewZ(dTex.sample(q).r, cameraNear, cameraFar);
        const o = u.texel.mul(u.thickness);
        const z = lin(p);
        const n0 = nTex.sample(p).xyz.mul(2).sub(1);
        let m = maskTex.sample(p).r, dz = float(0), dn = float(0);
        for (const off of [vec2(o.x, 0), vec2(o.x.negate(), 0), vec2(0, o.y), vec2(0, o.y.negate())]) {
          const q = p.add(off), ns = nTex.sample(q);
          m = max(m, maskTex.sample(q).r);
          dz = dz.add(abs(lin(q).sub(z)));
          dn = dn.add(float(1).sub(dot(n0, ns.xyz.mul(2).sub(1))));
        }
        const az = abs(z);
        const e = max(smoothstep(az.mul(0.02), az.mul(0.07), dz), smoothstep(0.35, 0.85, dn)).mul(float(1).sub(m)).mul(u.edgeStrength);
        const c = src.sample(p);
        return vec4(mix(c.rgb, u.edgeColour, e), c.a);
      })();
      passes.push('edges(custom TSL)');
    }
    if (has('dof')) { col = dof(col, scenePass.getViewZNode(), u.focus, u.range, u.bokeh); passes.push('dof()'); }
    const merged = [];
    if (has('bloom')) {
      const b = selective ? bloom(scenePass.getTextureNode('emissive'), u.bloomStrength, u.bloomRadius, float(0)) : bloom(col, u.bloomStrength, u.bloomRadius, u.bloomThreshold);
      col = vec4(col.rgb.add(b.rgb), col.a); merged.push(selective ? 'bloom(emissive MRT)' : 'bloom(threshold)');
    }
    if (has('grade')) {
      const g = saturation(hue(col.rgb, u.hue), u.sat.add(1)).add(u.bright);
      col = vec4(g.sub(0.5).mul(u.contrast.add(1)).add(0.5), col.a); merged.push('grade');
    }
    const lutSpec = this.spec.find((e) => e.effect === 'lut'), lut = lutSpec && this.luts.get(lutSpec.file);
    if (lut) { col = lut3D(col, texture3D(lut.texture3D), lut.size, u.lutIntensity); merged.push('lut3D()'); }
    col = vec4(toneMapping(TONE[this.toneMapping] ?? NeutralToneMapping, u.exposure, col).rgb, col.a); merged.push('toneMapping()');
    if (has('vignette')) {
      // three's VignetteShader form: offset, darkness
      const d = length(uv().sub(0.5)).mul(u.vigDark.add(u.vigOffset));
      col = vec4(col.rgb.mul(smoothstep(0.8, u.vigOffset.mul(0.799), d)), col.a); merged.push('vignette');
    }
    if (has('grain')) {
      // pmndrs NoiseEffect (premultiply, SCREEN blend): rand(uv * (1 + time)), time = the frame's presentation time
      const q = uv().mul(u.time.add(1));
      const n = fract(sin(dot(q, vec2(12.9898, 78.233))).mul(43758.5453));
      const pre = col.rgb.mul(n);
      const scr = col.rgb.add(pre).sub(col.rgb.mul(pre));
      col = vec4(mix(col.rgb, scr, u.grain), col.a); merged.push('grain');
    }
    if (has('anime')) {
      const src = col;
      col = Fn(() => {
        const c = src.rgb.toVar();
        const p = uv().sub(u.centre).mul(vec2(u.aspect, 1));
        const r = length(p), ang = atan(p.y, p.x);
        const k1 = floor(ang.add(PI).div(TAU).mul(180));
        const line1 = step(0.82, h1(k1.add(u.seed))).mul(smoothstep(float(0.18).add(h1(k1.mul(1.7).add(u.seed)).mul(0.2)), 0.75, r));
        c.assign(mix(c, vec3(1), line1.mul(u.speed)));
        const k2 = floor(ang.add(PI).div(TAU).mul(260));
        const line2 = step(0.7, h1(k2.mul(3.1).add(u.seed))).mul(smoothstep(float(0.32).add(h1(k2.add(u.seed.mul(0.7))).mul(0.25)), 0.95, r));
        c.assign(mix(c, vec3(0.04, 0.03, 0.05), line2.mul(u.focusLines)));
        const lum = dot(c, vec3(0.299, 0.587, 0.114));
        c.assign(mix(c, vec3(step(lum, 0.35)), u.impact));
        return vec4(c, src.a);
      })();
      merged.push('anime(custom TSL)');
    }
    passes.push(`merged(${merged.join('+')})`);
    if (has('chromaticAberration')) {
      // pmndrs ChromaticAberrationEffect (radialModulation, modulationOffset 0.3): a texture of the chain so far, 3 taps
      const t = convertToTexture(col);
      col = Fn(() => {
        const p = uv();
        const ra = clamp(length(p.sub(0.5)).mul(2).sub(0.3).div(0.7), 0, 1);
        const off = u.ca.mul(ra);
        return vec4(t.sample(p.add(off)).r, t.sample(p).g, t.sample(p.sub(off)).b, t.sample(p).a);
      })();
      passes.push('chromaticAberration(custom TSL)');
    }
    const pipeline = new RenderPipeline(this.renderer, col);
    pipeline.outputColorTransform = true; // sRGB only: renderer.toneMapping is NoToneMapping while the stack runs
    this.pipeline = pipeline;
    this.passes = passes;
    this.apply();
  }

  apply() {
    const { u } = this;
    const size = this.renderer.getDrawingBufferSize?.(new Vector2()) ?? null;
    const w = size?.x || this.w || 1920, h = size?.y || this.h || 1080, k = h / 1080;
    u.texel.value.set(1 / w, 1 / h); u.aspect.value = w / h;
    for (const e of this.spec) {
      switch (e.effect) {
        case 'edges': u.thickness.value = Math.max(1, e.thickness * k); u.edgeColour.value.copy(new Color(e.colour)); u.edgeStrength.value = e.strength; break;
        case 'dof': { const d = e.auto && this.dofSource?.(); u.focus.value = d ? d.focusDistance : e.focusDistance; u.range.value = Math.max(0.05, Math.min(50, d ? d.focusRange : e.focusRange)); u.bokeh.value = Math.min(8, (d ? d.bokehPx / 24 : e.bokehScale) * k); break; }
        case 'bloom': u.bloomStrength.value = e.intensity; u.bloomThreshold.value = e.threshold; u.bloomRadius.value = e.radius; break;
        case 'grade': u.hue.value = e.hue; u.sat.value = e.saturation; u.bright.value = e.brightness; u.contrast.value = e.contrast; break;
        case 'lut': u.lutIntensity.value = e.intensity ?? 1; break;
        case 'vignette': u.vigOffset.value = e.offset; u.vigDark.value = e.darkness; break;
        case 'grain': u.grain.value = e.amount; break;
        case 'anime': u.speed.value = e.speedLines; u.focusLines.value = e.focusLines; u.impact.value = e.impact; u.seed.value = e.seed; u.centre.value.set(e.centre[0], e.centre[1]); break;
        case 'chromaticAberration': { const o = e.offset / 1080; u.ca.value.set(o / (w / h), o); break; }
        default: break;
      }
    }
    u.exposure.value = this.exposure;
  }

  setParams(values) {
    let changed = false;
    for (const [path, v] of Object.entries(values)) {
      const [name, key] = path.split('.');
      const e = this.spec.find((x) => x.effect === name);
      if (e && e[key] !== v) { e[key] = v; changed = true; }
    }
    if (changed) this.apply();
  }

  /** RenderHost passes the WebGL drawing buffer's size (undefined here); the stack reads the renderer's own. */
  setSize(w, h) { if (w && h) { this.w = w; this.h = h; } this.apply(); }

  render(scene, camera, time = this.time) {
    if (!this.pipeline || scene !== this.scene || camera !== this.camera) {
      this.disposePipeline();
      const k = `${this.key}|${scene.uuid}|${camera.uuid}`;
      const hit = this.cache.get(k);
      if (hit) { this.pipeline = hit.pipeline; this.passes = hit.passes; this.scene = scene; this.camera = camera; this.apply(); }
      else { this.build(scene, camera); this.cache.set(k, { pipeline: this.pipeline, passes: this.passes }); }
    }
    if (this.spec.find((e) => e.effect === 'dof')?.auto) this.apply();
    this.u.time.value = time;
    this.pipeline.render();
  }

  /**
   * Drop the current pipeline. Pipelines are cached by structure (which effects, the LUT, the scene and camera) and
   * reused when that structure comes back: in r187 the FIRST frame of every newly built dof() is one flat colour (DOF
   * sizes its targets from the scene pass's still-1×1 target; mrdoob/three.js#35620). A cached pipeline has already
   * drawn that frame. (Other fixes: scenePass.setSize(w, h) at build, or drop the first frame after a rebuild; an
   * offline export must do one of them before its first frame.) ?disposeOld=1 disposes and forgets, to show it.
   */
  disposePipeline() {
    if (this.disposeOld) { this.pipeline?.dispose(); this.cache.clear(); }
    this.pipeline = null;
  }

  dispose() { for (const { pipeline } of this.cache.values()) pipeline.dispose(); this.cache.clear(); this.pipeline = null; this.maskMaterial?.dispose(); }
}

export { luminance };
