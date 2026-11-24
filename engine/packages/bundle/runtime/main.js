// The smallest runtime a build can sit around (M5 W0): it opens the build beside it, builds the entry scene's world
// and steps it at 60 Hz. No renderer, no menus: those are the game app's (apps/game, M5 W1), which takes this
// runtime's place in a build by keeping the same contract (../README.md).
//
//   index.html                              plays the entry scene, showing the step and the world's hash
//   index.html?check=input/walk-in.json     replays a recorded take from the build for `steps` steps (600) with a hash
//                                           of every component after every step, for a harness: window.__result, READY
import { installPortableMath } from '@vrmxg/dmath';
import * as engineCore from '@vrmxg/core';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import * as core from '@vrmxa-core/index.js';
import * as anim from '@vrmxa-core/anim/index.js';
import * as closet from '@vrmxa-core/closet/index.js';
import '../../../../apps/playground/src/sqljs.js'; // vrmxa-core's sql.js for bundles with a database (Mira's), as the apps load it
import { openBuild, fetchReader, moduleImports } from '../src/index.js';
import { readLexerCases } from './lexer-cases.js';
import { playScene } from './play.js';

window.__errors = [];
addEventListener('error', (e) => window.__errors.push(`${e.message} @${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => window.__errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));
const say = (text) => { document.getElementById('status').textContent = text; };

async function main() {
  installPortableMath(); // before anything parses a VRM or steps a world
  const q = new URLSearchParams(location.search);
  const build = await openBuild(fetchReader('./'));
  const { game, manifest } = build;
  document.title = game.title;
  say(`${game.title}: loading ${game.entry}…`);
  globalThis.VRMXG_CORE = engineCore; // what the import map's @vrmxg/core hands the project's behaviours
  const behaviours = await build.behaviours((path) => import(/* @vite-ignore */ new URL(path, location.href).href));
  const o = { R: await loadRapier(), bytes: build.bytes, scene: q.get('scene') ?? game.entry, behaviours, actions: await build.actions(), vrmxaCore: { ...core, ...anim }, closet };
  const about = { game: game.id, entry: o.scene, runtime: `${manifest.runtime.name} ${manifest.runtime.version}`, digest: manifest.digest, files: manifest.files.length };
  if (q.has('check')) {
    const r = await playScene({ ...o, take: q.get('check') || null, steps: +(q.get('steps') ?? 600) });
    // and how this engine's lexer reads a set of awkward modules, and the game's own module graph: the exporter may have
    // run in another engine, and the two have to agree on what a module imports
    window.__result = { ...about, take: q.get('check') || null, steps: r.steps, components: r.components, final: r.final, hashes: r.hashes, verified: build.checked.size,
      lexer: readLexerCases(moduleImports), modules: game.behaviours ? await build.modules(game.behaviours) : [], ua: navigator.userAgent };
    say(`${game.title}: ${r.steps} steps of ${o.scene}, final ${r.final}`);
    return;
  }
  const { world } = await playScene({ ...o, steps: 0 });
  window.__world = world;
  let last = performance.now(), owed = 0;
  const tick = (now) => {
    owed = Math.min(owed + (now - last) * 0.06, 6); last = now; // 60 steps a second, at most six to catch up
    for (; owed >= 1; owed--) if (!world.tree.step()) break;
    if (world.tree.clock.step % 30 === 0) say(`${game.title} · ${o.scene} · step ${world.tree.clock.step} · ${hashValue(worldHashes(world.tree))}`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

main().catch((e) => { window.__errors.push(String(e?.stack ?? e)); say(`This build can't be played: ${e?.message ?? e}`); }).finally(() => { window.READY = true; });
