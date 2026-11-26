// A game's worlds, built the same way wherever the game is played: in the game app (a browser tab, the Mac app) and in
// Node, where a session recorded in the app is replayed (session.js). No DOM, no bundler aliases: what differs by
// runtime comes in as arguments (how a file is read, Rapier, vrmxa-core, the project's behaviours).
//
// A world is the apps' shared one (apps/playground/src/world.js: every engine service, in the one order), built for a
// GameFlow: at the session's step, with the seed the flow asks for, and with the game service installed.
import { loadSample, buildWorld } from '../../playground/src/world.js';

/**
 * A game's scenes, each read once, and what GameFlow's whole-game check needs of them.
 * @param {(ref: string) => Promise<Uint8Array>} bytes a project file by ref (a build's `bytes`, or a folder's reader)
 * @param {{ entry: string, scenes?: string[], animations?: string | null, personas?: string | null }} game the game document
 */
export function gameScenes(bytes, game) {
  /** @type {Map<string, Promise<any>>} */ const read = new Map();
  const files = { animations: game.animations ?? null, personas: game.personas ?? null };
  /** A scene as buildWorld takes it (its document, prefabs, the project's animations and personas). */
  const sample = (scene) => {
    if (!read.has(scene)) {
      const p = loadSample(bytes, scene, files);
      read.set(scene, p);
      p.catch(() => { if (read.get(scene) === p) read.delete(scene); }); // a scene that couldn't be read is read again when asked for
    }
    return /** @type {Promise<any>} */ (read.get(scene));
  };
  return {
    sample,
    /** Every scene the game can reach and every prefab they use, parsed: `new GameFlow({ scenes, prefabs })`. */
    async documents() {
      const scenes = new Map(), prefabs = new Map();
      for (const ref of new Set([game.entry, ...(game.scenes ?? [])])) {
        const s = await sample(ref);
        scenes.set(ref, s.doc);
        for (const [k, v] of s.prefabs) prefabs.set(k, v);
      }
      return { scenes, prefabs };
    },
  };
}

/**
 * GameFlow's `load`: a world of the scene asked for, at the session's step and with the seed asked for.
 * @param {object} o
 * @param {any} o.R Rapier @param {ReturnType<typeof gameScenes>} o.scenes
 * @param {Map<string, any>} o.behaviours @param {Record<string, any> | null} [o.actions] the game's action map
 * @param {{ layers: string[], collides?: Record<string, string[]> } | null} [o.physics] the game's collision layers (game.json "physics", M6 W3)
 * @param {any} [o.vrmxaCore] @param {any} [o.closet] vrmxa-core and its closet module (a game with no characters needs neither)
 * @param {(req: any) => Record<string, any>} [o.options] what this runtime adds to every world (the render host's MToon
 *   class, the audio output, a character cache; `stubTextures` where nothing draws)
 * @param {(world: any, req: any) => void} [o.onBuilt] each world as it is built (a host keeps it, to dispose it later)
 * @returns {(req: { scene: string, seed: number, step: number, reason: string }) => Promise<any>} → the world's tree
 */
export function worldLoader({ R, scenes, behaviours, actions = null, physics = null, vrmxaCore = null, closet = null, options = () => ({}), onBuilt = null }) {
  return async (req) => {
    const sample = await scenes.sample(req.scene);
    const world = await buildWorld(R, sample, { vrmxaCore, closet, behaviours, actions, physics, ...options(req), seed: req.seed, step: req.step, game: true });
    onBuilt?.(world, req);
    return world.tree;
  };
}

/** Free a world nothing draws (Node): Rapier's memory. A host that draws disposes the whole world (host.js). */
export function freeWorld(tree) { tree?.services?.get('physics')?.world?.free?.(); }
