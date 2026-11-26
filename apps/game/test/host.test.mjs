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

// M6 W6 (AB-T-0639): a lost GPU device. Recovery itself (a render host made again, play going on with the same hashes)
// is checked in Chromium (acceptance/m6/device-loss.mjs); here, the stand-in's give-up: after three losses in a minute
// the game is held paused, the pause menu asked for, and the status line says to save.
test('a device lost a fourth time in a minute: the game is held, the pause menu asked for, and the status line says to save', async () => {
  const commands = [];
  const h = {
    render: { tree: null, lost: { api: 'WebGPU', reason: 'unknown', message: 'gone' } }, session: { step: 400, scene: 'level', tree: null, active: true },
    state: { display: '', loading: '', playing: true, paused: false }, recoveries: [], displays: [], _display: GameHost.prototype._display, _losses: [1, 2, 3].map(() => performance.now()), _recovering: false,
    mouse: { device: { unlock() {} } }, audio: null, onCommand: (c) => commands.push(c), _changed() {}, pause: GameHost.prototype.pause,
  };
  const warn = console.warn, error = console.error; console.warn = console.error = () => {};
  try { await GameHost.prototype._lost.call(h, h.render.lost); } finally { console.warn = warn; console.error = error; }
  assert.deepEqual(commands, ['pause']);
  assert.deepEqual([h.state.playing, h.state.paused, h.render], [false, true, null], 'held: nothing steps or draws');
  assert.match(h.state.display, /couldn't be restarted \(it was lost three times in a minute\)\. Save your game from the pause menu/);
  assert.deepEqual(h.recoveries.map((r) => [r.step, r.scene, r.failed]), [[400, 'level', 'it was lost three times in a minute']]);
  assert.deepEqual(h.displays.map((d) => [d.step, d.text.slice(0, 22)]), [[400, 'The display stopped. R'], [400, 'The display stopped an']], 'said, then said it couldn\'t');
  assert.equal(h._recovering, false);
});
