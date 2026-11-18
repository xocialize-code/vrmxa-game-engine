// Step cost of N characters (VRoid-class: vroid10, 106 spring joints) walking circles on a floor, with
// physics and the kinematic controller: the full tree.step(). 600 steps after a 120-step warm-up, for 1 and
// 20 characters. Sets window.__result / READY for the WKWebView harness.
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';

installPortableMath();
const R = await loadRapier();
const now = () => performance.now(); // timing only
const get = async (p) => new Uint8Array(await (await fetch(p)).arrayBuffer());
const vrm = await get('models/vroid10.vrm');
const doc = await (await fetch('models/animations.json')).json();
const clips = new Map();
for (const c of doc.clips) clips.set(c.sha256, await get(`models/clips/${c.sha256}.vrma`));

// Each character walks a circle of 2 m radius at 1.4 m/s, phase-shifted; a pure function of the step.
class Circle extends Behaviour {
  physicsProcess() {
    const k = this.tree.clock.step, w = 1.4 / 2, a = k / 60 * w + this.params.phase;
    this.node.input.move = [Math.cos(a) * 1.4, -Math.sin(a) * 1.4];
  }
}

async function build(n) {
  const tree = new SceneTree({ registry: m0Registry(), behaviours: new Map([['circle', Circle]]) });
  installPhysics(tree, R);
  const lib = installCharacters(tree, { resolve: () => vrm, stubTextures: true });
  lib.setAnimations('vroid10.vrm', { doc, clips });
  const nodes = [{ id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [60, 0.2, 60] } }];
  for (let i = 0; i < n; i++) nodes.push({ id: `c${i}`, type: 'Character', asset: 'vroid10.vrm', transform: { p: [(i % 5) * 5 - 10, 0, Math.floor(i / 5) * 5 - 10] }, behaviours: [{ use: 'circle', phase: i * 0.7 }] });
  const scene = { format: 'vrmxs', version: 1, id: 'bench', nodes };
  await lib.prepare(scene);
  tree.instantiate(scene);
  return tree;
}

async function time(n) {
  const tree = await build(n);
  for (let i = 0; i < 120; i++) tree.step();
  const s = [];
  for (let i = 0; i < 600; i++) { const t0 = now(); tree.step(); s.push(now() - t0); }
  s.sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { characters: n, mean: +mean.toFixed(3), p50: +s[300].toFixed(3), p95: +s[570].toFixed(3), perCharacter: +(mean / n).toFixed(4), springJoints: tree.find('c0').vrm.springBoneManager.joints.size };
}

const one = await time(1), twenty = await time(20), twentyAgain = await time(20);
const result = { one, twenty, twentyAgain, ua: navigator.userAgent, isolated: self.crossOriginIsolated };
window.__result = result; window.__errors = []; window.READY = true;
document.getElementById('out').textContent = JSON.stringify(result, null, 1);
