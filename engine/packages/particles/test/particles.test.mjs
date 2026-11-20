// M2 W4 (AB-T-0527): effect documents, the ParticleEmitter in a tree (steam, dust, sparks), determinism (the same
// particles every run; a stream that depends on the step alone), snapshot / restore mid-effect replaying identically,
// presentation emitters outside the hash, and the batch renderer's buffers filling.
// M4 W2 (AB-T-0574): the batch renderer comes from the host (WebGL's or three.quarks/webgpu's, or none headless), and
// the particles hash the same with each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { captureWorld, restoreWorld, worldHashes, hashValue } from '@vrmxg/snapshot';
import { installParticles, BUILTIN, checkEffect, atlasPixels, TILES } from '@vrmxg/particles';
import { BatchedRenderer as WebGLBatchedRenderer } from 'three.quarks';
import { BatchedRenderer as WebGPUBatchedRenderer } from 'three.quarks/webgpu';

installPortableMath();

function world(extra = [], seed = 5, BatchedRenderer = WebGLBatchedRenderer) {
  const tree = new SceneTree({ registry: m0Registry(), seed });
  const particles = installParticles(tree, { BatchedRenderer });
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'p', nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'cup', type: 'ParticleEmitter', parent: 'root', transform: { p: [0, 1, 0] }, props: { effect: 'steam' } },
    { id: 'feet', type: 'ParticleEmitter', parent: 'root', transform: { p: [1, 0, 0] }, props: { effect: 'dust' } },
    { id: 'hit', type: 'ParticleEmitter', parent: 'root', transform: { p: [-1, 1, 0] }, props: { effect: 'sparks' } },
    ...extra,
  ] });
  return { tree, particles };
}
const steps = (tree, n) => { for (let i = 0; i < n; i++) tree.step(); };
const hash = (tree) => hashValue(worldHashes(tree));

test('built-in effects are valid documents; bad ones are named; the atlas is drawn', () => {
  for (const [k, d] of Object.entries(BUILTIN)) assert.deepEqual(checkEffect(d), [], k);
  const p = checkEffect({ format: 'vrmxg-effect', systems: [{ shape: { type: 'torus' }, tile: 'nope', render: 'x', rate: 0, bursts: [{ count: 1.5 }] }] });
  for (const re of [/shape "torus"/, /tile "nope"/, /render "x"/, /burst count/]) assert.ok(p.some((m) => re.test(m)), `${re} in ${p.join('; ')}`);
  assert.match(checkEffect({ format: 'x', systems: [] }).join(), /not an effect document/);
  const a = atlasPixels();
  assert.equal(a.data.length, 512 * 256 * 4);
  assert.equal(Object.keys(TILES).length, 8);
});

test('emitters emit: steam rises, dust settles, sparks burst once a cycle and fall', () => {
  const { tree, particles } = world();
  steps(tree, 90);
  const [cup, feet, hit] = ['cup', 'feet', 'hit'].map((id) => /** @type {any} */ (tree.find(id)));
  assert.ok(cup.count > 10, `steam particles (${cup.count})`);
  assert.ok(feet.count > 3, `dust particles (${feet.count})`);
  const steam = cup.systems[0].particles.slice(0, cup.systems[0].particleNum);
  assert.ok(steam.every((p) => p.position.y >= 0.99), 'steam starts at the cup and goes up');
  assert.ok(steam.some((p) => p.position.y > 1.2), 'some of it has risen');
  assert.equal(particles.count(), cup.count + feet.count + hit.count);
  // sparks: the burst at the cycle start (1.5 s), so after 0.25 s of the second cycle they are live and falling
  steps(tree, 105);
  const sp = hit.systems[0];
  assert.ok(sp.particleNum > 20, `sparks burst (${sp.particleNum})`);
  assert.ok(sp.particles.slice(0, sp.particleNum).some((p) => p.velocity.y < 0), 'sparks fall');
});

test('the same particles every run; the seed and the emitter change them', () => {
  const runs = [world(), world()].map(({ tree }) => { steps(tree, 120); return hash(tree); });
  assert.equal(runs[0], runs[1]);
  const other = world([], 6); steps(other.tree, 120);
  assert.notEqual(hash(other.tree), runs[0], 'another scene seed, other particles');
});

test('a snapshot mid-effect restores and replays identically (particles, emission state, bursts)', () => {
  const a = world();
  steps(a.tree, 100);
  const snap = captureWorld(a.tree);
  steps(a.tree, 150);
  const b = world();
  restoreWorld(b.tree, snap);
  assert.equal(/** @type {any} */ (b.tree.find('cup')).count, /** @type {any} */ (captureWorld(b.tree).nodes.cup.systems[0].particles.length));
  steps(b.tree, 150);
  assert.equal(hash(b.tree), hash(a.tree));
  // and at step 0
  const c = world(), s0 = captureWorld(c.tree);
  steps(c.tree, 40); restoreWorld(c.tree, s0); steps(c.tree, 250);
  assert.equal(hash(c.tree), hash(a.tree), 'restored at step 0');
});

test('stop ends emission and a non-looping effect signals finished; presentation emitters stay out of the hash', () => {
  const once = { format: 'vrmxg-effect', version: 1, name: 'pop', systems: [{ looping: false, duration: 0.2, life: [0.3, 0.3], speed: [1, 1], rate: 0, bursts: [{ time: 0, count: 5 }], tile: 'dot' }] };
  const { tree, particles } = world([{ id: 'deco', type: 'ParticleEmitter', parent: 'root', props: { effect: 'steam', mode: 'presentation' } }]);
  particles.effects.set('pop.json', once);
  tree.add({ id: 'pop', type: 'ParticleEmitter', parent: 'root', props: { effect: 'pop.json' } });
  let finished = null;
  tree.listen(tree.find('pop'), 'finished', () => { finished = tree.clock.step; });
  steps(tree, 60);
  assert.ok(finished !== null && finished < 40, `finished after its burst died (${finished})`);
  const h = hash(tree);
  particles.present(1 / 30); particles.present(1 / 30);
  assert.ok(/** @type {any} */ (tree.find('deco')).count > 0, 'the presentation emitter runs with frames');
  assert.equal(hash(tree), h, 'and changes no hash');
  const cup = /** @type {any} */ (tree.find('cup'));
  cup.stop(); steps(tree, 200);
  assert.equal(cup.count, 0, 'stopped steam dies out');
  assert.ok(particles.batch.batches.length >= 2, `batched by material and render mode (${particles.batch.batches.length})`);
});

test('a fresh world restored mid-effect steps each emitter exactly as the run did (generators know their memory slots before any spawn)', () => {
  for (const effect of ['steam', 'dust', 'sparks']) {
    const one = () => { const tree = new SceneTree({ registry: m0Registry(), seed: 1 }); installParticles(tree); tree.instantiate({ format: 'vrmxs', version: 1, id: 'p', nodes: [{ id: 'root', type: 'Node3D' }, { id: 'e', type: 'ParticleEmitter', parent: 'root', props: { effect } }] }); return tree; };
    const a = one(); steps(a, 180);
    const b = one(); restoreWorld(b, captureWorld(a));
    for (let k = 0; k < 120; k++) { a.step(); b.step(); assert.deepEqual(b.find('e').getState(), a.find('e').getState(), `${effect}, step ${k + 1} after the restore`); }
  }
});

test('the batch renderer is the host\'s: none headless, WebGL\'s or WebGPU\'s, swapped mid-run; the particles hash the same with each', () => {
  const run = (R, swap) => {
    const { tree, particles } = world([], 5, R);
    const hashes = [];
    for (let k = 1; k <= 150; k++) {
      tree.step();
      if (k === 60 && swap) particles.attachHost({ particleRenderer: swap }); // a host on the other backend took the tree
      particles.present(1 / 60);
      if (k % 30 === 0) hashes.push(hash(tree));
    }
    return { hashes, particles, tree };
  };
  const none = run(null), gl = run(WebGLBatchedRenderer), gpu = run(WebGPUBatchedRenderer), moved = run(WebGLBatchedRenderer, WebGPUBatchedRenderer);
  assert.equal(none.particles.batch, null, 'headless: nothing draws, no batch');
  for (const r of [gl, gpu, moved]) assert.deepEqual(r.hashes, none.hashes, 'the same particles with any batch renderer, or none');
  assert.ok(gpu.particles.batch instanceof WebGPUBatchedRenderer && gpu.particles.batch.batches.length >= 2, 'WebGPU\'s batches');
  const b = moved.particles.batch;
  assert.ok(b instanceof WebGPUBatchedRenderer, 'the swap made a WebGPU batch');
  assert.equal(b.parent, moved.tree.root.object3d, 'in the tree, where the old one was');
  assert.equal(moved.tree.root.object3d.children.filter((o) => o.name === 'particles').length, 1, 'and the old one is gone');
  const systems = moved.particles.emitters.flatMap((e) => e.systems);
  assert.ok(systems.every((s) => s._renderer === b), 'every system tells the new batch when its look changes');
  assert.equal(b.batches.reduce((n, x) => n + x.systems.size, 0), systems.length, 'every system is in one of its batches');
  const same = moved.particles.batch;
  moved.particles.attachHost({ particleRenderer: WebGPUBatchedRenderer });
  assert.equal(moved.particles.batch, same, 'a host on the same backend keeps the batch');
  moved.particles.attachHost({});
  assert.equal(moved.particles.batch, null, 'a host that can\'t draw particles (a stand-in) drops it');
  assert.ok(systems.every((s) => s._renderer === null));
});
