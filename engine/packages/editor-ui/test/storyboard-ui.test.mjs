// The storyboard strip's cards and the queue's status lines (M4 W5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyCards, jobStatus } from '../src/index.js';

const board = { fps: 24, duration: 96, shots: [
  { id: 's1', name: '010', start: 0, end: 48, frame: 24, camera: 'vc-est', cameras: ['vc-est'], subjects: [], beat: 'sc-1', hand: false, crossesLine: null },
  { id: 's2', name: '020', start: 48, end: 96, frame: 72, camera: 'vc-cu-hana', cameras: ['vc-cu-hana', 'vc-two'], subjects: ['hana-1'], beat: 'ln-2', hand: true, crossesLine: 'crosses the 180° line' },
] };

test('cards follow the shots, with time, cameras, the script line and notes', () => {
  const cards = storyCards(board, { beats: { 'ln-2': { line: 14, text: 'HANA: Good morning!' } }, playhead: 50, selected: 's2', thumbs: { s1: { url: 'data:a', frame: 24 }, s2: { url: 'data:b', frame: 70 } } });
  assert.deepEqual(cards.map((c) => c.id), ['s1', 's2']);
  assert.equal(cards[0].time, '0:00–2:00');
  assert.equal(cards[0].thumb, 'data:a');
  assert.equal(cards[1].thumb, null, 'a thumbnail of another frame is stale');
  assert.equal(cards[1].camera, 'vc-cu-hana → vc-two');
  assert.deepEqual([cards[1].line, cards[1].text], [14, 'HANA: Good morning!']);
  assert.deepEqual(cards[1].notes, ['hand edit', 'crosses the line']);
  assert.deepEqual([cards[0].current, cards[1].current, cards[1].selected], [false, true, true]);
  assert.equal(cards[1].label, 'Shot 020, 48 frames from 48, camera vc-cu-hana then vc-two, hand edit, crosses the line');
  assert.deepEqual(storyCards(null), []);
});

test('job status lines', () => {
  const j = (state, o = {}) => ({ state, progress: { n: 0, total: 0, phase: '' }, result: null, error: null, ...o });
  assert.equal(jobStatus(j('queued')), 'queued');
  assert.equal(jobStatus(j('running')), 'starting');
  assert.equal(jobStatus(j('running', { progress: { n: 12, total: 96, phase: 'frames' } })), 'rendering 12 of 96 (frames)');
  assert.equal(jobStatus(j('done', { result: { stub: true, frames: 96 } })), 'done: 96 frames counted, nothing rendered (stub)');
  assert.equal(jobStatus(j('done', { result: { frames: 96, name: 'the-order.mp4', hashesDigest: 'abcd' } })), 'done: 96 frames · the-order.mp4 · frames abcd');
  assert.equal(jobStatus(j('failed', { error: 'no encoder' })), 'failed: no encoder');
  assert.equal(jobStatus(j('cancelled')), 'cancelled');
});
