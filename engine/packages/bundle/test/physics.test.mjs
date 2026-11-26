// M6 W3 (AB-T-0646): a game's collision layers in game.json ("physics"), which the editor's project settings write and
// every world of the game is built with (@vrmxg/physics's Layers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGame, checkPhysics, MAX_LAYERS } from '../src/index.js';
import { Layers } from '@vrmxg/physics';

const base = { format: 'vrmxg-game', version: 1, id: 'g', entry: 'a.vrmxs' };

test('collision layers: kept in the layers\' order, after the game\'s other keys; none, none in the manifest', () => {
  const g = checkGame({ ...base, release: '1.0.0', physics: { layers: ['default', 'player', 'trigger'], collides: { trigger: ['player'], player: ['trigger', 'default'] } } });
  assert.deepEqual(g.physics, { layers: ['default', 'player', 'trigger'], collides: { player: ['default', 'trigger'], trigger: ['player'] } });
  assert.equal(Object.keys(g).at(-1), 'physics');
  assert.equal('physics' in checkGame(base), false, 'earlier builds stay the same bytes');
  assert.deepEqual(checkPhysics({ layers: ['default'], collides: {} }), { layers: ['default'] }, 'an empty collides is none');
  // what physics makes of it: the groups a world's colliders get
  const l = new Layers(g.physics);
  assert.equal(l.groups('trigger') & 0xffff, l.bit('player'));
});

test('collision layers: what physics would refuse is refused here, by name, before a build is written', () => {
  const refused = (physics, re) => assert.throws(() => checkGame({ ...base, physics }), re);
  refused([], /"physics" is/);
  refused({ layers: [] }, /1 to 15 names/);
  refused({ layers: Array.from({ length: MAX_LAYERS + 1 }, (_, i) => `l${i}`) }, /1 to 15 names/);
  refused({ layers: ['Default'] }, /isn't a layer name/);
  refused({ layers: ['a', 'a'] }, /twice/);
  refused({ layers: ['a'], collides: { a: ['b'] } }, /physics.collides.a/);
  refused({ layers: ['a'], collides: { b: ['a'] } }, /names "b"/);
  refused({ layers: ['a'], gravity: [0, -9.8, 0] }, /has no "gravity"/);
});
