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

test('physics layers: named, renamed through collides, and a matrix kept symmetric; none left, none in game.json', async () => {
  const d = disk(), s = make(d);
  await s.setLayers(['default', 'player', 'trigger']);
  await s.setCollides('trigger', 'default', false);
  await s.setCollides('trigger', 'trigger', false);
  let p = d.json('game.json').physics;
  assert.deepEqual(p, { layers: ['default', 'player', 'trigger'], collides: { trigger: ['player'], default: ['default', 'player'] } });
  assert.doesNotThrow(() => checkGame(d.json('game.json')));
  const m = s.view().matrix;
  assert.equal(m[2].with[0].on, false); assert.equal(m[0].with[2].on, false); assert.equal(m[1].with[2].on, true);
  await s.setLayers(['world', 'player', 'sensor']); // a rename in place carries through collides
  p = d.json('game.json').physics;
  assert.deepEqual(p.collides, { sensor: ['player'], world: ['world', 'player'] });
  await s.setLayers(['world', 'player']); // a layer gone: gone from every list
  assert.deepEqual(d.json('game.json').physics, { layers: ['world', 'player'] });
  await assert.rejects(s.setLayers(['a', 'a']), /twice/);
  await assert.rejects(s.setLayers(['Bad Name']), /isn't a layer name/);
  await s.setLayers([]);
  assert.equal('physics' in d.json('game.json'), false);
});

test('a project with no game.json: the first edit writes one, from its first scene and the default controls', async () => {
  const d = disk(), s = new ProjectSettings({ game: null, files: ['b.vrmxs', 'a.vrmxs', 'prefabs/p.vrmxs'], name: 'My Cafe', write: d.write });
  assert.equal(s.view().exists, false);
  assert.deepEqual(s.view().rows.length > 0, true, 'the engine\'s controls shown');
  await s.setTitle('My Cafe');
  const g = d.json('game.json');
  assert.deepEqual([g.id, g.title, g.entry, g.scenes], ['my-cafe', 'My Cafe', 'b.vrmxs', ['b.vrmxs']]);
  assert.deepEqual(g.input.actions, DEFAULT_ACTIONS);
  assert.ok(s.files.includes('game.json'));
  assert.deepEqual(startingGame({ name: '!!', scenes: [] }).id, 'game');
});

test('edits queue: two at once land in order, each its own step', async () => {
  const d = disk(), s = make(d);
  await Promise.all([s.setTitle('One'), s.setRelease('2.0.0')]);
  assert.deepEqual([d.json('game.json').title, d.json('game.json').release], ['One', '2.0.0']);
  assert.deepEqual(s.history().undo, 'Version 2.0.0');
});
