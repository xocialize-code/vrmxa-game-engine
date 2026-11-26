// M6 W3 (AB-T-0646): New Project's templates (content/templates). Each one makes a project whose LICENCES.md lists
// every file and nothing else, whose scenes are valid and canonical, whose game passes @vrmxg/game's check and plans
// as a build (the export's every check); the editor asks the shell to copy exactly those files, with game.json made
// the new game's. With vrmxa-core beside the repository (so not on CI), each is played in Node: the empty game runs,
// the level is won and reaches its ending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator, parse, serialize } from '@vrmxg/scene';
import { checkGame as checkRules } from '@vrmxg/game';
import { planBuild, parseLicences, licenceOf } from '@vrmxg/bundle';
import { folderReader } from '@vrmxg/bundle/node';
import { listTemplates, makeProject } from '../../../content/templates/tools/new-project.mjs';
import { checkTemplate, templateFiles, gameIdFrom, personalGame } from '../../../content/templates/templates.js';
import { createRequest, newProjectFrom, entryScene } from '../src/projects.js';
import { available } from '../../../engine/packages/character/test/fixtures.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-new-project-'));
const walk = (root, dir = root, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(root, f, out); else out.push(path.relative(root, f).split(path.sep).join('/')); } return out; };

test('two templates, an empty game and one level, in the order New Project shows them', () => {
  const t = listTemplates();
  assert.deepEqual(t.map((x) => x.id), ['empty', 'level']);
  assert.deepEqual(t.find((x) => x.id === 'empty').files.map((f) => f.to), ['LICENCES.md', 'game.json', 'main.vrmxs']);
  const level = t.find((x) => x.id === 'level').files;
  for (const f of ['level.vrmxs', 'ending.vrmxs', 'sets/cafe.glb', 'characters/mira.vrmxa', 'characters/hana.vrmxa', 'animations.json', 'animations/clips/walk.vrma']) assert.ok(level.some((x) => x.to === f), f);
  assert.ok(level.every((f) => f.source.startsWith('templates/level/') || f.source.startsWith('sample/')), 'built on the sample content today (W4 swaps in starter items)');
});

for (const t of listTemplates()) {
  test(`template ${t.id}: a project made from it is licensed file by file, valid, and plans as a build`, async () => {
    const dir = path.join(tmp(), 'Project'), made = makeProject(t.id, dir, { title: 'My Cafe Game' });
    const files = walk(dir).sort();
    assert.deepEqual(files, made.files);
    // LICENCES.md: every file has a row with a licence, and every row names a file
    const rows = parseLicences(fs.readFileSync(path.join(dir, 'LICENCES.md'), 'utf8'));
    for (const f of files) assert.ok(licenceOf(rows, f)?.licence, `${f} has a licence row`);
    for (const r of rows) assert.ok(files.some((f) => licenceOf([r], f)), `the row ${r.pattern} names a file`);
    // game.json: the new game's id and title, the template's everything else
    const game = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
    assert.deepEqual([game.id, game.title], ['my-cafe-game', 'My Cafe Game']);
    // its scenes: valid, canonical, their rules sound across the game
    const { check } = createValidator(m0Registry());
    const scenes = new Map();
    for (const ref of game.scenes) {
      const text = fs.readFileSync(path.join(dir, ref), 'utf8'), doc = parse(text);
      assert.equal(serialize(doc), text, `${ref} is in canonical form`);
      const r = check(doc, { prefabs: new Map() });
      assert.ok(r.ok, `${ref}: ${r.errors.join('; ')}`);
      scenes.set(ref, doc);
    }
    assert.deepEqual(checkRules(scenes, { prefabs: new Map() }).problems, []);
    // the export's every check (Export Game and vrmxg-export run the same planBuild)
    const reader = folderReader(dir);
    const plan = await planBuild({ project: { files: reader.files, read: reader.read }, all: true });
    assert.deepEqual(plan.problems, []);
    assert.equal(plan.game.id, 'my-cafe-game');
  });
}

test('templates are checked: paths, patterns that match nothing, two files for one place', () => {
  assert.throws(() => checkTemplate({ format: 'vrmxg-template', version: 1, id: 'x', title: 'X', copy: [{ from: '../secret' }] }), /under content/);
  assert.throws(() => checkTemplate({ format: 'vrmxg-template', version: 1, id: 'Bad', title: 'X' }), /"id"/);
  assert.throws(() => checkTemplate({ format: 'vrmxg-template', version: 1, id: 'x', title: 'X', copy: [{ from: 'sample/*.glb', to: 'a.glb' }] }), /takes no "to"/);
  const t = checkTemplate({ format: 'vrmxg-template', version: 1, id: 'x', title: 'X', copy: [{ from: 'sample/a/*.vrma' }] });
  assert.throws(() => templateFiles(t, { own: [], content: ['sample/b.vrma'] }), /matches no file/);
  const u = checkTemplate({ format: 'vrmxg-template', version: 1, id: 'x', title: 'X', copy: [{ from: 'sample/game.json' }] });
  assert.throws(() => templateFiles(u, { own: ['game.json'], content: ['sample/game.json'] }), /comes from both/);
  assert.equal(gameIdFrom('Café Dash! 2'), 'cafe-dash-2');
  assert.equal(gameIdFrom('***'), 'game');
  assert.throws(() => personalGame('{}', { id: 'Bad Id', title: 'x' }), /lowercase/);
});

test('New Project asks the shell to copy the template\'s files and write game.json as the new game\'s, then opens its entry', async () => {
  const level = listTemplates().find((t) => t.id === 'level');
  const template = { id: level.id, files: level.files.map((f) => ({ from: f.source.startsWith('sample/') ? f.source.slice(7) : f.source, to: f.to })) };
  const gameText = fs.readFileSync(path.join(import.meta.dirname, '../../../content/templates/level/game.json'), 'utf8');
  const req = createRequest(template, gameText, { title: 'Cafe: Dash/2' });
  assert.equal(req.name, 'Cafe- Dash-2', 'a folder name: no slash or colon');
  assert.equal(req.files.filter((f) => f.to === 'game.json').length, 1);
  const game = JSON.parse(req.files.find((f) => f.to === 'game.json').text);
  assert.deepEqual([game.id, game.title, game.entry], ['cafe-dash-2', 'Cafe: Dash/2', 'level.vrmxs']);
  assert.ok(req.files.some((f) => f.from === 'sets/cafe.glb' && f.to === 'sets/cafe.glb'), 'the sample\'s files from where the editor serves them');
  assert.ok(req.files.some((f) => f.from === 'templates/level/level.vrmxs'));

  const calls = [];
  const shell = { inShell: true, call: async (m, p) => { calls.push([m, p]); return { base: '/project/', files: p.files.map((f) => f.to).sort(), name: p.name, path: `/x/${p.name}` }; } };
  const p = await newProjectFrom(template, { title: 'Dash', id: 'dash' }, shell, async (u) => { assert.equal(u, './templates/level/game.json'); return gameText; });
  assert.equal(calls[0][0], 'project.create');
  assert.equal(p.writable, true);
  assert.ok(p.has('level.vrmxs') && p.has('ending.vrmxs'));
  p.text = async () => gameText;
  assert.equal(await entryScene(p), 'level.vrmxs', 'the level, not the first file by name (ending.vrmxs)');
  await assert.rejects(newProjectFrom(template, { title: 'x' }, { inShell: false, call: async () => null }), /needs the Mac app/);
});

test('played in Node: the empty game runs; the level is won by walking to the counter, and its ending follows', { skip: !available('core') && 'needs vrmxa-core beside the repository' }, async () => {
  const { playTemplate, projectGame } = await import('../../../acceptance/m6/templates-node.mjs');
  const root = tmp();
  makeProject('empty', path.join(root, 'empty'));
  const e = await playTemplate(await projectGame(path.join(root, 'empty')), { maxSteps: 120 });
  assert.equal(e.decided, null);
  assert.equal(e.final.step, 120);
  makeProject('level', path.join(root, 'level'));
  const l = await playTemplate(await projectGame(path.join(root, 'level')));
  assert.equal(l.decided?.result, 'won');
  assert.equal(l.decided.score, 10);
  assert.equal(l.ending?.scene, 'ending.vrmxs');
});
