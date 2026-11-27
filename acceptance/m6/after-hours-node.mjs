// M6 W10 (AB-T-0651): the second game, "After Hours", played in Node by the scripted player (after-hours-player.js), no
// renderer: a quick check that the game can be won and lost, before the game app plays it (after-hours.mjs).
//
//   node acceptance/m6/after-hours-node.mjs [win|lose|time|all] [--build <dir>] [--trail]
//
// win: a hint from Hana, the scarf and the phone, the switch, the book from the back room, each on its shelf; lose: the
// scarf on two wrong shelves; time: the player stands still after the briefing until Hana locks up. Each prints its
// outcome, the steps it took and where the session went. With --build the build in <dir> is played (a folder the
// editor's Export Game wrote, say); else the game is exported from content/sample into a temporary folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { VirtualDevice } from '@vrmxg/input';
import { GameFlow } from '@vrmxg/game';
import { openFolder, behavioursImporter, exportToFolder } from '@vrmxg/bundle/node';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { gameScenes, worldLoader, freeWorld } from '../../apps/game/src/world.js';
import { createAfterHoursPlayer } from './after-hours-player.js';
import { assertFreshRuntime, GAME_RUNTIME } from '../../apps/game/scripts/test-game.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
export const AFTER_HOURS_PLANS = {
  win: { briefing: 'how', hint: 'book', shelves: ['phones', 'books', 'coats'] },
  lose: { briefing: 'ready', hint: null, wrong: ['books', 'phones'] },
  time: { briefing: 'ready', hint: null, stand: true },
};
export const LEVEL = 'after-hours/level.vrmxs';

/** Export "After Hours" into `out` with the game app's runtime (refused when apps/game/dist is older than the checkout). */
export async function exportAfterHours(out) {
  assertFreshRuntime(GAME_RUNTIME);
  return exportToFolder({ project: path.join(root, 'content/sample'), runtime: GAME_RUNTIME, out, gameFile: 'after-hours/game.json' });
}

/**
 * Play one plan in Node from New Game until the game is decided and its ending reached (or `maxSteps`).
 * @param {string} dir a build folder @param {any} plan @param {{ maxSteps?: number, onStep?: (flow: any, d: any) => void }} [o]
 */
export async function playAfterHours(dir, plan, { maxSteps = 60 * 300, onStep = null } = {}) {
  installPortableMath();
  const build = await openFolder(dir);
  const core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const scenes = gameScenes(build.bytes, build.game), docs = await scenes.documents();
  const load = worldLoader({ R: await loadRapier(), scenes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions(), vrmxaCore: core, closet, physics: build.game.physics, options: () => ({ stubTextures: true }) });
  const pad = new VirtualDevice();
  const flow = new GameFlow({ load, unload: freeWorld, seed: 1, scenes: docs.scenes, prefabs: docs.prefabs, onWorld: (tree) => tree.services.get('input').addDevice(pad) });
  await flow.start(build.game.entry);
  flow.tree.services.get('input').addDevice(pad);
  const player = createAfterHoursPlayer(plan), trail = [];
  let last = '', decided = null, endingAt = null;
  for (let i = 0; i < maxSteps; i++) {
    const tree = flow.tree, d = plan.stand && tree.services.get('dialogue')?.view() == null ? { stick: [0, 0], interact: false, choose: null, task: 'stand' } : player.decide(tree);
    const buttons = new Array(17).fill(0);
    if (d.interact) buttons[2] = 1;
    pad.setGamepad([d.stick[0], -d.stick[1], 0, 0], buttons);
    if (d.choose) tree.services.get('input').choose('dialogue.choose', d.choose);
    if (d.task !== last) { trail.push(`${tree.clock.step} ${d.task}`); last = d.task; }
    onStep?.(flow, d);
    while (!flow.step()) await flow.settle();
    const v = flow.view();
    if (!decided && v.outcome) decided = { result: v.outcome, step: v.step, counters: v.counters };
    if (decided && !endingAt && v.scene !== LEVEL) endingAt = { scene: v.scene, step: v.step };
    if (endingAt && v.step > endingAt.step + 60 * 4) break;
  }
  const view = flow.view();
  flow.dispose();
  return { decided, ending: endingAt, final: { scene: view.scene, step: view.step }, trail };
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2), at = args.indexOf('--build');
  let dir = at >= 0 ? path.resolve(args[at + 1]) : null;
  if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository'); process.exit(1); }
  if (!dir) { dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-after-hours-')), 'build'); await exportAfterHours(dir); }
  const which = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--build') ?? 'all';
  let ok = true;
  for (const name of which === 'all' ? Object.keys(AFTER_HOURS_PLANS) : [which]) {
    const t0 = performance.now(), r = await playAfterHours(dir, AFTER_HOURS_PLANS[name]);
    const want = name === 'win' ? 'won' : 'lost';
    ok &&= r.decided?.result === want && !!r.ending;
    console.log(`${r.decided?.result === want ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(r.decided)} → ${JSON.stringify(r.ending)} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
    if (args.includes('--trail') || r.decided?.result !== want) console.log(`  ${r.trail.join('\n  ')}`);
  }
  process.exit(ok ? 0 : 1);
}
