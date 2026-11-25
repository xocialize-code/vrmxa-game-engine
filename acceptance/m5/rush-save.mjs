// M5 W10 (AB-T-0620): a save for the Mac game app's hand test, taken from the recorded win session (rush.mjs) on the
// build it was played on: the session replayed in Node until Mira stands at the open till with its prompt showing (every
// regular served), then saved into a player's slot, as the app's Save Game does (GameSession.saveSlot, the build's
// digest in the file). It is written as the shell's saves.write writes a slot (`<slot>.vrmxgsave` and
// `<slot>.summary.json`), into the folder the hand test points VRMXG_SHELL_SAVES at. Loading it and pressing E wins.
//
//   node acceptance/m5/rush-save.mjs <build> <saves folder> [--log acceptance/results/m5-rush/win.json] [--slot slot-1]
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { ShellStore } from '@vrmxg/save';
import { openFolder, behavioursImporter } from '@vrmxg/bundle/node';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { gameScenes, worldLoader, freeWorld } from '../../apps/game/src/world.js';
import { GameSession } from '../../apps/game/src/session.js';
import { saveName } from '../../apps/game/src/slots.js';

const here = import.meta.dirname;
const args = process.argv.slice(2), opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const [buildDir, out] = args.filter((a, i) => !a.startsWith('--') && !['--log', '--slot'].includes(args[i - 1]));
if (!buildDir || !out) { console.error('usage: node acceptance/m5/rush-save.mjs <build> <saves folder> [--log <win.json>] [--slot slot-1]'); process.exit(2); }
const log = JSON.parse(fs.readFileSync(opt('--log', path.join(here, '../results/m5-rush/win.json')), 'utf8'));
const slot = opt('--slot', 'slot-1');

installPortableMath();
const build = await openFolder(buildDir);
const core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const scenes = gameScenes(build.bytes, build.game), docs = await scenes.documents();
const load = worldLoader({ R: await loadRapier(), scenes, behaviours: await build.behaviours(behavioursImporter(buildDir)), actions: await build.actions(), vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
fs.mkdirSync(out, { recursive: true });
// the shell's saves.write, in Node (apps/shell SaveMethods.swift): the file's text, and the summary with sorted keys
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
const store = new ShellStore(async (method, p) => {
  if (method !== 'saves.write') throw new Error(`not here: ${method}`);
  fs.writeFileSync(path.join(out, `${p.slot}.vrmxgsave`), p.text);
  fs.writeFileSync(path.join(out, `${p.slot}.summary.json`), JSON.stringify(sorted(p.summary)));
  return { slot: p.slot, bytes: Buffer.byteLength(p.text) };
});
const session = new GameSession({ game: build.game, digest: build.manifest.digest, load, unload: freeWorld, store, stamp: () => '2026-11-25T09:00:00.000Z', scenes: docs.scenes, prefabs: docs.prefabs });
await session.replay(log);
const TILL = [-1.65, -3.25];
let at = null;
for (;;) {
  const tree = session.tree, mira = tree.find('mira')?.object3d.position, till = tree.find('till');
  const prompt = tree.services.get('interact')?.prompts().find((f) => f.actor === 'mira');
  if (mira && till?.current === 'open' && prompt?.item === 'till' && Math.hypot(mira.x - TILL[0], mira.z - TILL[1]) < 0.3) { at = tree.clock.step; break; }
  if (!session.advance()) { if (session.replaying.left <= 0) break; await session.flow.settle(); }
}
if (at === null) { console.error('the session never stood at the open till'); process.exit(1); }
const entry = await session.saveSlot(slot, { name: saveName({ title: build.game.title, view: session.view() }) });
console.log(JSON.stringify({ slot, step: at, scene: session.scene, build: build.manifest.digest.slice(0, 16), name: entry.name, out }));
session.end();
