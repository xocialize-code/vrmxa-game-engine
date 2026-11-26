// M6 W3 (AB-T-0646): the project settings. Every edit is one undo step, written to game.json at once (and to the input
// map's own file when game.json names one); a refused edit or a failed write leaves the settings, and the disk, as
// they were. Rebinding is @vrmxg/game-ui's plan over the game's own map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkGame } from '@vrmxg/bundle';
import { DEFAULT_ACTIONS } from '@vrmxg/input';
import { ProjectSettings, writeJson, startingGame } from '../src/project-settings.js';

const root = path.join(import.meta.dirname, '../../..');
const template = JSON.parse(fs.readFileSync(path.join(root, 'content/templates/level/game.json'), 'utf8'));

/** A project's files in memory, as project.write writes them. */
function disk(files = {}) {
  const d = { files: new Map(Object.entries(files)), writes: [], fail: false };
  d.write = async (ref, text) => { if (d.fail) throw new Error('the disk is full'); d.writes.push(ref); d.files.set(ref, text); return { path: ref, bytes: text.length }; };
  d.json = (ref) => JSON.parse(d.files.get(ref));
  return d;
}
const make = (d, game = template, o = {}) => new ProjectSettings({ game, files: ['ending.vrmxs', 'game.json', 'level.vrmxs', 'prefabs/door.vrmxs', 'extra.vrmxs'], write: d.write, ...o });

test('title, id and version: each one undo step, written to game.json as the editor writes it', async () => {
  const d = disk(), s = make(d);
  await s.setTitle('Cafe Dash');
  assert.equal(d.json('game.json').title, 'Cafe Dash');
  assert.equal(d.files.get('game.json'), writeJson({ ...template, title: 'Cafe Dash' }), 'the other keys as they were, in their order');
  await s.setId('cafe-dash');
  await s.setRelease('1.2.0');
  assert.deepEqual(s.history(), { undo: 'Version 1.2.0', redo: null });
  assert.doesNotThrow(() => checkGame(d.json('game.json')), 'what is written exports');
  await s.undo();
  assert.equal(d.json('game.json').release, '0.1.0');
  await s.undo(); await s.undo();
  assert.deepEqual(d.json('game.json'), template, 'all the way back, on disk');
  assert.deepEqual(s.history(), { undo: null, redo: 'Title Cafe Dash' });
  await s.redo();
  assert.equal(d.json('game.json').title, 'Cafe Dash');
  assert.equal(await s.setTitle('Cafe Dash'), false, 'the same value: no step, no write');
  assert.equal(d.writes.length, 7);
});

test('what an export would refuse is refused, and says why; nothing is written', async () => {
  const d = disk(), s = make(d);
  await assert.rejects(s.setId('Cafe Dash'), /"id" is lowercase/);
  assert.match(s.error, /"id" is lowercase/);
  await assert.rejects(s.setTitle('   '), /needs a title/);
  await assert.rejects(s.setScene('level.vrmxs', false), /the entry scene/);
  assert.equal(d.writes.length, 0);
  assert.deepEqual(s.history(), { undo: null, redo: null });
  await s.setTitle('Fine');
  assert.equal(s.error, '', 'cleared by the next edit that works');
});

test('a write that fails leaves the settings as they were, and the next edit writes again', async () => {
  const d = disk(), s = make(d);
  d.fail = true;
  await assert.rejects(s.setTitle('Lost'), /not saved: the disk is full/);
  assert.equal(s.view().title, 'New Game', 'the panel shows what is on disk');
  assert.deepEqual(s.history(), { undo: null, redo: null });
  d.fail = false;
  await s.setTitle('Kept');
  assert.equal(d.json('game.json').title, 'Kept');
  d.fail = true;
  await assert.rejects(s.undo());
  assert.deepEqual(s.history(), { undo: 'Title Kept', redo: null }, 'an undo whose write failed is still to undo');
});

test('scenes: the entry and the scenes the game can reach (prefabs and sequences aren\'t scenes to start in)', async () => {
  const d = disk(), s = make(d);
  assert.deepEqual(s.view().scenes.map((x) => [x.ref, x.included, x.entry]), [['ending.vrmxs', true, false], ['extra.vrmxs', false, false], ['level.vrmxs', true, true]]);
  await s.setScene('extra.vrmxs', true);
  await s.setEntry('extra.vrmxs');
  assert.deepEqual([d.json('game.json').entry, d.json('game.json').scenes], ['extra.vrmxs', ['ending.vrmxs', 'extra.vrmxs', 'level.vrmxs']]);
  await s.undo();
  assert.equal(d.json('game.json').entry, 'level.vrmxs');
});

test('rebinding: a key moves out of where it was, as the game\'s own menu moves it; one step; Default Controls puts the engine\'s back', async () => {
  const d = disk(), s = make(d);
  const plan = s.planRebind('jump', 'keyboard', { key: 'KeyE' });
  assert.deepEqual(plan.conflicts.map((c) => c.label), ['Interact'], 'E is Interact\'s now: the panel asks first');
  await s.rebind('jump', 'keyboard', { key: 'KeyE' });
  const a = d.json('game.json').input.actions;
  assert.deepEqual(a.jump.bindings, [{ key: 'KeyE' }, { gamepadButton: 0 }]);
  assert.deepEqual(a.interact.bindings, [{ mouseButton: 0 }, { gamepadButton: 2 }], 'moved, not doubled');
  assert.deepEqual(s.history().undo, 'Jump: E');
  await s.undo();
  assert.deepEqual(d.json('game.json').input.actions, DEFAULT_ACTIONS, 'both actions back in one step');
  // an axis direction and a gamepad button
  await s.rebind('move_x+', 'keyboard', { key: 'KeyL' });
  assert.deepEqual(d.json('game.json').input.actions.move_x.bindings[0], { key: 'KeyL', value: 1 });
  await s.rebind('run', 'gamepad', { gamepadButton: 5 });
  await s.unbind('camera_next', 'gamepad');
  assert.deepEqual(d.json('game.json').input.actions.camera_next.bindings, [{ key: 'KeyC' }]);
  await s.resetControls();
  assert.deepEqual(d.json('game.json').input.actions, DEFAULT_ACTIONS);
});

test('the game\'s own actions: added with nothing bound, then bound, then removed', async () => {
  const d = disk(), s = make(d);
  await s.addAction('serve', 'button');
  await assert.rejects(s.addAction('serve'), /already/);
  await assert.rejects(s.addAction('two words'), /letters, digits/);
  await s.rebind('serve', 'keyboard', { key: 'KeyQ' });
  assert.deepEqual(d.json('game.json').input.actions.serve, { type: 'button', bindings: [{ key: 'KeyQ' }] });
  assert.ok(s.view().rows.some((r) => r.id === 'serve' && r.keyboard === 'Q'));
  await s.removeAction('serve');
  assert.equal('serve' in d.json('game.json').input.actions, false);
});

test('an input map in its own file is edited there; game.json is left alone', async () => {
  const d = disk(), game = { ...template, input: 'input/controls.json' };
  const s = make(d, game, { input: { actions: { jump: { type: 'button', bindings: [{ key: 'Space' }] } } } });
  await s.rebind('jump', 'keyboard', { key: 'KeyJ' });
  assert.deepEqual(d.writes, ['input/controls.json']);
  assert.deepEqual(d.json('input/controls.json'), { actions: { jump: { type: 'button', bindings: [{ key: 'KeyJ' }] } } });
  assert.equal(s.view().inputFile, 'input/controls.json');
});

test('physics layers: added, renamed through collides, removed; the matrix kept symmetric; none left, none in game.json', async () => {
  const d = disk(), s = make(d);
  await s.addLayer('player');
  await s.addLayer('trigger');
  assert.deepEqual(d.json('game.json').physics, { layers: ['default', 'player', 'trigger'] }, '"default" kept first');
  await s.setCollides('trigger', 'default', false);
  await s.setCollides('trigger', 'trigger', false);
  assert.deepEqual(d.json('game.json').physics.collides, { trigger: ['player'], default: ['default', 'player'] });
  assert.doesNotThrow(() => checkGame(d.json('game.json')));
  const m = s.view().matrix;
  assert.equal(m[2].with[0].on, false); assert.equal(m[0].with[2].on, false); assert.equal(m[1].with[2].on, true);
  await s.renameLayer('trigger', 'sensor');
  assert.deepEqual(d.json('game.json').physics, { layers: ['default', 'player', 'sensor'], collides: { sensor: ['player'], default: ['default', 'player'] } });
  assert.equal(s.history().undo, 'Rename layer trigger to sensor');
  await s.addLayer('pickup'); // a new layer collides with every layer, and every layer with it
  assert.deepEqual(d.json('game.json').physics.collides, { sensor: ['player', 'pickup'], default: ['default', 'player', 'pickup'] });
  await s.removeLayer('sensor');
  assert.deepEqual(d.json('game.json').physics, { layers: ['default', 'player', 'pickup'] }, 'gone from every list; default collides with all again');
  await assert.rejects(s.addLayer('player'), /twice/);
  await assert.rejects(s.addLayer('Bad Name'), /isn't a layer name/);
  for (const l of ['pickup', 'player', 'default']) await s.removeLayer(l);
  assert.equal('physics' in d.json('game.json'), false);
});

test('moving a layer moves it: the collision rules stay with their layers (review of PR #52)', async () => {
  const d = disk(), s = make(d);
  await s.addLayer('player'); await s.addLayer('enemy');
  await s.setCollides('player', 'default', false);
  const before = d.json('game.json').physics.collides;
  assert.deepEqual(before, { player: ['player', 'enemy'], default: ['default', 'enemy'] });
  await s.moveLayer('enemy', -1);
  assert.deepEqual(d.json('game.json').physics, { layers: ['default', 'enemy', 'player'], collides: { player: ['enemy', 'player'], default: ['default', 'enemy'] } });
  const on = (a, b) => s.view().matrix.find((r) => r.layer === a).with.find((c) => c.layer === b).on;
  assert.equal(on('player', 'default'), false, 'player still passes through default');
  assert.equal(on('enemy', 'player'), true); assert.equal(on('enemy', 'default'), true);
  assert.equal(s.history().undo, 'Move layer enemy up');
  assert.equal(await s.moveLayer('default', -1), false, 'the first can\'t go up');
});

test('a layer a scene uses can\'t be renamed or removed: every world with that node would stop being built', async () => {
  const d = disk();
  const uses = [{ ref: 'level.vrmxs', node: 'mira', layer: 'player' }, { ref: 'level.vrmxs', node: 'wall', layer: 'plyer' }];
  const s = make(d, { ...template, physics: { layers: ['default', 'player'] } }, { layerUses: async () => uses });
  await assert.rejects(s.renameLayer('player', 'hero'), /"player" is in use \(level\.vrmxs: mira\): change those nodes' layer first/);
  await assert.rejects(s.removeLayer('player'), /"player" is in use/);
  assert.equal(d.writes.length, 0);
  await s.addLayer('pickup'); // a node on an unknown layer (a typo) is the editor's warning, not a block on other edits
  await s.moveLayer('pickup', -1);
  await s.removeLayer('pickup');
  assert.deepEqual(d.json('game.json').physics, { layers: ['default', 'player'] });
});

test('projectLayerUses: every scene as saved, the open one as edited', async () => {
  const { projectLayerUses } = await import('../src/project-settings.js');
  const files = { 'a.vrmxs': JSON.stringify({ nodes: [{ id: 'w', props: { layer: 'wall' } }] }), 'b.vrmxs': JSON.stringify({ nodes: [{ id: 'm', props: { layer: 'player' } }] }) };
  const project = { scenes: () => Object.keys(files), text: async (r) => files[r] };
  assert.deepEqual(await projectLayerUses(project, { ref: 'b.vrmxs', doc: { nodes: [{ id: 'm', props: { layer: 'hero' } }] } }), [{ ref: 'a.vrmxs', node: 'w', layer: 'wall' }, { ref: 'b.vrmxs', node: 'm', layer: 'hero' }]);
});

test('a second write that fails puts the first file back, so the disk agrees with the panel (review of PR #52)', async () => {
  const d = disk({ 'input/controls.json': writeJson({ actions: { jump: { type: 'button', bindings: [{ key: 'Space' }] } } }) });
  const s = make(d, { ...template, input: 'input/controls.json' }, { input: d.json('input/controls.json') });
  const write = d.write;
  s.write = async (ref, text) => { if (ref === 'game.json') throw new Error('the disk is full'); return write(ref, text); };
  await assert.rejects(s.edit('both', (x) => { x.input.actions.jump.bindings = [{ key: 'KeyJ' }]; x.game.title = 'Both'; }), /not saved: the disk is full/);
  assert.deepEqual(d.json('input/controls.json').actions.jump.bindings, [{ key: 'Space' }], 'written, then put back');
  assert.equal(s.view().title, 'New Game');
});

test('a project with no game.json: the first edit writes one, from its first scene and the default controls', async () => {
  const d = disk(), s = new ProjectSettings({ game: null, files: ['b.vrmxs', 'a.vrmxs', 'prefabs/p.vrmxs'], name: 'My Cafe', write: d.write });
  assert.equal(s.view().exists, false);
  assert.deepEqual(s.view().rows.length > 0, true, 'the engine\'s controls shown');
  await s.setTitle('My Cafe Game');
  const g = d.json('game.json');
  assert.deepEqual([g.id, g.title, g.entry, g.scenes], ['my-cafe', 'My Cafe Game', 'b.vrmxs', ['b.vrmxs']]);
  assert.deepEqual(g.input.actions, DEFAULT_ACTIONS);
  assert.ok(s.files.includes('game.json'));
  assert.deepEqual(startingGame({ name: '!!', scenes: [] }).id, 'game');
});

test('an edit that changes nothing writes nothing, not even a first game.json (review of PR #52)', async () => {
  const d = disk(), s = new ProjectSettings({ game: null, files: ['a.vrmxs'], name: 'a', write: d.write });
  assert.equal(await s.removeAction('no-such-action'), false);
  assert.equal(await s.setLayers([]), false);
  assert.equal(d.writes.length, 0);
  assert.equal(s.view().exists, false);
});

test('edits queue: two at once land in order, each its own step', async () => {
  const d = disk(), s = make(d);
  await Promise.all([s.setTitle('One'), s.setRelease('2.0.0')]);
  assert.deepEqual([d.json('game.json').title, d.json('game.json').release], ['One', '2.0.0']);
  assert.deepEqual(s.history().undo, 'Version 2.0.0');
});

/** A project as project.js's: files by ref, a write that replaces the file list (as Project.write does). */
function projectOn(d, files) {
  const p = { name: 'p', files: [...files] };
  p.has = (ref) => d.files.has(ref) || p.files.includes(ref);
  p.text = async (ref) => d.files.get(ref) ?? '{}';
  p.write = async (ref, text) => { await d.write(ref, text); if (!p.files.includes(ref)) p.files = [...p.files, ref].sort(); };
  return p;
}

test('kept settings catch up: a scene saved since appears, and game.json changed elsewhere is read again, not written over (review of PR #52)', async () => {
  const d = disk({ 'game.json': writeJson(template) });
  const project = projectOn(d, ['ending.vrmxs', 'game.json', 'level.vrmxs']);
  const s = await ProjectSettings.load(project);
  await s.setTitle('Mine');
  // a scene saved in the editor since (Project.write gives the project a new file array)
  await project.write('bonus.vrmxs', '{}');
  await s.refresh();
  assert.ok(s.view().scenes.some((x) => x.ref === 'bonus.vrmxs'));
  // MCP (or a text editor) changes game.json: the next edit builds on that, and the old history can't undo over it
  d.files.set('game.json', writeJson({ ...d.json('game.json'), release: '9.0.0', id: 'from-mcp' }));
  await s.setTitle('Mine again');
  const g = d.json('game.json');
  assert.deepEqual([g.id, g.release, g.title], ['from-mcp', '9.0.0', 'Mine again'], 'the other edit kept');
  assert.match(s.view().note, /changed on disk: read again/);
  assert.deepEqual(s.history(), { undo: 'Title Mine again', redo: null }, 'the history starts again there');
  d.files.set('game.json', writeJson({ ...d.json('game.json'), title: 'Elsewhere' }));
  assert.equal(await s.undo(), false, 'an undo after an outside change only reads it');
  assert.equal(d.json('game.json').title, 'Elsewhere');
  assert.equal(s.view().title, 'Elsewhere');
});

test('undo and redo keep a layer a node was put on since (review of PR #52)', async () => {
  const d = disk();
  let uses = [];
  const s = make(d, template, { layerUses: async () => uses });
  await s.addLayer('npc');
  uses = [{ ref: 'level.vrmxs', node: 'hana', layer: 'npc' }]; // Hana put on it in the inspector
  await assert.rejects(s.undo(), /"npc" is in use \(level\.vrmxs: hana\)/);
  assert.deepEqual(d.json('game.json').physics, { layers: ['default', 'npc'] });
  assert.deepEqual(s.history().undo, 'Add layer npc', 'still there to undo once the node is off it');
  uses = [];
  await s.undo();
  assert.equal('physics' in d.json('game.json'), false);
  uses = [{ ref: 'level.vrmxs', node: 'hana', layer: 'default' }];
  await s.redo(); // adding a layer drops nothing
  assert.deepEqual(d.json('game.json').physics, { layers: ['default', 'npc'] });
});
