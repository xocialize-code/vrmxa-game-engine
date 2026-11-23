// @vrmxg/particles/webgpu (AB-T-0590): three.quarks/webgpu's BatchedRenderer, with each particle's colour decoded when it
// is drawn, not when its shader is compiled. WebGPU pages only: it loads three/tsl (the render host imports it with
// three/webgpu; a WebGL page never does).
//
// Why. three.quarks' WebGPU materials ("webgl-compatible" colours, its default) treat a particle's colour as a display
// (sRGB) value, as its WebGL batch does: drawn straight to an sRGB output they decode it to linear, and drawn into a linear
// target (a post stack's scene pass) they don't. quarks makes that choice while compiling (decodeDisplayColor reads
// `builder.renderer.outputColorSpace`), but r187 keeps a compiled material under a key without the output colour space
// (RenderObject.initialCacheKey), and remembers customProgramCacheKey per material version. So the first draw to compile
// a batch decides its colour for every later draw on that renderer. An export draws frame 0 without its look (the look
// track applies from the first step), so every later frame drew the steam decoded inside the TSL scene pass; a scrub, or
// any history that first draws a frame with the look on, compiled it undecoded. Frames differed by up to 12 levels after
// tone mapping and bloom, depending on what the renderer drew before (the editor's Check Against Scrub, 24 of 26).
//
// The fix. Materials are built with quarks' "display" colours (no decode in the shader), and the colour is wrapped in a
// decode chosen per render by a uniform: 1 while the renderer's output colour space is sRGB, 0 while it is linear (r187's
// RenderPipeline renders its passes with outputColorSpace set to the linear working space). One shader serves both, so a
// frame draws the same whatever was drawn before it, and each context still gets quarks' intended colour.
import { BatchedRenderer as QuarksBatchedRenderer } from 'three.quarks/webgpu';
import { uniform, float, vec4, max, sRGBTransferEOTF } from 'three/tsl';
import { LinearSRGBColorSpace } from 'three';

/** 1 while the renderer drawing outputs sRGB (decode the display colour to linear), 0 into a linear target. */
export const displayDecode = uniform(1).onRenderUpdate(({ renderer }) => (renderer.outputColorSpace === LinearSRGBColorSpace ? 0 : 1));

/** Wrap a quarks particle material's colour in the draw-time decode (once; quarks' compositing mode stays display). */
export function decodeAtDraw(material, composited = false) {
  if (!material || composited || material.userData.vrmxgDecodeAtDraw) return material;
  if (!(material.isParticleSpriteNodeMaterial || material.isParticleTrailNodeMaterial) || !material.colorNode) return material;
  const c = material.colorNode.toVar('vrmxgParticleColour'), k = displayDecode;
  // k is exactly 0 or 1, so this is exactly one or the other (x·1 = x, x·0 = 0, x + 0 = x): no branch, one sample. The
  // decode's input is clamped at 0 so it is never NaN (NaN·0 would leak into the undecoded side)
  material.colorNode = vec4(c.rgb.mul(float(1).sub(k)).add(sRGBTransferEOTF(max(c.rgb, 0)).mul(k)), c.a);
  material.userData.vrmxgDecodeAtDraw = true;
  material.needsUpdate = true;
  return material;
}

/** Make a batch's materials (now, and each one rebuildMaterial makes later) decode at draw. */
function patchBatch(batch) {
  const composited = () => !!batch.compositingSource_?.compositing && !!batch.settings?.material?.transparent;
  if (typeof batch.rebuildMaterial === 'function' && !batch.vrmxgDecodeAtDraw) {
    const rebuild = batch.rebuildMaterial.bind(batch);
    batch.rebuildMaterial = () => { rebuild(); decodeAtDraw(batch.material, composited()); };
    batch.vrmxgDecodeAtDraw = true;
  }
  decodeAtDraw(batch.material, composited());
  return batch;
}

/** three.quarks/webgpu's BatchedRenderer with draw-time colours: what a WebGPU render host hands the particles service. */
export class BatchedRenderer extends QuarksBatchedRenderer {
  constructor(options = {}) { super({ ...options, colorSpaceMode: 'display' }); this.isDecodeAtDraw = true; }
  setProfile(options = {}) { super.setProfile({ ...options, colorSpaceMode: 'display' }); }
  createBatch(settings) { return patchBatch(super.createBatch(settings)); }
}
