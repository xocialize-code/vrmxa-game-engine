// M5 W3 (AB-T-0618): rebinding at run time. An action rebound is used by the next step; the overrides are plain data
// for a settings store; a recording replays the same whatever the bindings were or are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { ActionMap, DEFAULT_ACTIONS, VirtualDevice, installInput, checkBinding, bindingKind } from '@vrmxg/input';

function world(config) {
  const tree = new SceneTree({ registry: m0Registry() });
  const input = installInput(tree, config);
  const dev = input.addDevice(new VirtualDevice());
  tree.instantiate({ format: 'vrmxs', version: 1, id: 't', nodes: [{ id: 'root', type: 'Node3D' }] });
  return { tree, input, dev };
}

test('the map takes its own copy: rebinding one world never changes the defaults or another world', () => {
  const before = JSON.stringify(DEFAULT_ACTIONS);
  const a = world(), b = world();
  a.input.rebind('jump', [{ key: 'KeyJ' }]);
  assert.equal(JSON.stringify(DEFAULT_ACTIONS), before);
  assert.deepEqual(b.input.bindings().jump.bindings, DEFAULT_ACTIONS.jump.bindings);
  assert.deepEqual(a.input.bindings().jump.bindings, [{ key: 'KeyJ' }]);
});

test('an action rebound is used by the next step, and the old key no longer is', () => {
  const { tree, input, dev } = world();
  dev.press('Space'); tree.step();
  assert.equal(input.pressed('jump'), true);
  dev.release('Space'); tree.step();
  input.rebind('jump', [{ key: 'KeyJ' }, { gamepadButton: 1 }]);
  dev.press('Space'); tree.step();
  assert.equal(input.isDown('jump'), false, 'Space no longer jumps');
  dev.release('Space').press('KeyJ'); tree.step();
  assert.equal(input.pressed('jump'), true, 'J does, on the step after the rebinding');
  dev.release('KeyJ'); tree.step();
  dev.setGamepad([0, 0, 0, 0], [0, 1]); tree.step();
  assert.equal(input.pressed('jump'), true, 'and the gamepad button it was given');
  // an axis: its keys carry their direction
  input.rebind('move_x', [{ key: 'KeyL', value: 1 }, { key: 'KeyJ', value: -1 }]);
  dev.setGamepad().press('KeyL'); tree.step();
  assert.equal(input.axis('move_x'), 1);
});

test('overrides are what differs from the project\'s map; applying them elsewhere gives the same bindings', () => {
  const a = world();
  assert.deepEqual(a.input.overrides(), {});
  a.input.rebind('jump', [{ key: 'KeyJ' }]);
  a.input.rebind('interact', [{ key: 'KeyF' }, { gamepadButton: 2 }]);
  a.input.rebind('run', DEFAULT_ACTIONS.run.bindings);
  const o = JSON.parse(JSON.stringify(a.input.overrides()));
  assert.deepEqual(o, { jump: [{ key: 'KeyJ' }], interact: [{ key: 'KeyF' }, { gamepadButton: 2 }] }, 'run, bound as the project has it, is no override');
  const b = world();
  assert.deepEqual(b.input.applyOverrides(o), { applied: ['jump', 'interact'], ignored: [] });
  assert.deepEqual(b.input.bindings(), a.input.bindings());
  // applying is "the project's map with these": what was rebound and isn't in them goes back
  b.input.rebind('run', [{ key: 'KeyR' }]);
  b.input.applyOverrides({ jump: [{ key: 'KeyJ' }] });
  assert.deepEqual(b.input.overrides(), { jump: [{ key: 'KeyJ' }] });
  b.input.resetBindings('jump');
  assert.deepEqual(b.input.overrides(), {});
  a.input.resetBindings();
  assert.deepEqual(a.input.bindings(), world().input.bindings());
});

test('stored overrides that don\'t fit this game are left out and listed, never thrown', () => {
  const { input } = world();
  const r = input.applyOverrides({ jump: [{ key: 'KeyJ' }], fly: [{ key: 'KeyF' }], run: [{ mouse: 'dx' }], interact: 'KeyE', zoom: [{ key: '' }], look_x: [{ gamepadAxis: 2, deadzone: 1 }] });
  assert.deepEqual(r.applied, ['jump']);
  assert.deepEqual(r.ignored.map((i) => i.action), ['fly', 'run', 'interact', 'zoom', 'look_x']);
  assert.match(r.ignored[0].reason, /no such action/);
  assert.match(r.ignored[1].reason, /a button can't be bound to mouse/);
  assert.deepEqual(input.overrides(), { jump: [{ key: 'KeyJ' }] });
  for (const junk of [null, undefined, 'x', 7, []]) assert.deepEqual(input.applyOverrides(junk), { applied: [], ignored: [] });
  assert.deepEqual(input.overrides(), {});
});

test('a binding is checked for its action\'s type', () => {
  assert.equal(bindingKind({ key: 'KeyE' }), 'key');
  assert.equal(bindingKind({ key: 'KeyE', gamepadButton: 1 }), null);
  assert.equal(checkBinding('button', { key: 'KeyE' }), null);
  assert.equal(checkBinding('axis', { gamepadAxis: 0, deadzone: 0.15, scale: -1 }), null);
  assert.equal(checkBinding('axis', { gamepadButton: 14, value: -1 }), null);
  assert.match(checkBinding('button', { gamepadAxis: 0 }), /can't be bound to gamepadAxis/);
  assert.match(checkBinding('axis', { mouseButton: 0 }), /can't be bound to mouseButton/);
  assert.match(checkBinding('axis', { mouse: 'dz' }), /dx, dy, wheel/);
  assert.match(checkBinding('button', { gamepadButton: -1 }), /whole number/);
  assert.match(checkBinding('button', {}), /names one of/);
  assert.match(checkBinding('axis', { key: 'KeyD', value: '1' }), /value is a number/);
  const map = new ActionMap();
  assert.throws(() => map.rebind('fly', []), /no action "fly"/);
  assert.throws(() => map.rebind('jump', { key: 'KeyJ' }), /as a list/);
  assert.throws(() => map.rebind('jump', [{ key: 'KeyJ' }, { mouse: 'dx' }]), /"jump" binding 1/);
  assert.throws(() => map.reset('fly'), /no action "fly"/);
});

test('a recording made before a rebinding replays the same after it, and one made after it replays on the default map', () => {
  // record on the default bindings
  const a = world();
  a.input.record();
  const play = (w, jump, right) => { const out = []; for (let k = 0; k < 30; k++) { if (k === 4) w.dev.press(right); if (k === 9) w.dev.press(jump); if (k === 11) w.dev.release(jump); if (k === 20) w.dev.release(right); w.tree.step(); out.push(JSON.stringify(w.input.getState())); } return out; };
  const live = play(a, 'Space', 'KeyD');
  const rec = JSON.parse(JSON.stringify(a.input.stop()));
  // replay it in a world whose bindings were changed
  const b = world();
  b.input.rebind('jump', [{ key: 'KeyJ' }]); b.input.rebind('move_x', [{ key: 'KeyL', value: 1 }]);
  b.input.replay(rec);
  for (let k = 0; k < 30; k++) { b.dev.press('KeyJ'); b.tree.step(); assert.equal(JSON.stringify(b.input.getState()), live[k], `step ${k}`); }
  // the rebound keys give the same frames live, and that recording is the first one
  const c = world();
  c.input.rebind('jump', [{ key: 'KeyJ' }]); c.input.rebind('move_x', [{ key: 'KeyL', value: 1 }]);
  c.input.record();
  assert.deepEqual(play(c, 'KeyJ', 'KeyL'), live);
  assert.deepEqual(JSON.parse(JSON.stringify(c.input.stop())), rec, 'a recording names actions and their values, never keys');
  // bindings are settings, not simulation state
  assert.deepEqual(Object.keys(c.input.getState()), ['axes', 'down', 'prev']);
});

test('a scene change carries the player\'s bindings to the next world\'s input', () => {
  const a = world(), b = world();
  a.input.rebind('jump', [{ key: 'KeyJ' }]);
  a.input.carryTo(b.input);
  assert.deepEqual(b.input.overrides(), { jump: [{ key: 'KeyJ' }] });
  b.dev.press('KeyJ'); b.tree.step();
  assert.equal(b.input.pressed('jump'), true);
});
