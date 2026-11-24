// M5 W2 (AB-T-0617): the rules. Conditions are data in @vrmxg/ai's test shape; goal, score, timers and win and lose are
// scene data that the scene schema validates and the registry lists; the game service keeps their values in the world
// snapshot and tells a HUD about changes only outside the step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TESTS as AI_TESTS } from '@vrmxg/ai';
import { m0Registry, GAME_TESTS, GAME_OPS, conditionSchema } from '@vrmxg/registry/m0';
import { createValidator, serialize, describeType, parse } from '@vrmxg/scene';
import { captureWorld, restoreWorld, worldHashes, hashValue } from '@vrmxg/snapshot';
import { TESTS, OPS, holds, checkCondition, conditionKeys, describeRules, GAME_NODES } from '../src/index.js';
import { SCENES, fixtureRegistry } from './fixtures/world.js';
import { rulesWorld, scenes, sceneText } from './helpers.mjs';

const state = (key, op, value) => ({ test: 'state', key, ...(op ? { op } : {}), ...(value !== undefined ? { value } : {}) });

test('a condition is data in ai\'s test shape: state compares a value by path, all / any / not compose', () => {
  const view = { score: 12, counters: { served: 3 }, flags: { tillClosed: true, open: false }, timers: { clock: { left: 0, done: true } }, goals: { 'take-order': { done: true } }, outcome: null };
  assert.equal(holds(state('counters.served', 'ge', 3), view), true);
  assert.equal(holds(state('counters.served', 'gt', 3), view), false);
  assert.equal(holds(state('counters.served', 'le', 3), view), true);
  assert.equal(holds(state('counters.served', 'lt', 3), view), false);
  assert.equal(holds(state('score', 'eq', 12), view), true);
  assert.equal(holds(state('score', 'ne', 12), view), false);
  assert.equal(holds(state('flags.tillClosed'), view), true, 'op defaults to set');
  assert.equal(holds(state('flags.open'), view), false, 'false is not set');
  assert.equal(holds(state('flags.nothing', 'unset'), view), true);
  assert.equal(holds(state('goals.take-order.done'), view), true, 'a key with a hyphen');
  assert.equal(holds(state('outcome', 'unset'), view), true);
  assert.equal(holds({ test: 'all', of: [state('flags.tillClosed'), state('timers.clock.done')] }, view), true);
  assert.equal(holds({ test: 'any', of: [state('flags.open'), state('counters.served', 'gt', 9)] }, view), false);
  assert.equal(holds({ test: 'not', of: state('flags.open') }, view), true);
  assert.equal(holds(undefined, view), false, 'no condition never holds');
  // the same function a brain's blackboard test is: one comparison, in one place
  assert.equal(TESTS.state(view, state('counters.served', 'ge', 3)), AI_TESTS.bb({ bb: view }, { key: 'counters.served', op: 'ge', value: 3 }));
  assert.deepEqual(conditionKeys({ test: 'all', of: [state('a.b'), { test: 'not', of: state('c') }, state('a.b')] }), ['a.b', 'c']);
});

test('a condition that isn\'t one is named with its path', () => {
  assert.deepEqual(checkCondition(state('score', 'ge', 1)), []);
  assert.match(checkCondition({ test: 'sometimes' }).join(), /unknown test "sometimes"/);
  assert.match(checkCondition({ test: 'state' }).join(), /needs a key/);
  assert.match(checkCondition(state('score', 'above', 1)).join(), /unknown op "above"/);
  assert.match(checkCondition(state('score', 'ge')).join(), /no value/);
  assert.match(checkCondition(state('score', 'ge', 'ten')).join(), /isn't a number/);
  assert.match(checkCondition({ test: 'all', of: [] }, 'win').join(), /win needs "of"/);
  assert.match(checkCondition({ test: 'all', of: [state('a'), { test: 'not', of: { test: 'any', of: [{ test: 'nope' }] } }] }, 'win').join(), /win\.of\[1\]\.of\.of\[0\] has unknown test "nope"/);
  assert.match(checkCondition('score > 3').join(), /not a condition object/);
});

test('the registry lists the game nodes, with the tests and ops the package runs', () => {
  const reg = m0Registry();
  assert.deepEqual(GAME_TESTS, Object.keys(TESTS));
  assert.deepEqual(GAME_OPS, OPS);
  for (const type of Object.keys(GAME_NODES)) assert.ok(reg.get(type), `${type} is in the registry`);
  const rules = describeType(reg, 'GameRules');
  assert.deepEqual(Object.keys(rules.actions).sort(), ['changeScene', 'clearFlag', 'hide', 'lose', 'restart', 'setFlag', 'show', 'win']);
  assert.deepEqual(Object.keys(rules.signals).sort(), ['ended', 'flagChanged', 'lost', 'ready', 'won']);
  assert.ok(rules.schema.properties.props.properties.win && rules.schema.properties.props.properties.lose);
  assert.deepEqual(Object.keys(describeType(reg, 'GameTimer').schema.properties.props.properties).sort(), ['autostart', 'key', 'label', 'scope', 'seconds']);
  assert.deepEqual(Object.keys(describeType(reg, 'GameCounter').actions).sort(), ['add', 'hide', 'reset', 'set', 'show']);
  assert.deepEqual(Object.keys(describeType(reg, 'GameGoal').signals).sort(), ['completed', 'ready']);
  assert.deepEqual(Object.keys(describeType(reg, 'Checkpoint').actions).sort(), ['hide', 'show', 'write']);
  // every action the registry lists is a method of the node's class (a connection would be unhandled otherwise)
  for (const [type, Cls] of Object.entries(GAME_NODES)) for (const a of Object.keys(reg.get(type).actions)) assert.equal(typeof Cls.prototype[a], 'function', `${type}.${a}`);
});

test('the scene schema validates the rules: the fixture scenes pass and are canonical, wrong rules are refused', () => {
  const v = createValidator(fixtureRegistry());
  for (const ref of SCENES) {
    const text = sceneText(ref), doc = parse(text);
    const r = v.check(doc);
    assert.deepEqual([r.errors, r.warnings], [[], []], ref);
    assert.equal(serialize(doc), text, `${ref} is in canonical form`);
  }
  const level = () => scenes().get('level.vrmxs');
  const broken = (edit) => { const d = level(); edit(Object.fromEntries(d.nodes.map((n) => [n.id, n])), d); return v.check(d); };
  const refused = (r, at) => { assert.equal(r.ok, false); assert.ok(r.errors.some((e) => e.startsWith(at)), `${at} in ${JSON.stringify(r.errors)}`); };
  refused(broken((n) => { n.rules.props.lose = { test: 'sometimes' }; }), '/nodes/10/props/lose/test');
  refused(broken((n) => { n.rules.props.lose = { test: 'state' }; }), '/nodes/10/props/lose');
  refused(broken((n) => { n.rules.props.win = 'score > 30'; }), '/nodes/10/props/win');
  refused(broken((n) => { n['take-order'].props.when.op = 'above'; }), '/nodes/14/props/when/op');
  refused(broken((n) => { n['close-till'].props.when.of[1] = { test: 'not', of: { test: 'state', key: '' } }; }), '/nodes/15/props/when/of/1/of/key');
  refused(broken((n) => { n.clock.props.seconds = -1; }), '/nodes/13/props/seconds');
  refused(broken((n) => { n.clock.props.seconds = '6'; }), '/nodes/13/props/seconds');
  refused(broken((n) => { n.orders.props.scope = 'level'; }), '/nodes/12/props/scope');
  refused(broken((n) => { n.score.props.key = 'the score'; }), '/nodes/11/props/key');
  refused(broken((n) => { n.rules.props.flags = { tillClosed: { no: 1 } }; }), '/nodes/10/props/flags/tillClosed');
  refused(broken((n) => { n.cp.props.slot = 'a slot'; }), '/nodes/16/props/slot');
  refused(broken((_n, d) => { d.connections[0].call = 'increase'; }), '/connections/0');
  refused(broken((_n, d) => { d.connections[5].signal = 'finished'; }), '/connections/5');
  assert.equal(conditionSchema(0).properties.test.enum, GAME_TESTS);
});

test('describeRules reads a scene\'s rules without running it', () => {
  const d = describeRules(scenes().get('level.vrmxs'));
  assert.equal(d.rules.id, 'rules');
  assert.deepEqual(d.rules.flags, { tillClosed: false });
  assert.deepEqual(d.counters.map((c) => [c.key, c.start, c.max, c.scope]), [['score', 0, null, 'game'], ['orders', 0, 3, 'scene']]);
  assert.deepEqual(d.timers.map((t) => [t.key, t.seconds, t.autostart, t.scope]), [['clock', 6, true, 'scene']]);
  assert.deepEqual(d.goals.map((g) => [g.key, g.text, g.optional]), [['take-order', 'Take the order', false], ['close-till', 'Close the till before the clock runs out', false]]);
  assert.deepEqual(d.checkpoints.map((c) => [c.id, c.slot, c.once]), [['cp', 'checkpoint', true], ['cp-order', 'after-order', true]]);
  assert.deepEqual(d.scenes, ['ending.vrmxs']);
  assert.deepEqual(d.reads, ['counters.orders', 'flags.tillClosed', 'goals.take-order.done', 'timers.clock.done']);
  assert.deepEqual(d.problems, []);
  const bad = describeRules({ nodes: [{ id: 'a', type: 'GameRules', props: { win: { test: 'x' } } }, { id: 'b', type: 'GameRules' }, { id: 'c', type: 'GameCounter', props: { key: 'n' } }, { id: 'd', type: 'GameCounter', props: { key: 'n' } }] });
  assert.equal(bad.problems.length, 3);
});

test('counters: the score is the counter "score"; min and max hold; a change is a signal and an event', () => {
  const { tree, game } = rulesWorld([
    { id: 'score', type: 'GameCounter' },
    { id: 'lives', type: 'GameCounter', props: { start: 3, min: 0, max: 5 } },
    { id: 'coins-node', type: 'GameCounter', props: { key: 'coins', start: 2 } },
  ], [{ from: 'lives', signal: 'changed', to: 'score', call: 'add', args: { by: 100 } }]);
  assert.deepEqual(game.view().counters, { coins: 2, lives: 3, score: 0 });
  tree.find('lives').call('add', { by: -1 });
  assert.equal(game.get('lives'), 2);
  assert.equal(game.score, 100, 'the connection ran in the same step');
  tree.find('lives').call('add', { by: 99 });
  assert.equal(game.get('lives'), 5, 'held at max');
  tree.find('lives').call('set', { value: -4 });
  assert.equal(game.get('lives'), 0, 'held at min');
  tree.find('lives').call('set', { value: 0 });
  assert.equal(game.score, 300, 'setting the value it has changes nothing');
  tree.find('coins-node').call('add', { body: 'ball' });
  assert.equal(game.get('coins'), 3, 'a connection without args passes the signal\'s payload: one more');
  tree.find('coins-node').call('reset');
  assert.equal(game.get('coins'), 2);
  assert.throws(() => tree.find('coins-node').call('set', {}), /set needs \{ value \}/);
  assert.throws(() => game.add('coins', NaN), /not a number/);
  assert.deepEqual(tree.unhandled, []);
});

test('flags: set, cleared, tested; a scene\'s rules give the values a game starts with', () => {
  const { tree, game } = rulesWorld([{ id: 'rules', type: 'GameRules', props: { flags: { tillClosed: false, mood: 'calm' } } }]);
  assert.deepEqual(game.view().flags, { mood: 'calm', tillClosed: false });
  const seen = [];
  tree.find('rules').on('flagChanged', (e) => seen.push(e));
  tree.find('rules').call('setFlag', { flag: 'tillClosed' });
  tree.find('rules').call('setFlag', { flag: 'mood', value: 'rushed' });
  tree.find('rules').call('setFlag', { flag: 'mood', value: 'rushed' });
  tree.find('rules').call('clearFlag', { flag: 'mood' });
  assert.deepEqual(game.view().flags, { tillClosed: true });
  assert.deepEqual(seen, [{ flag: 'tillClosed', value: true }, { flag: 'mood', value: 'rushed' }, { flag: 'mood', value: null }]);
  assert.throws(() => game.setFlag('x', { a: 1 }), /a boolean, a number or a string/);
});

test('timers count steps: a countdown times out on its step; stop, start, reset and addTime; a paused node\'s clock holds', () => {
  const { tree, game } = rulesWorld([
    { id: 'clock', type: 'GameTimer', props: { seconds: 0.5 } },
    { id: 'watch', type: 'GameTimer' },
    { id: 'later', type: 'GameTimer', props: { seconds: 1, autostart: false } },
  ]);
  const out = [];
  tree.find('clock').on('timeout', () => out.push(tree.clock.step));
  tree.run(29);
  assert.deepEqual([game.view().timers.clock.leftSteps, game.view().timers.clock.done, out], [1, false, []]);
  tree.step();
  assert.deepEqual([game.view().timers.clock.leftSteps, game.view().timers.clock.done, game.view().timers.clock.running, out], [0, true, false, [29]]);
  assert.deepEqual([game.view().timers.watch.elapsedSteps, game.view().timers.watch.left, game.view().timers.watch.seconds, game.view().timers.watch.limit], [30, null, null, false], 'a stopwatch has no limit and never times out');
  assert.equal(game.view().timers.later.elapsedSteps, 0, 'not started');
  tree.find('later').call('start'); tree.run(10);
  tree.find('later').call('stop'); tree.run(10);
  assert.equal(game.view().timers.later.elapsedSteps, 10);
  tree.find('later').call('start');
  tree.find('later').processMode = 'disabled'; tree.run(5);
  assert.equal(game.view().timers.later.elapsedSteps, 10, 'a disabled node\'s timer holds');
  tree.find('later').processMode = 'inherit'; tree.find('later').timeScale = 0.5; tree.run(10);
  assert.equal(game.view().timers.later.elapsedSteps, 15, 'half speed');
  tree.find('later').timeScale = 1;
  tree.find('later').call('addTime', { seconds: -0.5 });
  assert.equal(game.view().timers.later.leftSteps, 15);
  tree.find('later').call('reset');
  assert.deepEqual([game.view().timers.later.leftSteps, game.view().timers.later.running], [60, false], 'reset: full length, running as the node says');
  tree.find('clock').call('addTime', { seconds: 0.1 }); tree.find('clock').call('start'); tree.run(6);
  assert.deepEqual(out, [29, 70], 'time added after zero runs out again');
  assert.equal(game.view().timers.clock.left, 0);
});

test('goals are done in the scene\'s order when their condition holds; without a win condition, all of them is a win', () => {
  const { tree, game } = rulesWorld([
    { id: 'rules', type: 'GameRules' },
    { id: 'orders', type: 'GameCounter' },
    { id: 'first', type: 'GameGoal', props: { text: 'Take an order', when: state('counters.orders', 'ge', 1) } },
    { id: 'second', type: 'GameGoal', props: { text: 'Take three', when: state('counters.orders', 'ge', 3) } },
    { id: 'bonus', type: 'GameGoal', props: { text: 'Take ten', optional: true, when: state('counters.orders', 'ge', 10) } },
    { id: 'by-hand', type: 'GameGoal', props: { key: 'hand' } },
  ]);
  const won = [];
  tree.find('rules').on('ended', (e) => won.push([e.result, tree.clock.step]));
  assert.deepEqual(game.view().goal, { key: 'first', text: 'Take an order' });
  tree.step();
  tree.find('orders').call('add');
  tree.step();
  assert.deepEqual(game.view().objectives.map((o) => [o.key, o.done]), [['first', true], ['second', false], ['bonus', false], ['hand', false]]);
  assert.equal(game.view().goals.first.step, 1, 'the step it was done on');
  assert.deepEqual(game.view().goal, { key: 'second', text: 'Take three' });
  tree.find('orders').call('add', { by: 2 }); tree.step();
  assert.deepEqual(game.view().goal, { key: 'hand', text: 'hand' });
  assert.equal(game.view().outcome, null, 'a goal without a condition waits for its action');
  tree.find('by-hand').call('complete'); tree.step();
  assert.deepEqual(won, [['won', 3]], 'every goal that isn\'t optional is done');
  assert.deepEqual(game.view().goal, { key: 'bonus', text: 'Take ten' }, 'the optional one is what is left');
  assert.deepEqual(game.view().decided, { result: 'won', step: 3, scene: 'test.vrmxs' });
});

test('win and lose: a tie is a win; a timeout\'s connection can lose; once decided the result stands and the clock stops', () => {
  const tie = rulesWorld([
    { id: 'rules', type: 'GameRules', props: { flags: { done: false }, win: state('flags.done'), lose: state('timers.clock.done') } },
    { id: 'clock', type: 'GameTimer', props: { seconds: 0.1 } },
  ], [{ from: 'clock', signal: 'timeout', to: 'rules', call: 'lose' }]);
  tie.tree.run(5);
  tie.game.setFlag('done'); // on the step the clock reaches zero
  tie.tree.step();
  assert.deepEqual([tie.game.view().outcome, tie.game.view().timers.clock.left], ['won', 0]);

  const late = rulesWorld([
    { id: 'rules', type: 'GameRules', props: { flags: { done: false, late: false }, win: state('flags.done') } },
    { id: 'clock', type: 'GameTimer', props: { seconds: 0.1 } },
    { id: 'watch', type: 'GameTimer' },
    { id: 'after', type: 'GameTimer', props: { seconds: 0.2, autostart: false } },
    { id: 'goal', type: 'GameGoal', props: { when: state('flags.late') } },
    { id: 'cp', type: 'Checkpoint', props: { when: state('flags.late') } },
  ], [{ from: 'clock', signal: 'timeout', to: 'rules', call: 'lose' }, { from: 'rules', signal: 'lost', to: 'after', call: 'start' }]);
  const order = [];
  for (const s of ['won', 'lost', 'ended']) late.tree.find('rules').on(s, (e) => order.push(s === 'ended' ? `ended:${e.result}` : s));
  late.tree.run(6);
  assert.deepEqual(order, ['lost', 'ended:lost']);
  assert.equal(late.game.view().timers.watch.elapsedSteps, 6);
  late.game.setFlag('done'); late.game.setFlag('late'); late.tree.find('rules').call('win');
  late.tree.run(20);
  assert.equal(late.game.view().outcome, 'lost', 'the first result stands');
  assert.deepEqual([late.game.view().timers.watch.elapsedSteps, late.game.view().timers.watch.running], [6, false], 'the clocks that were running stopped');
  assert.equal(late.game.view().timers.after.done, true, 'a timer started after the result runs (an ending\'s own)');
  assert.equal(late.game.view().goals.goal.done, false, 'no goal is done once the game is decided');
  assert.deepEqual(late.game.view().checkpoints, {}, 'and no checkpoint is taken');
  late.tree.find('cp').call('write'); late.tree.run(2);
  assert.equal(late.game.checkpointSeq, 0, 'nor by its action');
  assert.deepEqual(late.game.requests, { win: false, lose: false, checkpoints: [] }, 'what is asked of a decided game is forgotten');

  const lose = rulesWorld([{ id: 'rules', type: 'GameRules', props: { flags: { a: false, b: false }, win: state('flags.a'), lose: state('flags.b') } }]);
  lose.game.setFlag('b'); lose.tree.step();
  assert.equal(lose.game.view().outcome, 'lost');
});

test('what a HUD reads: the view is plain data, and events arrive outside the step', () => {
  const { tree, game } = rulesWorld([
    { id: 'rules', type: 'GameRules', props: { flags: { open: true } } },
    { id: 'score', type: 'GameCounter', props: { label: 'Score' } },
    { id: 'clock', type: 'GameTimer', props: { seconds: 2, label: 'Time' } },
    { id: 'goal', type: 'GameGoal', props: { text: 'Score ten', when: state('score', 'ge', 10) } },
  ], [{ from: 'goal', signal: 'completed', to: 'rules', call: 'changeScene', args: { to: 'next.vrmxs', after: 1 } }]);
  const view = game.view();
  assert.deepEqual(structuredClone(view), view);
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view, 'JSON carries it whole');
  assert.deepEqual(Object.keys(view), ['scene', 'step', 'sceneSteps', 'arrivals', 'score', 'counters', 'labels', 'flags', 'timers', 'goals', 'objectives', 'goal', 'outcome', 'decided', 'pending', 'checkpoint', 'checkpoints']);
  assert.deepEqual(view.labels, { score: 'Score' });
  assert.deepEqual(view.timers.clock, { seconds: 2, elapsed: 0, left: 2, steps: 120, elapsedSteps: 0, leftSteps: 120, limit: true, running: true, done: false, declared: true, label: 'Time' });
  view.counters.score = 99;
  assert.equal(game.score, 0, 'changing the view changes nothing');

  const events = [];
  let inStep = false;
  game.on((e) => { assert.equal(inStep, false, 'never inside a step'); events.push(e); });
  const before = game.version;
  inStep = true;
  game.addScore(10); tree.step();
  inStep = false;
  assert.deepEqual(events, [], 'queued during the step');
  assert.notEqual(game.version, before, 'the version says the view moved');
  tree.present(1 / 60, 0);
  assert.deepEqual(events, [
    { type: 'counter', key: 'score', value: 10, by: 10, step: 0 },
    { type: 'goal', key: 'goal', done: true, step: 0 },
    { type: 'pending', to: 'next.vrmxs', at: 61, step: 0 },
    { type: 'outcome', result: 'won', step: 0 },
    { type: 'timer', key: 'clock', event: 'stopped', step: 0 },
  ]);
  assert.deepEqual(game.view().pending, { to: 'next.vrmxs', at: 61, reset: false });
  const v = game.version; tree.step();
  assert.equal(game.version, v, 'nothing moved: the clock stopped with the result');
});

test('a scene change is only recorded: at the next boundary, or after seconds; a later request replaces it', () => {
  const { tree, game } = rulesWorld([{ id: 'rules', type: 'GameRules' }]);
  tree.run(4);
  tree.find('rules').call('changeScene', { to: 'a.vrmxs' });
  assert.deepEqual(game.pending, { to: 'a.vrmxs', at: 5, reset: false });
  tree.find('rules').call('changeScene', { to: 'b.vrmxs', after: 0.5, reset: true });
  assert.deepEqual(game.pending, { to: 'b.vrmxs', at: 35, reset: true });
  tree.find('rules').call('restart', {});
  assert.deepEqual(game.pending, { to: 'test.vrmxs', at: 5, reset: true });
  assert.throws(() => tree.find('rules').call('changeScene', {}), /changeScene needs \{ to \}/);
  tree.run(10); // nothing drives the change here: the world plays on, and the state says what is asked
  assert.equal(game.pending.to, 'test.vrmxs');
});

test('the game state is in the world snapshot and in every step\'s hashes', () => {
  const nodes = [
    { id: 'rules', type: 'GameRules', props: { flags: { open: false }, lose: state('timers.clock.done') } },
    { id: 'score', type: 'GameCounter' },
    { id: 'clock', type: 'GameTimer', props: { seconds: 3 } },
    { id: 'goal', type: 'GameGoal', props: { when: state('score', 'ge', 30) } },
    { id: 'cp', type: 'Checkpoint', props: { when: state('score', 'ge', 20) } },
  ];
  const play = (tree, game, from, to) => { const out = []; for (let i = from; i < to; i++) { if (i % 7 === 0) game.addScore(5); if (i === 40) game.setFlag('open'); tree.step(); out.push(hashValue(worldHashes(tree))); } return out; };
  const a = rulesWorld(nodes);
  play(a.tree, a.game, 0, 30);
  assert.ok('service:game' in worldHashes(a.tree));
  const h1 = worldHashes(a.tree)['service:game']; a.game.addScore(1);
  assert.notEqual(worldHashes(a.tree)['service:game'], h1, 'a point of score changes the hash');
  a.game.addScore(-1);
  const snap = structuredClone(captureWorld(a.tree));
  assert.deepEqual(Object.keys(snap.services.game.data), ['scene', 'seed', 'arrivals', 'enteredAt', 'counters', 'flags', 'timers', 'goals', 'outcome', 'pending', 'checkpoints', 'checkpointSeq', 'fired', 'requests']);
  const rest = play(a.tree, a.game, 30, 200);
  const b = rulesWorld(nodes);
  restoreWorld(b.tree, JSON.parse(JSON.stringify(snap)));
  assert.equal(hashValue(worldHashes(b.tree)), hashValue(worldHashes(restoreWorld(rulesWorld(nodes).tree, snap))));
  assert.deepEqual(play(b.tree, b.game, 30, 200), rest, 'restored mid-game, the same hashes to the end');
  assert.deepEqual(b.game.view(), a.game.view());
  assert.equal(b.game.view().outcome, 'won');
  assert.deepEqual(b.game.flush().map((e) => e.type)[0], 'restored');
});

test('scenes that can\'t start say why: two rules, a name used twice, a condition that isn\'t one', () => {
  assert.throws(() => rulesWorld([{ id: 'a', type: 'GameRules' }, { id: 'b', type: 'GameRules' }]), /a scene has one GameRules node: "a" and "b"/);
  assert.throws(() => rulesWorld([{ id: 'a', type: 'GameCounter', props: { key: 'n' } }, { id: 'b', type: 'GameCounter', props: { key: 'n' } }]), /two counters named "n": "a" and "b"/);
  assert.throws(() => rulesWorld([{ id: 'r', type: 'GameRules', props: { win: { test: 'all', of: [{ test: 'state', key: 'a', op: 'near' }] } } }]), /GameRules "r": win\.of\[0\] has unknown op "near"/);
  assert.throws(() => rulesWorld([{ id: 'g', type: 'GameGoal', props: { when: { test: 'never' } } }]), /GameGoal "g": when has unknown test/);
  // a node removed while playing declares nothing any more; its value stays
  const { tree, game } = rulesWorld([{ id: 'clock', type: 'GameTimer', props: { seconds: 1 } }]);
  tree.run(10); tree.remove('clock'); tree.run(10);
  assert.deepEqual([game.view().timers.clock.elapsedSteps, game.view().timers.clock.declared, game.view().timers.clock.running], [10, false, false]);
});
