// M5 W2 (AB-T-0617), the edges found in review of PR 31. One test per rule:
//   1. no checkpoint is taken or written on or after the step the game is decided;
//   2. loadCheckpoint loads the session's own newest file, whatever the store is doing;
//   3. a countdown driven to nothing times out; "no limit" is a stopwatch, said by leaving seconds out;
//   4. a condition reads only what its scene declares (checked when the rules start), and a comparison with nothing
//      to compare is false; no name is special;
//   5. a checkpoint asked for while the world can't be saved waits in the state, and one a scene change overtakes
//      says so: the state never claims a checkpoint no file was written for without a `checkpointFailed`;
//   6. the game is decided once per step, so a win and a loss on the same step is a win whatever asked for them;
// and four smaller ones about the flow: a carry that throws, a recording across a load, the store's namespace, and
// waiting for a load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { captureWorld, restoreWorld } from '@vrmxg/snapshot';
import { installSave, MemoryStore } from '@vrmxg/save';
import { installInput } from '@vrmxg/input';
import { GameFlow, installGame, holds, checkKeys, describeRules, checkGame, CHECKPOINT_PREFIX } from '../src/index.js';
import { fixtureFlow, fixtureRecording } from './fixtures/world.js';
import { R, rulesWorld, scenes, sleep } from './helpers.mjs';

const state = (key, op, value) => ({ test: 'state', key, ...(op ? { op } : {}), ...(value !== undefined ? { value } : {}) });
const doc = (id, nodes, connections = []) => ({ format: 'vrmxs', version: 1, id, nodes: [{ id: 'root', type: 'Node3D' }, ...nodes.map((n) => ({ parent: 'root', ...n }))], connections });

/**
 * A flow over small scenes with no physics: the game and save services, and whatever `install` adds.
 * @param {Record<string, any>} docs scenes by name @param {{ store?: any, install?: (tree: any, req: any) => void, delay?: number, built?: any[], unloaded?: any[], carry?: string[] }} [o]
 */
async function miniFlow(docs, { store = null, install = null, delay = 0, built = null, unloaded = null, carry } = {}) {
  const load = async (req) => {
    built?.push(req.scene);
    if (delay) await sleep(delay);
    const tree = new SceneTree({ registry: m0Registry(), seed: req.seed });
    tree.clock.step = req.step;
    installInput(tree);
    installGame(tree, { scene: req.scene });
    installSave(tree, { scene: { ref: req.scene, doc: docs[req.scene] } });
    install?.(tree, req);
    return tree.instantiate(structuredClone(docs[req.scene]));
  };
  const flow = new GameFlow({ load, store, seed: 5, unload: (t) => unloaded?.push(t.services.get('game').scene), ...(carry ? { carry } : {}) });
  const events = [];
  flow.on((e) => events.push(e));
  await flow.start(Object.keys(docs)[0]);
  return { flow, events, types: () => { flow.flush(); return events.map((e) => e.type); } };
}

// ---------------------------------------------------------------- 1

test('1. a checkpoint is never taken on the step the game is decided, by its condition or by its action', async () => {
  // the review's case: a half-second clock, a loss when it runs out, and a checkpoint whose condition is that same moment
  const losing = { 'a.vrmxs': doc('a', [
    { id: 'rules', type: 'GameRules', props: { lose: state('timers.clock.done') } },
    { id: 'clock', type: 'GameTimer', props: { seconds: 0.5 } },
    { id: 'cp', type: 'Checkpoint', props: { when: state('timers.clock.done') } },
  ]) };
  const store = new MemoryStore();
  const { flow, events, types } = await miniFlow(losing, { store });
  const written = []; flow.tree.find('cp').on('written', (e) => written.push(e));
  flow.run(40); await flow.settle();
  assert.equal(flow.view().outcome, 'lost');
  assert.deepEqual([flow.view().checkpoints, flow.game.checkpointSeq, flow.checkpoints.size, await store.list(), written], [{}, 0, 0, [], []], 'no checkpoint in the state, in the session or in the store');
  assert.deepEqual(types().filter((t) => t.startsWith('checkpoint')), ['checkpointSkipped']);
  assert.deepEqual(events.find((e) => e.type === 'checkpointSkipped'), { type: 'checkpointSkipped', id: 'cp', slot: 'checkpoint', reason: 'decided', step: 29 });
  flow.dispose();

  // by its action, in the step a win is decided: the same
  const winning = rulesWorld([
    { id: 'rules', type: 'GameRules', props: { flags: { done: false }, win: state('flags.done') } },
    { id: 'cp', type: 'Checkpoint' },
  ]);
  winning.tree.run(3);
  winning.tree.find('cp').call('write'); winning.game.setFlag('done');
  winning.tree.step();
  assert.deepEqual([winning.game.view().outcome, winning.game.view().checkpoints, winning.game.fired], ['won', {}, {}]);

  // one step earlier it is taken, and the file is of an undecided game
  const early = { 'a.vrmxs': doc('a', [
    { id: 'rules', type: 'GameRules', props: { lose: state('timers.clock.done') } },
    { id: 'clock', type: 'GameTimer', props: { seconds: 0.5 } },
    { id: 'cp', type: 'Checkpoint', props: { when: state('timers.clock.leftSteps', 'le', 1) } },
  ]) };
  const e = await miniFlow(early);
  e.flow.run(40);
  assert.equal(e.flow.view().outcome, 'lost');
  const file = e.flow.checkpoints.get('checkpoint');
  assert.deepEqual([file.summary.step, file.extra.game.outcome, e.flow.view().checkpoints.checkpoint.requested], [29, null, 28]);
  assert.equal(await e.flow.loadCheckpoint(), 29);
  assert.deepEqual([e.flow.view().outcome, e.flow.view().timers.clock.leftSteps], [null, 1], 'loaded: one step of clock left, not lost');

  // and the flow itself refuses, should anything hand it a decided game's checkpoint: it tells, and writes nothing
  e.flow.run(2);
  assert.equal(e.flow.view().outcome, 'lost');
  e.flow.checkpoints.clear();
  e.flow.game.checkpoints.forced = { id: 'cp', label: null, requested: e.flow.tree.clock.step, seq: ++e.flow.game.checkpointSeq };
  e.flow.run(1);
  assert.deepEqual(e.events.at(-1), { type: 'checkpointFailed', id: 'cp', slot: 'forced', step: 32, error: 'the game is lost' });
  assert.equal(e.flow.checkpoints.size, 0);
  e.flow.dispose();
});

// ---------------------------------------------------------------- 2

test('2. loadCheckpoint loads the session\'s own newest file: before the store has written it, after a newer one, after a failed write', async () => {
  const two = { 'a.vrmxs': doc('a', [
    { id: 'first', type: 'Checkpoint', props: { slot: 's', when: state('sceneSteps', 'ge', 5) } },
    { id: 'second', type: 'Checkpoint', props: { slot: 's', when: state('sceneSteps', 'ge', 10) } },
  ]) };
  const inner = new MemoryStore();
  let fail = false, writes = 0;
  const slow = { read: (slot) => inner.read(slot), write: async (slot, file) => { await sleep(30); writes++; if (fail) throw new Error('disk full'); return inner.write(slot, file); } };

  // right after the checkpoint is taken, the store's write still 30 ms away
  let a = await miniFlow(two, { store: slow });
  a.flow.run(6);
  assert.deepEqual([a.types().filter((t) => t.startsWith('checkpoint')), writes], [['checkpoint'], 0], 'taken; the file isn\'t in the store yet');
  assert.equal(await a.flow.loadCheckpoint('s'), 6);
  await a.flow.settle();
  a.flow.dispose();

  // after a second checkpoint into the same slot, the store still holding the first: the second is loaded
  a = await miniFlow(two, { store: slow });
  a.flow.run(6); await a.flow.settle();
  assert.equal((await inner.read(`${CHECKPOINT_PREFIX}s`)).summary.step, 6);
  a.flow.run(5);
  assert.equal((await inner.read(`${CHECKPOINT_PREFIX}s`)).summary.step, 6, 'the store has the older file');
  assert.equal(await a.flow.loadCheckpoint('s'), 11, 'the newer one is loaded');
  await a.flow.settle();
  a.flow.dispose();

  // after a write that failed: the listeners are told, and the session's file still loads
  fail = true;
  a = await miniFlow(two, { store: slow });
  a.flow.run(6); await a.flow.settle();
  assert.deepEqual(a.events.at(-1), { type: 'checkpointFailed', id: 'first', slot: 's', step: 6, error: 'disk full' });
  assert.equal(await a.flow.loadCheckpoint('s'), 6);
  a.flow.dispose();

  // a session that took none itself reads the store's; a slot nobody wrote is an error that names it
  fail = false;
  const fresh = new GameFlow({ load: async (req) => { const t = new SceneTree({ registry: m0Registry(), seed: req.seed }); installInput(t); installGame(t, { scene: req.scene }); installSave(t, { scene: { ref: req.scene, doc: two['a.vrmxs'] } }); return t.instantiate(structuredClone(two['a.vrmxs'])); }, store: slow });
  assert.equal(await fresh.loadCheckpoint('s'), 11, 'the last file the store was given');
  await assert.rejects(fresh.loadCheckpoint('other'), /no checkpoint "other"/);
  fresh.dispose();
});

// ---------------------------------------------------------------- 3

test('3. a countdown driven to nothing times out; a stopwatch is a timer without seconds, and stays one', () => {
  const { tree, game } = rulesWorld([
    { id: 'five', type: 'GameTimer', props: { seconds: 5 } },
    { id: 'tiny', type: 'GameTimer', props: { seconds: 0.008 } },
    { id: 'watch', type: 'GameTimer' },
  ]);
  const out = [];
  for (const id of ['five', 'tiny', 'watch']) tree.find(id).on('timeout', () => out.push([id, tree.clock.step]));
  assert.deepEqual(['five', 'tiny', 'watch'].map((k) => [game.view().timers[k].limit, game.view().timers[k].steps]), [[true, 300], [true, 1], [false, null]]);
  tree.step();
  assert.deepEqual(out, [['tiny', 0]], 'seconds too few to make a step is a countdown of one step, not a stopwatch');
  // seconds: 0 is neither: it would lose a game on its first step. The schema and the scene's start both refuse it.
  assert.throws(() => rulesWorld([{ id: 'zero', type: 'GameTimer', props: { seconds: 0 } }]), /GameTimer "zero": seconds is 0: a countdown needs seconds above zero \(leave seconds out for a stopwatch\)/);
  assert.equal(m0Registry().get('GameTimer').props.seconds.schema.exclusiveMinimum, 0);
  assert.match(describeRules(doc('z', [{ id: 'zero', type: 'GameTimer', props: { seconds: 0 } }])).problems.join(), /seconds above zero/);
  tree.run(9);
  tree.find('five').call('addTime', { seconds: -10 });
  assert.deepEqual([game.view().timers.five.limit, game.view().timers.five.steps, game.view().timers.five.left, game.view().timers.five.done], [true, 0, 0, false], 'taken below nothing it is still a countdown, with none left');
  tree.step();
  assert.deepEqual(out.at(-1), ['five', 10], 'and times out on its next tick');
  assert.equal(game.view().timers.five.done, true);
  tree.run(600);
  assert.deepEqual([out.length, game.view().timers.watch.elapsedSteps, game.view().timers.watch.done], [2, 611, false], 'the stopwatch never does');
  assert.throws(() => game.addTime('watch', 5), /timer "watch" is a stopwatch \(no seconds\): it has no time to add to/);
  assert.equal(game.view().timers.watch.limit, false, 'and adding time doesn\'t make it a countdown');
  tree.find('five').call('reset');
  assert.deepEqual([game.view().timers.five.steps, game.view().timers.five.left], [300, 5], 'reset gives a countdown its length back');
  assert.equal(m0Registry().get('GameTimer').props.seconds.schema.default, undefined, 'the schema gives seconds no default: absent means a stopwatch');
});

// ---------------------------------------------------------------- 4

test('4. a comparison with nothing to compare is false, whichever op, and no key is special', () => {
  const view = { score: 3, counters: { lives: 3 }, flags: {}, timers: { watch: { left: null, elapsed: 2 } }, outcome: null };
  for (const op of ['eq', 'ne', 'gt', 'ge', 'lt', 'le']) {
    assert.equal(holds(state('counters.livez', op, 3), view), false, `a counter that isn't there, ${op}`);
    assert.equal(holds(state('timers.watch.left', op, 0), view), false, `a stopwatch's time left (null), ${op}`);
    assert.equal(holds(state('outcome', op, 'won'), view), false, `no outcome yet, ${op}`);
    assert.equal(holds({ test: 'state', key: 'score', op }, view), false, `no value to compare with, ${op}`);
  }
  assert.equal(holds(state('counters.livez'), view), false);
  assert.equal(holds(state('counters.livez', 'unset'), view), true, 'unset is how nothing is tested for');
  assert.equal(holds({ test: 'not', of: state('counters.livez', 'eq', 3) }, view), true);
  // names that mean something to JavaScript or to a behaviour tree mean nothing here
  for (const key of ['self', '$self', 'constructor', 'toString', '__proto__', 'counters.constructor', 'counters.toString', 'counters.__proto__', 'counters.lives.constructor', 'score.toFixed']) {
    assert.equal(holds(state(key), view), false, key);
    assert.equal(holds(state(key, 'ne', 0), view), false, `${key} ne`);
    assert.equal(holds(state(key, 'unset'), view), true, `${key} unset`);
  }
  assert.equal(holds(state('counters.lives', 'eq', 3), view), true);
});

test('4. a condition that reads what its scene doesn\'t declare stops the scene, naming the node and the key', () => {
  const start = (nodes) => () => rulesWorld(nodes);
  // the review's cases: a mistyped counter in a loss (it lost on step 0), a mistyped flag in a goal (it never held),
  // a stopwatch's time left (null: `le 0` held), and a key that reached into a behaviour tree's `$self`
  assert.throws(start([{ id: 'rules', type: 'GameRules', props: { lose: state('counters.livez', 'ne', 3) } }, { id: 'lives', type: 'GameCounter', props: { start: 3 } }]),
    /GameRules "rules": lose reads "counters\.livez": this scene has no counter "livez" \(counters: lives\)/);
  assert.throws(start([{ id: 'rules', type: 'GameRules', props: { flags: { tillClosed: false } } }, { id: 'g', type: 'GameGoal', props: { when: state('flags.tilClosed') } }]),
    /GameGoal "g": when reads "flags\.tilClosed": nothing in this scene starts or sets a flag "tilClosed" \(flags: tillClosed\)\. Start it in GameRules' flags, or list it in GameRules' reads\.flags/);
  assert.throws(start([{ id: 'rules', type: 'GameRules', props: { lose: state('timers.watch.left', 'le', 0) } }, { id: 'watch', type: 'GameTimer' }]),
    /GameRules "rules": lose reads "timers\.watch\.left": "watch" is a stopwatch: it has no left to compare/);
  assert.throws(start([{ id: 'rules', type: 'GameRules', props: { win: state('self') } }]), /GameRules "rules": win reads "self": a condition can read score, outcome/);
  assert.throws(start([{ id: 'cp', type: 'Checkpoint', props: { when: { test: 'all', of: [state('score', 'ge', 1), state('goals.serve.done')] } } }]),
    /Checkpoint "cp": when\.of\[1\] reads "goals\.serve\.done": this scene has no goal "serve" \(goals: none\)/);
  assert.throws(start([{ id: 'clock', type: 'GameTimer', props: { seconds: 3 } }, { id: 'g', type: 'GameGoal', props: { when: state('timers.clock') } }]), /a timer is read as "timers\.<name>\.<field>"/);
  assert.throws(start([{ id: 'clock', type: 'GameTimer', props: { seconds: 3 } }, { id: 'g', type: 'GameGoal', props: { when: state('timers.clock.remaining', 'le', 0) } }]), /a timer is read as/);
  assert.throws(start([{ id: 'g', type: 'GameGoal', props: { when: state('score.total', 'ge', 1) } }]), /"score" is a value, with nothing under it/);
  // every problem of the scene at once, and the same list from the document without running it
  const bad = [{ id: 'rules', type: 'GameRules', props: { win: state('counters.a', 'ge', 1), lose: state('flags.b') } }, { id: 'g', type: 'GameGoal', props: { when: state('timers.c.done') } }];
  assert.throws(start(bad), /win reads "counters\.a".*lose reads "flags\.b".*GameGoal "g": when reads "timers\.c\.done"/);
  assert.equal(describeRules(doc('bad', bad)).problems.length, 3);
  assert.match(describeRules(doc('bad', bad)).problems[0], /GameRules "rules": win reads "counters\.a": this scene has no counter "a"/);
  // what is declared, in any order in the scene, is fine: the rules come first here and read what follows them
  const good = rulesWorld([
    { id: 'rules', type: 'GameRules', props: { flags: { open: true }, win: { test: 'all', of: [state('counters.coins', 'ge', 2), state('flags.open'), state('goals.g.done'), state('timers.clock.left', 'gt', 0), state('timers.watch.elapsed', 'ge', 0), state('checkpoints.checkpoint', 'unset'), state('decided.result', 'unset'), state('goal.key', 'unset')] } } },
    { id: 'coins', type: 'GameCounter' }, { id: 'g', type: 'GameGoal' }, { id: 'clock', type: 'GameTimer', props: { seconds: 9 } }, { id: 'watch', type: 'GameTimer' }, { id: 'cp', type: 'Checkpoint' },
  ]);
  good.game.add('coins', 2); good.game.completeGoal('g'); good.tree.step();
  assert.equal(good.game.view().outcome, 'won');
  // a node added while playing is checked too
  assert.throws(() => good.tree.add({ id: 'late', type: 'GameGoal', parent: 'root', props: { when: state('counters.gems', 'ge', 1) } }), /GameGoal "late": when reads "counters\.gems"/);
  assert.deepEqual(checkKeys(state('counters.coins', 'ge', 1), good.game.declared()), []);
});

test('4. a counter, a flag, a timer or a goal can have any name but "__proto__"', () => {
  const nodes = [
    { id: 'rules', type: 'GameRules', props: { flags: { toString: 'x', valueOf: false }, win: { test: 'all', of: [state('counters.constructor', 'ge', 2), state('goals.hasOwnProperty.done'), state('flags.toString', 'eq', 'y')] } } },
    { id: 'constructor', type: 'GameCounter', props: { start: 1 } },
    { id: 'toString', type: 'GameCounter' },
    { id: 'hasOwnProperty', type: 'GameGoal', props: { when: state('counters.toString', 'ge', 1) } },
    { id: 'valueOf', type: 'GameTimer', props: { seconds: 1 } },
  ];
  const { tree, game } = rulesWorld(nodes);
  assert.deepEqual(game.view().counters, { constructor: 1, toString: 0 }, 'they start at their start, like any other');
  assert.equal(game.get('isPrototypeOf'), 0, 'and one nobody declared is 0, not a function');
  tree.find('constructor').call('add'); tree.find('toString').call('add'); game.setFlag('toString', 'y');
  tree.step();
  assert.deepEqual([game.view().counters, game.view().goals.hasOwnProperty.done, game.view().timers.valueOf.elapsedSteps, game.view().outcome], [{ constructor: 2, toString: 1 }, true, 1, 'won']);
  const again = rulesWorld(nodes);
  restoreWorld(again.tree, JSON.parse(JSON.stringify(captureWorld(tree))));
  assert.deepEqual(again.game.view(), game.view(), 'through a snapshot and JSON');
  assert.throws(() => rulesWorld([{ id: 'c', type: 'GameCounter', props: { key: '__proto__' } }]), /GameCounter "c": a counter can't be named "__proto__"/);
  assert.throws(() => rulesWorld([{ id: 'r', type: 'GameRules', props: { flags: JSON.parse('{"__proto__": true}') } }]), /GameRules "r": a flag can't be named "__proto__"/);
  assert.throws(() => game.setFlag('__proto__'), /a flag can't be named "__proto__"/);
  assert.throws(() => game.add('__proto__'), /a counter can't be named "__proto__"/);
  assert.equal(describeRules(doc('p', [{ id: 'c', type: 'GameCounter', props: { key: '__proto__' } }])).problems.length, 1);
});

// ---------------------------------------------------------------- 5

// A stand-in for the closet's redraws: `busy(step)` says whether one is in flight, set when the stub's part of the step
// runs. As a service installed before the game it is what the game's rules see; installed after it (`late`), a redraw
// that starts once the rules have run.
const redraws = (busy, { late = false } = {}) => (tree) => {
  const closet = { jobs: [], [late ? 'afterNodes' : 'physicsProcess']() { this.jobs = busy(tree.clock.step) ? [{ label: 'outfit' }] : []; } };
  if (!late) { const game = tree.services.get('game'), save = tree.services.get('save'); tree.services.delete('game'); tree.services.delete('save'); tree.services.set('closet', closet); tree.services.set('game', game); tree.services.set('save', save); } else tree.services.set('closet', closet);
};

test('5. a checkpoint asked for while the world can\'t be saved waits, in the state, for the first step that can', async () => {
  const docs = { 'a.vrmxs': doc('a', [{ id: 'cp', type: 'Checkpoint', props: { when: state('sceneSteps', 'ge', 5) } }]) };
  const store = new MemoryStore();
  const { flow, events, types } = await miniFlow(docs, { store, install: redraws((step) => step >= 3 && step < 10) });
  flow.run(8); await flow.settle();
  assert.deepEqual(flow.game.requests.checkpoints, [{ id: 'cp', slot: 'checkpoint', label: null, once: true }], 'asked for at step 5, and still asked for');
  assert.deepEqual([flow.view().checkpoints, types().filter((t) => t.startsWith('checkpoint')), await store.list()], [{}, [], []], 'not taken: the state doesn\'t say so, nothing is written, nobody is told it was');
  assert.deepEqual(captureWorld(flow.tree).services.game.data.requests.checkpoints.length, 1, 'the wait is in the snapshot');
  flow.run(4); await flow.settle();
  assert.deepEqual(flow.view().checkpoints, { checkpoint: { id: 'cp', requested: 10 } }, 'taken on step 10, the first without a redraw');
  assert.deepEqual(events.filter((e) => e.type.startsWith('checkpoint')), [{ type: 'checkpoint', id: 'cp', slot: 'checkpoint', step: 10 }, { type: 'checkpointWritten', id: 'cp', slot: 'checkpoint', step: 11, stored: true }]);
  assert.equal((await store.read(`${CHECKPOINT_PREFIX}checkpoint`)).summary.step, 11);
  flow.run(20); await flow.settle();
  assert.equal(events.filter((e) => e.type === 'checkpointWritten').length, 1, 'once');
  flow.dispose();
});

test('5. a checkpoint still waiting when the scene changes is not taken, and says so: state, file and events agree', async () => {
  const docs = {
    'a.vrmxs': doc('a', [{ id: 'rules', type: 'GameRules' }, { id: 'cp', type: 'Checkpoint', props: { when: state('sceneSteps', 'ge', 5) } }, { id: 'go', type: 'GameTimer', props: { seconds: 0.15 } }],
      [{ from: 'go', signal: 'timeout', to: 'rules', call: 'changeScene', args: { to: 'b.vrmxs' } }]),
    'b.vrmxs': doc('b', [{ id: 'rules', type: 'GameRules' }]),
  };
  const store = new MemoryStore();
  const { flow, events } = await miniFlow(docs, { store, install: redraws((step) => step >= 3) });
  await flow.runAsync(20); await flow.settle(); flow.flush();
  assert.equal(flow.scene, 'b.vrmxs');
  assert.deepEqual(events.filter((e) => e.type.startsWith('checkpoint') || e.type === 'scene').map((e) => [e.type, e.step, e.reason ?? e.to]), [['checkpointSkipped', 9, 'scene'], ['scene', 9, 'b.vrmxs']]);
  assert.deepEqual([flow.view().checkpoints, flow.game.checkpointSeq, flow.game.requests.checkpoints, flow.checkpoints.size, await store.list()], [{}, 0, [], 0, []], 'nowhere says a checkpoint was taken');
  flow.dispose();
});

test('5. a world that turns out unsavable at the boundary: no file, and checkpointFailed says why', async () => {
  // a redraw that starts after the game's rules ran in step 5: the rules took the checkpoint, the boundary can't save it
  const docs = { 'a.vrmxs': doc('a', [{ id: 'cp', type: 'Checkpoint', props: { when: state('sceneSteps', 'ge', 5) } }]) };
  const store = new MemoryStore();
  const { flow, events } = await miniFlow(docs, { store, install: redraws((step) => step >= 5 && step < 8, { late: true }) });
  flow.run(20); await flow.settle(); flow.flush();
  const about = events.filter((e) => e.type.startsWith('checkpoint'));
  assert.deepEqual(about.map((e) => [e.type, e.step]), [['checkpoint', 5], ['checkpointFailed', 6]]);
  assert.match(about[1].error, /a closet redraw is in flight \(outfit\)/);
  assert.deepEqual([flow.checkpoints.size, await store.list()], [0, []], 'no file, then or later');
  await assert.rejects(flow.loadCheckpoint(), /no checkpoint "checkpoint"/);
  flow.dispose();
});

// ---------------------------------------------------------------- 6

test('6. the game is decided once a step: a win and a loss on the same step is a win, whatever asked for each', () => {
  // the review's case: a loss asked for by a goal's connection, earlier in the step than the win condition is read
  const a = rulesWorld([
    { id: 'rules', type: 'GameRules', props: { flags: { done: false }, win: state('flags.done') } },
    { id: 'trap', type: 'GameGoal', props: { when: state('flags.done') } },
  ], [{ from: 'trap', signal: 'completed', to: 'rules', call: 'lose' }]);
  const order = []; for (const s of ['won', 'lost']) a.tree.find('rules').on(s, () => order.push(s));
  a.game.setFlag('done'); a.tree.step();
  assert.deepEqual([a.game.view().outcome, order], ['won', ['won']], 'the goal\'s connection asked for a loss first; the win condition held: won, and `lost` never fired');

  // a loss asked for before the step's nodes ran (a contact, a behaviour), against a win by goals
  const b = rulesWorld([{ id: 'rules', type: 'GameRules' }, { id: 'g', type: 'GameGoal' }]);
  b.tree.find('rules').call('lose'); b.game.completeGoal('g');
  assert.equal(b.game.view().outcome, null, 'asking decides nothing yet');
  b.tree.step();
  assert.equal(b.game.view().outcome, 'won');

  // both actions, in either order
  for (const calls of [['lose', 'win'], ['win', 'lose']]) {
    const c = rulesWorld([{ id: 'rules', type: 'GameRules' }]);
    for (const call of calls) c.tree.find('rules').call(call);
    c.tree.step();
    assert.equal(c.game.view().outcome, 'won', calls.join(' then '));
  }
  // a win action against a lose condition
  const d = rulesWorld([{ id: 'rules', type: 'GameRules', props: { flags: { dead: true }, lose: state('flags.dead') } }]);
  d.tree.find('rules').call('win'); d.tree.step();
  assert.equal(d.game.view().outcome, 'won');
  // alone, a loss is a loss, decided at the end of the step it was asked in
  const e = rulesWorld([{ id: 'rules', type: 'GameRules' }, { id: 'clock', type: 'GameTimer', props: { seconds: 0.05 } }], [{ from: 'clock', signal: 'timeout', to: 'rules', call: 'lose' }]);
  e.tree.run(3);
  assert.deepEqual(e.game.view().decided, { result: 'lost', step: 2, scene: 'test.vrmxs' });
  // asked for between steps (a tool), it is decided by the next step's rules, and is in a snapshot meanwhile
  const f = rulesWorld([{ id: 'rules', type: 'GameRules' }]);
  f.tree.run(4); f.tree.find('rules').call('lose');
  const g = rulesWorld([{ id: 'rules', type: 'GameRules' }]);
  restoreWorld(g.tree, captureWorld(f.tree));
  g.tree.step();
  assert.deepEqual(g.game.view().decided, { result: 'lost', step: 4, scene: 'test.vrmxs' });
});

// ---------------------------------------------------------------- smaller

test('a carry that throws fails the change once: the built world is freed, not rebuilt, and the session stays where it was', async () => {
  const docs = { 'a.vrmxs': doc('a', [{ id: 'rules', type: 'GameRules' }]), 'b.vrmxs': doc('b', [{ id: 'rules', type: 'GameRules' }]) };
  const built = [], unloaded = [];
  const install = (tree) => tree.services.set('fragile', { getState: () => ({}), setState() { throw new Error('this build can\'t read that'); } });
  const { flow } = await miniFlow(docs, { built, unloaded, install, carry: ['save', 'fragile'] });
  flow.tree.services.get('input').record();
  flow.run(3);
  flow.game.changeScene({ to: 'b.vrmxs' });
  flow.run(1); await flow.settle();
  for (let i = 0; i < 3; i++) assert.throws(() => flow.step(), /the scene change to "b\.vrmxs" failed: this build can't read that/);
  assert.deepEqual([built, unloaded], [['a.vrmxs', 'b.vrmxs'], ['b.vrmxs']], 'b was built once and freed once');
  assert.deepEqual([flow.scene, flow.tree.clock.step], ['a.vrmxs', 4]);
  assert.equal(flow.tree.services.get('input').recording.frames.length, 4, 'the recording in progress wasn\'t moved to a world that never played');
  flow.dispose();
});

test('a load stops an input recording in progress and hands it over; it is never dropped', async () => {
  const worlds = [];
  const flow = await fixtureFlow(await R(), scenes(), { recording: fixtureRecording(200), onWorld: (_t, info) => worlds.push(info) });
  flow.run(5);
  const file = JSON.parse(JSON.stringify(flow.save({ name: 'early' })));
  flow.tree.services.get('input').record();
  await flow.runAsync(40);
  const events = []; flow.on((e) => events.push(e));
  assert.equal(await flow.load(file), 5);
  const loaded = events.find((e) => e.type === 'loaded');
  assert.deepEqual([loaded.recording.start, loaded.recording.frames.length], [5, 40], 'the 40 steps recorded before the load');
  assert.equal(worlds.at(-1).recording, loaded.recording);
  assert.equal(flow.tree.services.get('input').recording, null, 'the loaded world isn\'t recording: the clock jumped');
  // without one in progress the event has no recording
  events.length = 0;
  await flow.load(file);
  assert.equal('recording' in events.find((e) => e.type === 'loaded'), false);
  flow.dispose();
});

test('waiting for a load: runAsync and settle wait for it instead of spinning', async () => {
  const docs = { 'a.vrmxs': doc('a', [{ id: 'rules', type: 'GameRules' }, { id: 'score', type: 'GameCounter' }]) };
  const { flow } = await miniFlow(docs, { delay: 15 });
  flow.run(4);
  const file = flow.save();
  flow.run(10);
  const loading = flow.load(file);
  assert.deepEqual([flow.step(), flow.held], [false, 'loading a save']);
  await flow.runAsync(3); // would never return if waiting meant only yielding to promises: the load needs a timer to fire
  assert.equal(flow.tree.clock.step, 7, 'the three steps ran on the loaded world');
  assert.equal(await loading, 4);
  await assert.rejects(Promise.all([flow.load(file), flow.load(file)]), /a save is loading already/);
  await flow.settle();
  assert.equal(flow.held, null);
  flow.dispose();
});

// ---------------------------------------------------------------- the second round of review

// A service that asks for things on a step: installed after the game (its afterNodes runs once the step's rules have)
// or before it.
const asker = (ask, { before = false } = {}) => (tree, req) => {
  if (req.scene !== 'a.vrmxs') return;
  const service = { afterNodes() { ask(tree.services.get('game'), tree.clock.step); } };
  if (!before) { tree.services.set('asker', service); return; }
  const rest = [...tree.services]; tree.services.clear(); tree.services.set('asker', service); for (const [k, v] of rest) tree.services.set(k, v);
};

test('a win or a loss asked for late in a step is never lost to a scene change on that step, whatever the service order', async () => {
  const scenesFor = (keep) => ({
    'a.vrmxs': doc('a', [{ id: 'rules', type: 'GameRules' }, { id: 'clock', type: 'GameTimer', props: { seconds: 9 } }]),
    'b.vrmxs': doc('b', [{ id: 'rules', type: 'GameRules', props: { keepOutcome: keep } }]),
  });
  const play = async (ask, o, keep = true) => {
    const { flow, events } = await miniFlow(scenesFor(keep), { install: asker(ask, o) });
    await flow.runAsync(8); flow.flush();
    const out = { view: flow.view(), events: events.filter((e) => ['outcome', 'scene', 'timer'].includes(e.type)) };
    flow.dispose();
    return out;
  };
  const winAndGo = (game, step) => { if (step === 4) { game.win(); game.changeScene({ to: 'b.vrmxs' }); } };
  // the review's case: the asker after the game. The win is decided as the world is left, as of the step it was asked on
  const after = await play(winAndGo);
  assert.deepEqual(after.view.decided, { result: 'won', step: 4, scene: 'a.vrmxs' });
  assert.deepEqual(after.events.map((e) => [e.type, e.step, e.result ?? e.event ?? e.to]), [['outcome', 4, 'won'], ['timer', 5, 'stopped'], ['scene', 5, 'b.vrmxs']]);
  assert.equal(after.view.timers.clock.elapsedSteps, 5, 'the level\'s clock held where it was');
  // installed before the game the same calls give the same game: the order of services decides nothing
  const before = await play(winAndGo, { before: true });
  assert.deepEqual(before.view, after.view);
  assert.deepEqual(before.events.filter((e) => e.type !== 'timer'), after.events.filter((e) => e.type !== 'timer'));
  // a loss, and a loss with a win (a win beats it), asked late
  assert.deepEqual((await play((g, s) => { if (s === 4) { g.lose(); g.changeScene({ to: 'b.vrmxs' }); } })).view.decided, { result: 'lost', step: 4, scene: 'a.vrmxs' });
  assert.equal((await play((g, s) => { if (s === 4) { g.lose(); g.win(); g.changeScene({ to: 'b.vrmxs' }); } })).view.outcome, 'won');
  // into a scene that starts undecided the outcome isn't kept, as for any win: but it was decided, and said
  const fresh = await play(winAndGo, {}, false);
  assert.deepEqual([fresh.view.outcome, fresh.events.map((e) => e.type)], [null, ['outcome', 'timer', 'scene']]);
  assert.deepEqual(fresh, await play(winAndGo, { before: true }, false).then((b) => ({ view: b.view, events: fresh.events })), 'and that too is the same from either side');
  // with no scene change the next step's rules decide it, as of the step it was asked on
  const stay = await play((g, s) => { if (s === 4) g.lose(); });
  assert.deepEqual([stay.view.scene, stay.view.decided, stay.view.timers.clock.elapsedSteps], ['a.vrmxs', { result: 'lost', step: 4, scene: 'a.vrmxs' }, 6]);
});

test('a player\'s save can\'t take a checkpoint\'s name: saveTo refuses the reserved prefix and says why', async () => {
  const docs = { 'a.vrmxs': doc('a', [{ id: 'cp', type: 'Checkpoint', props: { slot: 'quick', when: state('sceneSteps', 'ge', 5) } }]) };
  const store = new MemoryStore();
  const { flow } = await miniFlow(docs, { store });
  flow.run(2);
  await assert.rejects(flow.saveTo('auto-quick', { name: 'mine' }), /"auto-quick" can't be a player's save: slots that start with "auto-" are the game's checkpoints \(a Checkpoint node's slot "quick" is written there\)\. Pick another name/);
  await assert.rejects(flow.saveTo('auto-'), /can't be a player's save/);
  assert.deepEqual(await store.list(), []);
  assert.equal((await flow.saveTo('quick', { name: 'mine' })).step, 2);
  flow.run(6); await flow.settle();
  assert.deepEqual((await store.list()).map((s) => [s.slot, s.name, s.step]), [['auto-quick', 'Checkpoint', 6], ['quick', 'mine', 2]], 'the player\'s save and the checkpoint side by side');
  assert.equal(await flow.loadFrom('quick'), 2);
  assert.equal(await flow.loadFrom('auto-quick'), 6);
  await assert.rejects(new GameFlow({ load: () => null }).saveTo('x'), /has no store/);
  flow.dispose();
});

// The level and the ending the tests below share. The level sets `foundKey` and `vip` only by connections a player may
// never trigger; the ending owns one goal and reads the rest.
const readsLevel = () => doc('level', [
  { id: 'rules', type: 'GameRules' },
  { id: 'orders', type: 'GameCounter' }, { id: 'clock', type: 'GameTimer', props: { seconds: 9, scope: 'game' } }, { id: 'watch', type: 'GameTimer', props: { scope: 'game' } },
  { id: 'serve', type: 'GameGoal', props: { optional: true } }, { id: 'cp', type: 'Checkpoint', props: { slot: 'door' } },
  { id: 'leave', type: 'GameTimer', props: { seconds: 0.1 } },
], [
  { from: 'leave', signal: 'timeout', to: 'rules', call: 'changeScene', args: { to: 'ending.vrmxs' } },
  { from: 'serve', signal: 'completed', to: 'rules', call: 'setFlag', args: { flag: 'vip' } },
  { from: 'cp', signal: 'written', to: 'rules', call: 'setFlag', args: { flag: 'foundKey' } },
]);
const readsEnding = (rules = {}, extra = []) => doc('ending', [
  { id: 'rules', type: 'GameRules', props: { keepOutcome: true, reads: { counters: ['orders'], flags: ['vip', 'foundKey'], timers: ['clock'], goals: ['serve'], checkpoints: ['door'] }, ...rules } },
  { id: 'thanks', type: 'GameGoal', props: { text: 'Say thanks', when: { test: 'all', of: [state('goals.serve.done'), state('counters.orders', 'ge', 2), state('flags.vip'), state('timers.clock.left', 'gt', 0), state('checkpoints.door')] } } },
  ...extra,
]);

test('a scene reads what another scene owns by listing it in its rules\' reads, without owning it', async () => {
  const { flow } = await miniFlow({ 'level.vrmxs': readsLevel(), 'ending.vrmxs': readsEnding() });
  flow.game.add('orders', 2); flow.game.completeGoal('serve'); flow.tree.find('cp').call('write');
  await flow.runAsync(12);
  const v = flow.view();
  assert.deepEqual([v.scene, v.goals.thanks.done, v.outcome, v.flags], ['ending.vrmxs', true, 'won', { foundKey: true, vip: true }], 'the ending\'s goal read all five and was done');
  assert.deepEqual(v.objectives.map((o) => o.key), ['thanks'], 'reading the level\'s goal didn\'t make it one of the ending\'s objectives');
  flow.dispose();

  // a flag only ever set by a connection in the scene is the scene's own: no entry in flags needed
  const set = rulesWorld([{ id: 'rules', type: 'GameRules', props: { win: state('flags.done') } }, { id: 't', type: 'GameTimer', props: { seconds: 0.05 } }], [{ from: 't', signal: 'timeout', to: 'rules', call: 'setFlag', args: { flag: 'done' } }]);
  set.tree.run(5);
  assert.equal(set.game.view().outcome, 'won');

  // reads that aren't lists of names, of a kind there isn't, or of what the scene declares itself, stop the scene
  assert.throws(() => rulesWorld([{ id: 'rules', type: 'GameRules', props: { reads: { scores: ['a'] } } }]), /GameRules "rules": reads has no "scores" \(counters, flags, timers, goals, checkpoints\)/);
  assert.throws(() => rulesWorld([{ id: 'rules', type: 'GameRules', props: { reads: { flags: 'vip' } } }]), /reads\.flags is a list of names/);
  assert.throws(() => rulesWorld([{ id: 'rules', type: 'GameRules', props: { reads: { counters: { orders: 'none' } } } }]), /reads\.counters is a list of names, or a map of name → the number/);
  assert.throws(() => rulesWorld([{ id: 'rules', type: 'GameRules', props: { reads: { counters: ['coins'] } } }, { id: 'coins', type: 'GameCounter', props: { start: 3 } }]), /GameRules "rules": reads\.counters lists "coins", which this scene declares itself: take it out of reads/);
  const d = describeRules(readsEnding());
  assert.deepEqual([d.problems, d.rules.reads.goals, d.goals.map((g) => g.key)], [[], ['serve'], ['thanks']]);
  assert.match(describeRules(doc('e', [{ id: 'g', type: 'GameGoal', props: { when: state('goals.serve.done') } }])).problems[0], /Add a GameGoal with that key, or list it in GameRules' reads\.goals if it is another scene's/);
  assert.match(describeRules(doc('e', [{ id: 'rules', type: 'GameRules', props: { reads: { goals: ['g'] } } }, { id: 'g', type: 'GameGoal' }])).problems[0], /reads\.goals lists "g", which this scene declares itself/);
});

test('what a scene reads and the game didn\'t bring has its starting value: no way of playing can stop the game at a scene change', async () => {
  // the review's cases, all in one play: the player never served (the `vip` flag's connection never fired), never
  // reached the checkpoint (so `foundKey` was never set and the slot never written), and took no orders
  const ending = () => readsEnding({ lose: { test: 'not', of: state('flags.foundKey') } }, [{ id: 'none', type: 'GameGoal', props: { optional: true, when: state('flags.foundKey', 'eq', false) } }]);
  const played = await miniFlow({ 'level.vrmxs': readsLevel(), 'ending.vrmxs': ending() });
  await played.flow.runAsync(12); played.flow.flush();
  const v = played.flow.view();
  assert.deepEqual([v.scene, v.arrivals], ['ending.vrmxs', 1], 'the change was made');
  assert.deepEqual(v.flags, { foundKey: false, vip: false }, 'a flag nothing set is false');
  assert.deepEqual([v.goals.serve, v.counters.orders, v.checkpoints], [{ done: false, step: null }, 0, {}], 'a goal not done, a counter 0, a checkpoint not taken');
  assert.deepEqual([v.goals.none.done, v.goals.thanks.done, v.outcome], [true, false, 'lost'], 'conditions go by those values: "foundKey eq false" holds, and its absence loses');
  played.flow.dispose();

  // reached from a scene that has none of it (no goal, no counter, no clock): the same, and the clock is simply not there
  const title = doc('title', [{ id: 'rules', type: 'GameRules' }, { id: 'go', type: 'GameTimer', props: { seconds: 0.05 } }], [{ from: 'go', signal: 'timeout', to: 'rules', call: 'changeScene', args: { to: 'ending.vrmxs' } }]);
  const from = await miniFlow({ 'title.vrmxs': title, 'ending.vrmxs': readsEnding() });
  await from.flow.runAsync(10);
  const w = from.flow.view();
  assert.deepEqual([w.scene, w.goals.serve.done, w.counters.orders, w.flags, 'clock' in w.timers, w.goals.thanks.done], ['ending.vrmxs', false, 0, { foundKey: false, vip: false }, false, false]);
  from.flow.dispose();

  // a start, a reset and an arrival with nothing read alike
  const alone = await miniFlow({ 'ending.vrmxs': readsEnding() });
  alone.flow.run(3);
  const a = alone.flow.view();
  assert.deepEqual([a.flags, a.goals.serve, a.counters, a.checkpoints], [w.flags, w.goals.serve, w.counters, w.checkpoints]);
  alone.flow.game.changeScene({ to: 'ending.vrmxs', reset: true });
  await alone.flow.runAsync(3);
  assert.deepEqual([alone.flow.view().flags, alone.flow.view().counters, alone.flow.view().arrivals], [a.flags, a.counters, 1]);
  alone.flow.dispose();

  // a counter read with a default of its own; and what the game does bring wins over the default
  const lives = (n) => doc('next', [{ id: 'rules', type: 'GameRules', props: { reads: { counters: { lives: n } }, lose: state('counters.lives', 'le', 0) } }]);
  const b = await miniFlow({ 'next.vrmxs': lives(3) });
  b.flow.run(3);
  assert.deepEqual([b.flow.view().counters, b.flow.view().outcome], [{ lives: 3 }, null], 'seen as its default, and not lost');
  assert.deepEqual([captureWorld(b.flow.tree).services.game.data.counters, b.flow.game.get('lives')], [{}, 3], 'seen, not stored: reading a value doesn\'t make it state');
  b.flow.dispose();
  const c = await miniFlow({ 'a.vrmxs': doc('a', [{ id: 'rules', type: 'GameRules' }, { id: 'lives', type: 'GameCounter', props: { start: 1 } }]), 'next.vrmxs': lives(3) });
  c.flow.game.changeScene({ to: 'next.vrmxs' });
  await c.flow.runAsync(3);
  assert.equal(c.flow.view().counters.lives, 1, 'the one life the game brought, not the default three');
  c.flow.dispose();

  // a clock read for its time left that arrives as a stopwatch: nothing to compare, so the comparison is false; no failure
  const s = await miniFlow({ 'level.vrmxs': readsLevel(), 'ending.vrmxs': doc('ending', [{ id: 'rules', type: 'GameRules', props: { reads: { timers: ['watch'] }, lose: state('timers.watch.left', 'le', 0) } }]) });
  await s.flow.runAsync(12);
  assert.deepEqual([s.flow.scene, s.flow.view().outcome, s.flow.view().timers.watch.left], ['ending.vrmxs', null, null]);
  s.flow.dispose();
});

test('a reader\'s default never stands in for the owner\'s start: hub first or level first, the level is the same', async () => {
  // the review's case: the hub only reads `lives` and `doorOpen`; the level owns them (three lives, the door open)
  const hub = doc('hub', [{ id: 'rules', type: 'GameRules', props: { reads: { counters: ['lives'], flags: ['doorOpen'], goals: ['escape'] } } }, { id: 'sign', type: 'GameGoal', props: { optional: true, when: state('flags.doorOpen') } }]);
  const level = doc('level', [
    { id: 'rules', type: 'GameRules', props: { flags: { doorOpen: true }, lose: state('counters.lives', 'le', 0) } },
    { id: 'lives', type: 'GameCounter', props: { start: 3 } }, { id: 'escape', type: 'GameGoal', props: { optional: true } },
  ]);
  const docs = { 'hub.vrmxs': hub, 'level.vrmxs': level };
  const state0 = (flow) => { const { counters, flags, goals, outcome } = captureWorld(flow.tree).services.game.data; return { counters, flags, goals, outcome }; };

  const direct = await miniFlow({ 'level.vrmxs': level });
  direct.flow.run(3);
  const started = state0(direct.flow);
  assert.deepEqual(started, { counters: { lives: 3 }, flags: { doorOpen: true }, goals: { escape: { done: false, step: null } }, outcome: null });
  direct.flow.dispose();

  const viaHub = await miniFlow(docs);
  viaHub.flow.run(3);
  assert.deepEqual([viaHub.flow.view().counters, viaHub.flow.view().flags, viaHub.flow.view().goals.sign.done], [{ lives: 0 }, { doorOpen: false }, false], 'in the hub they are seen as their defaults');
  assert.deepEqual(state0(viaHub.flow), { counters: {}, flags: {}, goals: { sign: { done: false, step: null } }, outcome: null }, 'and are not state there');
  viaHub.flow.game.changeScene({ to: 'level.vrmxs' });
  await viaHub.flow.runAsync(4);
  assert.deepEqual([viaHub.flow.scene, viaHub.flow.view().outcome], ['level.vrmxs', null], 'not lost on the level\'s first step');
  assert.deepEqual({ ...state0(viaHub.flow), goals: { escape: state0(viaHub.flow).goals.escape } }, started, 'the level starts with three lives and the door open, as it does when the game starts there');

  // and back in the hub the level's values are what it reads
  viaHub.flow.game.add('lives', -1); viaHub.flow.game.changeScene({ to: 'hub.vrmxs' });
  await viaHub.flow.runAsync(3);
  assert.deepEqual([viaHub.flow.view().counters, viaHub.flow.view().flags, viaHub.flow.view().goals.sign.done, viaHub.flow.game.arrived], [{ lives: 2 }, { doorOpen: true }, true, { counters: { lives: 2 }, flags: { doorOpen: true }, goals: { escape: { done: false, step: null } } }]);
  viaHub.flow.dispose();
});

test('code that adds to a read counter the game doesn\'t have yet starts from the read\'s default (AB-T-0629)', async () => {
  // the review's case: the hub reads `lives` with a default of 3 and takes one; the level owns `lives` (start 3)
  const hub = doc('hub', [{ id: 'rules', type: 'GameRules', props: { reads: { counters: { lives: 3 } } } }]);
  const level = doc('level', [{ id: 'rules', type: 'GameRules', props: { lose: state('counters.lives', 'le', 0) } }, { id: 'lives', type: 'GameCounter', props: { start: 3 } }]);
  const { flow, events } = await miniFlow({ 'hub.vrmxs': hub, 'level.vrmxs': level });
  flow.run(2);
  assert.equal(flow.game.get('lives'), 3, 'get() sees the read\'s default, as the view does');
  assert.equal(flow.game.add('lives', -1), 2, 'and adding starts from it: 2, not -1');
  flow.flush();
  assert.deepEqual(events.filter((e) => e.type === 'counter').map(({ key, value, by }) => ({ key, value, by })), [{ key: 'lives', value: 2, by: -1 }]);
  assert.deepEqual(captureWorld(flow.tree).services.game.data.counters, { lives: 2 }, 'the write made it state');
  flow.game.changeScene({ to: 'level.vrmxs' });
  await flow.runAsync(4);
  assert.deepEqual([flow.scene, flow.view().counters.lives, flow.view().outcome], ['level.vrmxs', 2, null], 'carried into the level as two lives, not lost on arrival');
  flow.dispose();
  // a counter the scene neither declares nor reads still starts at 0
  const w = rulesWorld([{ id: 'rules', type: 'GameRules' }]);
  assert.equal(w.game.add('coins', 2), 2);
});

test('a restart of a scene gives what it reads from elsewhere back as it arrived, not as nothing', async () => {
  // the review's case: level 2 reads `lives` (the list form: default 0) and loses at none; the game arrives with three
  const docs = {
    'one.vrmxs': doc('one', [{ id: 'rules', type: 'GameRules', props: { flags: { hard: true } } }, { id: 'lives', type: 'GameCounter', props: { start: 3 } }]),
    'two.vrmxs': doc('two', [
      { id: 'rules', type: 'GameRules', props: { reads: { counters: ['lives'], flags: ['hard'] }, lose: state('counters.lives', 'le', 0) } },
      { id: 'coins', type: 'GameCounter' }, { id: 'clock', type: 'GameTimer', props: { seconds: 30 } },
    ]),
  };
  const { flow } = await miniFlow(docs);
  flow.game.changeScene({ to: 'two.vrmxs' });
  await flow.runAsync(5);
  flow.game.add('lives', -2); flow.game.add('coins', 7); flow.game.setFlag('hard', false);
  flow.run(3);
  assert.deepEqual([flow.view().counters, flow.view().flags.hard, flow.view().timers.clock.elapsedSteps], [{ coins: 7, lives: 1 }, false, 7]);
  flow.tree.find('rules').call('restart');
  await flow.runAsync(3);
  let v = flow.view();
  assert.deepEqual([v.scene, v.arrivals, v.outcome, v.counters, v.flags.hard, v.timers.clock.elapsedSteps], ['two.vrmxs', 2, null, { coins: 0, lives: 3 }, true, 2], 'three lives again, as the game arrived with; the scene\'s own coins and clock start again');
  // again, and through a save: what arrived is in the snapshot
  flow.game.add('lives', -1);
  const file = JSON.parse(JSON.stringify(flow.save()));
  assert.deepEqual(captureWorld(flow.tree).services.game.data.arrived, { counters: { lives: 3 }, flags: { hard: true } });
  await flow.load(file);
  flow.tree.find('rules').call('restart');
  await flow.runAsync(3);
  v = flow.view();
  assert.deepEqual([v.counters.lives, v.outcome, v.arrivals], [3, null, 3]);
  // losing them all still loses; a restart from the loss plays again with three
  flow.game.add('lives', -3); flow.run(1);
  assert.equal(flow.view().outcome, 'lost');
  flow.tree.find('rules').call('restart');
  await flow.runAsync(3);
  assert.deepEqual([flow.view().outcome, flow.view().counters.lives], [null, 3]);
  flow.dispose();

  // a game that starts in such a scene brought nothing: a restart has nothing to give back, and the default stands
  const alone = await miniFlow({ 'two.vrmxs': doc('two', [{ id: 'rules', type: 'GameRules', props: { reads: { counters: { lives: 3 } }, lose: state('counters.lives', 'le', 0) } }]) });
  alone.flow.run(2); alone.flow.game.restart();
  await alone.flow.runAsync(3);
  assert.deepEqual([alone.flow.view().counters, alone.flow.view().outcome, 'arrived' in captureWorld(alone.flow.tree).services.game.data], [{ lives: 3 }, null, false]);
  alone.flow.dispose();
});

test('the whole-game check sees game nodes inside prefab instances, and never refuses what it couldn\'t read', async () => {
  // the review's case: the counter the ending reads is declared inside a prefab the level places
  const kit = { format: 'vrmxs', version: 1, id: 'kit', nodes: [{ id: 'lives', type: 'GameCounter', props: { key: 'lives', start: 3 } }, { id: 'key', type: 'Checkpoint', props: { slot: 'door' } }] };
  const level = { format: 'vrmxs', version: 1, id: 'level', assets: [{ id: 'kit', type: 'vrmxs', ref: 'kit.vrmxs' }], nodes: [{ id: 'rules', type: 'GameRules' }, { id: 'kit-1', type: 'Instance', asset: 'kit' }], connections: [{ from: 'kit-1/key', signal: 'written', to: 'rules', call: 'changeScene', args: { to: 'ending.vrmxs' } }] };
  const ending = doc('ending', [{ id: 'rules', type: 'GameRules', props: { reads: { counters: ['lives'], checkpoints: ['door'] }, win: state('counters.lives', 'ge', 1) } }]);
  const scenesOf = { 'level.vrmxs': level, 'ending.vrmxs': ending }, prefabs = new Map([['kit.vrmxs', kit]]);

  const flat = checkGame(scenesOf, { prefabs });
  assert.deepEqual([flat.ok, flat.problems, flat.unchecked], [true, [], []]);
  assert.deepEqual([flat.scenes['level.vrmxs'].counters.map((c) => [c.id, c.key]), flat.scenes['level.vrmxs'].scenes], [[['kit-1/lives', 'lives']], ['ending.vrmxs']], 'the prefab\'s counter and the connection from inside it are seen');
  // without the prefabs the level can't be read whole: it is said, nothing is claimed about it, and nothing is refused
  const blind = checkGame(scenesOf);
  assert.deepEqual([blind.ok, blind.problems], [true, []]);
  assert.match(blind.unchecked.join(), /^level\.vrmxs: it has prefab instances that couldn't be flattened \(prefab kit\.vrmxs not loaded\): pass the game's prefabs$/);
  // what can still be proved is: with the prefabs, a read nothing declares is refused
  const wrong = checkGame({ ...scenesOf, 'ending.vrmxs': doc('ending', [{ id: 'rules', type: 'GameRules', props: { reads: { counters: ['livez'] } } }]) }, { prefabs });
  assert.deepEqual(wrong.problems, ['ending.vrmxs: GameRules "rules" reads counters.livez, and no scene of the game has a GameCounter with that key']);

  // the flow: given the scenes and the prefabs it starts this game; given the scenes alone it starts it too, and says what it didn't check
  const load = async (req) => {
    const t = new SceneTree({ registry: m0Registry(), prefabs, seed: req.seed });
    t.clock.step = req.step; installInput(t); installGame(t, { scene: req.scene }); installSave(t, { scene: { ref: req.scene, doc: scenesOf[req.scene] } });
    return t.instantiate(structuredClone(scenesOf[req.scene]));
  };
  const withPrefabs = await new GameFlow({ load, scenes: scenesOf, prefabs }).start('level.vrmxs');
  assert.deepEqual(withPrefabs.unchecked, []);
  withPrefabs.tree.find('kit-1/key').call('write');
  await withPrefabs.runAsync(4);
  assert.deepEqual([withPrefabs.scene, withPrefabs.view().counters, withPrefabs.view().outcome], ['ending.vrmxs', { lives: 3 }, 'won'], 'and it plays: the prefab\'s counter reaches the ending');
  withPrefabs.dispose();
  const without = await new GameFlow({ load, scenes: scenesOf }).start('level.vrmxs');
  assert.equal(without.unchecked.length, 1);
  without.dispose();
});

test('what a document can prove wrong is refused before the game starts: a read no scene declares, a change to no scene', async () => {
  const good = { 'level.vrmxs': readsLevel(), 'ending.vrmxs': readsEnding() };
  assert.deepEqual([checkGame(good).ok, checkGame(new Map(Object.entries(good))).problems], [true, []]);
  assert.deepEqual(checkGame(good).scenes['ending.vrmxs'].rules.reads.flags, ['vip', 'foundKey']);
  // nothing in the game could ever bring these: whatever is played, the conditions reading them are wrong
  const bad = { 'level.vrmxs': readsLevel(), 'ending.vrmxs': readsEnding({ reads: { counters: ['ordrs'], flags: ['vip', 'foundKee'], timers: ['clock', 'stopwatch'], goals: ['serve'], checkpoints: ['window'] } }) };
  const problems = checkGame(bad).problems;
  assert.deepEqual(problems.filter((p) => p.includes('no scene of the game')), [
    'ending.vrmxs: GameRules "rules" reads counters.ordrs, and no scene of the game has a GameCounter with that key',
    'ending.vrmxs: GameRules "rules" reads flags.foundKee, and no scene of the game has a flag started in a GameRules\' flags or set by a connection',
    'ending.vrmxs: GameRules "rules" reads timers.stopwatch, and no scene of the game has a GameTimer with that key',
    'ending.vrmxs: GameRules "rules" reads checkpoints.window, and no scene of the game has a Checkpoint with that slot',
  ]);
  assert.ok(problems.some((p) => /ending\.vrmxs: GameGoal "thanks": when\.of\[1\] reads "counters\.orders"/.test(p)), 'and each scene\'s own problems, with its name');
  assert.match(checkGame({ 'level.vrmxs': readsLevel() }).problems.join(), /level\.vrmxs: a connection changes to "ending\.vrmxs", which isn't a scene of the game \(level\.vrmxs\)/);
  // a flow that is given the game's scenes refuses to start such a game; one that isn't can't know (a tool checks)
  const { m0Registry: reg } = await import('@vrmxg/registry/m0');
  const load = (docs) => async (req) => { const t = new SceneTree({ registry: reg(), seed: req.seed }); t.clock.step = req.step; installInput(t); installGame(t, { scene: req.scene }); installSave(t, { scene: { ref: req.scene, doc: docs[req.scene] } }); return t.instantiate(structuredClone(docs[req.scene])); };
  await assert.rejects(new GameFlow({ load: load(bad), scenes: bad }).start('level.vrmxs'), /this game can't start: .*ending\.vrmxs: GameRules "rules" reads counters\.ordrs, and no scene of the game has a GameCounter with that key/);
  const unknowing = await new GameFlow({ load: load({ 'level.vrmxs': readsLevel(), 'ending.vrmxs': doc('ending', [{ id: 'rules', type: 'GameRules', props: { reads: { flags: ['nobody'] }, win: state('flags.nobody') } }]) }) }).start('level.vrmxs');
  await unknowing.runAsync(12);
  assert.deepEqual([unknowing.scene, unknowing.view().flags.nobody], ['ending.vrmxs', false], 'unchecked, it plays: the flag nobody sets is false for ever');
  unknowing.dispose();
  const knowing = await new GameFlow({ load: load(good), scenes: good }).start('level.vrmxs');
  assert.equal(knowing.scene, 'level.vrmxs');
  knowing.dispose();
});

test('a checkpoint taken on the step a loss is asked for late is not written, and the game takes it back', async () => {
  // the review's case: the rules take the checkpoint in step 5, then a service installed after the game asks for a loss
  const docs = { 'a.vrmxs': doc('a', [{ id: 'rules', type: 'GameRules' }, { id: 'early', type: 'Checkpoint', props: { when: state('sceneSteps', 'ge', 2) } }, { id: 'cp', type: 'Checkpoint', props: { when: state('sceneSteps', 'ge', 5) } }]) };
  const store = new MemoryStore();
  const { flow, events } = await miniFlow(docs, { store, install: asker((game, step) => { if (step === 5) game.lose(); }) });
  flow.run(3); await flow.settle(); // (the store has written the first before the second is taken)
  flow.run(3); await flow.settle(); flow.flush();
  assert.deepEqual(events.filter((e) => e.type.startsWith('checkpoint')).map((e) => [e.type, e.id, e.step, e.reason ?? null]), [
    ['checkpoint', 'early', 2, null], ['checkpointWritten', 'early', 3, null],
    ['checkpoint', 'cp', 5, null], ['checkpointSkipped', 'cp', 6, 'decided'],
  ]);
  assert.deepEqual([flow.checkpoints.get('checkpoint').summary.step, (await store.read(`${CHECKPOINT_PREFIX}checkpoint`)).summary.step], [3, 3], 'the file is still the earlier, good one');
  assert.equal(flow.checkpoints.get('checkpoint').snapshot.services.game.data.requests.lose, null, 'and no file holds a loss in waiting');
  flow.run(1);
  assert.deepEqual([flow.view().decided, flow.view().checkpoint], [{ result: 'lost', step: 5, scene: 'a.vrmxs' }, { slot: 'checkpoint', id: 'early', requested: 2 }], 'lost as of step 5; the state names the checkpoint that has a file');
  assert.equal(await flow.loadCheckpoint(), 3);
  flow.run(1);
  assert.equal(flow.view().outcome, null, 'loaded, it is a game still being played');
  flow.dispose();

  // with no earlier one the slot is empty again: state, file and events agree
  const only = { 'a.vrmxs': doc('a', [{ id: 'rules', type: 'GameRules' }, { id: 'cp', type: 'Checkpoint', props: { when: state('sceneSteps', 'ge', 5) } }]) };
  const b = await miniFlow(only, { store: new MemoryStore(), install: asker((game, step) => { if (step === 5) game.win(); }) });
  b.flow.run(7); await b.flow.settle(); b.flow.flush();
  assert.deepEqual([b.flow.view().outcome, b.flow.view().checkpoints, b.flow.checkpoints.size, b.events.filter((e) => e.type.startsWith('checkpoint')).map((e) => e.type)], ['won', {}, 0, ['checkpoint', 'checkpointSkipped']]);
  b.flow.dispose();
});

test('a refused tree.add leaves nothing behind: no node, no declaration, no state', () => {
  const { tree, game } = rulesWorld([{ id: 'rules', type: 'GameRules', props: { flags: { open: true } } }, { id: 'coins', type: 'GameCounter', props: { start: 3 } }]);
  tree.run(3);
  const before = JSON.stringify(captureWorld(tree));
  assert.throws(() => tree.add({ id: 'late', type: 'GameGoal', parent: 'root', props: { when: state('counters.gems', 'ge', 1) } }), /GameGoal "late": when reads "counters\.gems"/);
  assert.throws(() => tree.add({ id: 'gems', type: 'GameCounter', parent: 'root', props: { start: 5 } }, undefined) && tree.add({ id: 'bad', type: 'GameTimer', parent: 'root', props: { seconds: 0 } }), /seconds above zero/);
  assert.deepEqual([tree.find('late') === null, tree.find('bad') === null, game.decl.goals.has('late'), Object.hasOwn(game.goals, 'late'), game.decl.timers.has('bad'), Object.hasOwn(game.timers, 'bad')], [true, true, false, false, false, false]);
  tree.remove('gems');
  delete game.counters.gems; // the counter that was added rightly, and its value, taken out again by hand to compare
  assert.equal(JSON.stringify(captureWorld(tree)), before, 'the world is as it was');
  // and what is right can be added after what was refused
  tree.add({ id: 'gems', type: 'GameCounter', parent: 'root', props: { start: 1 } });
  tree.add({ id: 'late', type: 'GameGoal', parent: 'root', props: { when: state('counters.gems', 'ge', 1) } });
  tree.step();
  assert.equal(game.view().goals.late.done, true);
});

test('a connection that asks a game node for what it can\'t do is caught when the rules start; at run time it is refused, not thrown', () => {
  const start = (nodes, connections) => () => rulesWorld(nodes, connections);
  const base = [{ id: 'rules', type: 'GameRules' }, { id: 'watch', type: 'GameTimer' }, { id: 'clock', type: 'GameTimer', props: { seconds: 0.05 } }, { id: 'coins', type: 'GameCounter' }, { id: 'g', type: 'GameGoal' }];
  const wired = (call, to, args) => [{ from: 'g', signal: 'completed', to, call, ...(args !== undefined ? { args } : {}) }];
  assert.throws(start(base, wired('addTime', 'watch', { seconds: 5 })), /the connection g\.completed → watch\.addTime: addTime is for a countdown, and this timer is a stopwatch \(it has no seconds\)/);
  assert.throws(start(base, wired('addTime', 'watch')), /this timer is a stopwatch/, 'whatever the payload would be');
  assert.throws(start(base, wired('setFlag', 'rules', { flag: '__proto__' })), /the connection g\.completed → rules\.setFlag: a flag can't be named "__proto__"/);
  assert.throws(start(base, wired('setFlag', 'rules', { value: true })), /setFlag needs \{ flag \}/);
  assert.throws(start(base, wired('setFlag', 'rules', { flag: 'x', value: { a: 1 } })), /setFlag's value is a boolean, a number or a string/);
  assert.throws(start(base, wired('changeScene', 'rules', {})), /rules\.changeScene: changeScene needs \{ to \}/);
  assert.throws(start(base, wired('changeScene', 'rules', { to: 'b.vrmxs', after: -1 })), /"after" is seconds, zero or more/);
  assert.throws(start(base, wired('set', 'coins', { value: 'ten' })), /coins\.set: set needs \{ value \}: a number/);
  assert.throws(start(base, wired('addTime', 'clock', {})), /clock\.addTime: addTime needs \{ seconds \}: a number/);
  assert.match(describeRules(doc('w', base, wired('addTime', 'watch', { seconds: 5 }))).problems.join(), /g\.completed → watch\.addTime: addTime is for a countdown/);
  assert.deepEqual(describeRules(doc('w', base, wired('addTime', 'clock', { seconds: 5 }))).problems, []);
  // what can't be known then (a connection that passes its signal's payload on) is refused when it happens: an event,
  // the step goes on, nothing is thrown inside it
  const { tree, game } = rulesWorld(base, [{ from: 'clock', signal: 'timeout', to: 'rules', call: 'changeScene' }, { from: 'clock', signal: 'timeout', to: 'coins', call: 'set' }, { from: 'clock', signal: 'timeout', to: 'rules', call: 'setFlag' }, { from: 'clock', signal: 'timeout', to: 'coins', call: 'add' }]);
  tree.run(10);
  assert.deepEqual(game.flush().filter((e) => e.type === 'refused').map((e) => [e.id, e.action, e.step, e.reason]), [
    ['rules', 'changeScene', 2, 'changeScene needs { to }: the scene\'s path in the project'],
    ['coins', 'set', 2, 'set needs { value }'],
    ['rules', 'setFlag', 2, 'a flag can\'t be named undefined'],
  ]);
  assert.deepEqual([game.pending, game.get('coins'), tree.clock.step], [null, 1, 10], 'the connection after the refused ones still ran, and the game played on');
  // run-time misuse through a node's action, the same: time added to a stopwatch
  tree.find('watch').call('addTime', { seconds: 3 });
  assert.deepEqual(game.flush().map((e) => [e.type, e.action, e.reason]), [['refused', 'addTime', 'timer "watch" is a stopwatch (no seconds): it has no time to add to']]);
});

test('the scene schema refuses a countdown of no seconds, and takes reads', async () => {
  const { createValidator } = await import('@vrmxg/scene');
  const v = createValidator(m0Registry());
  const check = (props, type = 'GameTimer') => v.check(doc('s', [{ id: 'n', type, props }]));
  assert.equal(check({ seconds: 0 }).ok, false);
  assert.equal(check({ seconds: -2 }).ok, false);
  assert.deepEqual([check({ seconds: 0.5 }).ok, check({}).ok], [true, true]);
  assert.equal(check({ reads: { goals: ['serve'], flags: ['vip'] } }, 'GameRules').ok, true);
  assert.equal(check({ reads: { goals: 'serve' } }, 'GameRules').ok, false);
  assert.equal(check({ reads: { scores: [] } }, 'GameRules').ok, false);
});
