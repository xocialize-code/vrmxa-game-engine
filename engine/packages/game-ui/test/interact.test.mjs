// The HUD on a real character (M5 W3): the prompt for what is in reach comes from @vrmxg/interact, and what the player
// carries from its inventory, read through HudBinding from the world being played. A spec.vrm character and the VRMXI
// specification's key fixture; skips without VRMXA_Specification and vrmxa-core beside this repository.
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
import { HudBinding } from '../src/index.js';
import { SPEC, fixture, specChecker } from '../../item/test/fixtures.mjs';
import { available, vrmxaCore, read, testAnimations } from '../../character/test/fixtures.mjs';

installPortableMath();
const OK = SPEC && available('core', 'coreAnim', 'spec');
const SKIP = OK ? false : 'needs VRMXA_Specification (fixtures-vrmxi/), spec.vrm and vrmxa-core beside this repository';

/** What HudBinding reads of a session, for one world without the game's rules (it reads the world's services). */
const session = (tree) => ({ tree, view: () => null, version: '0', held: null, on: () => () => {} });

test('the HUD shows the prompt for the key in reach with the keys that take it, then the key carried', { skip: SKIP }, async () => {
  const R = await loadRapier(), core = await vrmxaCore();
  const tree = new SceneTree({ registry: m0Registry(), seed: 4 });
  const input = installInput(tree);
  installPhysics(tree, R);
  const items = installItems(tree, { resolve: () => fixture('items/key-pickup.vrmxi'), vrmxaCore: core, check: await specChecker(), stubTextures: true });
  const chars = installCharacters(tree, { resolve: () => read('spec'), stubTextures: true });
  chars.setAnimations('spec.vrm', await testAnimations(core, { actions: true }));
  installInteraction(tree);
  const doc = { format: 'vrmxs', version: 1, id: 'hud', assets: [{ id: 'key', type: 'vrmxi', ref: 'items/key-pickup.vrmxi' }, { id: 'mira', type: 'vrm', ref: 'spec.vrm' }], nodes: [
    { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } },
    { id: 'key', type: 'Item', asset: 'key', transform: { p: [-4, 0, 0] } },
    { id: 'mira', type: 'Character', asset: 'mira', behaviours: [{ use: 'player' }] },
  ] };
  await items.prepare(doc); await chars.prepare(doc);
  tree.instantiate(doc);
  const dev = input.addDevice(new VirtualDevice());
  const hud = new HudBinding(session(tree));
  assert.equal(hud.read().prompt, null, 'nothing in reach');
  tree.find('mira').placeAt(-3.2, 0, 0, -Math.PI / 2); tree.run(3);
  const m = hud.read();
  assert.equal(m.prompt.actor, 'mira');
  assert.equal(m.prompt.verb, 'take');
  assert.deepEqual(m.prompt.keys, { keyboard: 'E', gamepad: 'Gamepad X' });
  assert.match(m.prompt.label, /^Press E or Gamepad X to /);
  assert.deepEqual(m.carrying, []);
  // rebound: the prompt says the new key
  input.rebind('interact', [{ key: 'KeyF' }, { gamepadButton: 2 }]);
  assert.equal(hud.sync().prompt.keys.keyboard, 'F', 'a rebinding redraws the prompt');
  dev.press('KeyF'); tree.step(); dev.release('KeyF'); tree.step();
  const after = hud.read();
  assert.equal(after.prompt, null, 'taken: nothing in reach');
  assert.equal(after.carrying.length, 1);
  assert.equal(after.carrying[0].id, tree.services.get('inventory').list('mira')[0].id);
});
