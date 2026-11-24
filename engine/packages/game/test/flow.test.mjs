// M5 W2 (AB-T-0617): the session. A run that changes scene gives the same per-step hashes whatever loading takes; the
// change lands on its step; the game state goes with it; a save taken before a change loads and goes on with the
// unbroken run's hashes across it; a checkpoint is written at its declared point and loads the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns, assertSameRun, worldHashes, hashValue } from '@vrmxg/snapshot';
import { MemoryStore, installSave } from '@vrmxg/save';
import { SceneTree } from '@vrmxg/core';
import { m0Registry } from '@vrmxg/registry/m0';
import { GameFlow, recordFlow, worldSeed, installGame, CHECKPOINT_PREFIX } from '../src/index.js';
import { fixtureFlow, fixtureLoader, fixtureRecording, unloadWorld } from './fixtures/world.js';
import { R, scenes, sleep, word } from './helpers.mjs';

const STEPS = 600;
// the fixture's story with its recording (fixtures/world.js): where each world starts
const CHANGES = [[11, 'level.vrmxs'], [148, 'ending.vrmxs'], [208, 'title.vrmxs'], [267, 'level.vrmxs'], [404, 'ending.vrmxs'], [464, 'title.vrmxs'], [523, 'level.vrmxs']];

/** The unbroken run every other test compares with (made once). */
let reference = null;
async function unbroken() {
  if (reference) return reference;
  const store = new MemoryStore(), events = [], built = [];
  const flow = await fixtureFlow(await R(), scenes(), { store, recording: fixtureRecording(STEPS), built });
  flow.on((e) => events.push(e));
  const views = new Map(), saves = new Map();
  const run = await recordFlow(flow, STEPS, { onStep: (step) => {
    flow.flush();
    if ([5, 60, 100, 147, 148, 207, 300].includes(step)) { views.set(step, flow.view()); saves.set(step, JSON.parse(JSON.stringify(flow.save({ name: `at ${step}` })))); }
  } });
  await flow.settle(); flow.flush();
  reference = { run, events, built, views, saves, store, checkpoints: new Map(flow.checkpoints), final: flow.view() };
  flow.dispose();
  return reference;
}
const tail = (run, from) => run.filter((r) => r.step > from);

test('a 600-step session changes scene seven times, each on its step, and carries the game with it', async () => {
  const { run, events, built, views, final } = await unbroken();
  assert.equal(run.length, STEPS);
  assert.deepEqual(run.map((r) => r.step), Array.from({ length: STEPS }, (_, i) => i + 1), 'one clock for the whole session');
  const changes = events.filter((e) => e.type === 'scene').map((e) => [e.step, e.to]);
  assert.deepEqual(changes, CHANGES);
  // the world asked for at each change: the scene, the step the old world ended on, a seed of its own
  assert.deepEqual(built.map((b) => [b.step, b.scene, b.reason]), [[0, 'title.vrmxs', 'start'], ...CHANGES.map(([step, scene]) => [step, scene, 'change'])]);
  assert.deepEqual(built.map((b) => b.seed), [7, ...CHANGES.map((_, i) => worldSeed(7, i + 1))]);
  assert.equal(new Set(built.map((b) => b.seed)).size, built.length, 'the level entered twice gets two seeds');
  // the scene of every step: the old world's last step is `at`, the new one's first is `at` + 1
  for (const [at, to] of CHANGES) { assert.notEqual(run[at - 1].scene, to, `step ${at} is the old world's`); assert.equal(run[at].scene, to, `step ${at + 1} is ${to}'s`); }
  // carried: the score and the outcome reach the ending, with the level's clock as it stopped
  // (at the boundary of the change itself the world is still the level's: the change is made as the next step starts)
  assert.deepEqual([views.get(148).scene, views.get(148).pending], ['level.vrmxs', { to: 'ending.vrmxs', at: 148, reset: false }]);
  const ending = views.get(207);
  assert.deepEqual([ending.scene, ending.score, ending.outcome, ending.counters.orders, ending.flags.tillClosed, ending.arrivals], ['ending.vrmxs', 35, 'won', 1, true, 2]);
  assert.deepEqual([ending.timers.clock.elapsedSteps, ending.timers.clock.declared, ending.timers.clock.running], [107, false, false]);
  assert.deepEqual(views.get(147).decided, { result: 'won', step: 117, scene: 'level.vrmxs' });
  assert.deepEqual(ending.decided, views.get(147).decided);
  // the ending went back to the title as a new game: nothing carried but the session
  const again = views.get(300);
  assert.deepEqual([again.scene, again.score, again.outcome, again.counters.orders, again.flags.tillClosed, again.arrivals], ['level.vrmxs', 0, null, 0, false, 4]);
  assert.equal(again.timers.clock.elapsedSteps, 300 - 267, 'the level\'s clock started again');
  assert.equal(final.score, 10);
  // events: the story in order, and the checkpoints written
  const story = events.filter((e) => ['outcome', 'goal', 'checkpointWritten'].includes(e.type)).slice(0, 5).map((e) => [e.type, e.step, e.key ?? e.slot ?? e.result]);
  assert.deepEqual(story, [['goal', 66, 'take-order'], ['checkpointWritten', 67, 'checkpoint'], ['checkpointWritten', 67, 'after-order'], ['goal', 117, 'close-till'], ['outcome', 117, 'won']]);
});

test('the same run again, and with loading that takes any time, has the same hashes at every step', async () => {
  const { run } = await unbroken();
  const again = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(STEPS) });
  assertSameRun(run, await recordFlow(again, STEPS), 'two runs');
  again.dispose();
  // loading takes 0 to 12 ms, differently per world; steps are held meanwhile and counted
  let held = 0, n = 0;
  const slow = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(STEPS), delay: () => sleep([9, 0, 12, 3, 7, 1][n++ % 6]) });
  const slowRun = [];
  for (let i = 0; i < STEPS; i++) {
    while (!slow.step()) { held++; assert.match(slow.held, /^loading \w+\.vrmxs$/); await sleep(1); }
    slowRun.push({ step: slow.tree.clock.step, scene: slow.scene, h: worldHashes(slow.tree) });
  }
  assert.ok(held >= 7, `steps were held while worlds loaded (${held})`);
  assert.equal(compareRuns(run, slowRun), null);
  assert.deepEqual(slowRun.map(word), run.map(word));
  slow.dispose();
  // another session seed is another run: the seed reaches the worlds
  const other = await fixtureFlow(await R(), scenes(), { seed: 8, recording: fixtureRecording(STEPS) });
  const d = compareRuns(run, await recordFlow(other, 200));
  assert.ok(d && d.step <= 40, `seed 8 differs early (step ${d?.step}, ${d?.component})`);
  other.dispose();
});

test('a held step is an error for run(); runAsync and settle wait it out; a preload during `after` means no held step', async () => {
  const delays = [];
  const flow = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(STEPS), delay: async (req) => { delays.push(req.scene); await sleep(2); } });
  flow.run(11); // the request is made in step 10 (the 11th); the title's last step
  assert.equal(flow.tree.clock.step, 11);
  assert.equal(flow.step(), false, 'the level is still loading');
  assert.equal(flow.held, 'loading level.vrmxs');
  assert.equal(flow.scene, 'title.vrmxs');
  assert.throws(() => flow.run(1), /step 11 is held \(loading level\.vrmxs\): use runAsync/);
  await flow.settle();
  assert.equal(flow.held, null);
  assert.equal(flow.step(), true);
  assert.deepEqual([flow.scene, flow.tree.clock.step], ['level.vrmxs', 12]);
  // the level → ending change is asked with after: 0.5: the ending is built while the level plays those 30 steps
  await flow.runAsync(117 - 12 + 1);
  assert.deepEqual(flow.game.pending, { to: 'ending.vrmxs', at: 148, reset: false });
  await sleep(10);
  flow.run(30 + 5); // never held
  assert.deepEqual([flow.scene, flow.tree.clock.step], ['ending.vrmxs', 153]);
  flow.dispose();
});

test('a save taken before a scene change loads and goes on with the unbroken run\'s hashes across it', async () => {
  const { run, saves, views } = await unbroken();
  // 5: on the title, before any change. 60: in the level (the changes at 148, 208, 267… are ahead). 147: the last
  // boundary before the change, the request pending. 148: the boundary of the change itself. 207: before the reset.
  for (const at of [5, 60, 147, 148, 207]) {
    const file = saves.get(at);
    assert.equal(file.summary.step, at);
    const flow = new GameFlow({ load: fixtureLoader(await R(), scenes()), unload: unloadWorld, seed: 999 }); // the session comes from the file
    assert.equal(await flow.load(file), at);
    assert.deepEqual(flow.view(), views.get(at), `the view at ${at}`);
    flow.tree.services.get('input').replay(fixtureRecording(STEPS));
    const rest = await recordFlow(flow, STEPS - at);
    assertSameRun(tail(run, at), rest, `the save at ${at}`);
    assert.equal(rest.at(-1).step, STEPS);
    flow.dispose();
  }
  assert.deepEqual(saves.get(60).extra.game, { scene: 'level.vrmxs', score: 0, goal: 'Take the order', outcome: null });
  assert.equal(saves.get(60).requires.scene.ref, 'level.vrmxs');
  assert.ok(saves.get(60).requires.services.includes('game'));
});

test('a load replaces the world being played, mid-session; a file that can\'t load leaves it alone', async () => {
  const { run, saves } = await unbroken();
  const worlds = [];
  const flow = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(STEPS), onWorld: (_t, info) => worlds.push(info) });
  await flow.runAsync(250); // on the second title
  const seen = [];
  flow.on((e) => seen.push(e.type));
  assert.equal(await flow.load(saves.get(100)), 100);
  assert.deepEqual([flow.scene, flow.tree.clock.step], ['level.vrmxs', 100]);
  assert.deepEqual(worlds.at(-1), { reason: 'load', from: 'title.vrmxs', to: 'level.vrmxs' });
  flow.flush();
  assert.deepEqual(seen, ['loaded', 'restored']);
  flow.tree.services.get('input').replay(fixtureRecording(STEPS));
  assertSameRun(tail(run, 100).slice(0, 150), await recordFlow(flow, 150), 'played on from the loaded save');
  // a save of a scene that has changed since is refused, and play goes on where it was
  const edited = scenes(); edited.get('level.vrmxs').nodes.find((n) => n.id === 'clock').props.seconds = 9;
  const other = new GameFlow({ load: fixtureLoader(await R(), edited), unload: unloadWorld });
  await other.start('title.vrmxs');
  other.run(3);
  await assert.rejects(other.load(saves.get(100)), /the scene now is/);
  assert.deepEqual([other.scene, other.tree.clock.step, other.step()], ['title.vrmxs', 3, true]);
  await assert.rejects(other.load({ format: 'vrmxg-save', version: 1, requires: {}, summary: {} }), /doesn't name its scene/);
  flow.dispose(); other.dispose();
});

test('a checkpoint is written at its declared point, by the game, and loads like any save', async () => {
  const { run, store, events, checkpoints } = await unbroken();
  // two Checkpoint nodes fire in step 66: cp by the gate's connection, cp-order by its condition. Both are the world
  // at the boundary after it, and the later playthroughs write the slots again (579 is the last).
  const written = events.filter((e) => e.type === 'checkpointWritten').map((e) => [e.step, e.slot, e.id, e.stored]);
  assert.deepEqual(written, [[67, 'checkpoint', 'cp', true], [67, 'after-order', 'cp-order', true], [323, 'checkpoint', 'cp', true], [323, 'after-order', 'cp-order', true], [579, 'checkpoint', 'cp', true], [579, 'after-order', 'cp-order', true]]);
  assert.deepEqual((await store.list()).map((s) => [s.slot, s.name, s.step, s.scene]), [['auto-after-order', 'Order taken', 579, 'level.vrmxs'], ['auto-checkpoint', 'At the counter', 579, 'level.vrmxs']], 'in the store under the checkpoints\' prefix, apart from a player\'s saves');
  assert.equal(CHECKPOINT_PREFIX, 'auto-');
  assert.deepEqual(await store.read('auto-checkpoint'), JSON.parse(JSON.stringify(checkpoints.get('checkpoint'))), 'the store has the file the flow took');
  assert.equal((await store.read('auto-checkpoint')).note, 'checkpoint cp');

  // the first one (step 67), kept by a run that stops there; loaded from the store into a new session
  const first = new MemoryStore();
  const a = await fixtureFlow(await R(), scenes(), { store: first, recording: fixtureRecording(STEPS) });
  await a.runAsync(80); await a.settle();
  const file = await first.read('auto-checkpoint');
  assert.deepEqual([file.summary.step, file.name, file.extra.game.score], [67, 'At the counter', 10]);
  a.dispose();
  let writes = 0;
  const counting = { read: (slot) => first.read(slot), write: (slot, doc) => { writes++; return first.write(slot, doc); } };
  const b = new GameFlow({ load: fixtureLoader(await R(), scenes()), unload: unloadWorld, store: counting });
  assert.equal(await b.loadCheckpoint('checkpoint'), 67);
  assert.deepEqual([b.scene, b.view().score, b.view().goal.key, b.view().checkpoint], ['level.vrmxs', 10, 'close-till', { slot: 'after-order', id: 'cp-order', requested: 66 }]);
  b.tree.services.get('input').replay(fixtureRecording(STEPS));
  const rest = await recordFlow(b, 300 - 67);
  assertSameRun(tail(run, 67).slice(0, 300 - 67), rest, 'the checkpoint, loaded');
  await b.settle();
  assert.equal(writes, 0, 'loading a checkpoint doesn\'t write it again; the next one is at 323');
  await b.runAsync(30); await b.settle();
  assert.equal(writes, 2);
  b.dispose();

  // without a store the flow keeps the latest file of each slot itself
  const c = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(STEPS) });
  const seen = []; c.on((e) => { if (e.type === 'checkpointWritten') seen.push([e.slot, e.step, e.stored]); });
  await c.runAsync(100);
  assert.deepEqual(seen, [['checkpoint', 67, false], ['after-order', 67, false]]);
  assert.equal(await c.loadCheckpoint('after-order'), 67);
  await assert.rejects(c.loadCheckpoint('nowhere'), /no checkpoint "nowhere"/);
  c.dispose();
});

test('nobody plays: the level\'s clock runs out, the game is lost, and the ending keeps that', async () => {
  const flow = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(STEPS, { push: false }) });
  const events = []; flow.on((e) => events.push(e));
  await flow.runAsync(11 + 360 + 31); flow.flush();
  // entered at 11, the clock's 360th tick is step 370; the ending 0.5 s later
  assert.deepEqual(events.filter((e) => e.type === 'outcome' || e.type === 'scene').map((e) => [e.type, e.step, e.result ?? e.to]), [['scene', 11, 'level.vrmxs'], ['outcome', 370, 'lost'], ['scene', 401, 'ending.vrmxs']]);
  assert.deepEqual([flow.view().scene, flow.view().outcome, flow.view().score, flow.view().timers.clock.left], ['ending.vrmxs', 'lost', 0, 0]);
  assert.deepEqual(flow.view().checkpoints, {}, 'no checkpoint: the ball never reached the gate');
  flow.dispose();
});

test('a recording being made goes on across scene changes, and replays the session', async () => {
  const source = fixtureRecording(300);
  // "live" devices stand in as a replay on a second service; here the recording is made while the first one replays
  const flow = await fixtureFlow(await R(), scenes(), { recording: source });
  flow.tree.services.get('input').record();
  const run = await recordFlow(flow, 300);
  const made = flow.tree.services.get('input').stop();
  assert.deepEqual([made.start, made.frames.length], [0, 300], 'one recording for the session, through four worlds');
  assert.deepEqual(made.frames, source.frames);
  flow.dispose();
  const again = await fixtureFlow(await R(), scenes(), { recording: made });
  assertSameRun(run, await recordFlow(again, 300), 'the recording, replayed');
  again.dispose();
});

test('what a HUD binds to outlives worlds: one listener, the view of whichever scene is played', async () => {
  const flow = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(STEPS) });
  const types = new Set(), scenesSeen = [];
  const versions = new Set();
  flow.on((e) => { types.add(e.type); if (e.type === 'scene') scenesSeen.push(flow.view().scene); });
  for (let i = 0; i < 220; i++) { while (!flow.step()) await flow.settle(); flow.tree.present(1 / 60, 0); versions.add(flow.version); }
  assert.deepEqual(scenesSeen, ['level.vrmxs', 'ending.vrmxs', 'title.vrmxs']);
  for (const t of ['pending', 'scene', 'counter', 'goal', 'flag', 'checkpoint', 'checkpointWritten', 'outcome', 'timer']) assert.ok(types.has(t), t);
  assert.ok(versions.size > 100, 'the version moves while a clock runs');
  assert.deepEqual(JSON.parse(JSON.stringify(flow.view())), flow.view());
  flow.dispose();
  assert.equal(flow.view(), null);
});

test('a host that builds the wrong world is told; a failed load surfaces on the step of the change', async () => {
  const good = fixtureLoader(await R(), scenes());
  const flow = (load) => new GameFlow({ load, unload: unloadWorld, seed: 7 });
  await assert.rejects(flow(async (req) => good({ ...req, seed: 1 })).start('title.vrmxs'), /has seed 1, not 7: new SceneTree\(\{ seed: request\.seed \}\)/);
  await assert.rejects(flow(async (req) => { const t = await good(req); t.clock.step = 3; return t; }).start('title.vrmxs'), /is at step 3, not 0/);
  await assert.rejects(flow(async () => new SceneTree({ registry: m0Registry(), seed: 7 })).start('title.vrmxs'), /has no game service: installGame/);
  await assert.rejects(flow(async (req) => good({ ...req, scene: 'ending.vrmxs' })).start('title.vrmxs'), /asked for "title\.vrmxs", got a world of "ending\.vrmxs"/);
  assert.throws(() => new GameFlow({}), /needs load/);

  const f = flow(async (req) => { if (req.scene === 'level.vrmxs') throw new Error('level.vrmxs: 404'); return good(req); });
  await f.start('title.vrmxs');
  f.tree.services.get('input').replay(fixtureRecording(100));
  f.run(11);
  await f.settle();
  assert.throws(() => f.step(), /the scene change to "level\.vrmxs" failed: level\.vrmxs: 404/);
  assert.equal(f.scene, 'title.vrmxs');
  f.dispose();
});

test('a later request replaces a pending one: the world built for the first is unloaded, not played', async () => {
  const unloaded = [], built = [];
  const flow = new GameFlow({ load: fixtureLoader(await R(), scenes(), { built }), unload: (t) => { unloaded.push(t.services.get('game').scene); unloadWorld(t); }, seed: 7 });
  await flow.start('title.vrmxs');
  flow.run(2);
  flow.game.changeScene({ to: 'level.vrmxs', after: 1 });
  flow.run(3); await flow.settle();
  flow.game.changeScene({ to: 'ending.vrmxs', after: 0.1 });
  await flow.runAsync(10);
  assert.deepEqual(built.map((b) => [b.scene, b.step]), [['title.vrmxs', 0], ['level.vrmxs', 63], ['ending.vrmxs', 12]]);
  assert.deepEqual(unloaded, ['level.vrmxs', 'title.vrmxs']);
  assert.deepEqual([flow.scene, flow.tree.clock.step, flow.view().sceneSteps], ['ending.vrmxs', 15, 3]);
  flow.dispose();
  assert.deepEqual(unloaded, ['level.vrmxs', 'title.vrmxs', 'ending.vrmxs']);
});

test('carried across a change: game-scoped values, and the services the flow is told to carry', async () => {
  const doc = (id, nodes, connections = []) => ({ format: 'vrmxs', version: 1, id, nodes: [{ id: 'root', type: 'Node3D' }, ...nodes.map((n) => ({ parent: 'root', ...n }))], connections });
  const docs = new Map([
    ['a', doc('a', [
      { id: 'rules', type: 'GameRules', props: { flags: { key: false } } },
      { id: 'coins', type: 'GameCounter', props: { start: 1 } }, { id: 'tries', type: 'GameCounter', props: { scope: 'scene' } },
      { id: 'total', type: 'GameTimer', props: { scope: 'game' } }, { id: 'lap', type: 'GameTimer' },
      { id: 'found', type: 'GameGoal', props: { scope: 'game' } }, { id: 'here', type: 'GameGoal' },
    ])],
    ['b', doc('b', [
      { id: 'rules', type: 'GameRules', props: { flags: { key: true, lamp: true } } },
      { id: 'coins', type: 'GameCounter', props: { start: 50 } }, { id: 'tries', type: 'GameCounter', props: { scope: 'scene', start: 3 } },
      { id: 'total', type: 'GameTimer', props: { scope: 'game' } }, { id: 'lap', type: 'GameTimer' },
      { id: 'found', type: 'GameGoal', props: { scope: 'game' } }, { id: 'here', type: 'GameGoal' },
    ])],
  ]);
  const load = (req) => {
    const tree = new SceneTree({ registry: m0Registry(), seed: req.seed });
    tree.clock.step = req.step;
    installGame(tree, { scene: req.scene }); installSave(tree, { scene: { ref: req.scene, doc: docs.get(req.scene) } });
    return tree.instantiate(structuredClone(docs.get(req.scene)));
  };
  const flow = await new GameFlow({ load, seed: 5 }).start('a');
  flow.run(10);
  flow.game.add('coins', 4); flow.game.add('tries', 2); flow.game.setFlag('key'); flow.game.completeGoal('found'); flow.game.completeGoal('here');
  flow.tree.services.get('save').setFlag('doorOpen');
  flow.game.changeScene({ to: 'b' });
  flow.tree.clock.timeScale = 0.5; // slow motion is the session's, not the scene's
  await flow.runAsync(5);
  assert.equal(flow.tree.clock.timeScale, 0.5);
  let v = flow.view();
  assert.deepEqual([v.scene, v.step, v.sceneSteps, v.arrivals], ['b', 15, 4, 1]);
  assert.deepEqual(v.counters, { coins: 5, tries: 3 }, 'coins carried over b\'s start; tries is the scene\'s own');
  assert.deepEqual(v.flags, { key: true, lamp: true }, 'a carried flag wins over the scene\'s start; a new one starts');
  // both of a's goals done was a win there, which held its clocks; b's rules start undecided and the game's clock runs on
  assert.deepEqual([v.timers.total.elapsedSteps, v.timers.total.running, v.timers.lap.elapsedSteps, v.outcome], [15, true, 4, null]);
  assert.deepEqual([v.goals.found.done, v.goals.here.done], [true, false]);
  assert.equal(flow.tree.services.get('save').getFlag('doorOpen'), true, 'save\'s flags are carried');
  assert.equal(flow.tree.rng.seed, worldSeed(5, 1));
  // a reset: a new game in a, nothing carried but the clock and the session
  flow.game.changeScene({ to: 'a', reset: true });
  await flow.runAsync(2);
  v = flow.view();
  assert.deepEqual([v.scene, v.step, v.arrivals, v.counters, v.flags, v.goals.found.done, v.timers.total.elapsedSteps], ['a', 17, 2, { coins: 1, tries: 0 }, { key: false }, false, 1]);
  assert.equal(flow.tree.services.get('save').getFlag('doorOpen'), undefined);
  flow.dispose();
});

test('live play: frame() runs the due steps and presents; a loading world is a hitch, not a different run', async () => {
  const { run } = await unbroken();
  let release = null;
  const flow = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(STEPS), delay: (req) => (req.reason === 'change' ? new Promise((ok) => { release = ok; }) : null) });
  const events = []; flow.on((e) => events.push(e.type));
  for (let i = 0; i < 11; i++) flow.frame(1 / 60);
  assert.equal(flow.tree.clock.step, 11);
  assert.deepEqual(events, ['pending'], 'presentation delivered the step\'s event');
  for (let i = 0; i < 20; i++) flow.frame(1 / 60); // the level isn't there yet: frames go by, no step does
  assert.deepEqual([flow.tree.clock.step, flow.scene, flow.held], [11, 'title.vrmxs', 'loading level.vrmxs']);
  await sleep(1); // the build starts on a later turn of the loop: twenty frames went by before it had even begun
  release(); await flow.settle();
  const seen = [];
  for (let i = 0; i < 40; i++) { flow.frame(1 / 60); seen.push(flow.tree.clock.step); }
  assert.equal(flow.scene, 'level.vrmxs');
  assert.ok(flow.tree.clock.step >= 51, `the backlog is caught up, at most 8 steps a frame (${flow.tree.clock.step})`);
  // the hitch moved nothing: the level's steps hash as the unbroken run's
  const at = flow.tree.clock.step;
  assert.equal(hashValue(worldHashes(flow.tree)), word(run[at - 1]), `step ${at}`);
  assert.ok(events.includes('scene'));
  flow.dispose();
});
