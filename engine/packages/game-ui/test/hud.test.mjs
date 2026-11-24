// The HUD's decisions from the game's view (@vrmxg/game's contract), the interaction prompts and the inventory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hudModel, keysFor, promptLabel, Notices, NOTICE_STEPS } from '../src/index.js';
import { DEFAULT_ACTIONS } from '@vrmxg/input';

const view = (o = {}) => ({
  scene: 'level.vrmxs', step: 300, sceneSteps: 300, arrivals: 1, score: 10,
  counters: { score: 10, orders: 1, hidden: 4 }, labels: { score: 'Points', orders: 'Orders taken' }, flags: {},
  timers: {
    clock: { seconds: 6, elapsed: 5, left: 1, steps: 360, elapsedSteps: 300, leftSteps: 60, limit: true, running: true, done: false, declared: true, label: 'Until closing' },
    idle: { seconds: null, elapsed: 2, left: null, steps: null, elapsedSteps: 120, leftSteps: null, limit: false, running: true, done: false, declared: true, label: 'On shift' },
    carried: { seconds: 3, elapsed: 0, left: 3, steps: 180, elapsedSteps: 0, leftSteps: 180, limit: true, running: false, done: false, declared: false, label: 'From before' },
    quiet: { seconds: 3, elapsed: 0, left: 3, steps: 180, elapsedSteps: 0, leftSteps: 180, limit: true, running: true, done: false, declared: true },
  },
  goals: {}, objectives: [{ key: 'take', text: 'Take the order', done: true, optional: false }, { key: 'till', text: 'Close the till', done: false, optional: false }],
  goal: { key: 'till', text: 'Close the till' }, outcome: null, decided: null, pending: null, checkpoint: null, checkpoints: {}, ...o,
});

test('the HUD shows the goal, the score, the labelled counters and the declared, labelled timers', () => {
  const m = hudModel(view());
  assert.equal(m.ready, true);
  assert.deepEqual(m.goal, { key: 'till', text: 'Close the till' });
  assert.deepEqual(m.score, { label: 'Points', value: 10 });
  assert.deepEqual(m.counters, [{ key: 'orders', label: 'Orders taken', value: 1 }], 'a counter without a label is the game\'s own business');
  assert.deepEqual(m.timers.map((t) => [t.key, t.text, t.countdown, t.urgent]), [['clock', '0:01', true, true], ['idle', '0:02', false, false]], 'a timer carried from another scene, or without a label, isn\'t shown');
  assert.deepEqual(m.objectives.map((o) => o.done), [true, false]);
  assert.equal(hudModel(view({ counters: { orders: 1 }, labels: { orders: 'Orders' } })).score, null, 'no score counter: no score');
  assert.equal(hudModel(view({ counters: { score: 3 }, labels: {} })).score.label, 'Score');
  assert.equal(hudModel(view({ goal: null })).goal, null);
  assert.equal(hudModel(view({ outcome: 'lost' })).outcome, 'lost');
});

test('before a world exists the HUD is empty, not broken', () => {
  const m = hudModel(null, { loading: 'loading level.vrmxs' });
  assert.equal(m.ready, false); assert.equal(m.goal, null); assert.deepEqual(m.timers, []); assert.equal(m.loading, 'loading level.vrmxs');
});

test('the prompt is the player\'s, with the keys that answer it and an accessible name', () => {
  const prompts = [{ actor: 'hana', item: 'door', verb: 'use', prompt: 'Open' }, { actor: 'mira', item: 'key', verb: 'take', prompt: 'Take' }];
  const bindings = structuredClone(DEFAULT_ACTIONS);
  const m = hudModel(view(), { prompts, player: 'mira', names: (id) => ({ key: 'Brass key', door: 'Door' })[id], bindings, carrying: [{ id: 'coin', name: 'Coin', type: 'prop' }] });
  assert.deepEqual([m.prompt.item, m.prompt.name, m.prompt.text, m.prompt.keys.keyboard, m.prompt.keys.gamepad], ['key', 'Brass key', 'Take', 'E', 'Gamepad X']);
  assert.equal(m.prompt.label, 'Press E or Gamepad X to Take Brass key');
  assert.deepEqual(m.carrying, [{ id: 'coin', name: 'Coin' }]);
  assert.equal(hudModel(view(), { prompts, bindings }).prompt.actor, 'hana', 'no player given: the first prompt');
  assert.equal(hudModel(view(), { prompts, player: 'nobody' }).prompt, null);
  // rebound: the prompt follows the bindings
  bindings.interact.bindings = [{ key: 'KeyF' }];
  assert.equal(hudModel(view(), { prompts, player: 'mira', bindings }).prompt.label, 'Press F to Take key');
  assert.equal(promptLabel({ text: 'Open door', name: 'door', showName: false, keys: { keyboard: null, gamepad: null } }), 'Open door');
  assert.equal(hudModel(view(), { prompts: [{ actor: 'm', item: 'door', verb: 'use', prompt: 'Open the door' }], names: () => 'Door' }).prompt.showName, false, 'a prompt that names its item says it once');
  assert.deepEqual(keysFor(undefined), { keyboard: null, gamepad: null });
  assert.deepEqual(keysFor({ bindings: [{ mouseButton: 0 }] }), { keyboard: 'Left click', gamepad: null });
});

test('"Saved" comes on checkpointWritten, never on the game\'s checkpoint, and lasts a number of steps', () => {
  const n = new Notices();
  assert.equal(n.take({ type: 'checkpoint', id: 'cp', slot: 'checkpoint', step: 66 }), false, 'taken is not saved');
  assert.equal(n.take({ type: 'checkpointWritten', id: 'cp', slot: 'checkpoint', step: 67, stored: true }), true);
  assert.equal(n.take({ type: 'checkpointFailed', id: 'cp', slot: 'x', step: 70, error: 'disk' }), true);
  assert.deepEqual(n.at(67).map((x) => x.text), ['Saved', 'Couldn\'t save']);
  assert.deepEqual(n.at(67 + NOTICE_STEPS).map((x) => x.text), ['Couldn\'t save'], 'gone after its steps, by the game\'s clock');
  assert.deepEqual(n.at(70 + NOTICE_STEPS), []);
});
