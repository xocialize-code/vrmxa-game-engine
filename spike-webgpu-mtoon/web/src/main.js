// VRMXG WebGPU MToon spike (AB-T-0553): one still of a VRM with MToon, under WebGLRenderer (MToonMaterial,
// GLSL) or WebGPURenderer (MToonNodeMaterial, TSL), so the two can be compared pixel for pixel.
//
// Query: renderer=webgl|webgpu|webgpu-gl (WebGPURenderer forced onto its WebGL2 backend)
//        lib=patched|loadonly|stock (MToonNodeMaterial from src/vendor/three-vrm-nodes.js, -loadonly.js, or @pixiv/three-vrm/nodes)
//        model=mira|hana|vroid10   view=body|face|back   features=all|none|matcap,rim,emissive,uv   sun, amb
//        t=<s> (UV animation time)   w, h
// Sets window.__result, window.__png (captured in the same task as the last render), window.READY.
import * as THREE_GL from 'three';
import * as THREE_GPU from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, MToonMaterial, MToonMaterialLoaderPlugin, MToonMaterialOutlineWidthMode } from '@pixiv/three-vrm';

const q = new URLSearchParams(location.search);
const rendererKind = q.get('renderer') ?? 'webgpu';
const lib = q.get('lib') ?? 'patched';
const modelName = q.get('model') ?? 'mira';
const view = q.get('view') ?? 'body';
// features: all (1) | none (0) | a comma list of matcap,rim,emissive,uv — forced on top of the authored values.
const ALL = ['matcap', 'rim', 'emissive', 'uv'];
const fq = q.get('features') ?? 'all';
const features = fq === '1' || fq === 'all' ? ALL : fq === '0' || fq === 'none' ? [] : fq.split(',');
const sunIntensity = +(q.get('sun') ?? 1.6), ambIntensity = +(q.get('amb') ?? 0.25);
const uvTime = +(q.get('t') ?? 1.25);
const W = +(q.get('w') ?? 512), H = +(q.get('h') ?? 768);
const gpu = rendererKind !== 'webgl';
const THREE = gpu ? THREE_GPU : THREE_GL;

const errors = (window.__errors ??= []);
const warnings = (window.__warnings ??= []);
for (const [level, sink] of [['error', errors], ['warn', warnings]]) {
  const orig = console[level].bind(console);
  console[level] = (...a) => { sink.push(a.map(String).join(' ').slice(0, 400)); orig(...a); };
}
addEventListener('error', (e) => errors.push(`uncaught: ${e.message}`));
addEventListener('unhandledrejection', (e) => errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));

const result = { renderer: rendererKind, lib: gpu ? lib : null, model: modelName, view, features: features.join(',') || 'none', sun: sunIntensity, amb: ambIntensity, hide: q.get('hide'), noemissive: q.get('noemissive') === '1', uvTime, w: W, h: H, errors, warnings };
window.__result = result;

function finish(extra = {}) {
  Object.assign(result, extra);
  result.errorCount = errors.length;
  result.warningCount = warnings.length;
  result.uniqueWarnings = [...new Set(warnings.map((w) => w.replace(/\d+/g, 'N')))].slice(0, 20);
  window.READY = true;
  console.log('[spike] done', JSON.stringify({ ...result, errors: errors.slice(0, 5), warnings: undefined }));
}

// A deterministic matcap: a lit sphere with a warm rim, so matcap shows clearly on every material.
function makeMatcap() {
  const n = 64, data = new Uint8Array(n * n * 4);
  if (q.get('matcapTex') === 'quad') { // diagnostic: data row 0 is v = 0; red u<.5 v<.5, green u>=.5 v<.5, blue u<.5 v>=.5, yellow else
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) data.set(y < n / 2 ? (x < n / 2 ? [220, 30, 30, 255] : [30, 200, 30, 255]) : (x < n / 2 ? [30, 30, 220, 255] : [230, 220, 30, 255]), (y * n + x) * 4);
    const t = new THREE.DataTexture(data, n, n); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1, r2 = u * u + v * v, i = (y * n + x) * 4;
    const z = r2 < 1 ? Math.sqrt(1 - r2) : 0, hi = Math.max(0, u * -0.4 + v * 0.5 + z * 0.77);
    const rim = r2 < 1 ? Math.pow(1 - z, 3) : 1;
    data[i] = Math.min(255, Math.round(40 + 120 * hi * hi + 200 * rim));
    data[i + 1] = Math.min(255, Math.round(30 + 110 * hi * hi + 90 * rim));
    data[i + 2] = Math.min(255, Math.round(50 + 140 * hi * hi + 30 * rim));
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const isMToon = (m) => m && (m.isMToonMaterial || m.isMToonNodeMaterial || 'shadeColorFactor' in m);

function forceFeatures(materials, on) {
  const matcap = on.includes('matcap') ? makeMatcap() : null;
  for (const m of materials) {
    if (matcap) { m.matcapFactor.setRGB(0.6, 0.6, 0.6); m.matcapTexture = matcap; }
    if (on.includes('rim')) {
      m.parametricRimColorFactor.setRGB(0.9, 0.45, 0.2);
      m.parametricRimFresnelPowerFactor = 4;
      m.parametricRimLiftFactor = 0.05;
      m.rimLightingMixFactor = 0.5;
    }
    if (on.includes('emissive')) { m.emissive.setRGB(0.08, 0.02, 0.06); m.emissiveMap = null; } // Spec's emissive map is black
    if (on.includes('uv')) {
      m.uvAnimationScrollXSpeedFactor = 0.07;
      m.uvAnimationScrollYSpeedFactor = 0.03;
      m.uvAnimationRotationSpeedFactor = 0.05;
    }
    m.needsUpdate = true;
  }
}

function describe(m) {
  const c = (x) => x ? [x.r, x.g, x.b].map((v) => +v.toFixed(3)) : null;
  return {
    name: m.name, type: m.type, isOutline: !!m.isOutline, transparent: m.transparent,
    shade: c(m.shadeColorFactor), shadingShift: m.shadingShiftFactor, shadingToony: m.shadingToonyFactor,
    rim: c(m.parametricRimColorFactor), rimPower: m.parametricRimFresnelPowerFactor, matcap: !!m.matcapTexture,
    emissive: c(m.emissive), outlineWidthMode: m.outlineWidthMode, outlineWidth: m.outlineWidthFactor,
    uvAnim: [m.uvAnimationScrollXSpeedFactor, m.uvAnimationScrollYSpeedFactor, m.uvAnimationRotationSpeedFactor],
    maps: ['map', 'shadeMultiplyTexture', 'normalMap', 'emissiveMap', 'rimMultiplyTexture', 'outlineWidthMultiplyTexture', 'uvAnimationMaskTexture'].filter((k) => m[k]),
  };
}

// model=spheres: six spheres, each isolating one MToon input with flat colours, built with the material class
// directly (MToonMaterial or MToonNodeMaterial) so no loader or texture differences are involved.
function makeChecker() {
  const n = 8, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, on = (x + y) % 2 === 0;
    data.set(on ? [235, 235, 235, 255] : [60, 90, 200, 255], i);
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
function buildSpheres(Material) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.4, 64, 32);
  const black = (m) => { m.color.setRGB(0, 0, 0); m.shadeColorFactor.setRGB(0, 0, 0); };
  const cells = {
    shade: (m) => { m.color.setRGB(0.95, 0.85, 0.75); m.shadeColorFactor.setRGB(0.35, 0.3, 0.6); m.shadingToonyFactor = 0.9; m.shadingShiftFactor = -0.1; },
    rim: (m) => { black(m); m.parametricRimColorFactor.setRGB(1, 0.5, 0.2); m.parametricRimFresnelPowerFactor = 3; m.parametricRimLiftFactor = 0.05; m.rimLightingMixFactor = 0; },
    rimlit: (m) => { black(m); m.parametricRimColorFactor.setRGB(1, 0.5, 0.2); m.parametricRimFresnelPowerFactor = 3; m.parametricRimLiftFactor = 0.05; m.rimLightingMixFactor = 1; },
    matcap: (m) => { black(m); m.matcapFactor.setRGB(1, 1, 1); m.matcapTexture = makeMatcap(); m.rimLightingMixFactor = 0; },
    emissive: (m) => { black(m); m.emissive.setRGB(0.2, 0.6, 0.3); },
    uv: (m) => { m.color.setRGB(1, 1, 1); m.shadeColorFactor.setRGB(0.6, 0.6, 0.6); m.map = makeChecker(); m.uvAnimationScrollXSpeedFactor = 0.07; m.uvAnimationScrollYSpeedFactor = 0.03; m.uvAnimationRotationSpeedFactor = 0.3; },
  };
  const mats = [];
  Object.entries(cells).forEach(([name, setup], i) => {
    const m = new Material(); m.name = name; setup(m); m.needsUpdate = true; mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set((i % 3 - 1) * 1.0, 1.55 - Math.floor(i / 3) * 1.0, 0);
    group.add(mesh);
    if (name === 'shade') { // the outline: a second mesh with an outline copy, as the VRM loader does with groups
      const o = new Material(); o.name = 'shade (outline)'; setup(o); o.isOutline = true; o.side = THREE.BackSide;
      o.outlineWidthMode = MToonMaterialOutlineWidthMode.WorldCoordinates; o.outlineWidthFactor = 0.02;
      o.outlineColorFactor.setRGB(0.15, 0.05, 0.1); o.outlineLightingMixFactor = 0.5; o.needsUpdate = true; mats.push(o);
      const om = new THREE.Mesh(geo, o); om.position.copy(mesh.position); group.add(om);
    }
  });
  return { group, mats };
}

async function main() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  document.body.appendChild(canvas);

  let renderer;
  if (gpu) {
    result.hasNavigatorGpu = !!navigator.gpu;
    renderer = new THREE_GPU.WebGPURenderer({ canvas, antialias: false, forceWebGL: rendererKind === 'webgpu-gl' });
    await renderer.init();
    result.backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  } else {
    renderer = new THREE_GL.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    result.backend = 'WebGL2';
  }
  result.revision = THREE.REVISION;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  let MToonNodeMaterial;
  if (gpu) {
    try {
      // lib=upstream: lib/nodes built from the upstream fix PRs (pixiv/three-vrm#1904-1907 branches merged on dev), copied in by hand; loads on r186.
      const mod = lib === 'stock' ? await import('@pixiv/three-vrm/nodes') : lib === 'loadonly' ? await import('./vendor/three-vrm-nodes-loadonly.js') : lib === 'upstream' ? await import('./vendor/three-vrm-nodes-upstream.js') : await import('./vendor/three-vrm-nodes.js');
      MToonNodeMaterial = mod.MToonNodeMaterial;
    } catch (e) {
      errors.push(`import ${lib}: ${e.name}: ${e.message}`);
      return finish({ stage: 'import', importError: `${e.name}: ${e.message}` });
    }
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8dde6);
  const sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
  sun.position.set(1.6, 2.2, 1.0);
  scene.add(sun);
  if (ambIntensity > 0) scene.add(new THREE.AmbientLight(0xffffff, ambIntensity));

  if (modelName === 'threematcap') { // control: three's own MeshMatcapMaterial vs MeshMatcapNodeMaterial, same texture
    const m = gpu ? new THREE_GPU.MeshMatcapNodeMaterial({ matcap: makeMatcap() }) : new THREE_GL.MeshMatcapMaterial({ matcap: makeMatcap() });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 64, 32), m));
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
    camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0);
    return capture(renderer, scene, camera);
  }
  if (modelName === 'threealpha') { // control: three's own MeshBasicMaterial at opacity 0.5 over a blue sphere and the background
    const B = gpu ? THREE_GPU.MeshBasicNodeMaterial : THREE_GL.MeshBasicMaterial;
    const front = new B({ color: new THREE.Color(0.95, 0.4, 0.3), transparent: true, opacity: 0.5, depthWrite: false });
    const back = new B({ color: new THREE.Color(0.2, 0.3, 0.9) });
    const geo = new THREE.SphereGeometry(0.5, 64, 32);
    const f = new THREE.Mesh(geo, front); f.position.set(-0.2, 0, 0.5); const b = new THREE.Mesh(geo, back); b.position.set(0.3, 0.15, -0.2);
    scene.add(f, b);
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50); camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0);
    return capture(renderer, scene, camera);
  }
  if (modelName === 'spheres2') { // transparency and the UV-animation mask channel
    const mats = [];
    const geo = new THREE.SphereGeometry(0.4, 64, 32);
    const Material = gpu ? MToonNodeMaterial : MToonMaterial;
    const mask = (() => { // B = 1, R = G = 0: animates only if the mask is read from B (the spec's channel)
      const d = new Uint8Array(4 * 4 * 4); for (let i = 0; i < 16; i++) d.set([0, 0, 255, 255], i * 4);
      const t = new THREE.DataTexture(d, 4, 4); t.needsUpdate = true; return t; })();
    const back = new Material(); back.color.setRGB(0.2, 0.3, 0.9); back.shadeColorFactor.setRGB(0.1, 0.15, 0.5); mats.push(back);
    const cells = {
      uvmaskB: (m) => { m.map = makeChecker(); m.uvAnimationMaskTexture = mask; m.uvAnimationScrollXSpeedFactor = 0.07; m.uvAnimationRotationSpeedFactor = 0.3; },
      alpha: (m) => { m.color.setRGB(0.95, 0.4, 0.3); m.shadeColorFactor.setRGB(0.5, 0.2, 0.2); m.transparent = true; m.opacity = 0.5; m.depthWrite = false; },
      alphaZWrite: (m) => { m.color.setRGB(0.95, 0.4, 0.3); m.shadeColorFactor.setRGB(0.5, 0.2, 0.2); m.transparent = true; m.opacity = 0.5; m.depthWrite = true; },
      alphaMapUv: (m) => { m.map = makeChecker(); m.transparent = true; m.opacity = 0.6; m.depthWrite = false; m.uvAnimationScrollYSpeedFactor = 0.2; },
    };
    Object.entries(cells).forEach(([name, setup], i) => {
      const m = new Material(); m.name = name; m.color.setRGB(1, 1, 1); m.shadeColorFactor.setRGB(0.6, 0.6, 0.6); setup(m); m.needsUpdate = true; mats.push(m);
      const x = (i - 1.5) * 0.95;
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, 1, 0.5); scene.add(mesh);
      if (name !== 'uvmaskB') { const b = new THREE.Mesh(geo, back); b.position.set(x + 0.25, 1.15, -0.2); scene.add(b); }
    });
    for (const m of mats) m.update?.(uvTime);
    result.materials = mats.map(describe); result.mtoonCount = mats.length;
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
    camera.position.set(0, 1.05, 5.2); camera.lookAt(0, 1.05, 0);
    return capture(renderer, scene, camera);
  }
  if (modelName === 'spheres') {
    const { group, mats } = buildSpheres(gpu ? MToonNodeMaterial : MToonMaterial);
    scene.add(group);
    for (const m of mats) m.update?.(uvTime);
    result.materials = mats.map(describe);
    result.mtoonCount = mats.length;
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
    camera.position.set(0, 1.05, 5.2); camera.lookAt(0, 1.05, 0);
    return capture(renderer, scene, camera);
  }

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser, gpu ? {
    mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser, { materialType: MToonNodeMaterial }),
  } : {}));
  const gltf = await loader.loadAsync(`./models/${modelName}.vrm`);
  const vrm = gltf.userData.vrm;
  vrm.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  // Position and facing on a parent group (spike-physics gotcha 3); VRM 0.x faces -Z after rotateVRM0.
  const root = new THREE.Group();
  root.add(vrm.scene);
  if (vrm.meta?.metaVersion === '0') root.rotation.y = Math.PI;
  scene.add(root);

  // A fixed pose: arms down a little, head turned slightly. No spring bones (they'd make the still time-dependent).
  const h = vrm.humanoid;
  const bone = (n) => h.getNormalizedBoneNode(n);
  bone('leftUpperArm').rotation.z = -1.1;
  bone('rightUpperArm').rotation.z = 1.1;
  bone('leftLowerArm').rotation.z = -0.25;
  bone('rightLowerArm').rotation.z = 0.25;
  bone('neck').rotation.y = 0.15;
  h.update();
  vrm.nodeConstraintManager?.update();
  root.updateMatrixWorld(true);

  const materials = new Set();
  vrm.scene.traverse((o) => { if (o.isMesh) for (const m of [o.material].flat()) if (isMToon(m)) materials.add(m); });
  // Diagnostics, applied to both renderers alike: hide=transparent drops blended materials; noemissive=1 zeroes emission.
  for (const h of (q.get('hide') ?? '').split(',')) for (const m of materials) if ((h === 'transparent' && m.transparent) || (h === 'outline' && m.isOutline)) m.visible = false;
  if (q.get('noemissive') === '1') for (const m of materials) { m.emissive.setRGB(0, 0, 0); m.needsUpdate = true; }
  if (features.length) forceFeatures(materials, features);
  for (const m of materials) m.update?.(uvTime);
  result.materials = [...materials].map(describe);
  result.mtoonCount = materials.size;
  result.outlineCount = [...materials].filter((m) => m.isOutline).length;

  const head = new THREE.Vector3(); bone('head').getWorldPosition(head);
  const camera = new THREE.PerspectiveCamera(view === 'face' ? 18 : 30, W / H, 0.05, 50);
  if (view === 'face') { camera.position.set(0.25, head.y + 0.03, 0.85); camera.lookAt(0, head.y - 0.02, 0); }
  else if (view === 'back') { camera.position.set(-1.6, head.y * 0.62, -2.6); camera.lookAt(0, head.y * 0.52, 0); }
  else { camera.position.set(0.9, head.y * 0.62, 3.0); camera.lookAt(0, head.y * 0.52, 0); }

  return capture(renderer, scene, camera);
}

// Render a few frames (pipelines and textures settle), capture in the same task as the last render.
async function capture(renderer, scene, camera) {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const t = performance.now();
    renderer.render(scene, camera);
    if (i === 0) result.firstRenderMs = +(performance.now() - t).toFixed(2); // includes building every pipeline
  }
  if (gpu) await renderer.compileAsync?.(scene, camera);
  await new Promise((r) => requestAnimationFrame(r));
  const t0 = performance.now();
  renderer.render(scene, camera);
  window.__png = renderer.domElement.toDataURL('image/png');
  result.renderMs = +(performance.now() - t0).toFixed(2);
  // timing=1: CPU time of renderer.render() over 120 frames (take it over loopback: the scheme timer is 1 ms).
  if (q.get('timing') === '1') {
    const ms = [];
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const t = performance.now(); renderer.render(scene, camera); ms.push(performance.now() - t);
    }
    ms.sort((a, b) => a - b);
    result.cpuMsMedian = +ms[60].toFixed(3); result.cpuMsP90 = +ms[108].toFixed(3);
  }
  result.drawCalls = renderer.info.render.drawCalls ?? renderer.info.render.calls;
  result.triangles = renderer.info.render.triangles;
  finish({ stage: 'rendered' });
}

main().catch((e) => { errors.push(`main: ${e.stack ?? e}`); finish({ stage: 'error' }); });
