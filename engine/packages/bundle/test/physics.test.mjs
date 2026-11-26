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

test('a node on a layer the game doesn\'t have stops the export, by scene, node and layer (MCP\'s check says the same)', async () => {
  const { planBuild, layersUsed, unknownLayers } = await import('../src/index.js');
  const scene = (layer) => JSON.stringify({ format: 'vrmxs', version: 1, id: 'a', nodes: [{ id: 'root', type: 'Node3D' }, { id: 'wall', type: 'Collider', parent: 'root', props: { layer } }, { id: 'door', type: 'Instance', parent: 'root', overrides: { frame: { props: { layer: 'trigger' } } } }] });
  const files = (layer, game) => new Map([['game.json', JSON.stringify(game)], ['a.vrmxs', scene(layer)], ['LICENCES.md', '| `*` | Xocialize original |\n']]);
  const project = (m) => ({ files: [...m.keys()], read: async (r) => new TextEncoder().encode(m.get(r)) });
  const game = { ...base, physics: { layers: ['default', 'player', 'trigger'] } };
  assert.deepEqual(layersUsed(JSON.parse(scene('player'))), [{ node: 'wall', layer: 'player' }, { node: 'door/frame', layer: 'trigger' }]);
  assert.deepEqual((await planBuild({ project: project(files('player', game)), all: true })).problems, []);
  const p = await planBuild({ project: project(files('plyer', game)), all: true });
  assert.equal(p.problems.length, 1);
  assert.equal(p.problems[0].code, 'unknown_layer');
  assert.match(p.problems[0].message, /a\.vrmxs: "wall" is on layer "plyer", which the game doesn't have \(its layers: default, player, trigger\)/);
  await assert.rejects(planBuild({ project: project(files('player', base)) }), /"wall" is on layer "player".*its layers: default\)/, 'no physics key: one layer, "default"');
  assert.deepEqual(unknownLayers(base, [['x.vrmxs', { nodes: [{ id: 'n', props: { layer: 'default' } }] }]]), []);
});
