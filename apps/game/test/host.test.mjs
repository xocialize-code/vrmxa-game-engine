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
    render: { tree: null, lost: { api: 'WebGPU', reason: 'unknown', message: 'gone' }, dispose() { this.disposed = true; } }, session: { step: 400, scene: 'level', tree: null, active: true },
    state: { display: '', loading: '', playing: true, paused: false }, recoveries: [], displays: [], _display: GameHost.prototype._display, _losses: [1, 2, 3].map(() => performance.now()), _recovering: false,
    mouse: { device: { unlock() {} } }, audio: null, onCommand: (c) => commands.push(c), _changed() {}, pause: GameHost.prototype.pause,
    _gaveUp: GameHost.prototype._gaveUp, _givenUp: null,
  };
  const lostHost = h.render;
  const warn = console.warn, error = console.error; console.warn = console.error = () => {};
  try { await GameHost.prototype._lost.call(h, h.render.lost); } finally { console.warn = warn; console.error = error; }
  assert.deepEqual(commands, ['pause']);
  assert.deepEqual([h.state.playing, h.state.paused, h.render], [false, true, null], 'held: nothing steps or draws');
  assert.match(h.state.display, /couldn't be restarted \(it was lost three times in a minute\)\. Save your game from the pause menu; Resume tries again/);
  assert.ok(lostHost.disposed, 'the lost host was let go');
  assert.equal(h._givenUp, lostHost, 'kept for Resume to try again with its options');
  // Resume tries again: a fresh count, and _remake with the given-up host
  const remade = [];
  Object.assign(h, { keyboard: { arm() {} }, gamepad: { arm() {} }, _remake: (old) => remade.push(old), mouse: { device: { unlock() {} }, arm() {} } });
  GameHost.prototype.resume.call(h);
  assert.deepEqual([remade, h._losses, h._givenUp, h.state.display], [[lostHost], [], null, 'Restarting the display…']);
  assert.deepEqual(h.recoveries.map((r) => [r.step, r.scene, r.failed]), [[400, 'level', 'it was lost three times in a minute']]);
  assert.deepEqual(h.displays.map((d) => [d.step, d.text.slice(0, 22)]), [[400, 'The display stopped. R'], [400, 'The display stopped an'], [400, 'Restarting the display']], 'said, said it couldn\'t, then Resume restarting it');
  assert.equal(h._recovering, false);
});

// M6 W6 review: the retry loop. One try fails (WebKit's GPU process not back yet), the next succeeds; a Load between them
// gives the retry the new world, not the one let go; a Resume during the wait starts no second try.
test('a renderer that can\'t be made at once is tried again after a wait, with the world the session plays now; a Resume meanwhile starts nothing', async () => {
  const { RenderHost } = await import('@vrmxg/render');
  const real = RenderHost.replace, calls = [];
  const made = { backend: 'webgpu', replaced: { tried: [] }, lost: null, tree: null, onLost: null, attach(t) { this.tree = t; }, detach() { this.tree = null; } };
  RenderHost.replace = async (old, o) => { calls.push(o.tree); if (calls.length === 1) throw new Error('no adapter yet'); made.tree = o.tree; return made; };
  const level = { id: 'level' }, loaded = { id: 'loaded' }, old = { lost: { api: 'WebGPU', reason: 'unknown', message: 'gone' } };
  const h = {
    session: { tree: level, step: 500, scene: 'level', active: true }, render: null, retryWaits: [30, 30], recoverWith: null, recoveries: [], displays: [],
    state: { display: '', loading: '', playing: true, paused: false }, _recovering: false, _givenUp: null, _losses: [],
    _freshCanvas: () => ({}), resize() {}, _changed() {}, _display: GameHost.prototype._display, _lost() {},
    keyboard: { arm() {} }, mouse: { arm() {}, device: { unlock() {} } }, gamepad: { arm() {} }, audio: null,
  };
  let second = 0;
  h._remake = (...a) => { second++; return GameHost.prototype._remake.call(h, ...a); }; // what Resume would call
  const warn = console.warn; console.warn = () => {};
  try {
    const p = GameHost.prototype._remake.call(h, old, old.lost);
    await new Promise((ok) => setTimeout(ok, 5)); // the first try has failed; the loop waits
    assert.deepEqual([calls.length, h._recovering, h.render], [1, true, null]);
    h.session.tree = loaded; // a Load while it waits
    h._givenUp = old; GameHost.prototype.resume.call(h); // and a Resume, even with a given-up host on record
    assert.equal(second, 0, 'Resume started no second try while one is under way');
    await p;
    assert.deepEqual(calls, [level, loaded], 'the retry drew the world the session plays now');
    assert.deepEqual([h.render, made.tree, h._recovering, h.recoveries.map((r) => r.backend)], [made, loaded, false, ['webgpu']]);
    assert.equal(typeof made.onLost, 'function', 'the new host is watched once in place');
  } finally { RenderHost.replace = real; console.warn = warn; }
});
