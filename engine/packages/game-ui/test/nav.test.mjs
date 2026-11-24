// Keyboard and gamepad navigation, as input actions: the decisions, without a DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionMap } from '@vrmxg/input';
import { UI_ACTIONS, NavPad, keyAction, navTarget, ActivationGuard } from '../src/index.js';

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

test('a held or repeated Enter or Space never activates a control it didn\'t go down on (review)', () => {
  const later = []; const g = new ActivationGuard({ later: (fn) => later.push(fn) });
  const flush = () => { for (const fn of later.splice(0)) fn(); };
  const cont = { id: 'continue' }, choice = { id: 'choice-1' };
  // Enter on Continue: its press clicks Continue
  assert.equal(g.keydown('Enter', false, cont), false);
  assert.equal(g.click(cont), false, 'the press clicks what it went down on');
  // still held: the choices appear, focus moves to the first; the repeats are stopped, and so would any click there be
  assert.equal(g.keydown('Enter', true, choice), true, 'a repeat is no activation');
  assert.equal(g.click(choice), true, 'nor a click on a control it didn\'t go down on');
  g.keyup('Enter'); flush();
  assert.equal(g.click(choice), false, 'let go: a fresh press (or the mouse) works');
  // Space pressed on Continue, let go on a choice: the release's click is stopped (it is still down until that click ran)
  g.keydown('Space', false, cont);
  g.keyup('Space');
  assert.equal(g.click(choice), true);
  flush();
  // a fresh Space on the choice: allowed
  g.keydown('Space', false, choice); g.keyup('Space');
  assert.equal(g.click(choice), false); flush();
  // other keys, and clicks with nothing held (a gamepad's A, a script): never stopped
  assert.equal(g.keydown('KeyW', true, cont), false);
  assert.equal(g.click(choice), false);
  g.keydown('Enter', false, cont); g.clear();
  assert.equal(g.click(choice), false, 'focus left the page: nothing held');
});
