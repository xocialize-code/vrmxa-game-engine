import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyName, describeBinding, clock, timerText, isUrgent } from '../src/index.js';

test('bindings read as key caps and gamepad buttons', () => {
  assert.deepEqual(['KeyE', 'Digit1', 'Space', 'ShiftLeft', 'ArrowUp', 'Numpad4', 'F5', 'Slash', 'IntlRo'].map(keyName), ['E', '1', 'Space', 'Left Shift', 'Up', 'Num 4', 'F5', '/', 'IntlRo']);
  assert.equal(describeBinding({ key: 'KeyE' }), 'E');
  assert.equal(describeBinding({ gamepadButton: 2 }), 'Gamepad X');
  assert.equal(describeBinding({ gamepadButton: 40 }), 'Gamepad button 40');
  assert.equal(describeBinding({ mouseButton: 0 }), 'Left click');
  assert.equal(describeBinding({ mouse: 'dx', scale: 0.0025 }), 'Mouse X');
  assert.equal(describeBinding({ gamepadAxis: 1 }), 'Left stick Y');
  assert.equal(describeBinding(null), '?');
});

test('a countdown reads what is left, rounded up; a stopwatch what has gone; from limit, not from left', () => {
  assert.equal(clock(0), '0:00'); assert.equal(clock(59), '0:00'); assert.equal(clock(60 * 75), '1:15');
  assert.equal(timerText({ limit: true, leftSteps: 1, elapsedSteps: 0 }), '0:01', 'one step left is not 0:00');
  assert.equal(timerText({ limit: true, leftSteps: 0, elapsedSteps: 9 }), '0:00');
  assert.equal(timerText({ limit: true, leftSteps: 1200, elapsedSteps: 0 }), '0:20');
  assert.equal(timerText({ limit: false, leftSteps: null, elapsedSteps: 3661 }), '1:01');
  assert.equal(isUrgent({ limit: true, leftSteps: 600, done: false }), true);
  assert.equal(isUrgent({ limit: true, leftSteps: 601, done: false }), false);
  assert.equal(isUrgent({ limit: false, leftSteps: null }), false);
  assert.equal(isUrgent({ limit: true, leftSteps: 0, done: true }), false);
});
