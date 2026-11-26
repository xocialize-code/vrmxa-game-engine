// A session played as the app plays one (New Game, a person's input, Save, Load, Quit to Title) replays from its log
// to the same per-step hashes; saves and checkpoints count as kept only once the store has them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '@vrmxg/save';
import { ballSession, ballGame, play, FailingStore } from './helpers.mjs';
import { compatFingerprint } from '@vrmxg/bundle';
import { BEHAVIOURS } from '../../../engine/packages/game/test/fixtures/world.js';
import { GameSession, replaySession, firstDifference, SESSION_FORMAT } from '../src/session.js';
import { GAME } from './helpers.mjs';

// the person: holds right (KeyD → move_x) from the start, taps Space (jump: the title's Start) at a few steps
const person = (device) => (step) => {
  device.press('KeyD');
  if (step % 64 === 12) device.press('Space'); else device.release('Space');
};

test('a new game starts in the entry scene at step 0 and records from there', async () => {
  const { session } = await ballSession();
  await session.newGame();
  assert.equal(session.scene, 'title.vrmxs');
  assert.equal(session.step, 0);
  assert.equal(session.dirty, false, 'nothing played yet');
  await play(session, 5);
  assert.equal(session.dirty, true);
  const log = session.log();
  assert.equal(log.format, SESSION_FORMAT);
  assert.deepEqual(log.segments[0].from, { start: 'title.vrmxs', seed: 1 });
  assert.equal(log.segments[0].steps, 5);
  session.end();
});

test('a session through scene changes, a save and a load replays to the same per-step hashes', async () => {
  const { session, device, store } = await ballSession();
  const act = person(device);
  await session.newGame();
  await play(session, 150, act);                 // title → level (Space at 12), into the level
  const savedAt = session.step;
  await session.saveSlot('slot-1');
  assert.equal(session.dirty, false, 'saved: nothing to lose');
  await play(session, 140, act);                 // on past the save
  assert.equal(session.dirty, true);
  await session.loadSlot('slot-1');              // back to the save: a new segment starts from its file
  assert.equal(session.step, savedAt);
  assert.equal(session.dirty, false, 'just loaded: nothing to lose');
  await play(session, 320, act);                 // through the result, the ending and back to the title
  const log = session.log();
  assert.equal(log.segments.length, 2);
  assert.equal(log.segments[1].from.slot, 'slot-1');
  assert.equal(log.segments[1].at, savedAt);
  const scenes = new Set(log.hashes.map((h) => h.scene));
  assert.ok(scenes.has('title.vrmxs') && scenes.has('level.vrmxs') && scenes.has('ending.vrmxs'), `went through ${[...scenes]}`);
  assert.ok((await store.list()).some((e) => e.slot === 'slot-1'));
  session.end();

  // replayed in a fresh runtime with no person: the log alone
  const g = await ballGame();
  const replay = await replaySession(JSON.parse(JSON.stringify(log)), { ...g, digest: 'test' });
  assert.equal(replay.length, log.hashes.length);
  assert.equal(firstDifference(replay, log.hashes), -1, 'every step the same');
});

test('the log survives Quit to Title, and the next New Game starts a fresh one', async () => {
  const { session, device } = await ballSession();
  await session.newGame();
  await play(session, 30, person(device));
  const log = session.end();
  assert.equal(session.active, false);
  assert.equal(log.segments[0].steps, 30);
  assert.equal(session.last, log);
  await session.newGame();
  assert.equal(session.step, 0);
  assert.equal(session.log().segments[0].steps, 0);
  session.end();
});

test('Continue from the title starts a session from a save, and it replays', async () => {
  const store = new MemoryStore();
  const first = await ballSession({ store });
  await first.session.newGame();
  await play(first.session, 100, person(first.device));
  await first.session.saveSlot('slot-2');
  first.session.end();
  // a fresh launch: another session over the same store
  const { session, device } = await ballSession({ store });
  await session.loadSlot('slot-2');
  assert.equal(session.step, 100);
  await play(session, 80, person(device));
  const log = session.log();
  assert.equal(log.segments.length, 1);
  assert.equal(log.segments[0].from.slot, 'slot-2');
  session.end();
  const replay = await replaySession(log, { ...(await ballGame()), digest: 'test' });
  assert.equal(firstDifference(replay, log.hashes), -1);
});

test('a player can\'t save into a checkpoint\'s slot', async () => {
  const { session } = await ballSession();
  await session.newGame();
  await play(session, 3);
  await assert.rejects(session.saveSlot('auto-checkpoint'), /can't be a player's save/);
  assert.equal(GameSession.playerSlot('auto-door'), false);
  assert.equal(GameSession.playerSlot('slot-1'), true);
  session.end();
});

test('a save whose write fails throws and leaves the progress unsaved', async () => {
  const { session } = await ballSession({ store: new FailingStore() });
  await session.newGame();
  await play(session, 20);
  await assert.rejects(session.saveSlot('slot-1'), /the disk is full/);
  assert.equal(session.dirty, true);
  assert.equal(session.log().segments[0].marks.length, 0, 'no save marked');
  session.end();
});

test('a checkpoint counts as kept once the store has it, and not when its write fails', async () => {
  for (const [store, kept] of [[new MemoryStore(), true], [new FailingStore(), false]]) {
    const { session, device } = await ballSession({ store });
    const events = [];
    session.onEvent = (e) => events.push(e);
    await session.newGame();
    const act = person(device);
    // the level's first gate takes a checkpoint; play until the flow says what became of it
    for (let i = 0; i < 400 && !events.some((e) => e.type === 'checkpointWritten' || e.type === 'checkpointFailed'); i++) { await play(session, 1, act); await session.flow.settle(); session.flow.flush(); }
    const done = events.find((e) => e.type === 'checkpointWritten' || e.type === 'checkpointFailed');
    assert.ok(done, 'a checkpoint was taken');
    assert.equal(done.type, kept ? 'checkpointWritten' : 'checkpointFailed');
    assert.equal(session.safeStep === done.step, kept, `safe step ${session.safeStep}, checkpoint at ${done.step}`);
    session.end();
  }
});

test('a save that can\'t load leaves the game being played as it was', async () => {
  const { session, store } = await ballSession();
  await session.newGame();
  await play(session, 10);
  await store.write('slot-3', { format: 'not-a-save', requires: { scene: { ref: 'level.vrmxs' } } });
  await assert.rejects(session.loadSlot('slot-3'));
  assert.equal(session.step, 10);
  assert.equal(session.log().segments.length, 1);
  await play(session, 2);
  assert.equal(session.step, 12);
  session.end();
});

test('a replay refuses a log that isn\'t one, and one whose segment starts elsewhere', async () => {
  const g = await ballGame();
  await assert.rejects(replaySession({ format: 'x' }, { ...g, digest: 'test' }), /not a session log/);
  const { session } = await ballSession();
  await session.newGame();
  await play(session, 4);
  const log = session.log();
  session.end();
  log.segments[0].at = 3;
  await assert.rejects(replaySession(log, { ...g, digest: 'test' }), /starts at step 3/);
});

// ---------------------------------------------------------------- what the review found (one test per finding)

/** A store whose writes wait until released: a slow shell write, so something can happen while one is in flight. */
class HeldStore extends MemoryStore {
  constructor() { super(); this.held = []; }
  async write(slot, doc) { if (slot === 'slow') await new Promise((ok) => this.held.push(ok)); return super.write(slot, doc); }
  release() { for (const ok of this.held.splice(0)) ok(); }
}

test('a save still being written when another one loads keeps the new timeline unsaved', async () => {
  const store = new HeldStore();
  const { session, device } = await ballSession({ store });
  await session.newGame();
  await play(session, 100, person(device));
  await session.saveSlot('slot-1');                     // step 100
  await play(session, 200, person(device));             // step 300
  const writing = session.saveSlot('slow');             // step 300, its write held back
  await new Promise((r) => setImmediate(r));
  await session.loadSlot('slot-1');                     // back to step 100: a new segment
  await play(session, 50, person(device));              // step 150, unsaved
  assert.equal(session.dirty, true);
  store.release();
  const entry = await writing;
  assert.equal(entry.kept, false, 'the save belongs to the segment that was loaded over');
  assert.equal(session.safeStep, 100, 'the old timeline\'s save doesn\'t make step 150 safe');
  assert.equal(session.dirty, true);
  assert.deepEqual(session.log().segments[1].marks, [], 'no save mark from the old timeline in the new segment');
  session.end();
});

test('a load that outlives its session (Quit to Title while it loads) frees its world and says so', async () => {
  const { session } = await ballSession();
  await session.newGame();
  await play(session, 40);
  await session.saveSlot('slot-1');
  await play(session, 10);
  // ended while the slot's file is read, and while its world is built
  const reading = session.loadSlot('slot-1');
  session.end();
  await assert.rejects(reading, /ended while the save was loading/);
  assert.equal(session.active, false, 'no session started from the title by a load meant for the one that ended');
  await session.newGame();
  await play(session, 5);
  const building = session.loadFile(await session.store.read('slot-1'), { slot: 'slot-1' });
  session.end();
  await assert.rejects(building, /ended while the save was loading/);
  assert.equal(session.active, false);
});

test('one session change at a time: a second New Game or load while one is under way is refused', async () => {
  const { session } = await ballSession();
  const first = session.newGame();
  await assert.rejects(session.newGame(), /starting or loading already/, 'New Game during New Game');
  await assert.rejects(session.loadFile({}), /starting or loading already/, 'a load during New Game');
  await first;
  await play(session, 20);
  await session.saveSlot('slot-1');
  const file = await session.store.read('slot-1');
  const loading = session.loadFile(file);
  await assert.rejects(session.loadFile(file), /starting or loading already/, 'a load during a load');
  await assert.rejects(session.newGame(), /starting or loading already/, 'New Game during a load');
  assert.equal(await loading, 20);
  session.end();
});

test('a save belongs to the build that made it: another build\'s save, or one that doesn\'t say, is refused', async () => {
  const store = new MemoryStore();
  const a = await ballSession({ store });
  await a.session.newGame();
  await play(a.session, 30);
  await a.session.saveSlot('slot-1');
  a.session.end();
  const saved = await store.read('slot-1');
  assert.deepEqual(saved.extra.build, { digest: 'test', game: 'ball-game' }, 'the save names its build (a build from before M6: no fingerprint)');
  // the same game exported again: another digest, the same store (one bundle id, one Saves folder)
  const g = await ballGame();
  const b = new GameSession({ game: GAME, digest: 'another-build', load: g.load, unload: g.unload, store, scenes: g.scenes, prefabs: g.prefabs });
  await assert.rejects(b.loadSlot('slot-1'), /made with another version of the game \(build test\); this one is build another-buil/);
  assert.equal(b.active, false, 'nothing started');
  const unstamped = structuredClone(saved); delete unstamped.extra.build;
  await assert.rejects(b.loadFile(unstamped), /doesn't say which version of the game made it/);
  // a checkpoint the flow writes is stamped too
  const c = await ballSession({ store });
  await c.session.newGame();
  const act = person(c.device);
  for (let i = 0; i < 400 && !(await store.list()).some((e) => e.slot.startsWith('auto-')); i++) { await play(c.session, 1, act); await c.session.flow.settle(); }
  const cp = (await store.list()).find((e) => e.slot.startsWith('auto-'));
  assert.ok(cp, 'a checkpoint was written');
  assert.equal((await store.read(cp.slot)).extra.build.digest, 'test');
  c.session.end();
});

// the ball game's fingerprint, as an export makes it (M6 W5): its scene documents, its behaviours' code, its action map
const fingerprint = async ({ edit = null, code = 'a'.repeat(64), actions = null, engine = undefined } = {}) => {
  const docs = (await ballGame()).scenes;
  const scenes = [...docs].map(([ref, doc]) => [ref, edit?.(ref, structuredClone(doc)) ?? doc]);
  const eng = engine === undefined ? { snapshot: 1, dmath: '0.1.0', maths: '0123456789abcdef', actions: 'b'.repeat(64), behaviours: {} } : engine;
  return compatFingerprint({ scenes, behaviours: { code, names: new Set(BEHAVIOURS.keys()), exports: null }, actions, runtime: { version: '0.1.0', engine: eng } });
};

test('a save loads into another export with the same fingerprint, and play goes on with the same per-step hashes (M6 W5)', async () => {
  const store = new MemoryStore(), compat = await fingerprint();
  const a = await ballSession({ store, compat });
  const act = person(a.device);
  await a.session.newGame();
  await play(a.session, 150, act);
  await a.session.saveSlot('slot-1');
  const saved = await store.read('slot-1');
  assert.deepEqual(saved.extra.build, { digest: 'test', game: 'ball-game', compat }, 'the save carries the build\'s fingerprint');
  const listed = (await store.list()).find((e) => e.slot === 'slot-1');
  assert.deepEqual(listed.compat, { format: compat.format, version: compat.version, digest: compat.digest, parts: compat.parts }, 'and a listing says it without reading the file');
  assert.equal(listed.game, 'ball-game');
  const from = a.session.trace.length;
  await play(a.session, 140, act);
  const unbroken = a.session.trace.slice(from);
  a.session.end();
  // a re-export that changed a texture: another digest, the same fingerprint
  const b = await ballSession({ store, digest: 'texture-changed', compat: await fingerprint() });
  await b.session.loadSlot('slot-1');
  const actB = person(b.device);
  await play(b.session, 140, actB);
  assert.equal(firstDifference(b.session.trace, unbroken), -1, 'the same per-step hashes as the run that never stopped');
  // and what it saves now names the new build
  await b.session.saveSlot('slot-2');
  assert.equal((await store.read('slot-2')).extra.build.digest, 'texture-changed');
  // its session log still names the whole build: a log from the first build won't replay on the second
  const g = await ballGame();
  const logA = a.session.last;
  await assert.rejects(replaySession(logA, { ...g, digest: 'texture-changed' }), /played on build test; this is build texture-chan/);
  b.session.end();
});

test('a save is refused by an export whose fingerprint differs, saying what changed (M6 W5)', async () => {
  const store = new MemoryStore();
  const a = await ballSession({ store, compat: await fingerprint() });
  await a.session.newGame();
  await play(a.session, 30);
  await a.session.saveSlot('slot-1');
  a.session.end();
  const refused = async (compat, re, part) => {
    const s = await ballSession({ store, digest: 'next', compat });
    const err = await s.session.loadSlot('slot-1').then(() => null, (e) => e);
    assert.ok(err, `${part}: refused`);
    assert.match(err.message, re);
    assert.equal(err.code, 'incompatible_save');
    assert.deepEqual(err.problems.map((p) => p.part), [part]);
    assert.equal(s.session.active, false, 'nothing started');
  };
  await refused(await fingerprint({ edit: (ref, doc) => { if (ref === 'level.vrmxs') doc.nodes.push({ id: 'extra', type: 'Node3D' }); return doc; } }), /another version of the game, and this one can't restore it: the scene level\.vrmxs changed\./, 'scenes');
  await refused(await fingerprint({ code: 'c'.repeat(64) }), /the code of the behaviours .* changed \(they declare no state/, 'behaviours');
  await refused(await fingerprint({ actions: { move_x: { type: 'axis' }, crouch: { type: 'button' } } }), /the game's controls changed/, 'input');
  await refused(await fingerprint({ engine: { snapshot: 2, dmath: '0.1.0', maths: '0123456789abcdef', actions: 'b'.repeat(64), behaviours: {} } }), /the engine changed/, 'engine');
  // a build from before M6 (no fingerprint) restores only its own saves
  const old = await ballSession({ store, digest: 'next' });
  await assert.rejects(old.session.loadSlot('slot-1'), /made with another version of the game \(build test\)/);
  // another game's save, whatever its fingerprint
  const other = structuredClone(await store.read('slot-1')); other.extra.build.game = 'another-game';
  const same = await ballSession({ store, compat: await fingerprint() });
  await assert.rejects(same.session.loadFile(other), /from another game \("another-game"\)/);
});

test('a log replays only on the build it was played on', async () => {
  const { session } = await ballSession();
  await session.newGame();
  await play(session, 5);
  const log = session.end();
  const g = await ballGame();
  await assert.rejects(replaySession(log, { ...g, digest: 'another-build' }), /played on build test; this is build another-buil/);
  await assert.rejects(replaySession(log, g), /needs the digest of the build/);
  assert.equal((await replaySession(log, { ...g, digest: 'test' })).length, 5);
});

test('a session played back in the app (replay, M5 W10): each segment from its start, the recorded input, the same per-step hashes', async () => {
  const { session, device } = await ballSession();
  const act = person(device);
  await session.newGame();
  await play(session, 150, act);
  await session.saveSlot('slot-1');
  await play(session, 60, act);
  await session.loadSlot('slot-1');
  await play(session, 120, act);
  const log = JSON.parse(JSON.stringify(session.log()));
  session.end();
  device.release('KeyD');

  // the app's loop: advance until a segment's frames run out, then the next segment, until done; no one at the keys
  const { session: back, device: idle, store } = await ballSession({ hashes: true });
  idle.press('KeyA'); // the devices are ignored while a log plays: a held key changes nothing
  await back.replay(log);
  assert.equal(back.replaying.segment, 0);
  for (let guard = 0; guard < 10000 && !back.replaying.done; guard++) {
    if (back.advance()) continue;
    if (back.replaying.left <= 0) await back.replayNext();
    else await back.flow.settle();
  }
  assert.ok(back.replaying.done, 'every segment played');
  assert.equal(back.dirty, false, 'a replay is nobody\'s progress: nothing to save on closing');
  assert.deepEqual(await store.list(), [], 'and it writes nothing into the player\'s store (the ball game\'s checkpoint included)');
  assert.equal(back.trace.length, log.hashes.length);
  assert.equal(firstDifference(back.trace, log.hashes), -1, 'every step the same as when it was played');
  assert.equal(back.advance(), false, 'nothing steps once the log is played');
  back.end();
  assert.equal(back.replaying, null);
});

test('a replay refuses a log from another build, and one that isn\'t a log', async () => {
  const { session } = await ballSession();
  await assert.rejects(session.replay({ format: 'something' }), /not a session log/);
  const built = new GameSession({ ...(await ballGame()), game: GAME, digest: 'build-a' });
  await assert.rejects(built.replay({ format: SESSION_FORMAT, version: 1, game: { digest: 'build-b' }, segments: [] }), /replays only on the build it was played on/);
});

test('a save loaded over a replay (the pause menu during ?replay) is the player\'s game again: their store, their seed, a log of its own', async () => {
  const store = new MemoryStore();
  const { session, device } = await ballSession({ store });
  const act = person(device);
  await session.newGame();
  await play(session, 120, act);
  await session.saveSlot('slot-1');
  await play(session, 40, act);
  const log = JSON.parse(JSON.stringify(session.log()));
  const played = session.end();
  device.release('KeyD');

  const g = await ballGame();
  const back = new GameSession({ ...g, game: GAME, digest: 'test', store, seed: 9, hashes: true, stamp: () => '2026-11-25T12:00:00.000Z' });
  await back.replay(log);
  assert.equal(back.seed, 1, 'the log\'s seed while it plays');
  for (let i = 0; i < 30; i++) { while (!back.advance()) await back.flow.settle(); }
  await back.loadSlot('slot-1');
  assert.equal(back.replaying, null, 'the load ended the replay');
  assert.equal(back.seed, 9, 'the session\'s own seed is back');
  assert.equal(back.dirty, false, 'just loaded: nothing to lose');
  for (let i = 0; i < 20; i++) { while (!back.advance()) await back.flow.settle(); }
  const entry = await back.saveSlot('slot-2');
  assert.ok(entry.kept && (await store.list()).some((e) => e.slot === 'slot-2'), 'Save Game writes into the player\'s store');
  const mine = back.log();
  assert.equal(mine.segments.length, 1, 'the replay\'s segments aren\'t in the player\'s log');
  assert.equal(mine.segments[0].from.slot, 'slot-1');
  assert.ok(mine.segments[0].recording, 'and its input is recorded');
  back.end();

  // a replay ended by Quit to Title leaves the last session's log alone, and the seed
  const again = new GameSession({ ...g, game: GAME, digest: 'test', seed: 9, hashes: true });
  again.last = played;
  await again.replay(log);
  for (let i = 0; i < 10; i++) { while (!again.advance()) await again.flow.settle(); }
  assert.equal(again.end(), null, 'a replay ended gives no log');
  assert.equal(again.last, played, 'the last session played stays the last log');
  assert.equal(again.seed, 9);
});
