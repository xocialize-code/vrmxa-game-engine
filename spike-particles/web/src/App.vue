<script setup>
// Modes from the query string:
//   (default)       interactive showcase: pick a library and an effect, plays live at 60 Hz
//   ?autorun=1      the measurement suite (determinism, scrub, JSON, perf with draw calls) plus a
//                   pixel-level scrub check; posts JSON to the wrapper (webkit.messageHandlers.spike)
//                   and, with &save=<name>, to the dev server (results/<name>.json)
//   ?shots=1        renders every library x effect shot next to the VRM at fixed frames and posts
//                   each PNG (type "png"), plus a contact sheet; &save=1 also writes them via the dev server
//   &avatar=vroid10|vroid0x|spec
import { ref, shallowRef, onMounted, onBeforeUnmount, markRaw } from 'vue';
import * as THREE from 'three';
import { GPURenderer } from 'three-nebula';
import { runSuite, buildMixed, run, DT } from './tests.js';
import * as quarks from './libs/quarks.js';
import { Stage, PLACEMENT, LIB_EFFECTS } from './stage/stage.js';
import { Hasher } from './core/hash.js';

const params = new URLSearchParams(location.search);
const autorun = params.get('autorun') === '1';
const shots = params.get('shots') === '1';
const save = params.get('save');
const avatarKey = params.get('avatar') || 'vroid10';
const canvas = ref(null);
const status = ref('loading…');
const report = shallowRef(null);
const lib = ref(params.get('lib') || 'quarks');
const effect = ref(params.get('effect') || 'impact');
let stage = null;
let raf = 0;

const bridge = window.webkit?.messageHandlers?.spike;
const post = (type, payload) => { try { bridge?.postMessage(JSON.stringify({ type, payload })); } catch { /* not in the wrapper */ } };
const log = (m) => { status.value = m; post('log', m); };
async function saveToDev(name, body, kind = 'json') {
  if (!save || bridge) return; // the wrapper writes files itself
  await fetch(`/__results?name=${encodeURIComponent(name)}&kind=${kind}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }).catch(() => {});
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---- pixel scrub: does a restored frame render exactly the same image? ----------------------
async function pixelScrub() {
  const W = 480, H = 300;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(W, H, false);
  const rt = new THREE.WebGLRenderTarget(W, H);
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
  cam.position.set(0, 3, 9); cam.lookAt(0, 2, 0);
  const buf = new Uint8Array(W * H * 4);
  const shot = (scene) => {
    scene.updateMatrixWorld();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x202030, 1); renderer.clear(); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); renderer.setRenderTarget(null);
    const h = new Hasher(); for (let i = 0; i < buf.length; i += 4) h.word(buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24));
    return h.hex();
  };
  const A = 300, B = 450, WIN = 100, out = {};
  // quarks: full snapshot and window restore
  for (const mode of ['full', 'window']) {
    const w = buildMixed('quarks', { seeding: 'frame' });
    const states = [];
    let snap = null;
    for (let f = 0; f < B; f++) { if (f === A) snap = quarks.snapshotFull(w); states.push(quarks.emitterState(w)); w.step(DT); }
    const ref = shot(w.scene);
    run(w, 37); shot(w.scene);
    if (mode === 'full') { quarks.restoreFull(w, snap); run(w, B - A); } else quarks.restoreWindow(w, states[B - WIN], B - WIN, B, DT);
    out[`quarks-${mode}`] = { same: shot(w.scene) === ref, ref };
    w.dispose();
  }
  // nebula: re-simulate from 0 with the same seed, rendering through its GPURenderer
  {
    const mk = () => { const scene = new THREE.Scene(); return buildMixed('nebula', { seeding: 'seed', scene, renderer: new GPURenderer(scene, THREE) }); };
    const a = run(mk(), B); const ref = shot(a.scene); a.dispose();
    const b = run(mk(), B); out['nebula-resim'] = { same: shot(b.scene) === ref, ref }; b.dispose();
  }
  // stateless: wander, seek back
  {
    const w = run(buildMixed('stateless'), B); const ref = shot(w.scene);
    run(w, 37); shot(w.scene); w.seek(B, DT);
    out['stateless-seek'] = { same: shot(w.scene) === ref, ref };
    w.dispose();
  }
  renderer.dispose(); rt.dispose();
  return out;
}

// ---- perf render hook ---------------------------------------------------------------------
function makeRenderHook() {
  const renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 800, false);
  const cam = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 200);
  cam.position.set(0, 6, 22); cam.lookAt(0, 5, 0);
  const render = async (w) => {
    const t = performance.now();
    renderer.render(w.scene, cam);
    const ms = performance.now() - t;
    return { ms, calls: renderer.info.render.calls };
  };
  const makeExtra = (lib) => {
    if (lib !== 'nebula') return {};
    const scene = new THREE.Scene();
    return { scene, renderer: new GPURenderer(scene, THREE) };
  };
  return { render, makeExtra, renderer };
}

async function doAutorun() {
  try {
    log('running suite…');
    await nextFrame();
    const hook = makeRenderHook();
    const r = await runSuite({ render: hook.render, makeExtra: hook.makeExtra });
    log('pixel scrub…');
    r.pixelScrub = await pixelScrub();
    r.gl = { renderer: hook.renderer.getContext().getParameter(hook.renderer.getContext().VERSION), maxPointSize: hook.renderer.getContext().getParameter(hook.renderer.getContext().ALIASED_POINT_SIZE_RANGE)?.[1] };
    report.value = markRaw(r);
    window.__spikeResults = r;
    post('results', r);
    await saveToDev(save || 'browser', r);
    log('done');
  } catch (e) {
    log(`error: ${e?.stack || e}`); post('error', String(e?.stack || e));
  }
}

async function doDebug() {
  const manifest = await (await fetch('models/models.json')).json();
  stage = new Stage(canvas.value, { preserve: true });
  await stage.loadAvatar(manifest.avatars.find((a) => a.key === avatarKey).url, manifest.motions.idle);
  const w = stage.setEffect(lib.value, effect.value, 1);
  stage.goTo(PLACEMENT[effect.value].frame);
  const calls = stage.render();
  const gl = stage.renderer.getContext();
  const info = { calls, pointRange: [...gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)], count: w.count() };
  const r = w.system?.renderers?.[0];
  if (r) {
    info.atlas = r.textureAtlas ? { w: r.textureAtlas.atlasTexture.image.width, h: r.textureAtlas.atlasTexture.image.height, idx: Array.from(r.textureAtlas.indexData || []).slice(0, 16), tex: r.material.uniforms.uTexture.value?.uuid, atlasTex: r.textureAtlas.atlasTexture.uuid } : null;
    info.stride = r.stride; info.attrs = Object.fromEntries(Object.entries(r.geometry.attributes).map(([k, a]) => [k, a.offset]));
    info.buf = Array.from(r.buffer.array.slice(0, r.stride * 3)).map((v) => +v.toFixed(3));
    info.drawRange = r.geometry.drawRange;
  }
  post('results', info); log(JSON.stringify(info));
}

async function doShots() {
  const manifest = await (await fetch('models/models.json')).json();
  const av = manifest.avatars.find((a) => a.key === avatarKey) ?? manifest.avatars[0];
  stage = new Stage(canvas.value, { preserve: true });
  stage.resize(960, 720);
  await stage.loadAvatar(av.url, manifest.motions.idle);
  stage.poseAt(1.0);
  const list = [];
  for (const l of ['quarks', 'nebula', 'stateless']) for (const e of LIB_EFFECTS[l]) list.push([l, e]);
  const W = 480, H = 360, cols = 4;
  const sheet = document.createElement('canvas');
  const libs = ['quarks', 'nebula', 'stateless'], effects = ['impact', 'sparkles', 'speedlines', 'sweatdrop'];
  sheet.width = W * cols; sheet.height = H * libs.length;
  const g = sheet.getContext('2d');
  g.fillStyle = '#1d2333'; g.fillRect(0, 0, sheet.width, sheet.height);
  for (const [l, e] of list) {
    log(`shot ${l} ${e}`);
    stage.setEffect(l, e, 1);
    stage.goTo(PLACEMENT[e].frame);
    stage.render();
    const name = `${l}-${e}-${avatarKey}`;
    const url = canvas.value.toDataURL('image/png');
    post('png', { name, dataUrl: url });
    await saveToDev(name, url, 'png');
    g.drawImage(canvas.value, effects.indexOf(e) * W, libs.indexOf(l) * H, W, H);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(effects.indexOf(e) * W, libs.indexOf(l) * H, W, 26);
    g.fillStyle = '#fff'; g.font = '15px -apple-system, system-ui, sans-serif';
    g.fillText(`${l} · ${e} · frame ${PLACEMENT[e].frame}`, effects.indexOf(e) * W + 8, libs.indexOf(l) * H + 18);
    await nextFrame();
  }
  const sheetUrl = sheet.toDataURL('image/png');
  post('png', { name: `contact-sheet-${avatarKey}`, dataUrl: sheetUrl });
  await saveToDev(`contact-sheet-${avatarKey}`, sheetUrl, 'png');
  stage.clearEffect();
  post('results', { shots: list.map(([l, e]) => `${l}-${e}-${avatarKey}`) });
  log('shots done');
}

async function startInteractive() {
  const manifest = await (await fetch('models/models.json')).json();
  const av = manifest.avatars.find((a) => a.key === avatarKey) ?? manifest.avatars[0];
  stage = new Stage(canvas.value);
  await stage.loadAvatar(av.url, manifest.motions.idle);
  choose(lib.value, effect.value);
  let last = performance.now(), acc = 0, t = 0;
  const loop = (now) => {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= DT) { acc -= DT; t += DT; stage.world?.step(DT); stage.mixer?.update(DT); stage.vrm?.update(DT); }
    const calls = stage.render();
    status.value = `${lib.value} · ${effect.value} · frame ${stage.world?.frame ?? 0} · ${calls} draw calls`;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  window.addEventListener('resize', () => stage.resize());
  post('ready', { avatar: avatarKey });
}
function choose(l, e) {
  if (!LIB_EFFECTS[l].includes(e)) e = LIB_EFFECTS[l][0];
  lib.value = l; effect.value = e;
  stage.setEffect(l, e, Date.now() >>> 0);
}

onMounted(async () => {
  try {
    if (autorun) await doAutorun();
    else if (shots && params.get('webgpu') === '1') {
      const { webgpuShots } = await import('./webgpu.js');
      const r = await webgpuShots(canvas.value, post);
      log(JSON.stringify(r)); post('results', r); await saveToDev('webgpu', r);
    } else if (shots) await doShots();
    else if (params.get('debug') === '1') await doDebug();
    else await startInteractive();
  } catch (e) { log(`error: ${e?.stack || e}`); post('error', String(e?.stack || e)); }
});
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <canvas ref="canvas" class="stage" width="1280" height="800" />
  <div class="hud">
    <div>{{ status }}</div>
    <template v-if="!autorun && !shots">
      <div>
        <button v-for="l in ['quarks', 'nebula', 'stateless']" :key="l" :class="{ on: lib === l }" @click="choose(l, effect)">{{ l }}</button>
      </div>
      <div>
        <button v-for="e in LIB_EFFECTS[lib]" :key="e" :class="{ on: effect === e }" @click="choose(lib, e)">{{ e }}</button>
        <button @click="choose(lib, effect)">replay</button>
      </div>
    </template>
  </div>
  <div v-if="report" class="report" style="position:fixed;inset:0;overflow:auto;background:#1d2333">{{ JSON.stringify(report, null, 1) }}</div>
</template>
