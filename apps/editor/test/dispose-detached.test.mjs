// AB-T-0626: what leaves a world's root while it runs is disposed with the world. A node removed during play, an item
// taken (its model), a body the closet replaced and a wearable taken off are out of the root's graph, so the walk
// under the root never reached them; the tree hands them over (`tree.detached`) and disposeWorld walks those too.
// The first test runs anywhere; the second plays Mira's closet (it needs the fixtures the closet's own tests need).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, SkinnedMesh, BoxGeometry, BufferAttribute, MeshStandardMaterial, Texture } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { disposeWorld } from '../src/dispose.js';

installPortableMath();

/** Every geometry, material and texture under these objects, each with a flag its dispose event sets. */
function resourcesOf(objects) {
  const out = new Map();
  const mark = (x) => { if (x && !out.has(x)) { out.set(x, false); x.addEventListener('dispose', () => out.set(x, true)); } };
  for (const o of objects) o.traverse((m) => {
    mark(m.geometry);
    for (const mat of [m.material].flat().filter(Boolean)) { mark(mat); for (const v of Object.values(mat)) if (v?.isTexture) mark(v); }
  });
  return out;
}
const undisposed = (res) => [...res].filter(([, done]) => !done).map(([x]) => `${x.type ?? x.constructor.name} ${x.name ?? ''}`.trim());

test('a node removed during play and a body handed over as detached are disposed with the world, skinned buffers detached', () => {
  // a prop that draws a mesh (a model's stand-in) and a body (a character's stand-in) made per world, as a library would
  class Prop extends Behaviour { ready() { this.node.object3d.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: new Texture() }))); } }
  const tree = new SceneTree({ registry: m0Registry(), behaviours: new Map([['prop', Prop]]), seed: 1 });
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'd', nodes: [
    { id: 'root', type: 'Node3D' }, { id: 'cup', type: 'Node3D', parent: 'root', behaviours: [{ use: 'prop' }] },
    { id: 'saucer', type: 'Node3D', parent: 'cup', behaviours: [{ use: 'prop' }] }, { id: 'table', type: 'Node3D', parent: 'root', behaviours: [{ use: 'prop' }] },
  ] });
  tree.run(3);
  const cup = tree.find('cup').object3d, table = tree.find('table').object3d;
  const geo = new BoxGeometry();
  geo.morphAttributes.position = [new BufferAttribute(new Float32Array(72), 3)];
  const oldBody = new SkinnedMesh(geo, new MeshStandardMaterial());
  table.add(oldBody);
  const res = resourcesOf([cup, oldBody]), kept = resourcesOf([table]);
  tree.remove('cup'); // an item taken, a prop destroyed: the cup and the saucer under it leave the root
  table.remove(oldBody); tree.detach(oldBody); // a body replaced
  tree.run(3);
  assert.ok(tree.detached.has(cup) && tree.detached.has(oldBody));
  assert.equal(undisposed(res).length, res.size, 'nothing is disposed while the world runs');

  const out = disposeWorld({ tree });
  assert.deepEqual(undisposed(res), [], 'every geometry, material and texture the cup, the saucer and the old body held');
  assert.deepEqual(undisposed(kept), [], 'and what is still under the root, as before');
  assert.equal(geo.getAttribute('position').array.length, 0, 'the old body\'s vertex data detached');
  assert.equal(geo.morphAttributes.position[0].array.length, 0, 'and its morph targets');
  assert.deepEqual([out.geometries, out.materials, out.textures], [4, 4, 3], 'two props removed, one kept, one body: each once');
  assert.equal(tree.detached.size, 0, 'handed over and let go');
});

// The closet's own fixtures: Mira (a top worn, a sword stowed), the sword pickup. Skips where they aren't.
const { SPEC, fixture, specChecker } = await import('../../../engine/packages/item/test/fixtures.mjs');
const { available, vrmxaCore, read, testAnimations, PATHS } = await import('../../../engine/packages/character/test/fixtures.mjs');
const OK = SPEC && available('core', 'coreAnim', 'spec', 'full');
const SKIP = OK ? false : 'needs VRMXA_Specification (fixtures-vrmxi/), spec.vrm and vrmxa-core beside this repository';

test('a play world that takes an item, swaps a body and takes a wearable off: every object that left disposes with the world', { skip: SKIP }, async () => {
  const [{ loadRapier, installPhysics }, { installInput, VirtualDevice }, { installCharacters }, { installItems }, { installInteraction }, { installCloset }] = await Promise.all(
    ['@vrmxg/physics', '@vrmxg/input', '@vrmxg/character', '@vrmxg/item', '@vrmxg/interact', '@vrmxg/closet'].map((m) => import(m)));
  const core = await vrmxaCore(), closetLib = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const anims = await testAnimations(core, { actions: true });
  anims.doc.sets.find((s) => s.id === 'sword').requires = ['held:sword'];
  const files = { 'items/sword-pickup.vrmxi': fixture('items/sword-pickup.vrmxi'), 'mira.vrmxa': read('full') };
  const TOP = 'b11a6647-7168-4dea-916b-70eccf5182ae', FIXTURE_SWORD = '2de0bbfe-3b3f-49db-a82f-1964608c2927';
  const tree = new SceneTree({ registry: m0Registry(), seed: 4 });
  const input = installInput(tree);
  installPhysics(tree, await loadRapier());
  const items = installItems(tree, { resolve: (ref) => files[ref], vrmxaCore: core, check: await specChecker(), stubTextures: true });
  const chars = installCharacters(tree, { resolve: (ref) => files[ref], vrmxaCore: core, stubTextures: true });
  chars.setAnimations('mira.vrmxa', anims);
  installInteraction(tree);
  const closet = installCloset(tree, { vrmxaCore: core, closet: closetLib, spec: read('spec'), latency: 2, stubTextures: true, now: () => performance.now() });
  const doc = { format: 'vrmxs', version: 1, id: 'closet',
    assets: [{ id: 'sword', type: 'vrmxi', ref: 'items/sword-pickup.vrmxi' }, { id: 'mira', type: 'vrmxa', ref: 'mira.vrmxa' }],
    nodes: [
      { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } },
      { id: 'sword', type: 'Item', asset: 'sword', transform: { p: [0, 0, 1] } },
      { id: 'mira', type: 'Character', asset: 'mira', behaviours: [{ use: 'player' }] },
    ] };
  await items.prepare(doc); await chars.prepare(doc); await closet.prepare(doc);
  tree.instantiate(doc);
  await closet.showWorn();
  const mira = /** @type {any} */ (tree.find('mira')), dev = input.addDevice(new VirtualDevice());
  const run = async (n) => { const until = tree.clock.step + n; while (tree.clock.step < until) if (!tree.step()) await tree.settle(); await tree.settle(); };

  // what is about to leave: the pickup (its node and model), the body worn now, the stowed sword's hung copy
  const pickup = tree.find('sword'), body = mira.vrm.scene;
  const hungSword = []; body.traverse((o) => { if (o.userData.presentation && o.userData.item === FIXTURE_SWORD) hungSword.push(o); });
  assert.ok(pickup.model && hungSword.length === 1, 'the pickup has a model and the stowed sword hangs on the body');
  const res = resourcesOf([pickup.object3d, pickup.model, body]);
  const skinned = []; body.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o.geometry); });

  mira.placeAt(0, 0, 0.3, 0); await run(3);
  dev.press('KeyE'); tree.step(); dev.release('KeyE'); await run(3);
  assert.equal(tree.find('sword'), null, 'the pickup left the world');
  closet.unequip(mira, FIXTURE_SWORD); await run(2); // the stowed sword taken off: its hung copy comes down
  closet.unequip(mira, TOP); await run(6); // the top taken off: a new body
  assert.notEqual(mira.vrm.scene, body, 'a new body');
  for (const o of [pickup.object3d, pickup.model, body, hungSword[0]]) assert.ok(tree.detached.has(o), `${o.name || o.type} handed over as detached`);
  assert.ok(undisposed(res).length > 0, 'nothing left disposed before the world goes');

  disposeWorld({ tree });
  assert.deepEqual(undisposed(res), [], 'every geometry, material and texture the pickup, the old body and the sword held');
  assert.ok(skinned.length > 0 && skinned.every((g) => g.getAttribute('position').array.length === 0), `the old body's ${skinned.length} skinned buffers detached`);
});
