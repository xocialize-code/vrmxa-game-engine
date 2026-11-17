// VRMXG cinematics spike: does an anime post stack run on three r187 + three-vrm 3.5.5 MToon?
// Query params:
//   pipe = none | three | pmndrs | builtin   (which post path)
//   edges = 0 | 1      screen-space depth/normal outline on top (pmndrs only)
//   mtoonOutline = 0 | 1 | <width>   keep, remove, or widen MToon's own inverted-hull outline
//   fx = comma list to disable effects for A/B (dof,bloom,vig,ca,grain,lut,speed)
//   w, h  canvas size; frames = timing frames
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { EffectComposer as ThreeComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass as ThreeRenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import * as PP from 'postprocessing';

const q = new URLSearchParams(location.search);
const PIPE = q.get('pipe') || 'pmndrs';
const EDGES = q.get('edges') === '1';
const MTOON_OUTLINE = q.get('mtoonOutline') ?? '1';
const OFF = new Set((q.get('fx') || '').split(',').filter(Boolean));
const W = +(q.get('w') || 1280), H = +(q.get('h') || 720);
const FRAMES = +(q.get('frames') || 60);
const log = (...a) => { console.log('[spike]', ...a); };
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
const origErr = console.error;
console.error = (...a) => { window.__errors.push(a.map(String).join(' ')); origErr(...a); };
const origWarn = console.warn;
window.__warnings = [];
console.warn = (...a) => { window.__warnings.push(a.map(String).join(' ')); origWarn(...a); };

// ---------- physical camera ----------
// Lens in mm on a sensor (Super 35 by default); focus distance in metres; f-stop -> DOF.
const lens = { focalMm: 50, sensorMm: [24.89, 18.66], focusM: 3.9, fStop: 1.8, cocMm: 0.025 };
const renderer = new THREE.WebGLRenderer({
  antialias: PIPE === 'none' || PIPE === 'builtin', preserveDrawingBuffer: true,
  ...(PIPE === 'builtin' ? { outputBufferType: THREE.HalfFloatType } : {}),
});
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = q.get('shadows') !== '0';
renderer.shadowMap.type = THREE.PCFShadowMap;
// MToon keeps authored colours best with Neutral; pmndrs wants NoToneMapping on the renderer
// and a ToneMappingEffect at the end instead.
renderer.toneMapping = PIPE === 'pmndrs' ? THREE.NoToneMapping : THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 60);
camera.filmGauge = lens.sensorMm[0];
camera.setFocalLength(lens.focalMm);
camera.position.set(0.2, 1.3, 4.0);
camera.lookAt(0.05, 1.05, 0);

// Thin-lens depth of field from the physical lens (all in metres).
function thinLens({ focalMm, focusM, fStop, cocMm }) {
  const f = focalMm / 1000, c = cocMm / 1000, s = focusM;
  const Hd = (f * f) / (fStop * c) + f; // hyperfocal distance
  const near = (s * (Hd - f)) / (Hd + s - 2 * f);
  const far = s < Hd ? (s * (Hd - f)) / (Hd - s) : Infinity;
  // CoC diameter on the sensor for a point at distance d, as a fraction of sensor width
  const coc = (d) => (Math.abs(d - s) / d) * (f * f) / (fStop * (s - f));
  return { Hd, near, far, coc };
}
const dofInfo = thinLens(lens);
log('thin lens', JSON.stringify({ ...dofInfo, coc: undefined, cocAt8m_px: dofInfo.coc(8) / (lens.sensorMm[0] / 1000) * W }));

// ---------- scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8d8);
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(1.5, 3, 2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
scene.add(key, new THREE.HemisphereLight(0xdde8ff, 0x605040, 0.9));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshToonMaterial({ color: 0x9a8f7a }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// Background props for DOF and an emissive lantern for bloom
for (let i = 0; i < 9; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2 + (i % 3) * 0.6, 0.6), new THREE.MeshToonMaterial({ color: new THREE.Color().setHSL(i / 9, 0.45, 0.55) }));
  m.position.set(-4 + i, 0.6 + (i % 3) * 0.3, -5 - (i % 2) * 3); m.castShadow = true; scene.add(m);
}
const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc070, emissiveIntensity: 6 }));
lantern.position.set(-0.75, 1.7, -0.4); scene.add(lantern);

const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));
async function loadVrm(url, x, ry) {
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  const holder = new THREE.Group(); holder.position.x = x; holder.rotation.y = ry; holder.add(vrm.scene); scene.add(holder);
  vrm.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  for (const side of ['left', 'right']) {
    const b = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
    if (b) b.rotation.z = (side === 'left' ? -1 : 1) * 1.2;
  }
  vrm.expressionManager?.setValue('happy', 0.6);
  const outlined = [];
  vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) if (m.isMToonMaterial && m.isOutline) outlined.push(m);
  });
  for (const m of outlined) {
    if (MTOON_OUTLINE === '0') m.visible = false;
    else if (MTOON_OUTLINE !== '1') { m.outlineWidthFactor = +MTOON_OUTLINE; }
  }
  vrm.update(0);
  return { vrm, outlined: outlined.length };
}
const a = await loadVrm('models/spec.vrm', -0.35, 0.35);
const b = await loadVrm('models/vroid10.vrm', 0.45, -0.3);
log('outline materials', a.outlined, b.outlined);

// ---------- anime overlays as a custom pmndrs Effect: speed lines + impact frame ----------
const speedFrag = /* glsl */`
uniform float strength; uniform float seed; uniform float impact;
float hash(float n){ return fract(sin(n)*43758.5453123); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec2 p = uv - 0.5; p.x *= ${(W / H).toFixed(4)};
  float ang = atan(p.y, p.x); float r = length(p);
  float k = floor((ang + 3.14159) / 6.28318 * 180.0);
  float line = step(0.82, hash(k + seed)) * smoothstep(0.18 + 0.2*hash(k*1.7+seed), 0.75, r);
  vec3 c = mix(inputColor.rgb, vec3(1.0), line * strength);
  // impact frame: posterised inverse silhouette
  float lum = dot(inputColor.rgb, vec3(0.299,0.587,0.114));
  c = mix(c, vec3(step(lum, 0.35)), impact);
  outputColor = vec4(c, inputColor.a);
}`;
class SpeedLinesEffect extends PP.Effect {
  constructor() {
    super('SpeedLines', speedFrag, { uniforms: new Map([['strength', new THREE.Uniform(0.85)], ['seed', new THREE.Uniform(3)], ['impact', new THREE.Uniform(0)]]) });
  }
}

// Screen-space depth + normal edge outline (the alternative to MToon's hull outline)
const edgeFrag = /* glsl */`
uniform sampler2D tNormal; uniform vec2 texel; uniform float thickness;
float lin(float d){ return perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor){
  vec2 o = texel * thickness; float z = lin(depth);
  float dz = 0.0; float dn = 0.0; vec3 n0 = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
  vec2 offs[4]; offs[0]=vec2(o.x,0.); offs[1]=vec2(-o.x,0.); offs[2]=vec2(0.,o.y); offs[3]=vec2(0.,-o.y);
  for (int i=0;i<4;i++){ dz += abs(lin(readDepth(uv+offs[i])) - z); vec3 n = texture2D(tNormal, uv+offs[i]).xyz*2.0-1.0; dn += 1.0 - dot(n0, n); }
  float e = max(step(0.04 * abs(z), dz), step(0.6, dn));
  outputColor = vec4(mix(inputColor.rgb, vec3(0.05,0.03,0.04), e), inputColor.a);
}`;
class EdgeEffect extends PP.Effect {
  constructor(normalTex) {
    super('Edges', edgeFrag, {
      attributes: PP.EffectAttribute.DEPTH,
      uniforms: new Map([['tNormal', new THREE.Uniform(normalTex)], ['texel', new THREE.Uniform(new THREE.Vector2(1 / W, 1 / H))], ['thickness', new THREE.Uniform(1.0)]]),
    });
  }
}

// ---------- pipelines ----------
let render;
const info = { pipe: PIPE, edges: EDGES, mtoonOutline: MTOON_OUTLINE, off: [...OFF], passes: [] };
if (PIPE === 'views') {
  // Multi-angle preview in one canvas: N cameras, one renderer, scissored viewports.
  const N = +(q.get('n') || 4); const cols = Math.ceil(Math.sqrt(N)); const rows = Math.ceil(N / cols);
  const cams = Array.from({ length: N }, (_, i) => { const c = camera.clone(); c.aspect = W / H; const ang = (i / N) * Math.PI * 2; c.position.set(Math.sin(ang) * 4, 1.3, Math.cos(ang) * 4); c.lookAt(0, 1.05, 0); c.updateProjectionMatrix(); return c; });
  const shadowOnce = q.get('shadowOnce') === '1';
  renderer.setScissorTest(true);
  render = () => {
    const w = W / cols, h = H / rows;
    cams.forEach((c, i) => {
      if (shadowOnce) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = i === 0; }
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h); renderer.render(scene, c);
    });
  };
  info.views = N;
} else if (PIPE === 'monitor') {
  // A render-to-texture monitor in the set: second camera -> 512x288 target -> screen mesh
  const rt = new THREE.WebGLRenderTarget(512, 288, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam2 = camera.clone(); cam2.position.set(-1.5, 1.6, 1.5); cam2.lookAt(0.45, 1.4, 0); cam2.aspect = 16 / 9; cam2.updateProjectionMatrix();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false }));
  screen.position.set(1.6, 1.6, -1.2); screen.rotation.y = -0.4; scene.add(screen);
  render = () => {
    screen.visible = false; renderer.setRenderTarget(rt); renderer.render(scene, cam2);
    renderer.setRenderTarget(null); screen.visible = true; renderer.render(scene, camera);
  };
} else if (PIPE === 'none') {
  render = () => renderer.render(scene, camera);
} else if (PIPE === 'builtin') {
  // r187 renderer.setEffects: no composer, tone mapping after the effects
  const fx = [];
  if (!OFF.has('bloom')) fx.push(new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.9));
  if (!OFF.has('dof')) fx.push(new BokehPass(scene, camera, { focus: lens.focusM, aperture: 0.004, maxblur: 0.008 }));
  renderer.setEffects(fx);
  info.passes = fx.map((p) => p.constructor.name);
  render = () => renderer.render(scene, camera);
} else if (PIPE === 'three') {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new ThreeComposer(renderer, rt);
  composer.setSize(W, H);
  composer.addPass(new ThreeRenderPass(scene, camera));
  if (!OFF.has('dof')) composer.addPass(new BokehPass(scene, camera, { focus: lens.focusM, aperture: 0.004, maxblur: 0.008 }));
  if (!OFF.has('bloom')) composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.9));
  if (!OFF.has('ca')) { const s = new ShaderPass(RGBShiftShader); s.uniforms.amount.value = 0.0015; composer.addPass(s); }
  composer.addPass(new OutputPass());
  if (!OFF.has('vig')) { const v = new ShaderPass(VignetteShader); v.uniforms.offset.value = 1.0; v.uniforms.darkness.value = 1.1; composer.addPass(v); }
  if (!OFF.has('grain')) composer.addPass(new FilmPass(0.25, false));
  info.passes = composer.passes.map((p) => p.constructor.name);
  render = () => composer.render(1 / 60);
} else {
  const composer = new PP.EffectComposer(renderer, { multisampling: 4, frameBufferType: THREE.HalfFloatType });
  composer.addPass(new PP.RenderPass(scene, camera));
  if (EDGES) {
    const normalPass = new PP.NormalPass(scene, camera);
    composer.addPass(normalPass);
    composer.addPass(new PP.EffectPass(camera, new EdgeEffect(normalPass.texture)));
  }
  if (!OFF.has('dof')) {
    // Physical lens -> pmndrs' artistic CoC: sharp zone = thin-lens near..far, blur scale from CoC at infinity
    const dof = new PP.DepthOfFieldEffect(camera, {
      focusDistance: lens.focusM,
      focusRange: Math.max(0.05, (Math.min(dofInfo.far, 50) - dofInfo.near)),
      bokehScale: Math.min(6, dofInfo.coc(1e4) / (lens.sensorMm[0] / 1000) * W / 8),
      resolutionScale: 0.5,
    });
    composer.addPass(new PP.EffectPass(camera, dof));
    info.dof = { focusDistance: dof.cocMaterial.focusDistance, focusRange: dof.cocMaterial.focusRange, bokehScale: dof.bokehScale };
  }
  const merged = [];
  if (!OFF.has('bloom')) merged.push(new PP.BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.9, intensity: 1.2, radius: 0.6 }));
  if (!OFF.has('lut')) merged.push(new PP.HueSaturationEffect({ saturation: 0.12 }), new PP.BrightnessContrastEffect({ contrast: 0.06 }));
  merged.push(new PP.ToneMappingEffect({ mode: PP.ToneMappingMode.NEUTRAL }));
  if (!OFF.has('vig')) merged.push(new PP.VignetteEffect({ offset: 0.3, darkness: 0.55 }));
  if (!OFF.has('grain')) { const n = new PP.NoiseEffect({ premultiply: true }); n.blendMode.opacity.value = 0.25; merged.push(n); }
  if (q.get('speed') === '1') merged.push(new SpeedLinesEffect());
  composer.addPass(new PP.EffectPass(camera, ...merged));
  // Convolution effects can't share a pass with each other: chromatic aberration gets its own
  if (!OFF.has('ca')) composer.addPass(new PP.EffectPass(camera, new PP.ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0012, 0.0008), radialModulation: true, modulationOffset: 0.3 })));
  info.passes = composer.passes.map((p) => p.name + (p.effects ? `(${p.effects.map((e) => e.name).join('+')})` : ''));
  render = () => composer.render(1 / 60);
}

// ---------- run: warm up, time, then publish results ----------
renderer.info.autoReset = false;
const gl = renderer.getContext();
const px = new Uint8Array(4);
const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
for (let i = 0; i < 5; i++) { render(); }
sync();
const times = [];
const tAll = performance.now();
for (let i = 0; i < FRAMES; i++) {
  a.vrm.update(1 / 60); b.vrm.update(1 / 60);
  renderer.info.reset(); const t0 = performance.now(); render(); sync(); times.push(performance.now() - t0);
  info.drawCalls = renderer.info.render.calls; info.triangles = renderer.info.render.triangles;
}
// Mean over the whole run: stays meaningful where performance.now() resolves only 1 ms (WKWebView).
info.msMean = +((performance.now() - tAll) / FRAMES).toFixed(3);
times.sort((x, y) => x - y);
info.msMedian = +times[Math.floor(times.length / 2)].toFixed(2);
info.msP90 = +times[Math.floor(times.length * 0.9)].toFixed(2);
info.programs = renderer.info.programs?.length;
info.errors = window.__errors;
info.warnings = [...new Set(window.__warnings)].slice(0, 8);
info.glRenderer = (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })();
render();
window.__result = info;
window.READY = true;
log(JSON.stringify(info));
