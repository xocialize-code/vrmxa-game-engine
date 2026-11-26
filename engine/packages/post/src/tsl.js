// TSLPostStack (M4 W1, AB-T-0573): the post stack on WebGPURenderer, as a TSL RenderPipeline. The same spec, order and
// parameters as PostStack (pmndrs on WebGL) behind the same interface (configure, setParams, settle, setSize, render,
// passes, dofSource), so the render host drives either. Seeded by spike-webgpu-render/web/src/tsl-post.js (AB-T-0554);
// the formulas here are pmndrs postprocessing 6.39.6's, so the look stays within the WebGL tolerance (M4-PLAN: SSIM ≥ 0.98).
//
//   scene pass (MSAA, HalfFloat) ─┬─ normal pass (override material, full res) + character mask (layer 2, ½ res)
//                                 └► edges ► DOF ► merged: bloom ► hue/saturation ► brightness/contrast ► LUT ► tone
//                                    mapping ► vignette ► grain ► anime ► chromatic aberration ► (SMAA without MSAA) ► sRGB
//
// What three's node set gives for each effect and what is custom is MAPPING below (and the README).
// Two r187 gotchas shape the build (spike-webgpu-render/README.md "Gotchas"):
//   4. A newly built dof() draws one flat colour on its first frame: it sizes its targets from its input texture, which
//      is still 1×1 until the pass under it first runs (mrdoob/three.js#35620). So every pass and texture is sized to the
//      drawing buffer when the pipeline is built, and pipelines are cached per structure. (The DOF here is a port of
//      pmndrs' rather than three's dof(), for the look: its own targets are sized the same way.)
//   5. A material's `mrtNode` breaks every pass without an MRT (WGSL "struct OutputType {}"), so the character mask is a
//      ½-resolution layer pass with an override material (PassNode.setLayers + overrideMaterial), as PostStack does on WebGL.
//
// The effects' formulas and the DOF are ported from pmndrs postprocessing 6.39.6 into TSL: this is an altered
// version, not the original software. Its licence (zlib), which must be kept with this port:
//
//   Copyright © 2015 Raoul van Rüschen
//
//   This software is provided 'as-is', without any express or implied warranty. In
//   no event will the authors be held liable for any damages arising from the use of
//   this software.
//
//   Permission is granted to anyone to use this software for any purpose, including
//   commercial applications, and to alter it and redistribute it freely, subject to
//   the following restrictions:
//
//   1. The origin of this software must not be misrepresented; you must not claim
//      that you wrote the original software. If you use this software in a product,
//      an acknowledgment in the product documentation would be appreciated but is
//      not required.
//
//   2. Altered source versions must be plainly marked as such, and must not be
//      misrepresented as being the original software.
//
//   3. This notice may not be removed or altered from any source distribution.
import {
  RenderPipeline, PassNode, Layers, MeshBasicNodeMaterial, Vector2, Vector3, Color, HalfFloatType, FloatType,
  NoToneMapping, NeutralToneMapping, AgXToneMapping, ACESFilmicToneMapping, LinearToneMapping, Data3DTexture, RGBAFormat,
  LinearFilter, ClampToEdgeWrapping, DataUtils, WebGPUCoordinateSystem,
} from 'three/webgpu';
import {
  pass, uniform, vec2, vec3, vec4, float, Fn, uv, texture3D, perspectiveDepthToViewZ, smoothstep, mix, max, min, abs, dot,
  length, atan, floor, fract, sin, step, sqrt, toneMapping, rtt, sRGBTransferOETF, sRGBTransferEOTF, packNormalToRGB,
  normalView, select, uniformArray, Loop,
} from 'three/tsl';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js';
import { normalizePost, structureOf, CHARACTER_LAYER } from './spec.js';

const TONE = { neutral: NeutralToneMapping, agx: AgXToneMapping, aces: ACESFilmicToneMapping, none: LinearToneMapping };
const PI = 3.141592653589793, TAU = 6.28318;
/** pmndrs' bloom: an 8-level mipmap blur (MipmapBlurPass). */
export const BLOOM_LEVELS = 8;

/** Each effect → what it is under TSL in r187 (the README's table). */
export const MAPPING = {
  edges: { tsl: 'custom', with: 'depth from the scene pass, normals from a full-res pass with an override material (pmndrs NormalPass), the character mask from a ½-res pass of layer 2 (PassNode.setLayers + overrideMaterial)', note: 'three has sobel() (luminance) and outline() (a selection outline); neither is depth + normal set edges with a mask. Not material.mrtNode: r187 #35373 (gotcha 5)' },
  dof: { tsl: 'custom', with: 'pmndrs\' DepthOfFieldEffect: CoC from the distance to the camera, the near CoC Kawase-blurred at ½ res, the far field masked by its CoC, 64-tap average + 16-tap max per field (Vogel kernel), composited by CoC × bokeh scale', note: 'three\'s dof() is a port of the same bokeh but blurs the far field unmasked (in-focus edges bleed into the blur) and blends by min(CoC, ½) × 2; its first frame is flat when built (gotcha 4, #35620)' },
  bloom: { tsl: 'custom', with: 'pmndrs\' luminance threshold and its 8-level mipmap blur (13-tap downsample, 9-tap tent upsample, radius), SCREEN-blended', note: 'three\'s bloom() is a different blur (UnrealBloom\'s); the port keeps the WebGL look' },
  grade: { tsl: 'custom', note: 'pmndrs HueSaturationEffect (hue matrix, saturation on the average, min 1) and BrightnessContrastEffect (in sRGB, as pmndrs converts for it); three\'s hue()/saturation() use other formulas' },
  lut: { tsl: 'lut3D()', with: 'three/addons LUTCubeLoader → a HalfFloat 3D texture; looked up in sRGB as pmndrs\' LUT3DEffect does', note: 'same .cube files; intensity mixes in sRGB, as PostStack now does (NORMAL blend below 1)' },
  toneMapping: { tsl: 'toneMapping()', note: 'mid-chain as in pmndrs; the pipeline\'s own output transform does only sRGB (renderer.toneMapping = NoToneMapping)' },
  vignette: { tsl: 'custom', note: 'no vignette node in r187; pmndrs\' default technique' },
  grain: { tsl: 'custom', note: 'film() takes the renderer\'s global time; this is pmndrs\' NoiseEffect (three\'s rand, premultiplied, SCREEN) on the frame\'s presentation time' },
  anime: { tsl: 'custom', note: 'speed lines, focus lines, impact frame: a port of AnimeEffect' },
  chromaticAberration: { tsl: 'custom', note: 'three\'s chromaticAberration() is a stepped radial scale with no px unit; this is pmndrs\' (radial modulation, offset 0.3) in px at 1080p' },
  smaa: { tsl: 'smaa()', note: 'only without MSAA, as on WebGL' },
};

/**
 * A pass that draws without the scene's background, environment and fog, over a clear colour of its own: the character
 * mask (white characters on black) and the normals (pmndrs' NormalPass ignores the background and clears to 0x7777ff).
 */
const PassNodeBase = /** @type {any} */ (PassNode); // three's types for PassNode's members are incomplete in r187
class ClearPassNode extends PassNodeBase {
  constructor(scene, camera, options, clear) { super(PassNode.COLOR, scene, camera, options); this.clear = new Color(clear); }
  updateBefore(frame) {
    const s = this.scene, r = frame.renderer, bg = s.background, env = s.environment, fog = s.fog;
    const cc = r.getClearColor(new Color()), ca = r.getClearAlpha();
    s.background = null; s.environment = null; s.fog = null; r.setClearColor(this.clear, 1);
    try { super.updateBefore(frame); } finally { s.background = bg; s.environment = env; s.fog = fog; r.setClearColor(cc, ca); }
  }
}

const clamp01 = (x) => min(max(x, 0), 1);
/** pmndrs' (and three's) bokeh kernels: 80 points of Vogel's spiral, every fifth for the 16-tap fill pass. */
const VOGEL = (() => {
  const p64 = [], p16 = [], s80 = Math.sqrt(80);
  for (let i = 0; i < 80; i++) { const th = i * 2.39996323, r = Math.sqrt(i) / s80, v = new Vector2(r * Math.cos(th), r * Math.sin(th)); (i % 5 === 0 ? p16 : p64).push(v); }
  return { p64, p16 };
})();
/** GLSL h1 of AnimeEffect: fract(sin(n * 12.9898) * 43758.5453). */
const h1 = (n) => fract(sin(n.mul(12.9898)).mul(43758.5453));
/** pmndrs' SCREEN blend: dst + src − min(dst·src, 1). */
const screen = (dst, src) => dst.add(src).sub(min(dst.mul(src), 1));

/** A .cube's text (or three's LUTCubeLoader result) → { size, texture3D } with a HalfFloat texture (float32 isn't filterable everywhere in WebGPU). */
export function lutFromCubeTSL(cube) {
  const lut = typeof cube === 'string' ? new LUTCubeLoader().setType(FloatType).parse(cube) : cube;
  const src = lut.texture3D;
  if (src.type === HalfFloatType) return lut;
  const f = src.image.data, half = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) half[i] = DataUtils.toHalfFloat(src.type === FloatType ? f[i] : f[i] / 255);
  const t = new Data3DTexture(half, lut.size, lut.size, lut.size);
  t.type = HalfFloatType; t.format = RGBAFormat; t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = ClampToEdgeWrapping; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
  return { ...lut, texture3D: t };
}

export class TSLPostStack {
  /**
   * @param {any} renderer a WebGPURenderer (initialised)
   * @param {{ multisampling?: number, loadLut?: (file: string) => Promise<string | { size: number, texture3D: any }>, cacheSize?: number }} [o]
   *   loadLut: a .cube's text (or a parsed LUT) for a file the spec names. cacheSize: how many structures keep their
   *   pipeline (2: the look and the one before it; the least recently drawn is disposed beyond that)
   */
  constructor(renderer, { multisampling = 4, loadLut, cacheSize = 2 } = {}) {
    this.renderer = renderer;
    this.multisampling = multisampling;
    this.loadLut = loadLut ?? null;
    /** file → the load in flight */ this.loading = new Map();
    /** file → { size, texture3D } (null: the load failed) */ this.luts = new Map();
    /**
     * structure key → the built pipeline and its own targets, least recently drawn first (gotcha 4: a structure that comes
     * back within `cacheSize` reuses its pipeline; one that was evicted is rebuilt, sized at build, so it draws right too)
     */
    this.cache = new Map();
    this.cacheSize = Math.max(1, cacheSize);
    /** The passes every structure shares (one MSAA scene pass; the normal and mask passes once a structure has edges). */
    this.shared = { scenePass: null, normalPass: null, maskPass: null };
    this.built = null;
    this.spec = []; this.key = '';
    this.scene = null; this.camera = null;
    this.size = new Vector2(0, 0);
    this.time = 0;
    this.toneMapping = 'neutral'; this.exposure = 1;
    /** Where the current camera's depth of field comes from: () => { focusDistance, focusRange, bokehPx } | null */
    this.dofSource = null;
    this.passes = [];
    /** @type {any} */ this.maskMaterial = null;
    /** @type {any} */ this.normalMaterial = null;
    // uniforms: made once, shared by every cached pipeline, values pushed by apply()
    this.u = {
      texel: uniform(new Vector2(1 / 1920, 1 / 1080)), thickness: uniform(1), edgeColour: uniform(new Color(0.05, 0.03, 0.04)), edgeStrength: uniform(1),
      near: uniform(0.1), far: uniform(100), p00: uniform(1), p11: uniform(1),
      focus: uniform(3), range: uniform(2), bokeh: uniform(2), dofTexel: uniform(new Vector2(1 / 1920, 1 / 1080)),
      bloomIntensity: uniform(1), bloomThreshold: uniform(0.9), bloomSmoothing: uniform(0.03), bloomRadius: uniform(0.6),
      hue: uniform(new Vector3(1, 0, 0)), satK: uniform(0), bright: uniform(0), contrastK: uniform(1), lutIntensity: uniform(1),
      exposure: uniform(1), vigOffset: uniform(0.3), vigDark: uniform(0.55), grain: uniform(0.25), time: uniform(0),
      speed: uniform(0), focusLines: uniform(0), impact: uniform(0), seed: uniform(3), centre: uniform(new Vector2(0.5, 0.5)), aspect: uniform(16 / 9),
      caShift: uniform(new Vector2(0, 0)),
      bloomTexel: Array.from({ length: 2 * BLOOM_LEVELS - 1 }, () => uniform(new Vector2(1, 1))),
    };
  }

  get active() { return this.spec.length > 0; }
  /** The pipeline drawing now (null before the first render after a change of structure). */
  get pipeline() { return this.built?.pipeline ?? null; }

  /** Set the spec (an Environment's `post`) and its tone mapping. A change of structure picks another pipeline; values only update uniforms. */
  configure(post, { toneMapping = 'neutral', exposure = 1 } = {}) {
    const spec = normalizePost(post);
    this.toneMapping = toneMapping; this.exposure = exposure;
    this.spec = spec;
    this.rekey();
    if (spec.length) this.renderer.toneMapping = NoToneMapping; // the stack tone-maps mid-chain; the output transform does sRGB only
    for (const e of spec) {
      if (e.effect !== 'lut' || !e.file || this.luts.has(e.file) || this.loading.has(e.file) || !this.loadLut) continue;
      const file = e.file;
      this.loading.set(file, this.loadLut(file).then((cube) => {
        this.luts.set(file, lutFromCubeTSL(cube));
        const before = this.key;
        this.rekey();
        if (before !== this.key && before.includes('|lut:false|')) this.evict(before); // the look without its LUT won't come back
      })
        .catch((err) => { this.luts.set(file, null); console.warn(`[post] LUT ${file}: ${err?.message ?? err}`); })
        .finally(() => this.loading.delete(file)));
    }
    this.apply();
  }

  /** The structure key: which effects (and LUT file), whether that LUT has arrived, the tone mapping and the sampling. */
  rekey() {
    const lut = this.spec.find((e) => e.effect === 'lut');
    const key = `${structureOf(this.spec)}|lut:${lut ? !!this.luts.get(lut.file) : '-'}|tone:${this.toneMapping}|msaa:${this.multisampling}`;
    if (key !== this.key) { this.key = key; this.built = null; }
  }

  /** Wait for what the spec still loads (LUTs), so an offline frame never draws before its grade (M2 W12). */
  async settle() { while (this.loading.size) await Promise.all([...this.loading.values()]); }

  /** The drawing buffer's size, as PassNode sizes itself. */
  bufferSize() {
    const v = this.renderer.getDrawingBufferSize?.(new Vector2());
    return v && v.x && v.y ? v : (this.size.x ? this.size.clone() : new Vector2(1920, 1080));
  }

  /** Build the pipeline for the current structure (lazily, on the first render after a change). */
  build(scene, camera) {
    const { u } = this, has = (n) => this.spec.some((e) => e.effect === n);
    // pmndrs' patterns (speed lines, the aberration's direction, grain's noise) are in GL's uv, y up; WebGPU's is y down
    const flip = this.renderer.coordinateSystem === WebGPUCoordinateSystem;
    const glUV = () => (flip ? vec2(uv().x, float(1).sub(uv().y)) : uv());
    const passes = [], nodes = { scenePass: null, normalPass: null, maskPass: null, auto: [], bloom: [], dof: null };
    const sh = this.shared;
    const scenePass = (nodes.scenePass = sh.scenePass ??= pass(scene, camera, { samples: this.multisampling }));
    passes.push(`scene(MSAA${this.multisampling})`);
    /** A texture of a node (an RTT at the drawing buffer's size), sized now so nothing downstream sees 1×1 (gotcha 4). */
    const tex = (n) => { if (n.isTextureNode) return n; const t = rtt(n, null, null, { type: HalfFloatType, depthBuffer: false }); nodes.auto.push(t); return t; };

    let col = scenePass.getTextureNode('output');
    if (has('edges')) {
      if (!sh.normalPass) {
        const normalPass = (sh.normalPass = new ClearPassNode(scene, camera, { samples: 0 }, 0x7777ff));
        const nm = (this.normalMaterial ??= new MeshBasicNodeMaterial());
        nm.colorNode = vec4(packNormalToRGB(normalView), 1); nm.fog = false; // raw packed normals, as pmndrs' NormalPass (MeshNormalMaterial) stores them
        normalPass.overrideMaterial = nm;
        const maskPass = (sh.maskPass = new ClearPassNode(scene, camera, { samples: 0 }, 0x000000));
        const layers = new Layers(); layers.set(CHARACTER_LAYER);
        maskPass.setLayers(layers);
        const mm = (this.maskMaterial ??= new MeshBasicNodeMaterial({ color: 0xffffff })); mm.fog = false;
        maskPass.overrideMaterial = mm;
        maskPass.setResolutionScale(0.5);
      }
      const normalPass = (nodes.normalPass = sh.normalPass), maskPass = (nodes.maskPass = sh.maskPass);
      passes.push('normals(override, full res)', `characterMask(layer ${CHARACTER_LAYER}, ½ res)`);
      const nTex = normalPass.getTextureNode('output'), mTex = maskPass.getTextureNode('output'), dTex = scenePass.getTextureNode('depth'), src = col;
      col = Fn(() => {
        const p = uv(), o = u.texel.mul(u.thickness);
        const lin = (q) => perspectiveDepthToViewZ(dTex.sample(q).r, u.near, u.far);
        const nrm = (q) => nTex.sample(q).xyz.mul(2).sub(1);
        const z = lin(p), n0 = nrm(p);
        let m = mTex.sample(p).r, dz = float(0), dn = float(0);
        for (const off of [vec2(o.x, 0), vec2(o.x.negate(), 0), vec2(0, o.y), vec2(0, o.y.negate())]) {
          const q = p.add(off);
          m = max(m, mTex.sample(q).r);
          dz = dz.add(abs(lin(q).sub(z)));
          dn = dn.add(float(1).sub(dot(n0, nrm(q))));
        }
        const az = abs(z);
        const e = max(smoothstep(az.mul(0.02), az.mul(0.07), dz), smoothstep(0.35, 0.85, dn)).mul(float(1).sub(m)).mul(u.edgeStrength);
        const c = src.sample(p);
        return vec4(mix(c.rgb, u.edgeColour, e), c.a);
      })();
      passes.push('edges(custom TSL)');
    }
    if (has('dof')) { col = this.buildDof(tex(col), scenePass, nodes); passes.push('dof(pmndrs port)'); }

    // one merged chain, effect by effect as pmndrs' EffectPass merges them: each in its own colour space (linear unless
    // pmndrs says sRGB: brightness/contrast and the LUT), converted where it changes
    const merged = [];
    const input = tex(col);
    let c = input.sample(uv()), srgb = false;
    const toSRGB = () => { if (!srgb) { c = vec4(sRGBTransferOETF(c.rgb), c.a); srgb = true; } };
    const toLinear = () => { if (srgb) { c = vec4(sRGBTransferEOTF(c.rgb), c.a); srgb = false; } };
    if (has('bloom')) {
      const b = this.buildBloom(input, nodes).sample(uv()).mul(u.bloomIntensity);
      c = vec4(screen(c.rgb, b.rgb), max(c.a, b.a));
      merged.push(`bloom(mipmap ${BLOOM_LEVELS})`);
    }
    if (has('grade')) {
      const hv = u.hue;
      let g = vec3(dot(c.rgb, hv.xyz), dot(c.rgb, hv.zxy), dot(c.rgb, hv.yzx));
      const avg = g.r.add(g.g).add(g.b).div(3);
      g = min(g.add(vec3(avg).sub(g).mul(u.satK)), 1);
      c = vec4(g, c.a);
      toSRGB();
      c = vec4(c.rgb.add(u.bright.sub(0.5)).mul(u.contrastK).add(0.5), c.a);
      merged.push('hueSaturation', 'brightnessContrast(sRGB)');
    }
    const lutSpec = this.spec.find((e) => e.effect === 'lut'), lut = lutSpec && this.luts.get(lutSpec.file);
    if (lut) { toSRGB(); c = lut3D(c, texture3D(lut.texture3D), lut.size, u.lutIntensity); merged.push('lut3D(sRGB)'); }
    toLinear();
    c = toneMapping(TONE[this.toneMapping] ?? NeutralToneMapping, u.exposure, c); merged.push('toneMapping()'); // a vec4 in, a vec4 out (r187 always returns vec4: gotcha 7)
    if (has('vignette')) {
      const d = length(uv().sub(0.5)).mul(u.vigDark.add(u.vigOffset));
      c = vec4(c.rgb.mul(smoothstep(0.8, u.vigOffset.mul(0.799), d)), c.a); merged.push('vignette');
    }
    if (has('grain')) {
      // three's rand(uv * (1 + time)), as pmndrs' NoiseEffect: dot, mod π, sin
      const q = glUV().mul(u.time.add(1));
      const dt = dot(q, vec2(12.9898, 78.233)), n = fract(sin(dt.sub(floor(dt.div(PI)).mul(PI))).mul(43758.5453)); // GLSL's mod, spelled out (WGSL's % truncates)
      const pre = min(c.rgb.mul(n), 1);
      c = vec4(mix(c.rgb, screen(c.rgb, pre), u.grain), c.a); merged.push('grain');
    }
    if (has('anime')) {
      const src = c;
      c = Fn(() => {
        const k = src.rgb.toVar();
        const p = glUV().sub(u.centre).mul(vec2(u.aspect, 1));
        const r = length(p), ang = atan(p.y, p.x);
        const k1 = floor(ang.add(PI).div(TAU).mul(180));
        const line1 = step(0.82, h1(k1.add(u.seed))).mul(smoothstep(float(0.18).add(h1(k1.mul(1.7).add(u.seed)).mul(0.2)), 0.75, r));
        k.assign(mix(k, vec3(1), line1.mul(u.speed)));
        const k2 = floor(ang.add(PI).div(TAU).mul(260));
        const line2 = step(0.7, h1(k2.mul(3.1).add(u.seed))).mul(smoothstep(float(0.32).add(h1(k2.add(u.seed.mul(0.7))).mul(0.25)), 0.95, r));
        k.assign(mix(k, vec3(0.04, 0.03, 0.05), line2.mul(u.focusLines)));
        const lum = dot(k, vec3(0.299, 0.587, 0.114));
        k.assign(mix(k, vec3(step(lum, 0.35)), u.impact));
        return vec4(k, src.a);
      })();
      merged.push('anime(custom TSL)');
    }
    passes.push(`merged(${merged.join('+')})`);
    let out = c;
    if (has('chromaticAberration')) {
      const t = tex(out);
      out = Fn(() => {
        const p = uv(), base = t.sample(p), shift = flip ? u.caShift.mul(vec2(1, -1)) : u.caShift;
        const d = max(length(p.sub(0.5)).mul(2).sub(0.3), 0);
        const on = d.greaterThan(0);
        const ra = select(on, t.sample(mix(p, p.add(shift), d)).ra, base.ra);
        const ba = select(on, t.sample(mix(p, p.sub(shift), d)).ba, base.ba);
        return vec4(ra.x, base.g, ba.x, max(max(ra.y, ba.y), base.a));
      })();
      passes.push('chromaticAberration(custom TSL)');
    }
    if (has('smaa') && !this.multisampling) { out = smaa(tex(out)); passes.push('smaa()'); }
    const pipeline = new RenderPipeline(this.renderer, out);
    pipeline.outputColorTransform = true; // sRGB only: renderer.toneMapping is NoToneMapping while the stack runs
    const built = { pipeline, passes, nodes, key: this.key, size: new Vector2() };
    this.sizeNodes(built, this.bufferSize());
    return built;
  }

  /**
   * pmndrs' DepthOfFieldEffect (resolutionScale ½), node for node: the CoC (near in r, far in g: smoothstep(0, range,
   * |distance − focus|)), the near CoC Kawase-blurred (MEDIUM: kernels 0, 1, 1, 2) at ½ res, the input masked by the far
   * CoC × scale, then per field a 64-tap average (½ res) and a 16-tap max (far: full res, near: ½ res) on the Vogel kernel,
   * steps in full-res texels × CoC × scale; composited as input · (1 − cocFar) + far, mixed with near by cocNear.
   * Fixed-size RTTs, sized by sizeNodes. Returns the composite (a node; the caller makes a texture of it).
   */
  buildDof(input, scenePass, nodes) {
    const { u } = this, scale = u.bokeh;
    const full = [], half = [];
    const make = (n, list) => { const t = rtt(n, 1, 1, { type: HalfFloatType, depthBuffer: false }); list.push(t); return t; };
    const vz = scenePass.getViewZNode();
    const coc = make(Fn(() => {
      // the distance to the camera, as pmndrs' CoC measures it (not view Z)
      const ndc = uv().mul(2).sub(1), x = ndc.x.div(u.p00), y = ndc.y.div(u.p11);
      const dist = vz.negate().mul(sqrt(x.mul(x).add(y.mul(y)).add(1)));
      const signed = dist.sub(u.focus), mag = smoothstep(0, u.range, abs(signed));
      return vec4(mag.mul(step(signed, 0)), mag.mul(step(0, signed)), 0, 1);
    })(), full);
    let blurred = coc;
    for (const k of [0, 1, 1, 2]) {
      const src = blurred;
      blurred = make(Fn(() => {
        const p = uv(), d = u.dofTexel.mul(k).add(u.dofTexel.mul(0.5));
        return src.sample(vec2(p.x.sub(d.x), p.y.add(d.y))).add(src.sample(vec2(p.x.add(d.x), p.y.add(d.y)))).add(src.sample(vec2(p.x.add(d.x), p.y.sub(d.y)))).add(src.sample(vec2(p.x.sub(d.x), p.y.sub(d.y)))).mul(0.25);
      })(), half);
    }
    const masked = make(Fn(() => { const t = input.sample(uv()); return vec4(t.rgb.mul(clamp01(coc.sample(uv()).g.mul(scale))), t.a); })(), full);
    const k64 = uniformArray(VOGEL.p64, 'vec2'), k16 = uniformArray(VOGEL.p16, 'vec2');
    /** pmndrs' BokehMaterial: the base pass (64-tap average) or the fill pass (16-tap max); `foreground` reads near and far. */
    const bokeh = (src, cocTex, fill, foreground) => Fn(() => {
      const p = uv(), cn = cocTex.sample(p);
      const c = foreground ? cn.r.mul(scale) : cn.g.mul(scale);
      const st = u.dofTexel.mul(foreground ? max(cn.r, cn.g).mul(scale) : c);
      const base = src.sample(p);
      const acc = (fill ? base : vec4(0)).toVar();
      Loop(fill ? 16 : 64, ({ i }) => {
        const tap = src.sample(p.add(st.mul((fill ? k16 : k64).element(i))));
        if (fill) acc.assign(max(tap, acc)); else acc.addAssign(tap);
      });
      return select(c.equal(0), base, fill ? acc : acc.div(64));
    })();
    const farBase = make(bokeh(masked, coc, false, false), half);
    const farFill = make(bokeh(farBase, coc, true, false), full);
    const nearBase = make(bokeh(input, blurred, false, true), half);
    const nearFill = make(bokeh(nearBase, blurred, true, true), half);
    nodes.dof = { full, half, coc, blurred, farFill, nearFill };
    return Fn(() => {
      const p = uv(), inC = input.sample(p), far = farFill.sample(p), near = nearFill.sample(p);
      const cn = min(blurred.sample(p).r.mul(scale), 1), cf = min(coc.sample(p).g.mul(scale), 1);
      const res = inC.mul(float(1).sub(cf)).add(vec4(far.rgb, far.a.mul(cf)));
      return mix(res, near, cn);
    })();
  }

  /**
   * pmndrs' mipmap bloom: luminance over the threshold (full res), BLOOM_LEVELS downsamples (13 taps, halving with
   * Math.round), upsamples back to ½ res (9-tap tent mixed with the level below by radius). Fixed-size RTTs, sized by sizeNodes.
   */
  buildBloom(input, nodes) {
    const { u } = this;
    const make = (n) => { const t = rtt(n, 1, 1, { type: HalfFloatType, depthBuffer: false }); nodes.bloom.push(t); return t; };
    const lum = make(Fn(() => {
      const t = input.sample(uv()), l = dot(t.rgb, vec3(0.2126, 0.7152, 0.0722));
      return t.mul(smoothstep(u.bloomThreshold, u.bloomThreshold.add(u.bloomSmoothing), l));
    })());
    const inside = (q) => step(0, q.x).mul(step(q.x, 1)).mul(step(0, q.y)).mul(step(q.y, 1));
    const down = (src, texel) => Fn(() => {
      const p = uv(); let acc = vec4(0);
      for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const q = p.add(texel.mul(vec2(x, y))); acc = acc.add(src.sample(q).mul(inside(q).mul(0.125))); }
      for (const [x, y] of [[-2, 2], [0, 2], [2, 2], [-2, 0], [2, 0], [-2, -2], [0, -2], [2, -2]]) { const q = p.add(texel.mul(vec2(x, y))); acc = acc.add(src.sample(q).mul(inside(q).mul(0.05556))); }
      return acc.add(src.sample(p).mul(0.05556));
    })();
    const up = (src, support, texel) => Fn(() => {
      const p = uv(); let acc = src.sample(p).mul(0.25);
      for (const [x, y, w] of [[-1, 1, 0.0625], [0, 1, 0.125], [1, 1, 0.0625], [-1, 0, 0.125], [1, 0, 0.125], [-1, -1, 0.0625], [0, -1, 0.125], [1, -1, 0.0625]]) acc = acc.add(src.sample(p.add(texel.mul(vec2(x, y)))).mul(w));
      return mix(support.sample(p), acc, u.bloomRadius);
    })();
    const downs = [];
    let prev = lum;
    for (let i = 0; i < BLOOM_LEVELS; i++) { prev = make(down(prev, u.bloomTexel[i])); downs.push(prev); }
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) prev = make(up(prev, downs[i], u.bloomTexel[BLOOM_LEVELS + (BLOOM_LEVELS - 2 - i)]));
    nodes.bloomDowns = downs.length;
    return prev;
  }

  /** Size every pass and texture of a pipeline to the drawing buffer (gotcha 4), and the bloom chain as pmndrs sizes it. */
  sizeNodes(built, size) {
    const w = size.x, h = size.y, { nodes } = built;
    built.size.set(w, h);
    for (const p of [nodes.scenePass, nodes.normalPass, nodes.maskPass]) p?.setSize(w, h);
    for (const t of nodes.auto) t.setSize(w, h);
    if (nodes.dof) {
      const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2)); // pmndrs' Resolution at scale ½
      for (const t of nodes.dof.full) { t.width = w; t.height = h; t.setSize(w, h); }
      for (const t of nodes.dof.half) { t.width = hw; t.height = hh; t.setSize(hw, hh); }
      this.u.dofTexel.value.set(1 / w, 1 / h);
    }
    if (nodes.bloom.length) {
      const [lum, ...chain] = nodes.bloom, L = BLOOM_LEVELS;
      lum.setSize(w, h);
      const sizes = []; let sw = w, sh = h;
      for (let i = 0; i < L; i++) { sw = Math.round(sw * 0.5); sh = Math.round(sh * 0.5); sizes.push([sw, sh]); }
      // downsample i reads the level above it (the luminance for i = 0); upsample into level i reads level i + 1
      for (let i = 0; i < L; i++) { chain[i].width = sizes[i][0]; chain[i].height = sizes[i][1]; chain[i].setSize(...sizes[i]); const s = i ? sizes[i - 1] : [w, h]; this.u.bloomTexel[i].value.set(1 / s[0], 1 / s[1]); }
      for (let j = 0, i = L - 2; i >= 0; j++, i--) { const t = chain[L + j]; t.width = sizes[i][0]; t.height = sizes[i][1]; t.setSize(...sizes[i]); this.u.bloomTexel[L + j].value.set(1 / sizes[i + 1][0], 1 / sizes[i + 1][1]); }
    }
  }

  /** Push the spec's values into the uniforms (lengths in px at 1080p, scaled by the output's height). */
  apply() {
    const { u } = this;
    const { x: w, y: h } = this.size.x ? this.size : this.bufferSize(), k = h / 1080, aspect = w / h;
    u.texel.value.set(1 / w, 1 / h); u.aspect.value = aspect;
    for (const e of this.spec) {
      switch (e.effect) {
        case 'edges': u.thickness.value = Math.max(1, e.thickness * k); u.edgeColour.value.copy(new Color(e.colour)); u.edgeStrength.value = e.strength; break;
        case 'dof': { const d = e.auto && this.dofSource?.(); u.focus.value = d ? d.focusDistance : e.focusDistance; u.range.value = Math.max(0.05, Math.min(50, d ? d.focusRange : e.focusRange)); u.bokeh.value = Math.min(8, (d ? d.bokehPx / 24 : e.bokehScale) * k); break; }
        case 'bloom': u.bloomIntensity.value = e.intensity; u.bloomThreshold.value = e.threshold; u.bloomSmoothing.value = e.smoothing; u.bloomRadius.value = e.radius; break;
        case 'grade': {
          const s = Math.sin(e.hue), co = Math.cos(e.hue), r3 = Math.sqrt(3);
          u.hue.value.set((2 * co + 1) / 3, (-r3 * s - co + 1) / 3, (r3 * s - co + 1) / 3);
          u.satK.value = e.saturation > 0 ? 1 - 1 / (1.001 - e.saturation) : -e.saturation;
          u.bright.value = e.brightness; u.contrastK.value = e.contrast > 0 ? 1 / (1 - e.contrast) : 1 + e.contrast;
          break;
        }
        case 'lut': u.lutIntensity.value = Math.min(1, Math.max(0, e.intensity ?? 1)); break; // mixed in sRGB, as PostStack's NORMAL blend
        case 'vignette': u.vigOffset.value = e.offset; u.vigDark.value = e.darkness; break;
        case 'grain': u.grain.value = e.amount; break;
        case 'anime': u.speed.value = e.speedLines; u.focusLines.value = e.focusLines; u.impact.value = e.impact; u.seed.value = e.seed; u.centre.value.set(e.centre[0], e.centre[1]); break;
        // pmndrs: offset (o / aspect, o), shifted by offset × (1, aspect) in uv
        case 'chromaticAberration': { const o = e.offset / 1080; u.caShift.value.set(o / aspect, o * aspect); break; }
        default: break;
      }
    }
    u.exposure.value = this.exposure;
  }

  /** Set values by path ("anime.speedLines", "bloom.intensity") for this frame: what a post track keys. No rebuild. */
  setParams(values) {
    let changed = false;
    for (const [path, v] of Object.entries(values)) {
      const [name, key] = path.split('.');
      const e = this.spec.find((x) => x.effect === name);
      if (e && e[key] !== v) { e[key] = v; changed = true; }
    }
    if (changed) this.apply();
  }

  /** The drawing buffer's size (RenderHost passes it on resize): every pass is resized and the lengths rescaled. */
  setSize(w, h) {
    if (w && h) this.size.set(w, h);
    if (this.built && (this.built.size.x !== this.size.x || this.built.size.y !== this.size.y)) this.sizeNodes(this.built, this.size);
    this.apply();
  }

  /** Draw a frame through the stack; `time` (s) is the frame's presentation time (grain), so every export of a frame is the same. */
  render(scene, camera, time = this.time) {
    const buf = this.bufferSize();
    if (buf.x !== this.size.x || buf.y !== this.size.y) { this.size.copy(buf); this.apply(); }
    if (!this.built) {
      const hit = this.cache.get(this.key);
      this.built = hit ?? this.build(scene, camera);
      this.cache.delete(this.key); this.cache.set(this.key, this.built); // most recently drawn last
      for (const k of [...this.cache.keys()]) if (this.cache.size > this.cacheSize && k !== this.key) this.evict(k);
    }
    const b = this.built;
    // another scene or camera (a cut, a new load): the shared passes retarget, nothing is rebuilt
    for (const p of Object.values(this.shared)) if (p && (p.scene !== scene || p.camera !== camera)) { p.scene = scene; p.camera = camera; }
    if (b.size.x !== this.size.x || b.size.y !== this.size.y) this.sizeNodes(b, this.size);
    this.scene = scene; this.camera = camera; this.passes = b.passes;
    const pe = camera.projectionMatrix.elements;
    this.u.near.value = camera.near; this.u.far.value = camera.far; this.u.p00.value = pe[0]; this.u.p11.value = pe[5];
    if (this.spec.find((e) => e.effect === 'dof')?.auto) this.apply();
    this.u.time.value = time;
    b.pipeline.render();
  }

  /** The render targets a built pipeline owns (the shared passes aren't its own). */
  static ownTargets(b) { return [...b.nodes.auto, ...b.nodes.bloom, ...(b.nodes.dof ? [...b.nodes.dof.full, ...b.nodes.dof.half] : [])]; }

  /** Drop a structure's pipeline and free what it owns. */
  evict(key) {
    const b = this.cache.get(key);
    if (!b) return;
    this.cache.delete(key);
    if (this.built === b) this.built = null;
    b.pipeline.dispose();
    for (const t of TSLPostStack.ownTargets(b)) t.dispose();
  }

  dispose() {
    for (const k of [...this.cache.keys()]) this.evict(k);
    for (const [k, p] of Object.entries(this.shared)) { p?.dispose(); this.shared[k] = null; }
    this.built = null;
    this.maskMaterial?.dispose(); this.normalMaterial?.dispose();
    for (const l of this.luts.values()) l?.texture3D?.dispose?.();
  }
}
