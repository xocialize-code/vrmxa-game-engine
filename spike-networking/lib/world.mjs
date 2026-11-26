// The world every peer steps: the sample cafe for two players (M3 W9's split-screen scene: Mira is player 1 on the
// unprefixed actions, Hana player 2 on `p2.*`), built by the playground's buildWorld exactly as
// engine/packages/input/test/split.test.mjs builds it. Needs vrmxa-avatar-studio beside the repository (the characters).
//
// Input reaches the simulation through the input service's replay: each peer keeps one recording object whose frames it
// writes before stepping (a confirmed frame, or a prediction it may later overwrite). The service reads
// `rec.frames[step - rec.start]` live, so writing the array is how a peer feeds it.
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { loadSample, buildWorld } from '../../apps/playground/src/world.js';
import { withTwoPlayers } from '../../apps/playground/src/split.js';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../../content/sample/behaviours.js';

installPortableMath();
const root = path.resolve(import.meta.dirname, '../..');
const content = path.join(root, 'content/sample');
export const HAS_MODELS = fs.existsSync(PATHS.core);

let cached = null;
async function shared() {
  if (cached) return cached;
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = withTwoPlayers(sample.doc);
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  cached = { sample, closet, behaviours, R: await loadRapier(), core: await vrmxaCore() };
  return cached;
}

/** A fresh two-player cafe world, its input fed from `rec` (see newRecording). */
export async function twoPlayerWorld() {
  const s = await shared();
  const W = await buildWorld(s.R, { ...s.sample, doc: structuredClone(s.sample.doc) }, { vrmxaCore: s.core, closet: s.closet, behaviours: s.behaviours, stubTextures: true, players: 2 });
  const rec = { version: 1, start: W.tree.clock.step, axes: [...W.input.map.axes], buttons: [...W.input.map.buttons], frames: [] };
  W.input.replay(rec);
  return { ...W, rec };
}

/** Free a world's Rapier memory. */
export function freeWorld(W) { W.tree.services.get('physics')?.world?.free?.(); }

/** One hash for the whole world after a step (the per-component hashes, hashed). */
export function stepHash(tree) { return hashValue(worldHashes(tree)); }

/** The reference: one world stepping both players' true inputs alone; the hash after every step. */
export async function referenceHashes(in0, in1, steps) {
  const { frameOf } = await import('./inputs.mjs');
  const W = await twoPlayerWorld(), h = [];
  for (let s = 0; s < steps; s++) { W.rec.frames[s] = frameOf(W.rec, [in0[s], in1[s]]); W.tree.step(); h.push(stepHash(W.tree)); }
  freeWorld(W);
  return h;
}
