// What the game app's tests share: a small game with no characters (@vrmxg/game's test game: a title, a level and an
// ending with physics, recorded input and random streams), built through the app's own world builder, so the tests
// run anywhere (CI has no vrmxa-core).
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { VirtualDevice } from '@vrmxg/input';
import { MemoryStore } from '@vrmxg/save';
import { BEHAVIOURS } from '../../../engine/packages/game/test/fixtures/world.js';
import { gameScenes, worldLoader, freeWorld } from '../src/world.js';
import { GameSession } from '../src/session.js';

installPortableMath();

const FIXTURES = path.resolve(import.meta.dirname, '../../../engine/packages/game/test/fixtures');
export const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(FIXTURES, ref)));
export const GAME = { id: 'ball-game', title: 'The ball game', entry: 'title.vrmxs', scenes: ['title.vrmxs', 'level.vrmxs', 'ending.vrmxs'], animations: null, personas: null };
let rapier = null;
export const R = async () => (rapier ??= await loadRapier());

/**
 * The ball game's world builder and documents. `device`: a stand-in for the person's keyboard and gamepad, added to
 * every world as the app adds its devices.
 */
export async function ballGame({ device = null } = {}) {
  const scenes = gameScenes(bytes, GAME);
  const { scenes: docs, prefabs } = await scenes.documents();
  const load = worldLoader({ R: await R(), scenes, behaviours: BEHAVIOURS, onBuilt: (world) => { if (device) world.input.addDevice(device); } });
  return { load, unload: freeWorld, scenes: docs, prefabs };
}

/** A session on the ball game, as the app makes one (store, stamp, hashes kept). */
export async function ballSession({ device = new VirtualDevice(), store = new MemoryStore(), hashes = true, stamp = () => '2026-11-24T12:00:00.000Z' } = {}) {
  const g = await ballGame({ device });
  const session = new GameSession({ game: GAME, digest: 'test', load: g.load, unload: g.unload, store, stamp, scenes: g.scenes, prefabs: g.prefabs, hashes });
  return { session, device, store, game: g };
}

/** Play `n` steps, waiting out loading (as the frame loop does across frames). `each(step)` runs before each step. */
export async function play(session, n, each = null) {
  for (let i = 0; i < n; i++) {
    each?.(session.step);
    while (!session.advance()) await session.flow.settle();
  }
}

/** A store whose writes fail (a full disk, a folder gone). */
export class FailingStore extends MemoryStore {
  async write() { throw new Error('the disk is full'); }
}
