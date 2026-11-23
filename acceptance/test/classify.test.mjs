// M4 W3: the matrix's rule for a load and its one rerun (acceptance/classify.mjs). Only pixel faults can be AB-T-0589,
// and only when the rerun is clean and the failed load ran under another process's GPU load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLoad, classifyRerun, EXACTNESS_VERDICTS } from '../classify.mjs';

const all = { noErrors: true, notTimedOut: true, backend: true, filmTwiceIdentical: true, scrubSame: true };
const clean = { verdicts: all, match: true };

test('a load: clean, pixels (digest or exactness verdicts only) or broken (any functional verdict)', () => {
  assert.equal(classifyLoad(clean).kind, 'clean');
  assert.equal(classifyLoad({ verdicts: all, match: null }).kind, 'clean', 'no reference yet');
  assert.equal(classifyLoad({ verdicts: all, match: false }).kind, 'pixels');
  assert.equal(classifyLoad({ verdicts: { ...all, filmTwiceIdentical: false }, match: false }).kind, 'pixels');
  for (const k of ['noErrors', 'notTimedOut', 'backend', 'scrubSame']) assert.equal(classifyLoad({ verdicts: { ...all, [k]: false }, match: true }).kind, 'broken', k);
  assert.equal(classifyLoad({ verdicts: { ...all, filmTwiceIdentical: false, backend: false }, match: false }).kind, 'broken', 'a fall-back to WebGL with odd pixels');
  assert.ok(!EXACTNESS_VERDICTS.has('scrubSame'));
});

test('AB-T-0589 only for pixel faults, under load, with a clean rerun', () => {
  const pixels = { verdicts: all, match: false };
  assert.equal(classifyRerun({ ...pixels, loaded: true }, clean).outcome, 'incident');
  assert.equal(classifyRerun({ verdicts: { ...all, filmTwiceIdentical: false }, match: false, loaded: true }, clean).outcome, 'incident', 'one odd film export');
  assert.equal(classifyRerun({ ...pixels, loaded: false }, clean).outcome, 'failure', 'a quiet GPU');
  assert.equal(classifyRerun({ ...pixels, loaded: null }, clean).outcome, 'failure', 'not sampled');
  assert.equal(classifyRerun({ ...pixels, loaded: true }, { verdicts: all, match: false }).outcome, 'failure', 'the rerun differs too');
  assert.equal(classifyRerun({ ...pixels, loaded: true }, { verdicts: { ...all, noErrors: false }, match: true }).outcome, 'failure', 'the rerun errs');
});

test('a functional failure is a failure whatever the rerun and the load', () => {
  for (const k of ['noErrors', 'notTimedOut', 'backend', 'scrubSame']) {
    const r = classifyRerun({ verdicts: { ...all, [k]: false }, match: true, loaded: true }, clean);
    assert.equal(r.outcome, 'failure', k);
    assert.match(r.why, new RegExp(k));
  }
  assert.throws(() => classifyRerun({ ...clean, loaded: true }, clean), /clean/);
});
