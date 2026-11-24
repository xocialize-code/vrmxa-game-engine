// A session played as the app plays one (New Game, a person's input, Save, Load, Quit to Title) replays from its log
// to the same per-step hashes; saves and checkpoints count as kept only once the store has them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '@vrmxg/save';
import { ballSession, ballGame, play, FailingStore } from './helpers.mjs';
import { GameSession, replaySession, firstDifference, SESSION_FORMAT } from '../src/session.js';

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
  const replay = await replaySession(JSON.parse(JSON.stringify(log)), g);
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
  const replay = await replaySession(log, await ballGame());
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
  await assert.rejects(replaySession({ format: 'x' }, g), /not a session log/);
  const { session } = await ballSession();
  await session.newGame();
  await play(session, 4);
  const log = session.log();
  session.end();
  log.segments[0].at = 3;
  await assert.rejects(replaySession(log, g), /starts at step 3/);
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
  await assert.rejects(session.newGame(), /starting or loading already/);
  await first;
  assert.equal(session.step, 0);
  session.end();
});
