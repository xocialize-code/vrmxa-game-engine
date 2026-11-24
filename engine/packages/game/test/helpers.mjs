// What the tests share: the fixture scenes read from disk, Rapier, and a small world without physics for the rules.
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import { hashValue } from '@vrmxg/snapshot';
import { installGame } from '../src/index.js';
import { SCENES } from './fixtures/world.js';

installPortableMath();

export const FIXTURES = path.join(import.meta.dirname, 'fixtures');
export const sceneText = (ref) => fs.readFileSync(path.join(FIXTURES, ref), 'utf8');
export const scenes = () => new Map(SCENES.map((s) => [s, parse(sceneText(s))]));
let rapier = null;
export const R = async () => (rapier ??= await loadRapier());

/** A world of game nodes only (no physics): the rules on their own. */
export function rulesWorld(nodes, connections = [], { seed = 3 } = {}) {
  const tree = new SceneTree({ registry: m0Registry(), seed });
  const game = installGame(tree, { scene: 'test.vrmxs' });
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'test', nodes: [{ id: 'root', type: 'Node3D' }, ...nodes.map((n) => ({ parent: 'root', ...n }))], connections });
  return { tree, game };
}

/** One word for a recorded step's hashes. */
export const word = (r) => hashValue(r.h);
export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
