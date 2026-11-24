// Keyboard and gamepad navigation, as input actions: the decisions, without a DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionMap } from '@vrmxg/input';
import { UI_ACTIONS, NavPad, keyAction, navTarget } from '../src/index.js';

const pad = (buttons = {}, axes = [0, 0, 0, 0]) => { const b = new Array(17).fill(0); for (const [i, v] of Object.entries(buttons)) b[Number(i)] = v; return { gamepad: { axes, buttons: b } }; };

test('keys map to the UI\'s actions', () => {
  const map = new ActionMap(UI_ACTIONS);
  assert.deepEqual(['ArrowDown', 'KeyW', 'Enter', 'Space', 'Escape', 'Backspace', 'KeyQ'].map((c) => keyAction(map, c)), ['ui_down', 'ui_up', 'ui_accept', 'ui_accept', 'ui_back', 'ui_back', null]);
});

test('the gamepad: the d-pad and the stick move, A accepts, B goes back; edges once, held directions repeat by frames', () => {
  const p = new NavPad({ delay: 3, every: 2 });
  assert.deepEqual(p.update(pad({ 13: 1 })), ['ui_down']);
  assert.deepEqual(p.update(pad({ 13: 1 })), [], 'held: not again at once');
  p.update(pad({ 13: 1 }));
  assert.deepEqual(p.update(pad({ 13: 1 })), [], 'frame 4: first repeat waits for every');
  assert.deepEqual(p.update(pad({ 13: 1 })), ['ui_down'], 'frame 5 repeats');
  assert.deepEqual(p.update(pad()), []);
  assert.deepEqual(p.update(pad({ 0: 1 })), ['ui_accept']);
  assert.deepEqual(p.update(pad({ 0: 1 })), [], 'accept never repeats');
  assert.deepEqual(p.update(pad({ 1: 1 })), ['ui_back']);
  assert.deepEqual(p.update(pad({}, [0, -0.9, 0, 0])), ['ui_up'], 'stick up (negative y) is up');
  assert.deepEqual(p.update(pad({}, [0.3, 0, 0, 0])), [], 'inside the half-way deadzone');
  assert.deepEqual(p.update(pad({}, [0.8, 0, 0, 0])), ['ui_right']);
  assert.deepEqual(p.update({ gamepad: null }), [], 'no pad: nothing');
  assert.deepEqual(new NavPad().update({ keys: new Set(['ArrowDown']), gamepad: null }), [], 'the keyboard comes as events, never polled');
});

test('what an action does to the controls: focus wraps, sliders step, accept clicks, back leaves', () => {
  assert.deepEqual(navTarget('ui_down', { count: 3, index: 2, kind: 'button' }), { focus: 0 });
  assert.deepEqual(navTarget('ui_up', { count: 3, index: 0, kind: 'button' }), { focus: 2 });
  assert.deepEqual(navTarget('ui_down', { count: 3, index: -1 }), { focus: 0 }, 'nothing focused: the first');
  assert.deepEqual(navTarget('ui_up', { count: 3, index: -1 }), { focus: 2 });
  assert.deepEqual(navTarget('ui_right', { count: 3, index: 1, kind: 'range' }), { step: 1 });
  assert.deepEqual(navTarget('ui_left', { count: 3, index: 1, kind: 'range' }), { step: -1 });
  assert.deepEqual(navTarget('ui_right', { count: 3, index: 1, kind: 'button' }), { focus: 2 });
  assert.deepEqual(navTarget('ui_accept', { count: 3, index: 1, kind: 'button' }), { click: true });
  assert.equal(navTarget('ui_accept', { count: 3, index: 1, kind: 'range' }), null);
  assert.deepEqual(navTarget('ui_accept', { count: 3, index: -1 }), { focus: 0 });
  assert.deepEqual(navTarget('ui_back', { count: 0, index: -1 }), { back: true });
  assert.equal(navTarget('ui_down', { count: 0, index: -1 }), null);
});
