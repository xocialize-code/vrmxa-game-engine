import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { ActionMap, DEFAULT_ACTIONS, VirtualDevice, installInput } from '@vrmxg/input';

installPortableMath();
const empty = () => ({ keys: new Set(), mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() }, gamepad: null });

test('the action map: keys, gamepad axes with deadzones, mouse deltas, buttons from any binding', () => {
  const map = new ActionMap(DEFAULT_ACTIONS);
  const ax = (s, name) => map.evaluate(s).axes[map.axes.indexOf(name)];
  const bt = (s, name) => map.evaluate(s).buttons[map.buttons.indexOf(name)];
  const s = empty();
  s.keys.add('KeyW'); s.keys.add('KeyD'); s.keys.add('KeyA');
  assert.equal(ax(s, 'move_y'), 1);
  assert.equal(ax(s, 'move_x'), 0, 'D and A cancel');
  s.gamepad = { axes: [0.1, -0.6, 0, 0], buttons: new Array(17).fill(0) };
  assert.equal(ax(s, 'move_y'), 1, 'keys and stick add, clamped to 1');
  s.keys.clear();
  assert.equal(ax(s, 'move_x'), 0, '0.1 is inside the 0.15 deadzone');
  assert.ok(Math.abs(ax(s, 'move_y') - (0.6 - 0.15) / 0.85) < 1e-12, 'stick up (negative) is +move_y, rescaled from the deadzone');
  s.mouse.dx = 400;
  assert.equal(ax(s, 'look_x'), 1, 'mouse deltas are unbounded (400 × 0.0025)');
  s.gamepad.buttons[0] = 1;
  assert.equal(bt(s, 'jump'), true);
  s.mouse.buttons.add(0);
  assert.equal(bt(s, 'interact'), true);
});

// A kinematic "avatar" moved by actions: the stand-in for a player character in CI (no VRM needed).
class Mover extends Behaviour {
  ready() { this.vy = 0; this.yaw = 0; }
  physicsProcess(dt) {
    const input = this.tree.services.get('input');
    const p = this.node.object3d.position;
    this.yaw -= input.axis('look_x');
    const speed = input.isDown('run') ? 4 : 1.4;
    const x = input.axis('move_x'), y = input.axis('move_y');
    p.x += (Math.sin(this.yaw) * y - Math.cos(this.yaw) * x) * speed * dt;
    p.z += (Math.cos(this.yaw) * y + Math.sin(this.yaw) * x) * speed * dt;
    if (input.pressed('jump') && p.y === 0) this.vy = 4.5;
    this.vy -= 9.81 * dt; p.y = Math.max(0, p.y + this.vy * dt); if (p.y === 0) this.vy = 0;
  }
  getState() { return { vy: this.vy, yaw: this.yaw }; }
}

// 10 s of scripted devices: keys, a stick, mouse look, jumps and run, changing over time.
function drive(dev, k) {
  if (k === 30) dev.press('KeyW');
  if (k === 90) dev.press('ShiftLeft');
  if (k === 120) dev.press('Space');
  if (k === 122) dev.release('Space');
  if (k === 150) { dev.release('KeyW'); dev.release('ShiftLeft'); dev.setGamepad([0.7, -0.4, 0.3, 0]); }
  if (k >= 150 && k < 300) dev.moveMouse(k % 7, 0);
  if (k === 300) { const b = new Array(17).fill(0); b[0] = 1; dev.setGamepad([-0.5, -0.9, 0, 0], b); }
  if (k === 302) dev.setGamepad([-0.5, -0.9, -0.6, 0]);
  if (k === 420) { dev.setGamepad([0, 0, 0, 0]); dev.press('KeyA'); }
  if (k === 500) dev.release('KeyA');
}

const scene = { format: 'vrmxs', version: 1, id: 'input', nodes: [{ id: 'avatar', type: 'Marker', behaviours: [{ use: 'mover' }] }] };
function makeTree() {
  const tree = new SceneTree({ registry: m0Registry(), behaviours: new Map([['mover', Mover]]) });
  const input = installInput(tree);
  tree.instantiate(scene);
  return { tree, input, avatar: tree.find('avatar') };
}

test('record 10 s of keyboard, mouse and gamepad, replay it: the identical end state, devices ignored', () => {
  const A = makeTree();
  const dev = A.input.addDevice(new VirtualDevice());
  A.input.record();
  const trail = [];
  for (let k = 0; k < 600; k++) { drive(dev, k); A.tree.step(); trail.push(A.avatar.object3d.position.toArray()); }
  const rec = A.input.stop();
  assert.equal(rec.frames.length, 600);
  const end = A.tree.stateHash();
  const maxY = Math.max(...trail.map((p) => p[1]));
  assert.ok(maxY > 0.9, `it jumped (${maxY.toFixed(2)} m)`);

  const B = makeTree();
  const noise = B.input.addDevice(new VirtualDevice());
  noise.press('KeyS'); noise.setGamepad([1, 1, 1, 1]); // a replay must not listen to live devices
  B.input.replay(JSON.parse(JSON.stringify(rec)));     // through JSON, as a saved recording would be
  for (let k = 0; k < 600; k++) B.tree.step();
  assert.equal(B.tree.stateHash(), end);
  assert.deepEqual(B.avatar.object3d.position.toArray(), trail[599]);
  B.tree.step();
  assert.equal(B.input.isReplaying, false, 'replay ends with the recording');
});

test('button edges, and a recording refuses a different action map', () => {
  const { tree, input } = makeTree();
  const dev = input.addDevice(new VirtualDevice());
  const seen = [];
  for (let k = 0; k < 6; k++) {
    if (k === 1) dev.press('Space');
    if (k === 4) dev.release('Space');
    tree.step();
    seen.push([input.pressed('jump'), input.isDown('jump'), input.released('jump')].map(Number).join(''));
  }
  assert.deepEqual(seen, ['000', '110', '010', '010', '001', '000']);
  input.record(); tree.step(); const rec = input.stop();
  const other = new SceneTree({ registry: m0Registry() });
  const i2 = installInput(other, { actions: { jump: DEFAULT_ACTIONS.jump } });
  assert.throws(() => i2.replay(rec), /different action map/);
});
