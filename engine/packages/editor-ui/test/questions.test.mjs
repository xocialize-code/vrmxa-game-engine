// A window's questions: one at a time, and every ask resolves (M5 W8, AB-T-0593 review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questions } from '../src/index.js';

test('a question shows, waits, and resolves with the person\'s choice', async () => {
  const shown = [];
  const q = questions((x) => shown.push(x));
  const a = q.ask('Unsaved changes', 'First Light has changes.', [{ id: 'save', label: 'Save' }, { id: 'cancel', label: 'Cancel' }]);
  assert.equal(q.asking, true);
  assert.equal(shown.at(-1).title, 'Unsaved changes');
  q.reply('save');
  assert.equal(await a, 'save');
  assert.equal(q.asking, false);
  assert.equal(shown.at(-1), null, 'the sheet goes');
  q.reply('save'); // nothing open: nothing happens
  assert.equal(shown.length, 2);
});

test('a second question while one is up is answered "cancel" and never shown; the first keeps its sheet and its answer', async () => {
  const shown = [];
  const q = questions((x) => shown.push(x));
  const closing = q.ask('Unsaved changes', 'on close', [{ id: 'save', label: 'Save' }, { id: 'discard', label: 'Don\'t Save' }, { id: 'cancel', label: 'Cancel' }]);
  const newShort = q.ask('Unsaved changes', 'on New Short', [{ id: 'save', label: 'Save' }, { id: 'cancel', label: 'Cancel' }]);
  assert.equal(await newShort, 'cancel', 'refused at once: New Short doesn\'t go on');
  assert.equal(shown.length, 1, 'only the first was shown');
  assert.equal(shown[0].text, 'on close');
  q.reply('discard');
  assert.equal(await closing, 'discard', 'the close still gets its answer');
  const next = q.ask('A different file has this name', 'x', [{ id: 'rename', label: 'Keep Both' }, { id: 'cancel', label: 'Cancel' }]);
  q.reply('rename');
  assert.equal(await next, 'rename', 'and the next question is asked as usual');
});
