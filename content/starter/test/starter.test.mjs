// M6 W4 (AB-T-0647): the starter content works in the engine. A VRMXA (the sample's Mira) cast with the default set
// plays every slot of every set; every item, used as its type says, does what it should (the playground's ?mode=starter
// runs the same code in a browser: apps/playground/src/starter-check.js). Skips without vrmxa-core (it reads
// the character and the items) beside the repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { available, vrmxaCore } from '../../../engine/packages/character/test/fixtures.mjs';
import { starterAnimationsCheck, starterItemsCheck } from '../../../apps/playground/src/starter-check.js';
import { ITEMS } from '../tools/starter-items.mjs';

installPortableMath();
const SKIP = available('core', 'coreAnim') ? false : 'needs vrmxa-core beside this repository';
const here = import.meta.dirname;
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(here, '../../sample', ref)));
const starterBytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(here, '..', ref)));
const opts = async () => ({ R: await loadRapier(), bytes, starterBytes, vrmxaCore: await vrmxaCore() });

test('Mira cast with the starter set plays every slot of every set, the starter\'s clip each time', { skip: SKIP }, async () => {
  const r = await starterAnimationsCheck(await opts());
  assert.deepEqual(r.failures, []);
  assert.ok(r.ok);
  assert.ok(r.slots.length >= 35, `${r.slots.length} slots`);
  for (const s of r.slots) assert.ok(s.finite && s.moved > 0.05, `${s.set}.${s.slot} moved ${s.moved}`);
  const at = (set, slot) => r.slots.find((s) => s.set === set && s.slot === slot);
  assert.deepEqual(at('default', 'jump').states.slice(0, 3), ['jump', 'fall', 'land'], 'a jump goes up, falls and lands');
  assert.equal(at('sword', 'idle').picked, 'idle-sword', 'a sword in hand changes idle (VRMXA §8.3)');
  assert.equal(at('chest', 'use').picked, 'chestOpen', 'opening a chest plays the chest\'s own clip (VRMXI §8.1)');
});

test('every starter item does what its type says: open, press, sit, take; props stand still; the spawn point has its node', { skip: SKIP }, async () => {
  const r = await starterItemsCheck(await opts());
  assert.deepEqual(r.failures, []);
  assert.equal(r.items.length, ITEMS.length);
  const by = Object.fromEntries(r.items.map((i) => [i.file, i]));
  assert.ok(by['items/door.vrmxi'].turned > 1.4, 'the door swings open');
  assert.ok(by['items/chest.vrmxi'].turned > 1.4, 'the chest\'s lid lifts');
  assert.ok(by['items/lever.vrmxi'].turned > 1.4, 'the lever is thrown');
  assert.equal(by['items/button.vrmxi'].state, 'on');
  for (const f of ['items/chair.vrmxi', 'items/bench.vrmxi']) assert.equal(by[f].slot, 'sitIdle', f);
  for (const f of ['items/coin.vrmxi', 'items/key.vrmxi', 'items/mug.vrmxi', 'items/sword.vrmxi', 'items/axe.vrmxi', 'items/hammer.vrmxi']) assert.ok(by[f].gone && by[f].inventory.length === 1, f);
});

test('the item check is the same twice (simulation only, no clock)', { skip: SKIP }, async () => {
  const o = await opts();
  const a = await starterItemsCheck(o), b = await starterItemsCheck(o);
  assert.deepEqual(a, b);
});
