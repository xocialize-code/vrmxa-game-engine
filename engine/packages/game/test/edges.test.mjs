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
import { GameFlow, installGame, holds, checkKeys, describeRules, CHECKPOINT_PREFIX } from '../src/index.js';
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

test('a scene reads what another scene owns by listing it in its rules\' reads: checked when the game gets there', async () => {
  const level = doc('level', [
    { id: 'rules', type: 'GameRules' },
    { id: 'orders', type: 'GameCounter' }, { id: 'clock', type: 'GameTimer', props: { seconds: 9, scope: 'game' } }, { id: 'watch', type: 'GameTimer', props: { scope: 'game' } },
    { id: 'serve', type: 'GameGoal', props: { optional: true } }, { id: 'cp', type: 'Checkpoint', props: { slot: 'door' } },
    { id: 'leave', type: 'GameTimer', props: { seconds: 0.1 } },
  ], [{ from: 'leave', signal: 'timeout', to: 'rules', call: 'changeScene', args: { to: 'ending.vrmxs' } }, { from: 'leave', signal: 'started', to: 'rules', call: 'setFlag', args: { flag: 'left' } }]);
  // the ending owns one goal of its own and reads the level's goal, counter, flag, clock and checkpoint
  const ending = (rules = {}) => doc('ending', [
    { id: 'rules', type: 'GameRules', props: { keepOutcome: true, reads: { counters: ['orders'], flags: ['vip'], timers: ['clock'], goals: ['serve'], checkpoints: ['door'] }, ...rules } },
    { id: 'thanks', type: 'GameGoal', props: { text: 'Say thanks', when: { test: 'all', of: [state('goals.serve.done'), state('counters.orders', 'ge', 2), state('flags.vip'), state('timers.clock.left', 'gt', 0), state('checkpoints.door')] } } },
  ]);
  const { flow } = await miniFlow({ 'level.vrmxs': level, 'ending.vrmxs': ending() });
  flow.game.add('orders', 2); flow.game.completeGoal('serve'); flow.game.setFlag('vip'); flow.tree.find('cp').call('write');
  await flow.runAsync(12);
  const v = flow.view();
  assert.deepEqual([v.scene, v.goals.thanks.done, v.outcome], ['ending.vrmxs', true, 'won'], 'the ending\'s goal read all five and was done');
  assert.deepEqual(v.objectives.map((o) => o.key), ['thanks'], 'reading the level\'s goal didn\'t make it one of the ending\'s objectives');
  flow.dispose();

  // a flag only ever set by a connection in the scene is the scene's own: no entry in flags needed
  const set = rulesWorld([{ id: 'rules', type: 'GameRules', props: { win: state('flags.done') } }, { id: 't', type: 'GameTimer', props: { seconds: 0.05 } }], [{ from: 't', signal: 'timeout', to: 'rules', call: 'setFlag', args: { flag: 'done' } }]);
  set.tree.run(5);
  assert.equal(set.game.view().outcome, 'won');

  // what a scene reads has to arrive: from a level that never had it the change fails, naming it, and play stays put
  const bare = doc('level', [{ id: 'rules', type: 'GameRules' }, { id: 'leave', type: 'GameTimer', props: { seconds: 0.1 } }], [{ from: 'leave', signal: 'timeout', to: 'rules', call: 'changeScene', args: { to: 'ending.vrmxs' } }]);
  const built = [], unloaded = [];
  const b = await miniFlow({ 'level.vrmxs': bare, 'ending.vrmxs': ending() }, { built, unloaded });
  b.flow.run(6); await b.flow.settle();
  assert.throws(() => b.flow.step(), /the scene change to "ending\.vrmxs" failed: GameRules "rules" reads counters\.orders from another scene, and "level\.vrmxs" brought none \(it brought no counters\)\. Declare it in the scene the game comes from, or as this scene's own; GameRules "rules" reads flags\.vip/);
  assert.deepEqual([b.flow.scene, built, unloaded], ['level.vrmxs', ['level.vrmxs', 'ending.vrmxs'], ['ending.vrmxs']]);
  b.flow.dispose();

  // a clock read for its time left has to arrive as a countdown: a stopwatch under that name fails the change the same way
  const c = await miniFlow({ 'level.vrmxs': level, 'ending.vrmxs': doc('ending', [{ id: 'rules', type: 'GameRules', props: { reads: { timers: ['watch'] }, lose: state('timers.watch.left', 'le', 0) } }]) });
  c.flow.run(6); await c.flow.settle();
  assert.throws(() => c.flow.step(), /failed: GameRules "rules": lose reads "timers\.watch\.left": "watch" is a stopwatch/);
  c.flow.dispose();

  // a game that starts in such a scene has brought nothing: what it reads is absent, and a comparison with it is false
  const alone = await miniFlow({ 'ending.vrmxs': ending() });
  alone.flow.run(5);
  assert.deepEqual([alone.flow.view().goals.thanks.done, alone.flow.view().counters], [false, {}]);
  alone.flow.dispose();

  // reads that aren't lists of names, or of a kind there isn't, stop the scene; describeRules says the same
  assert.throws(() => rulesWorld([{ id: 'rules', type: 'GameRules', props: { reads: { scores: ['a'] } } }]), /GameRules "rules": reads has no "scores" \(counters, flags, timers, goals, checkpoints\)/);
  assert.throws(() => rulesWorld([{ id: 'rules', type: 'GameRules', props: { reads: { counters: 'orders' } } }]), /reads\.counters is a list of names/);
  const d = describeRules(ending());
  assert.deepEqual([d.problems, d.rules.reads.goals, d.goals.map((g) => g.key)], [[], ['serve'], ['thanks']]);
  assert.match(describeRules(doc('e', [{ id: 'g', type: 'GameGoal', props: { when: state('goals.serve.done') } }])).problems[0], /Add a GameGoal with that key, or list it in GameRules' reads\.goals if it is another scene's/);
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
