// W4 (AB-T-0516): the closet at run time. Mira is vrmxa-core's full fixture (a top worn, a sword pinned and stowed);
// the sword pickup is the specification's VRMXI fixture (a takeable item embedding "Short sword", held). Skips without
// VRMXA_Specification (with the VRMXI draft), spec.vrm and vrmxa-core beside this repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installInput, VirtualDevice } from '@vrmxg/input';
import { installCharacters } from '@vrmxg/character';
import { installItems } from '@vrmxg/item';
import { installInteraction } from '@vrmxg/interact';
import { captureWorld, restoreWorld, recordRun, recordRunAsync, compareRuns } from '@vrmxg/snapshot';
import { installCloset } from '../src/index.js';
import { SPEC, fixture, specChecker } from '../../item/test/fixtures.mjs';
import { available, vrmxaCore, read, testAnimations, PATHS } from '../../character/test/fixtures.mjs';

installPortableMath();
const OK = SPEC && available('core', 'coreAnim', 'spec', 'full');
const SKIP = OK ? false : 'needs VRMXA_Specification (fixtures-vrmxi/), spec.vrm and vrmxa-core beside this repository';
const R = OK ? await loadRapier() : null;
const core = OK ? await vrmxaCore() : null;
const closetLib = OK ? await import(PATHS.core.replace(/index\.js$/, 'closet/index.js')) : null;
const check = OK ? await specChecker() : null;
const SWORD = 'bd8b3324-19a4-4e23-aac2-edb16bbaba16', FIXTURE_SWORD = '2de0bbfe-3b3f-49db-a82f-1964608c2927', TOP = 'b11a6647-7168-4dea-916b-70eccf5182ae';
// the test sets, with the sword set asking for a sword in hand (VRMXA §8.3: an item's state's tags)
const anims = OK ? await testAnimations(core, { actions: true }) : null;
if (anims) anims.doc.sets.find((s) => s.id === 'sword').requires = ['held:sword'];
const files = OK ? { 'items/sword-pickup.vrmxi': fixture('items/sword-pickup.vrmxi'), 'mira.vrmxa': read('full') } : {};
const spec = OK ? read('spec') : null;

const scene = () => ({
  format: 'vrmxs', version: 1, id: 'closet',
  assets: [{ id: 'sword', type: 'vrmxi', ref: 'items/sword-pickup.vrmxi' }, { id: 'mira', type: 'vrmxa', ref: 'mira.vrmxa' }],
  nodes: [
    { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } },
    { id: 'sword', type: 'Item', asset: 'sword', transform: { p: [0, 0, 1] } },
    { id: 'mira', type: 'Character', asset: 'mira', behaviours: [{ use: 'player' }] },
  ],
});

async function world({ latency = 30 } = {}) {
  const tree = new SceneTree({ registry: m0Registry(), seed: 4 });
  const input = installInput(tree);
  installPhysics(tree, R);
  const items = installItems(tree, { resolve: (ref) => files[ref], vrmxaCore: core, check, stubTextures: true });
  const chars = installCharacters(tree, { resolve: (ref) => files[ref], vrmxaCore: core, stubTextures: true });
  chars.setAnimations('mira.vrmxa', anims);
  const { interact } = installInteraction(tree);
  const closet = installCloset(tree, { vrmxaCore: core, closet: closetLib, spec, latency, stubTextures: true, now: () => performance.now() });
  const doc = scene();
  await items.prepare(doc); await chars.prepare(doc); await closet.prepare(doc);
  tree.instantiate(doc);
  await closet.showWorn();
  return { tree, interact, closet, dev: input.addDevice(new VirtualDevice()), mira: tree.find('mira') };
}
const hung = (w) => { const out = []; w.mira.vrm.scene.traverse((o) => { if (o.userData.presentation && o.userData.item) out.push([o.userData.item, o.userData.bone]); }); return out.sort(); };
const drawnSword = (w) => { const v = []; w.mira.vrm.scene.traverse((o) => { if (o.userData.vrmxaFit?.item === FIXTURE_SWORD && o.isMesh) v.push(o.visible); }); return v; };

test('taking the sword pickup puts the Short sword in Mira\'s hand on that step, changes her idle, and fills her closet', { skip: SKIP }, async () => {
  const w = await world();
  assert.deepEqual(w.closet.wornBy('mira').map((x) => [x.id, x.state]), [[TOP, null], [FIXTURE_SWORD, 'stowed']]);
  assert.notEqual(w.mira.graph.slots.idle.set.id, 'sword', 'a stowed sword keeps the default idle');
  w.mira.placeAt(0, 0, 0.3, 0); w.tree.run(3);
  assert.deepEqual(w.interact.prompts().map((p) => p.verb), ['take']);
  const before = w.tree.clock.step, name = w.tree.find('sword').manifest.name;
  w.dev.press('KeyE'); w.tree.step(); w.dev.release('KeyE');
  const t0 = performance.now(); w.tree.step(); const onStep = performance.now() - t0; // the step the take happens on (interact reads the press a step late)
  assert.equal(w.tree.find('sword'), null, 'the pickup leaves the world');
  assert.deepEqual(w.closet.wornBy('mira').find((x) => x.id === SWORD), { id: SWORD, slot: 'accessory', state: 'held', pinned: true, tags: ['weapon:sword', 'held:sword'], from: 'sword' });
  assert.ok(w.mira.equipped.has('held:sword') && w.mira.equipped.has('stowed:sword'), 'both swords\' tags: an accessory displaces nothing');
  assert.equal(w.mira.graph.slots.idle.set.id, 'sword', 'the sword set\'s idle, from the step of the take');
  assert.equal(w.closet.jobs.length, 0, 'a pinned item needs no redraw');
  assert.ok(w.tree.clock.step - before <= 2);
  await w.tree.settle();
  const c = w.closet.closetOf('mira');
  assert.ok(c.items.some((x) => x.id === SWORD && x.source === name), 'the wearable is in her closet, its source the item');
  assert.ok(c.worn.items.includes(SWORD) && c.worn.states[SWORD] === undefined, 'worn, in its default state (held)');
  assert.deepEqual(hung(w), [[FIXTURE_SWORD, 'upperChest'], [SWORD, 'rightHand']].sort(), 'its model hangs on the right hand; the stowed one stays on the chest');
  const p = w.closet.timings.find((t) => t.op === 'pinned');
  console.log(`  take (pinned): on the step ${(onStep).toFixed(3)} ms; off the step (add, put on) ${p.ms.toFixed(0)} ms`);
});

test('moving the pinned sword between its states moves its model between bones; taking it off removes it', { skip: SKIP }, async () => {
  const w = await world();
  assert.equal(drawnSword(w).length, 0, 'the fixture\'s avatar.vrm predates its closet: the sword isn\'t drawn in');
  assert.deepEqual(hung(w), [[FIXTURE_SWORD, 'upperChest']], 'so a copy hangs on its stowed bone');
  w.closet.setItemState(w.mira, FIXTURE_SWORD, 'held');
  assert.equal(w.mira.graph.slots.idle.set.id, 'sword', 'held: the sword idle, on this step');
  await w.tree.settle();
  assert.deepEqual(hung(w), [[FIXTURE_SWORD, 'rightHand']]);
  w.closet.setItemState(w.mira, FIXTURE_SWORD, 'stowed');
  await w.tree.settle();
  assert.deepEqual(hung(w), [[FIXTURE_SWORD, 'upperChest']]);
  assert.notEqual(w.mira.graph.slots.idle.set.id, 'sword');
  w.closet.unequip(w.mira, FIXTURE_SWORD);
  await w.tree.settle();
  assert.deepEqual(hung(w), []);
  assert.ok(!w.mira.equipped.has('weapon:sword'));
  assert.deepEqual(w.closet.closetOf('mira').worn.items, [TOP]);
  // the Adventurer outfit (top, sword stowed) puts the sword back: pinned only, so on this step
  const outfit = w.closet.closetOf('mira').outfits[0];
  assert.equal(w.closet.applyOutfit(w.mira, outfit.id).at, w.tree.clock.step);
  assert.ok(w.mira.equipped.has('stowed:sword') && w.closet.jobs.length === 0);
  await w.tree.settle();
  assert.deepEqual(hung(w), [[FIXTURE_SWORD, 'upperChest']]);
  assert.equal(w.closet.closetOf('mira').worn.outfit, outfit.id);
});

test('taking off the top swaps the body on exactly the scheduled step, holding it until the redraw is ready', { skip: SKIP }, async () => {
  const w = await world({ latency: 2 });
  const dressed = [];
  w.mira.on('dressed', (p) => dressed.push({ step: w.tree.clock.step, worn: p.worn }));
  const body = w.mira.vrm;
  w.tree.run(5);
  w.closet.unequip(w.mira, TOP);
  const at = w.tree.clock.step + 2;
  assert.ok(w.mira.equipped.has('top:shell'), 'the look (and its tags) change with the swap, not before');
  let held = 0;
  while (w.tree.clock.step < at + 3) { if (!w.tree.step()) { held++; await w.tree.settle(); } }
  assert.ok(held >= 1, 'a two-step latency is shorter than a redraw: the swap step was held');
  assert.deepEqual(dressed, [{ step: at, worn: [FIXTURE_SWORD] }]);
  assert.notEqual(w.mira.vrm, body, 'a new body');
  assert.ok(!w.mira.equipped.has('top:shell') && w.mira.equipped.has('stowed:sword'));
  assert.deepEqual(w.closet.closetOf('mira').worn.items, [FIXTURE_SWORD]);
  await w.tree.settle();
  assert.ok(drawnSword(w).length && drawnSword(w).every(Boolean), 'the redrawn body has the stowed sword drawn in, shown');
  assert.deepEqual(hung(w), [], 'so no copy hangs');
  // the Adventurer outfit puts the top back on: a look change again, swapped `latency` steps on
  const due = w.closet.applyOutfit(w.mira, w.closet.closetOf('mira').outfits[0].id).at;
  assert.equal(due, w.tree.clock.step + 2);
  while (w.tree.clock.step <= due) { if (!w.tree.step()) await w.tree.settle(); }
  assert.ok(w.mira.equipped.has('top:shell') && dressed.at(-1).step === due);
  const r = w.closet.timings.find((t) => t.op === 'redraw');
  console.log(`  redraw (take off, avatar.vrm drawn and parsed): ${r.ms.toFixed(0)} ms`);
});

test('a run that takes the sword and takes off the top is identical twice; a snapshot after the take restores', { skip: SKIP }, async () => {
  const script = (w) => (step) => {
    if (step === 3) w.mira.placeAt(0, 0, 0.3, 0);
    if (step === 8) w.dev.press('KeyE'); if (step === 10) w.dev.release('KeyE');   // take the sword
    if (step === 60) w.dev.press('KeyW'); if (step === 90) w.dev.release('KeyW');
  };
  const A = await world(), B = await world();
  const ra = recordRun(A.tree, 120, { onStep: script(A) }), rb = recordRun(B.tree, 120, { onStep: script(B) });
  assert.equal(compareRuns(ra, rb), null);
  assert.ok(A.closet.wornBy('mira').some((x) => x.id === SWORD));
  // snapshot at 40: sword in hand
  const C = await world();
  recordRun(C.tree, 40, { onStep: script(C) });
  await C.tree.settle();
  const snap = captureWorld(C.tree);
  const rest = recordRun(C.tree, 80, { onStep: script(C) });
  const D = await world();
  restoreWorld(D.tree, snap);
  assert.equal(D.tree.find('sword'), null);
  assert.ok(D.mira.equipped.has('held:sword'));
  assert.equal(compareRuns(rest, recordRun(D.tree, 80, { onStep: script(D) })), null);
  await D.tree.settle();
  assert.deepEqual(hung(D).map((h) => h[0]), [FIXTURE_SWORD, SWORD].sort(), 'presentation follows the restored closet');

  // a look change lands on the same step in both runs whatever the redraw's time
  const E = await world(), F = await world();
  const off = (w) => (step) => { if (step === 20) w.closet.unequip(w.mira, TOP); };
  const re = await recordRunAsync(E.tree, 70, { onStep: off(E) });
  await new Promise((r) => setTimeout(r, 30)); // F's redraw starts at another moment of wall time
  const rf = await recordRunAsync(F.tree, 70, { onStep: off(F) });
  assert.equal(compareRuns(re, rf), null);
  assert.throws(() => restoreWorld(E.tree, snap), /different look/, 'a snapshot from before the redraw can\'t restore onto the redrawn body');
});
