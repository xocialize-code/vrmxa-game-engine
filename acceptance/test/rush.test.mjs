// M5 W10 (AB-T-0620): the sample game, "The Morning Rush" (content/sample/game). Its scenes are valid and in canonical
// form, the whole game passes @vrmxg/game's own check and the exporter's, and (with vrmxa-core beside the repository,
// so not on CI) the scripted player wins it, loses it on two wrong orders (the second of them the third delivery too)
// and loses it on time, in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator, parse, serialize } from '@vrmxg/scene';
import { checkGame, describeRules } from '@vrmxg/game';
import { planBuild } from '@vrmxg/bundle';
import { projectWithGame } from '@vrmxg/bundle/node';
import { available } from '../../engine/packages/character/test/fixtures.mjs';

const root = path.resolve(import.meta.dirname, '../..'), sample = path.join(root, 'content/sample');
const game = JSON.parse(fs.readFileSync(path.join(sample, 'game/game.json'), 'utf8'));
const read = (ref) => fs.readFileSync(path.join(sample, ref), 'utf8');

test('the game\'s scenes are valid and canonical, and every one of its rules can start', () => {
  const { check } = createValidator(m0Registry());
  assert.deepEqual(game.scenes, ['game/title.vrmxs', 'game/level.vrmxs', 'game/won.vrmxs', 'game/lost.vrmxs']);
  for (const ref of game.scenes) {
    const text = read(ref), doc = parse(text);
    assert.equal(serialize(doc), text, `${ref} is in canonical form`);
    const r = check(doc, { prefabs: new Map() });
    assert.ok(r.ok, `${ref}: ${r.errors.join('; ')}`);
    assert.deepEqual(describeRules(doc).problems, [], `${ref}'s rules`);
  }
  const scenes = new Map(game.scenes.map((ref) => [ref, parse(read(ref))]));
  const whole = checkGame(scenes, { prefabs: new Map() });
  assert.deepEqual(whole.problems, [], 'the whole game');
});

test('the level\'s rules: a 240 s clock, two goals in order, lost on time or two mistakes, a checkpoint, a change to each ending', () => {
  const r = describeRules(parse(read('game/level.vrmxs')));
  assert.deepEqual(r.goals.map((g) => g.key), ['serve', 'close-till']);
  assert.ok(r.timers.some((t) => t.key === 'clock' && t.seconds === 240));
  assert.ok(r.checkpoints.some((c) => c.slot === 'first-order'));
  assert.deepEqual([...r.scenes].sort(), ['game/lost.vrmxs', 'game/won.vrmxs']);
});

test('it exports: every file the game uses has a licence row (the exporter\'s checks, nothing written)', async () => {
  const p = projectWithGame(sample, 'game/game.json');
  const plan = await planBuild({ project: { files: p.files, read: p.read }, game: p.game });
  assert.equal(plan.game.id, 'morning-rush');
  for (const ref of ['game/level.vrmxs', 'game/behaviours.js', 'game/animations.json', 'game/items/till.vrmxi', 'game/voice/hana-brief.wav', 'game/voice/hana-brief.timings.json', 'animations/clips/carry.vrma']) assert.ok(plan.refs.includes(ref), `${ref} goes in`);
});

const RUNTIME = path.join(root, 'apps/game/dist/vrmxg-runtime.json');
const skipPlay = !available('core') ? 'needs vrmxa-avatar-studio beside the repository' : !fs.existsSync(RUNTIME) ? 'needs the game runtime: npm run build -w @vrmxg/game-app' : false;
test('the editor scenario that builds the level is up to date with the level (acceptance/m5/rush-level-scenario.mjs)', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [path.join(root, 'acceptance/m5/rush-level-scenario.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
  const { compare } = await import('../m5/rush-level.mjs');
  const r = compare(parse(read('game/level.vrmxs')));
  assert.ok(r.nodes.every((n) => n.found && n.same), 'the committed level compares as itself');
});

test('the scripted player wins, loses on two wrong orders, and loses on time (Node)', { skip: skipPlay, timeout: 300000 }, async () => {
  const { exportRush, playRush, RUSH_PLANS } = await import('../m5/rush-node.mjs');
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-rush-test-')), 'build');
  try {
    await exportRush(dir);
    const win = await playRush(dir, RUSH_PLANS.win);
    assert.equal(win.decided?.result, 'won', win.trail.join('\n'));
    assert.deepEqual(win.decided.counters, { mistakes: 0, score: 50, served: 3 });
    assert.equal(win.ending?.scene, 'game/won.vrmxs');
    const lose = await playRush(dir, RUSH_PLANS.lose);
    assert.equal(lose.decided?.result, 'lost');
    assert.equal(lose.decided.counters.mistakes, 2);
    assert.equal(lose.ending?.scene, 'game/lost.vrmxs');
    // the third delivery being the second wrong order loses on that step: the serve goal mustn't open the till then
    let opened = null;
    const third = await playRush(dir, { orders: ['wrong', 'right', 'wrong'] }, { onStep: (flow) => { if (opened === null && flow.tree.find('till')?.current === 'open') opened = flow.tree.clock.step; } });
    assert.equal(third.decided?.result, 'lost');
    assert.deepEqual(third.decided.counters, { mistakes: 2, score: 10, served: 3 });
    assert.equal(opened, null, 'the till never opened, and Hana never said to close it');
    const time = await playRush(dir, RUSH_PLANS.time);
    assert.equal(time.decided?.result, 'lost');
    assert.equal(time.decided.step, 14760, 'the clock: 240 s after the level began');
  } finally { fs.rmSync(path.dirname(dir), { recursive: true, force: true }); }
});
