// A scene's world built and played with a hash of every component after every step: the measure a build is checked
// by. The same function plays the project straight from its folder (Node), a build through the loader (Node), and a
// build in a browser (this runtime's page), so the three runs can differ only in where the files came from.
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';

/**
 * @param {object} o
 * @param {any} o.R Rapier
 * @param {(ref: string) => Promise<Uint8Array>} o.bytes a project file by ref (a folder's reader, or a build's `bytes`)
 * @param {string} o.scene the scene to play
 * @param {Map<string, any>} o.behaviours @param {Record<string, any> | null} [o.actions] the game's action map
 * @param {any} o.vrmxaCore @param {any} o.closet
 * @param {string | null} [o.take] recorded input to replay, by ref @param {number} [o.steps]
 * @returns {Promise<{ scene: string, steps: number, components: number, final: string, hashes: string[], world: any }>}
 *   hashes[k]: the world after step k (0: before any), Rapier's whole state included every 60th step
 */
export async function playScene({ R, bytes, scene, behaviours, actions = null, vrmxaCore, closet, take = null, steps = 600 }) {
  const sample = await loadSample(bytes, scene);
  const world = await buildWorld(R, sample, { vrmxaCore, closet, behaviours, actions, stubTextures: true });
  if (take) world.input.replay(JSON.parse(new TextDecoder().decode(await bytes(take))));
  const first = worldHashes(world.tree, { physicsBytes: true });
  const hashes = [hashValue(first)];
  for (let k = 1; k <= steps; k++) {
    while (!world.tree.step()) await world.tree.settle();
    hashes.push(hashValue(worldHashes(world.tree, { physicsBytes: k % 60 === 0 })));
  }
  return { scene, steps, components: Object.keys(first).length, final: hashes.at(-1), hashes, world };
}
