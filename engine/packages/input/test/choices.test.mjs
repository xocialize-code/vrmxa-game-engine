// M5 W3 (AB-T-0618): a choice is a latched, recorded input; an overlay's hold on the devices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { VirtualDevice, installInput } from '@vrmxg/input';

// What the simulation does with input: it counts jumps and keeps every choice with the step it was read on.
class Listener extends Behaviour {
  ready() { this.jumps = 0; this.heard = []; this.x = 0; }
  physicsProcess() {
    const input = this.tree.services.get('input');
    if (input.pressed('jump')) this.jumps++;
    this.x += input.axis('move_x');
    const c = input.choice('dialogue.choose'), m = input.choice('menu');
    if (c !== undefined) this.heard.push([this.tree.clock.step, 'dialogue.choose', c]);
    if (m !== undefined) this.heard.push([this.tree.clock.step, 'menu', m]);
  }
  getState() { return { jumps: this.jumps, heard: this.heard, x: this.x }; }
}

function world() {
  const tree = new SceneTree({ registry: m0Registry(), behaviours: new Map([['listener', Listener]]) });
  const input = installInput(tree);
  const dev = input.addDevice(new VirtualDevice());
  tree.instantiate({ format: 'vrmxs', version: 1, id: 't', nodes: [{ id: 'root', type: 'Node3D' }, { id: 'me', type: 'Node3D', parent: 'root', behaviours: [{ use: 'listener' }] }] });
  return { tree, input, dev, me: tree.find('me').behaviours[0] };
}

test('a choice is latched by the next step, read on that step only, and is in the snapshot state only then', () => {
  const { tree, input, me } = world();
  tree.run(3);
  assert.equal(input.choice('dialogue.choose'), undefined);
  assert.deepEqual(Object.keys(input.getState()), ['axes', 'down', 'prev'], 'a step without a choice has the state it always had');
  assert.equal(input.choose('dialogue.choose', 'tea'), true);
  assert.equal(input.choice('dialogue.choose'), undefined, 'not before a step latches it');
  tree.step();
  assert.equal(input.choice('dialogue.choose'), 'tea');
  assert.deepEqual(input.getState().choices, { 'dialogue.choose': 'tea' });
  tree.step();
  assert.equal(input.choice('dialogue.choose'), undefined, 'one step only');
  assert.deepEqual(me.heard, [[3, 'dialogue.choose', 'tea']]);
  // the later of two under one name wins; two names arrive together
  input.choose('menu', 1); input.choose('menu', 2); input.choose('dialogue.choose', 'latte');
  tree.step();
  assert.deepEqual(me.heard.slice(1), [[5, 'dialogue.choose', 'latte'], [5, 'menu', 2]]);
});

test('a choice takes a string, a number or a boolean, under a name', () => {
  const { input } = world();
  for (const bad of [null, undefined, {}, [], NaN, Infinity, () => 1]) if (bad !== undefined) assert.throws(() => input.choose('menu', bad), /string, a number or a boolean/);
  for (const bad of ['', 3, null, '__proto__']) assert.throws(() => input.choose(bad, 1), /needs a name/);
  assert.equal(input.choose('menu'), true, 'the value defaults to true');
});

test('a recording carries the choice in its step\'s frame, and a replay makes it on the same step with no UI', () => {
  const a = world();
  a.input.record();
  for (let k = 0; k < 40; k++) {
    if (k === 5) a.dev.press('Space'); if (k === 6) a.dev.release('Space');
    if (k === 12) a.input.choose('dialogue.choose', 'tea');
    if (k === 20) a.input.choose('menu', 3);
    a.tree.step();
  }
  const rec = JSON.parse(JSON.stringify(a.input.stop()));
  assert.equal(rec.version, 2, 'a recording with a choice says so: a version 1 reader would drop it');
  assert.deepEqual(rec.frames[12][2], { 'dialogue.choose': 'tea' });
  assert.deepEqual(rec.frames[20][2], { menu: 3 });
  assert.equal(rec.frames.filter((f) => f.length === 3).length, 2, 'the other frames are as they always were');
  assert.deepEqual(a.me.heard, [[12, 'dialogue.choose', 'tea'], [20, 'menu', 3]]);

  const b = world();
  b.input.replay(rec);
  assert.equal(b.input.choose('dialogue.choose', 'latte'), false, 'a replay is the only input: a click meanwhile is not taken');
  const states = [];
  for (let k = 0; k < 40; k++) { b.tree.step(); states.push(JSON.stringify(b.tree.getState()) + JSON.stringify(b.input.getState())); }
  assert.deepEqual(b.me.heard, a.me.heard);
  assert.equal(b.me.jumps, 1);
  // and step for step: the live run again, compared with the replay
  const c = world();
  for (let k = 0; k < 40; k++) {
    if (k === 5) c.dev.press('Space'); if (k === 6) c.dev.release('Space');
    if (k === 12) c.input.choose('dialogue.choose', 'tea');
    if (k === 20) c.input.choose('menu', 3);
    c.tree.step();
    assert.equal(JSON.stringify(c.tree.getState()) + JSON.stringify(c.input.getState()), states[k], `step ${k}`);
  }
});

test('a recording without a choice is version 1, as before, and a version 1 recording replays', () => {
  const a = world();
  a.input.record(); a.dev.press('KeyD'); a.tree.run(5);
  const rec = a.input.stop();
  assert.equal(rec.version, 1);
  assert.ok(rec.frames.every((f) => f.length === 2));
  const b = world(); b.input.replay(rec); b.tree.run(5);
  assert.equal(b.me.x, 5);
  assert.throws(() => world().input.replay({ ...rec, version: 3 }), /unknown recording version 3/);
});

test('a choice handed over at a scene change is latched by the next world', () => {
  const a = world(), b = world();
  a.tree.run(2);
  a.input.choose('menu', 'start');
  b.tree.clock.step = a.tree.clock.step;
  a.input.carryTo(b.input);
  b.tree.step();
  assert.deepEqual(b.me.heard, [[2, 'menu', 'start']]);
  a.tree.step();
  assert.deepEqual(a.me.heard, [], 'and not by the world that was left');
});

test('while an overlay holds the devices the actions read nothing, choices pass, and a held button stays up until let go', () => {
  const { tree, input, dev, me } = world();
  dev.press('KeyD'); tree.run(2);
  assert.equal(me.x, 2);
  input.muted = true;
  dev.press('Space'); input.choose('dialogue.choose', 'tea');
  tree.run(3);
  assert.equal(me.x, 2, 'the axis reads nothing');
  assert.equal(me.jumps, 0, 'nor the button');
  assert.deepEqual(me.heard, [[2, 'dialogue.choose', 'tea']], 'the choice passes');
  input.muted = false;
  tree.run(3);
  assert.equal(me.jumps, 0, 'the press that answered is not a jump once the overlay is gone');
  assert.equal(me.x, 5, 'the axis is back at once');
  dev.release('Space'); tree.step(); dev.press('Space'); tree.step();
  assert.equal(me.jumps, 1, 'let go and pressed again: a jump');
});

test('peek reads what the devices hold without taking the step\'s mouse deltas', () => {
  const { tree, input, dev } = world();
  dev.press('KeyE').moveMouse(40, 0).setGamepad([0, 0, 0, 0], [1, 0, 0]);
  const p = input.peek();
  assert.ok(p.keys.has('KeyE')); assert.equal(p.gamepad.buttons[0], 1); assert.equal(p.mouse.dx, 0);
  tree.step();
  assert.equal(input.axis('look_x'), 40 * 0.0025, 'the step still got the movement');
});
