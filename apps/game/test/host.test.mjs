// The host's one-at-a-time rule for New Game and Load (GameHost._busy), on a stand-in host: the rest of GameHost needs a
// page (a canvas, a renderer), and is checked in Chromium (acceptance/m5/game.mjs) and in the Mac app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameHost } from '../src/host.js';

const standIn = () => ({ state: { loading: '', error: null }, changes: 0, _changed() { this.changes++; } });

test('a second New Game or Load while one is under way is refused, and the first is unaffected', async () => {
  const h = standIn();
  let finish;
  const first = GameHost.prototype._busy.call(h, 'Loading…', () => new Promise((ok) => { finish = ok; }));
  assert.equal(h.state.loading, 'Loading…');
  await assert.rejects(GameHost.prototype._busy.call(h, 'Starting…', async () => 'no'), /Loading already/);
  assert.equal(h.state.loading, 'Loading…', 'the refused one changed nothing');
  finish('done');
  assert.equal(await first, 'done');
  assert.equal(h.state.loading, '');
});

test('a failed load says why and leaves nothing loading', async () => {
  const h = standIn();
  const errors = console.error; console.error = () => {};
  try { await assert.rejects(GameHost.prototype._busy.call(h, 'Loading…', async () => { throw new Error('made with another version'); }), /another version/); }
  finally { console.error = errors; }
  assert.equal(h.state.error, 'made with another version');
  assert.equal(h.state.loading, '');
});

test('pause is refused while a game starts or a save loads', () => {
  const h = { session: { active: true }, state: { loading: 'Loading…', playing: true, paused: false } };
  assert.equal(GameHost.prototype.pause.call(h), false);
  assert.equal(h.state.playing, true);
});
