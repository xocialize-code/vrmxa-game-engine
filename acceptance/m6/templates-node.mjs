// M6 W3 (AB-T-0646): each New Project template made into a project and played in Node, no renderer: the empty game
// starts and runs, the level is won by walking to the counter and reaches its ending. The same check the Mac editor's
// scenario makes through the game app (apps/editor-mac/docs/HAND-TEST-M6-NEW-PROJECT.md), here in seconds.
//
//   node acceptance/m6/templates-node.mjs [<project folder> …]    (none: each template, made in a temporary folder)
//   node acceptance/m6/templates-node.mjs --build <build folder>  a build Export Game or vrmxg-export wrote
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { VirtualDevice } from '@vrmxg/input';
import { GameFlow } from '@vrmxg/game';
import { folderReader, openFolder, behavioursImporter } from '@vrmxg/bundle/node';
import { checkGame as checkGameDoc } from '@vrmxg/bundle';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { gameScenes, worldLoader, freeWorld } from '../../apps/game/src/world.js';
import { makeProject } from '../../content/templates/tools/new-project.mjs';

/**
 * Walk forward (the stick up) from New Game until the game is decided and its ending has run 2 s, or `maxSteps`.
 * @param {{ game: any, bytes: (ref: string) => Promise<Uint8Array>, behaviours: Map<string, any>, actions: any }} g
 */
export async function playTemplate(g, { maxSteps = 60 * 40 } = {}) {
  installPortableMath();
  const core = fs.existsSync(PATHS.core) ? await vrmxaCore() : null;
  const scenes = gameScenes(g.bytes, g.game), docs = await scenes.documents();
  const load = worldLoader({ R: await loadRapier(), scenes, behaviours: g.behaviours, actions: g.actions, physics: g.game.physics ?? null, vrmxaCore: core, options: () => ({ stubTextures: true }) });
  const pad = new VirtualDevice();
  const flow = new GameFlow({ load, unload: freeWorld, seed: 1, scenes: docs.scenes, prefabs: docs.prefabs, onWorld: (tree) => tree.services.get('input').addDevice(pad) });
  await flow.start(g.game.entry);
  flow.tree.services.get('input').addDevice(pad);
  let decided = null, ending = null, steps = 0;
  for (; steps < maxSteps; steps++) {
    pad.setGamepad([0, -1, 0, 0], new Array(17).fill(0)); // forward
    while (!flow.step()) await flow.settle();
    const v = flow.view();
    if (!decided && v.outcome) decided = { result: v.outcome, step: v.step, score: v.score };
    if (decided && !ending && v.scene !== g.game.entry) ending = { scene: v.scene, step: v.step };
    if (ending && v.step > ending.step + 120) break;
  }
  const v = flow.view();
  flow.dispose();
  return { decided, ending, final: { scene: v.scene, step: v.step, goal: v.goal?.text ?? null } };
}

/** A project folder as playTemplate takes it. */
export async function projectGame(dir) {
  const r = folderReader(dir);
  const game = checkGameDoc(JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8')));
  return { game, bytes: r.read, behaviours: new Map(), actions: game.input?.actions ?? null };
}

if (process.argv[1] === import.meta.filename) {
  if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-avatar-studio beside the repository (the level has characters)'); process.exit(1); }
  const args = process.argv.slice(2), at = args.indexOf('--build');
  const runs = [];
  if (at >= 0) {
    const dir = path.resolve(args[at + 1]), build = await openFolder(dir);
    runs.push([dir, { game: build.game, bytes: build.bytes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions() }]);
  } else if (args.length) for (const d of args) runs.push([d, await projectGame(path.resolve(d))]);
  else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-templates-'));
    for (const id of ['empty', 'level']) { const dir = path.join(tmp, id); makeProject(id, dir, { title: `Template ${id}` }); runs.push([dir, await projectGame(dir)]); }
  }
  let ok = true;
  for (const [dir, g] of runs) {
    const t0 = performance.now(), r = await playTemplate(g, { maxSteps: g.game.scenes.length > 1 ? 60 * 40 : 60 * 5 });
    const pass = g.game.scenes.length > 1 ? r.decided?.result === 'won' && !!r.ending : !r.decided && r.final.step >= 60 * 5 - 1;
    ok &&= pass;
    console.log(JSON.stringify({ project: path.basename(dir), game: g.game.id, pass, ...r, ms: Math.round(performance.now() - t0) }));
  }
  process.exit(ok ? 0 : 1);
}
