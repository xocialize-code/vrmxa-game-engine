// What a game needs, traced from its documents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, checkGame, defaultGame } from '@vrmxg/bundle';
import { project, GAME } from './helpers.mjs';

const trace = (p, game = GAME) => collect({ game: checkGame(game), files: p.files, read: p.read });

test('a scene brings its prefabs, their models, brains by path, voice lines and their timings; a module its imports', async () => {
  const { refs, why } = await trace(project());
  assert.deepEqual(refs, [
    'LICENCES.md', 'animations.json', 'animations/clips/idle.vrma', 'behaviours.js', 'brains/guard.json', 'game.json', 'level.vrmxs',
    'lib/maths.js', 'prefabs/door.vrmxs', 'props/door.glb', 'voice/hello.timings.json', 'voice/hello.wav',
  ]);
  assert.equal(why.get('props/door.glb'), 'prefabs/door.vrmxs');
  assert.equal(why.get('voice/hello.timings.json'), 'voice/hello.wav');
  assert.equal(why.get('lib/maths.js'), 'behaviours.js');
  assert.equal(why.get('level.vrmxs'), 'game.json');
});

test('what nothing names stays out: tools, an unused clip, notes', async () => {
  const { refs } = await trace(project());
  for (const f of ['tools/make.mjs', 'voice/unused.wav', 'notes/unlicensed.txt', 'extras/readme.txt', '.DS_Store']) assert.ok(!refs.includes(f), f);
});

test('include adds files no document names, by ref or by pattern', async () => {
  const { refs } = await trace(project(), { ...GAME, include: ['extras/readme.txt', 'voice/*.wav'] });
  assert.ok(refs.includes('extras/readme.txt') && refs.includes('voice/unused.wav'));
  await assert.rejects(trace(project(), { ...GAME, include: ['extras/*.png'] }), (e) => e.code === 'missing_file' && /extras\/\*\.png/.test(e.message));
});

test('the order of the listing does not change the result', async () => {
  const a = project(), b = project();
  b.files.reverse();
  assert.deepEqual((await trace(a)).refs, (await trace(b)).refs);
});

test('a named file the project lacks stops the trace and is named', async () => {
  await assert.rejects(trace(project(), { ...GAME, entry: 'missing.vrmxs' }), (e) => e.code === 'missing_file' && e.files[0] === 'missing.vrmxs' && /game\.json names missing\.vrmxs/.test(e.message));
  await assert.rejects(trace(project({ 'behaviours.js': "import './lib/gone.js';\n" })), (e) => e.code === 'missing_file' && e.files[0] === 'lib/gone.js' && /behaviours\.js imports/.test(e.message));
  await assert.rejects(trace(project({ 'behaviours.js': "import x from '../outside.js';\n" })), (e) => e.code === 'missing_file');
  await assert.rejects(trace(project({ 'brains/guard.json': '{ not json' })), (e) => e.code === 'bad_file' && e.files[0] === 'brains/guard.json');
});

test('the game document is checked, and its defaults filled in', () => {
  const g = checkGame(GAME);
  assert.deepEqual(g.scenes, ['level.vrmxs']);
  assert.deepEqual([g.personas, g.input, g.include], [null, null, []]);
  assert.deepEqual(Object.keys(g), ['format', 'version', 'id', 'title', 'entry', 'scenes', 'behaviours', 'animations', 'personas', 'input', 'include']);
  for (const [doc, re] of [
    [{ ...GAME, format: 'other' }, /"format"/], [{ ...GAME, version: 2 }, /version 1/], [{ ...GAME, id: 'Has Spaces' }, /"id"/],
    [{ ...GAME, entry: '../up.vrmxs' }, /"entry"/], [{ ...GAME, entry: 'level.json' }, /not a \.vrmxs scene/], [{ ...GAME, behaviours: '/abs.js' }, /"behaviours"/],
    [{ ...GAME, input: 5 }, /"input"/], [{ ...GAME, colour: 'red' }, /unknown key "colour"/], [{ ...GAME, entry: 'a*.vrmxs' }, /has a \*/],
  ]) assert.throws(() => checkGame(doc), (e) => e.code === 'bad_game' && re.test(e.message), JSON.stringify(doc));
  assert.deepEqual(checkGame({ ...GAME, scenes: ['b.vrmxs', 'a.vrmxs'] }).scenes, ['a.vrmxs', 'b.vrmxs', 'level.vrmxs'], 'the entry is always a scene; scenes are in order');
});

test('a project with no game.json is one scene and what it has', () => {
  const g = defaultGame({ files: ['cafe.vrmxs', 'behaviours.js', 'personas.json'], entry: 'cafe.vrmxs' });
  assert.deepEqual([g.id, g.title, g.entry, g.behaviours, g.animations, g.personas], ['cafe', 'cafe', 'cafe.vrmxs', 'behaviours.js', null, 'personas.json']);
  assert.equal(defaultGame({ files: [], entry: 'levels/Level One.vrmxs' }).id, 'levels-level-one');
});
