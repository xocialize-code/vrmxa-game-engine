// The question a window asks before it closes or the app quits (M5 W8, AB-T-0593).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closingQuestion } from '../src/index.js';

test('nothing unsaved: no question, the window closes', () => {
  assert.equal(closingQuestion({ dirty: false, canSave: true, title: 'First Light' }), null);
  assert.equal(closingQuestion({ dirty: false, canSave: false, memory: [], title: 'cafe.vrmxs' }), null);
  assert.equal(closingQuestion({ dirty: false, canSave: true, memory: ['scripts/a.fountain'], title: 'First Light' }), null, 'a project folder holds everything saved');
});

test('unsaved changes where Save works: Save, Don\'t Save, Cancel', () => {
  const q = closingQuestion({ dirty: true, canSave: true, title: 'First Light' });
  assert.equal(q.title, 'Unsaved changes');
  assert.equal(q.text, 'First Light has changes that aren\'t saved.');
  assert.deepEqual(q.options, [{ id: 'save', label: 'Save' }, { id: 'discard', label: 'Don\'t Save' }, { id: 'cancel', label: 'Cancel' }]);
  assert.match(closingQuestion({ dirty: true, canSave: true, title: 'Untitled', neverSaved: true }).text, /\(it has never been saved\)\.$/);
});

test('where nothing can be saved to disk, there is no Save to offer, and Cancel comes first', () => {
  const q = closingQuestion({ dirty: true, canSave: false, title: 'cafe.vrmxs', project: 'Sample (bundled)' });
  assert.deepEqual(q.options.map((o) => o.id), ['cancel', 'discard']);
  assert.equal(q.options[1].label, 'Close Anyway');
  assert.equal(q.text, 'cafe.vrmxs has changes that aren\'t saved. Sample (bundled) is read-only, so nothing can be saved to it: open a project folder to keep work. Closing now loses this.');
  const m = closingQuestion({ dirty: false, canSave: false, memory: ['sequences/first-light.vrmxs', 'shorts.json'], title: 'First Light', reason: 'quit' });
  assert.match(m.text, /^2 files are saved only in memory\. /);
  assert.match(m.text, /Quitting now loses this\.$/);
  assert.equal(m.options[1].label, 'Quit Anyway');
  const both = closingQuestion({ dirty: true, canSave: false, memory: ['shorts.json'], title: 'First Light' });
  assert.match(both.text, /^First Light has changes that aren't saved, and shorts\.json is saved only in memory\. /);
});
