// node --test test/   (Node 22+). Writes nothing; prints the per-function report with --verbose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as D from '../src/index.js';
import { evaluate } from './cases.js';

const report = evaluate();
const golden = JSON.parse(fs.readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
if (process.env.DMATH_REPORT) console.log(JSON.stringify(report, null, 1));

for (const fn of D.FUNCTIONS) {
  test(`${fn}: within 1 ulp of native on ${report[fn].random} seeded inputs`, () => {
    assert.ok(report[fn].maxUlp <= 1, `max ${report[fn].maxUlp} ulp at ${JSON.stringify(report[fn].worstArgs)}`);
  });
  test(`${fn}: edge cases match native (NaN, signed zero, infinities, thresholds)`, () => {
    assert.deepEqual(report[fn].edgeMismatch, []);
  });
  test(`${fn}: output bits match the golden digest`, () => {
    assert.equal(report[fn].digest, golden.digests[fn]);
  });
}

test('installPortableMath replaces and restores all twelve functions', () => {
  D.installPortableMath();
  try {
    assert.ok(D.isPortableMathInstalled());
    for (const k of D.FUNCTIONS) assert.equal(Math[k], D.portable[k]);
    assert.equal(Math.sin(1), D.sin(1)); // no recursion through the patched global
    assert.equal(Math.pow(2, 0.5), D.pow(2, 0.5));
  } finally { D.uninstallPortableMath(); }
  for (const k of D.FUNCTIONS) assert.equal(Math[k], D.native[k]);
});

test('withPortableMath swaps in, returns the value, restores, and nests', () => {
  const v = D.withPortableMath(() => {
    assert.ok(D.isPortableMathInstalled());
    D.withPortableMath(() => assert.ok(D.isPortableMathInstalled()));
    assert.ok(D.isPortableMathInstalled()); // still installed after the inner swap
    return Math.atan2(1, 2);
  });
  assert.equal(v, D.atan2(1, 2));
  assert.ok(!D.isPortableMathInstalled());
  assert.throws(() => D.withPortableMath(() => { throw new Error('x'); }));
  assert.ok(!D.isPortableMathInstalled());
});
