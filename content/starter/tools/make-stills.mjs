// Contact sheets of the starter content, drawn in headless Chromium with three.js (WebGL): Spec posed by every starter
// clip (three-vrm and three-vrm-animation, as an app loads them) and every starter item's model. For looking at, not
// for comparing: nothing checks their pixels.
//   node content/starter/tools/make-stills.mjs
// Writes acceptance/results/m6-starter-set.png and m6-starter-items.png. Needs vrmxa-core (it reads the
// items' ZIPs) and VRMXA_Specification (spec.vrm) beside the repository, and Playwright's Chromium (as the acceptance
// runners). Takes the GPU lock (acceptance/README.md, "Exactness").
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { vrmxaCore, PATHS } from '../../../engine/packages/character/test/fixtures.mjs';
import { acquireGpuLock, sayWaiting } from '../../../acceptance/gpu-lock.mjs';

const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '../..');
const results = path.join(repo, 'acceptance/results');
const core = await vrmxaCore();
const anims = JSON.parse(fs.readFileSync(path.join(root, 'animations.json'), 'utf8'));
const items = fs.readdirSync(path.join(root, 'items')).filter((f) => f.endsWith('.vrmxi')).sort();
const models = new Map(items.map((f) => [f, core.readZip(new Uint8Array(fs.readFileSync(path.join(root, 'items', f)))).find((e) => e.name === 'model.glb').data]));

const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#20242b">
<script type="importmap">{ "imports": {
  "three": "/node_modules/three/build/three.module.js", "three/addons/": "/node_modules/three/examples/jsm/",
  "@pixiv/three-vrm": "/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js",
  "@pixiv/three-vrm-animation": "/node_modules/@pixiv/three-vrm-animation/lib/three-vrm-animation.module.js" } }</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
const W = 220, H = 300;
const sheet = async (cells, cols, draw) => {
  const rows = Math.ceil(cells.length / cols);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const out = document.createElement('canvas'); out.width = cols * W; out.height = rows * H;
  const g = out.getContext('2d'); g.fillStyle = '#20242b'; g.fillRect(0, 0, out.width, out.height);
  for (let i = 0; i < cells.length; i++) {
    const { scene, camera } = await draw(cells[i]);
    renderer.render(scene, camera);
    const x = (i % cols) * W, y = Math.floor(i / cols) * H;
    g.drawImage(renderer.domElement, x, y);
    g.fillStyle = '#e8e8e8'; g.font = '13px -apple-system, Helvetica, sans-serif'; g.fillText(cells[i].label, x + 8, y + H - 10);
  }
  return out.toDataURL('image/png');
};
const lit = (scene) => { scene.background = new THREE.Color('#2b3038'); scene.add(new THREE.HemisphereLight('#ffffff', '#445', 2.2)); const d = new THREE.DirectionalLight('#ffffff', 2.5); d.position.set(1.5, 3, 2.5); scene.add(d); const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshStandardMaterial({ color: '#59606b' })); floor.rotation.x = -Math.PI / 2; scene.add(floor); };
const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p)); loader.register((p) => new VRMAnimationLoaderPlugin(p));
window.drawSet = async (clips) => {
  const vrm = (await loader.loadAsync('/files/spec.vrm')).userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  const scene = new THREE.Scene(); lit(scene); scene.add(vrm.scene);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 20); camera.position.set(1.6, 1.25, 3.4); camera.lookAt(0, 0.85, 0);
  const mixer = new THREE.AnimationMixer(vrm.scene);
  return sheet(clips, 8, async (c) => {
    const va = (await loader.loadAsync('/files/' + c.file)).userData.vrmAnimations[0];
    mixer.stopAllAction(); mixer.uncacheRoot(vrm.scene);
    const clip = createVRMAnimationClip(va, vrm);
    mixer.clipAction(clip).play(); mixer.setTime(clip.duration * c.at); vrm.update(0);
    return { scene, camera };
  });
};
window.drawItems = async (list) => sheet(list, 6, async (c) => {
  const gltf = await loader.loadAsync('/files/items/' + c.file);
  const scene = new THREE.Scene(); lit(scene); scene.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z, 0.12);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 50); camera.position.set(mid.x + r * 1.5, mid.y + r * 1.1, mid.z + r * 2.4); camera.lookAt(mid);
  return { scene, camera };
});
window.READY = true;
</script>`;

const files = new Map([['/', { type: 'text/html', data: Buffer.from(page) }], ['/files/spec.vrm', { type: 'application/octet-stream', data: fs.readFileSync(PATHS.spec) }]]);
for (const c of anims.clips) files.set(`/files/${c.file}`, { type: 'application/octet-stream', data: fs.readFileSync(path.join(root, c.file)) });
for (const [f, data] of models) files.set(`/files/items/${f}`, { type: 'model/gltf-binary', data: Buffer.from(data) });
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (files.has(p)) { const f = files.get(p); res.writeHead(200, { 'content-type': f.type }).end(f.data); return; }
  const file = path.join(repo, p);
  if (p.startsWith('/node_modules/') && file.startsWith(path.join(repo, 'node_modules')) && fs.existsSync(file) && fs.statSync(file).isFile()) { res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(file)); return; }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
await acquireGpuLock({ who: 'content/starter/tools/make-stills.mjs', onWait: sayWaiting('content/starter/tools/make-stills.mjs') });
const require = createRequire(path.join(repo, 'spike-determinism/web/package.json'));
let pw;
try { pw = require('playwright-core'); } catch { pw = createRequire(path.join(repo, '../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', (e) => errors.push(e.message));
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 60000 });
// each clip at a moment that shows it: a third of the way in, the middle of a one-shot's action
const at = (c) => (c.loops ? 0.3 : 0.5);
const set = await tab.evaluate((clips) => /** @type {any} */ (window).drawSet(clips), anims.clips.map((c) => ({ file: c.file, at: at(c), label: c.name })));
const pack = await tab.evaluate((list) => /** @type {any} */ (window).drawItems(list), items.map((f) => ({ file: f, label: f.replace('.vrmxi', '') })));
await browser.close(); server.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const png = (url) => Buffer.from(url.split(',')[1], 'base64');
fs.mkdirSync(results, { recursive: true });
fs.writeFileSync(path.join(results, 'm6-starter-set.png'), png(set));
fs.writeFileSync(path.join(results, 'm6-starter-items.png'), png(pack));
console.log('wrote acceptance/results/m6-starter-set.png and m6-starter-items.png');
