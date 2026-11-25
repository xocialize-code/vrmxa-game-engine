// The number field's decisions (AB-T-0600): typed arithmetic without eval, min / max / step / precision, keys and drags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evalArithmetic, parseNumber, constrain, stepBy, dragTo, formatNumber, fillOf, roundTo, stepMultiplier, DRAG_THRESHOLD } from '../src/index.js';

test('arithmetic: + - * / %, unary signs, parentheses, a comma as the decimal point', () => {
  const cases = { '2*3': 6, '1.5 * 2 + 0.25': 3.25, '90/2': 45, '-(3 - 1)': -2, '2 + 3 * 4': 14, '(2 + 3) * 4': 20, '10 % 4': 2, '--1': 1, '+5': 5, '1,5': 1.5, '1,5 * 2': 3, '.5': 0.5, '1e3': 1000, '2.5e-1': 0.25, '  7  ': 7, '8 / 4 / 2': 1, '2 - 3 - 4': -5 };
  for (const [t, v] of Object.entries(cases)) assert.equal(evalArithmetic(t), v, t);
  for (const t of ['', ' ', 'abc', '2 +', '(1', '1)', '1 2', '2 ** 3', '1/0', 'Math.PI', 'alert(1)', '0x10', '1;2', '[1]', null, undefined]) assert.equal(evalArithmetic(t), null, String(t));
});

test('the field\'s source has no eval or new Function', () => {
  for (const f of ['numbers.js', 'NumberField.vue', 'fields.js', 'ValueField.vue']) {
    const src = fs.readFileSync(path.join(import.meta.dirname, '../src', f), 'utf8');
    assert.doesNotMatch(src, /\beval\s*\(|new\s+Function\s*\(/, f);
  }
});

test('a typed value is clamped, rounded to the precision, whole for an integer; junk keeps the old value', () => {
  assert.equal(parseNumber('2*3'), 6, '"2*3" commits 6');
  assert.equal(parseNumber('5', { max: 4 }), 4);
  assert.equal(parseNumber('-1', { min: 0 }), 0);
  assert.equal(parseNumber('1.23456', { precision: 2 }), 1.23);
  assert.equal(parseNumber('2.6', { integer: true }), 3);
  assert.equal(parseNumber('nope'), null);
  assert.equal(constrain(-0), 0);
  assert.equal(constrain(0.1 + 0.2), 0.3, 'six decimals by default: no float noise in files');
  assert.equal(roundTo(-0.0001, 2), 0);
});

test('arrow keys step by the schema\'s step; Shift is fine (×0.1), Alt coarse (×10)', () => {
  assert.equal(stepBy(1, 1, { step: 0.1 }), 1.1);
  assert.equal(stepBy(1, -1, { step: 0.1 }), 0.9);
  assert.equal(stepBy(1, 1, { step: 0.1, shiftKey: true }), 1.01);
  assert.equal(stepBy(1, 1, { step: 0.1, altKey: true }), 2);
  assert.equal(stepBy(0.95, 1, { step: 0.1, max: 1 }), 1);
  assert.equal(stepBy(undefined, 1, { step: 1 }), 1);
  assert.equal(stepBy(3, 1, { step: 1, integer: true }), 4);
  assert.deepEqual([stepMultiplier({}), stepMultiplier({ shiftKey: true }), stepMultiplier({ altKey: true })], [1, 0.1, 10]);
});

test('a drag moves one step per pixel from where it started, on the step\'s grid, within min and max', () => {
  assert.equal(dragTo(1, 10, { step: 0.01 }), 1.1);
  assert.equal(dragTo(1, -250, { step: 0.01, min: 0 }), 0);
  assert.equal(dragTo(0, 7, { step: 0.05 }), 0.35);
  assert.equal(dragTo(0, 7, { step: 0.05, shiftKey: true }), 0.035);
  assert.equal(dragTo(10, 3, { step: 1, integer: true, altKey: true }), 40);
  assert.equal(dragTo(0, 33, { step: 0.1, precision: 2 }), 3.3, 'no 3.3000000000000003');
  assert.equal(DRAG_THRESHOLD, 3);
});

test('shown values drop trailing zeros; the fill bar needs both ends', () => {
  assert.equal(formatNumber(1.5), '1.5');
  assert.equal(formatNumber(2), '2');
  assert.equal(formatNumber(0.123456, 3), '0.123');
  assert.equal(formatNumber(undefined), '');
  assert.equal(formatNumber(NaN), '');
  assert.equal(fillOf(5, 0, 10), 0.5);
  assert.equal(fillOf(15, 0, 10), 1);
  assert.equal(fillOf(5, 0, undefined), null);
});

test('the review\'s cases: a fine drag stores what the field shows; an integer field stays whole at a fractional bound', () => {
  assert.equal(dragTo(1, 2, { step: 0.05, precision: 2, shiftKey: true }), 1.01, 'hundredths (two pixels each), never 1.005 shown as 1');
  assert.equal(dragTo(1, 4, { step: 0.05, precision: 2, shiftKey: true }), 1.02);
  assert.equal(stepBy(1, 1, { step: 0.05, precision: 2, shiftKey: true }), 1.01);
  assert.equal(constrain(0.4, { integer: true, min: 0.5 }), 1);
  assert.equal(constrain(9.7, { integer: true, max: 9.5 }), 9);
});
