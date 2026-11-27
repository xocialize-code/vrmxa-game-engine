// M6 W10 (AB-T-0651): the second game, "After Hours" (content/sample/after-hours). Its scenes are valid and canonical, the
// whole game passes @vrmxg/game's own check and the exporter's; the committed scenes and game.json are what the editor's
// own session and project settings make of the build plan (so the Mac editor's scenario can be held to their bytes),
// and that scenario is up to date with the plan; the shelf behaviour declares itself and checks what is put on it; and
// (with vrmxa-core beside the repository, so not on CI) the scripted player wins it and loses it both ways in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createValidator, parse, serialize } from '@vrmxg/scene';
import { checkGame, describeRules } from '@vrmxg/game';
import { planBuild } from '@vrmxg/bundle';
import { projectWithGame } from '@vrmxg/bundle/node';
import { stateShape } from '@vrmxg/registry';
import { available } from '../../engine/packages/character/test/fixtures.mjs';
import { afterHoursRegistry, buildScenes, afterHoursGame } from '../../content/sample/tools/after-hours-build.mjs';
import { LOST, SHELVES } from '../../content/sample/tools/after-hours-plan.mjs';

const root = path.resolve(import.meta.dirname, '../..'), sample = path.join(root, 'content/sample');
const game = JSON.parse(fs.readFileSync(path.join(sample, 'after-hours/game.json'), 'utf8'));
const read = (ref) => fs.readFileSync(path.join(sample, ref), 'utf8');
const reg = await afterHoursRegistry();

test('the game\'s scenes are valid and canonical, and the whole game passes its own check', () => {
  const { check } = createValidator(reg);
  assert.deepEqual(game.scenes, ['after-hours/level.vrmxs', 'after-hours/lost.vrmxs', 'after-hours/title.vrmxs', 'after-hours/won.vrmxs']);
  assert.equal(game.entry, 'after-hours/title.vrmxs');
  assert.equal(game.behaviours, 'after-hours/behaviours.js');
  for (const ref of game.scenes) {
    const text = read(ref), doc = parse(text);
    assert.equal(serialize(doc), text, `${ref} is in canonical form`);
    const r = check(doc, { prefabs: new Map() });
    assert.ok(r.ok, `${ref}: ${r.errors.join('; ')}`);
    assert.deepEqual(describeRules(doc).problems, [], `${ref}'s rules`);
  }
  const whole = checkGame(new Map(game.scenes.map((ref) => [ref, parse(read(ref))])), { prefabs: new Map() });
  assert.deepEqual(whole.problems, [], 'the whole game');
});

test('the level\'s rules: a 180 s clock, one goal, lost on time or two wrong shelves, a checkpoint, a change to each ending', () => {
  const r = describeRules(parse(read('after-hours/level.vrmxs')));
  assert.deepEqual(r.goals.map((g) => g.key), ['tidy']);
  assert.ok(r.timers.some((t) => t.key === 'clock' && t.seconds === 180));
  assert.ok(r.checkpoints.some((c) => c.slot === 'first-shelved'));
  assert.deepEqual([...r.scenes].sort(), ['after-hours/lost.vrmxs', 'after-hours/won.vrmxs']);
});

test('the committed scenes and game.json are what the editor\'s session and project settings make of the plan, byte for byte', async () => {
  for (const { scene, session } of buildScenes(reg)) assert.equal(session.text(), read(scene.ref), `${scene.ref}: run content/sample/tools/make-after-hours.mjs`);
  assert.equal(await afterHoursGame(), read('after-hours/game.json'));
});

test('the editor scenario that builds the game is up to date with the plan (acceptance/m6/after-hours-scenario.mjs)', () => {
  const out = execFileSync(process.execPath, [path.join(root, 'acceptance/m6/after-hours-scenario.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
});

test('it exports: every file the game uses has a licence row (the exporter\'s checks, nothing written)', async () => {
  const p = projectWithGame(sample, 'after-hours/game.json');
  const plan = await planBuild({ project: { files: p.files, read: p.read }, game: p.game });
  assert.equal(plan.game.id, 'after-hours');
  for (const ref of ['after-hours/level.vrmxs', 'after-hours/behaviours.js', 'after-hours/items/scarf.vrmxi', 'after-hours/items/shelf.vrmxi', 'after-hours/props/back-room.glb', 'items/switch.vrmxi']) assert.ok(plan.refs.includes(ref), `${ref} goes in`);
});

test('the shelf declares its params, its placed and refused signals and its state (M6 W0), and each shelf in the level names its own thing', () => {
  const d = reg.behaviours.get('shelf');
  assert.equal(d.source, 'project');
  assert.deepEqual(Object.keys(d.signals).sort(), ['placed', 'refused']);
  assert.equal(stateShape(d), '{"additionalProperties":false,"properties":{"done":{"type":"boolean"},"inside":{"type":"boolean"}},"required":["done","inside"],"type":"object"}');
  const level = parse(read('after-hours/level.vrmxs'));
  for (const s of SHELVES) {
    const zone = level.nodes.find((n) => n.id === `zone-${s.key}`);
    assert.deepEqual(zone.behaviours, [{ item: LOST.find((l) => l.shelf === s.key).id, use: 'shelf' }]);
    assert.ok(level.connections.some((c) => c.from === zone.id && c.signal === 'placed' && c.to === 'shelved'), `${zone.id}.placed counts`);
  }
});

const RUNTIME = path.join(root, 'apps/game/dist/vrmxg-runtime.json');
const skipPlay = !available('core') ? 'needs vrmxa-core beside the repository' : !fs.existsSync(RUNTIME) ? 'needs the game runtime: npm run build -w @vrmxg/game-app' : false;
test('the scripted player wins, loses on two wrong shelves, and loses on time (Node)', { skip: skipPlay, timeout: 300000 }, async () => {
  const { exportAfterHours, playAfterHours, AFTER_HOURS_PLANS } = await import('../m6/after-hours-node.mjs');
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-after-hours-test-')), 'build');
  try {
    await exportAfterHours(dir);
    const win = await playAfterHours(dir, AFTER_HOURS_PLANS.win);
    assert.equal(win.decided?.result, 'won', win.trail.join('\n'));
    assert.deepEqual(win.decided.counters, { mistakes: 0, shelved: 3 });
    assert.equal(win.ending?.scene, 'after-hours/won.vrmxs');
    const lose = await playAfterHours(dir, AFTER_HOURS_PLANS.lose);
    assert.equal(lose.decided?.result, 'lost', lose.trail.join('\n'));
    assert.deepEqual(lose.decided.counters, { mistakes: 2, shelved: 0 });
    assert.equal(lose.ending?.scene, 'after-hours/lost.vrmxs');
    const time = await playAfterHours(dir, AFTER_HOURS_PLANS.time);
    assert.equal(time.decided?.result, 'lost');
    assert.equal(time.decided.counters.mistakes, 0);
  } finally { fs.rmSync(path.dirname(dir), { recursive: true, force: true }); }
});
