// The game app's test game (the sample cafe with a title, a level and an ending) played as the app plays it: through the
// title, into the level, Mira walks in (the door's checkpoint, the counter's goal: won), the ending, and back to the
// title as a new game; then its log replays to the same per-step hashes. Needs vrmxa-core beside the repository (the
// level has characters): skipped where it isn't, as on CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { MemoryStore } from '@vrmxg/save';
import { behavioursImporter } from '@vrmxg/bundle/node';
import { PATHS, vrmxaCore } from '../../../engine/packages/character/test/fixtures.mjs';
import { testGameProject } from '../scripts/test-game.mjs';
import { gameScenes, worldLoader, freeWorld } from '../src/world.js';
import { GameSession, replaySession, firstDifference } from '../src/session.js';

const skip = !fs.existsSync(PATHS.core) && 'needs vrmxa-core beside the repository';

test('the test game: title, Hana answered, level won at the counter, ending, title again; the log replays', { skip, timeout: 600000 }, async () => {
  installPortableMath();
  const p = testGameProject();
  const core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  // the project's behaviours as the build's import map gives them: game/behaviours.js and the sample's it re-exports
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-test-game-'));
  try {
    fs.mkdirSync(path.join(dir, 'project/game'), { recursive: true });
    for (const ref of ['behaviours.js', 'game/behaviours.js']) fs.writeFileSync(path.join(dir, 'project', ref), await p.read(ref));
    const importer = behavioursImporter(dir);
    const behaviours = new Map(Object.entries(await importer('./project/game/behaviours.js')).filter(([, v]) => typeof v === 'function'));
    const scenes = gameScenes(p.read, p.game);
    const docs = await scenes.documents();
    const load = worldLoader({ R: await loadRapier(), scenes, behaviours, actions: p.game.input.actions, vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
    const events = [];
    const session = new GameSession({ game: p.game, digest: 'test-game', load, unload: freeWorld, store: new MemoryStore(), scenes: docs.scenes, prefabs: docs.prefabs, hashes: true, onEvent: (e) => events.push(e) });
    await session.newGame();
    // the person: Space at step 20 skips the title; then the recorded walk into the cafe; then nothing
    const walk = JSON.parse(new TextDecoder().decode(await p.read('input/walk-in.json')));
    const frames = [];
    for (let i = 0; i < 40; i++) frames.push([[0, 0, 0, 0, 0], i === 20 ? 1 : 0]);
    frames.push(...walk.frames);
    while (frames.length < 1500) frames.push([[0, 0, 0, 0, 0], 0]);
    // Hana's question comes two seconds into the level (from step 21); the answer is a choice in the recording, as the
    // overlay's input.choose leaves it (a frame's third entry, recording version 2)
    frames[300] = [frames[300][0], frames[300][1], { 'dialogue.choose': 'ready' }];
    session.tree.services.get('input').replay({ ...walk, version: 2, start: 0, frames });
    for (let i = 0; i < 1500; i++) { while (!session.advance()) await session.flow.settle(); session.flow.flush(); }
    await session.flow.settle(); session.flow.flush();
    const changes = events.filter((e) => e.type === 'scene').map((e) => `${e.from}→${e.to}@${e.step}`);
    assert.deepEqual(changes.map((c) => c.replace(/@\d+$/, '')), ['game/title.vrmxs→game/level.vrmxs', 'game/level.vrmxs→game/ending.vrmxs', 'game/ending.vrmxs→game/title.vrmxs', 'game/title.vrmxs→game/level.vrmxs'], changes.join(', '));
    assert.equal(events.find((e) => e.type === 'outcome')?.result, 'won', 'got to the counter in time');
    assert.ok(events.some((e) => e.type === 'checkpointWritten' && e.slot === 'door' && e.stored), 'the door\'s checkpoint, in the store');
    assert.equal(events.filter((e) => e.type === 'goal' && e.done).length, 1);
    assert.ok(events.some((e) => e.type === 'flag' && e.flag === 'ready' && e.value === true), 'the choice took its branch: the flag it sets');
    assert.equal(session.log().segments[0].recording.frames.filter((f) => f[2]).length, 1, 'the choice is in the log');
    const log = session.end();
    const replay = await replaySession(log, { digest: 'test-game', load, unload: freeWorld, scenes: docs.scenes, prefabs: docs.prefabs });
    assert.equal(firstDifference(replay, log.hashes), -1);
    assert.equal(replay.length, 1500);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
