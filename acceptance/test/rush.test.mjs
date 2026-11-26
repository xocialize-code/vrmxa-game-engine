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
const skipPlay = !available('core') ? 'needs vrmxa-core beside the repository' : !fs.existsSync(RUNTIME) ? 'needs the game runtime: npm run build -w @vrmxg/game-app' : false;
test('the editor scenario that builds the level is up to date with the level (acceptance/m5/rush-level-scenario.mjs)', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [path.join(root, 'acceptance/m5/rush-level-scenario.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
  const { compare } = await import('../m5/rush-level.mjs');
  const r = compare(parse(read('game/level.vrmxs')));
  assert.ok(r.same && r.nodes.every((n) => n.found && n.same), 'the committed level compares as itself');
});

// M6 W1 (AB-T-0638): what the scenario does in the Mac editor, done through the editor's session in Node from the same
// room: every node added as the editor adds it (the id it gives, then the committed id), Duplicates, the Before menu,
// pins, behaviours with their params and the 19 connections. The result is the committed level, byte for byte, so the
// scenario's run can be held to the bytes.
test('the level built through the editor\'s session, from the scenario\'s room, is the committed level byte for byte', async () => {
  const { split, rushRegistry, compare } = await import('../m5/rush-level.mjs');
  const { EditorSession } = await import('@vrmxg/editor-core');
  const { doc, room, game, behaviours } = split();
  const s = new EditorSession({ registry: await rushRegistry(), text: serialize(room), prefabs: new Map() });
  const asset = new Map(doc.assets.map((a) => [a.id, a.ref]));
  const fill = (id, want) => {
    s.setNodeId(id, want.id);
    if (want.name) s.rename(want.id, want.name);
    if (want.parent !== 'root') s.reparent(want.id, want.parent);
    for (const [k, v] of Object.entries(want.props ?? {})) s.setProp(want.id, k, v);
    if (want.transform) s.setTransform(want.id, want.transform);
  };
  for (const { id, behaviours: list } of behaviours) for (const { use, ...params } of list) { s.addBehaviour(id, use); for (const [k, v] of Object.entries(params)) s.setBehaviourParam(id, use, k, v); }
  const items = game.filter((n) => n.type === 'Item'), others = game.filter((n) => n.type !== 'Item');
  const after = doc.nodes[doc.nodes.indexOf(items.at(-1)) + 1].id;
  for (const want of items) { const id = s.addFromAsset(asset.get(want.asset)); fill(id, want); s.moveBefore(want.id, after); }
  // the toolbar adds where the view looks (the app passes it); the scenario puts a node the level keeps at the origin back
  const at = [0, 0, 1.983371];
  for (const want of others) {
    const id = want.type === 'Area' && want.id !== 'table-1' ? s.duplicate([s.selection[0]])[0] : s.addNode(want.type, { at });
    if (!want.transform && want.type !== 'Area') s.setTransform(id, { p: [0, 0, 0] });
    fill(id, want);
  }
  for (const want of game) for (const { use, ...params } of want.behaviours ?? []) { s.addBehaviour(want.id, use); for (const [k, v] of Object.entries(params)) s.setBehaviourParam(want.id, use, k, v); }
  for (const c of doc.connections) s.connect(c);
  const r = compare(s.doc);
  assert.ok(r.same, JSON.stringify({ nodes: r.nodes.filter((n) => !n.same), order: r.order, connections: r.connections.list.filter((c) => !c.same), assets: r.assets, rest: r.rest }));
  assert.ok(s.validate().ok, s.validate().errors.join('; '));
  // and every step undoes back to the room
  while (s.history().undo) s.undo();
  assert.equal(s.text(), serialize(room));
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
