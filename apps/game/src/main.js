// The game app's page (M5 W1, AB-D-0286): the runtime every game build is made with. It opens the build beside it
// (./vrmxg-build.json, the project's files under ./project/: @vrmxg/bundle's runtime contract 1) and plays it.
//
//   index.html                                  the game: title menu, play, pause, save slots, settings
//   index.html?renderer=webgl|webgpu|auto       the backend, over the settings' choice (the switch every app obeys)
//   index.html?trace                            and a hash of the world after every step, in the session's log
//                                               (window.__game.log()): a runner replays it in Node
//   index.html?replay=<log>[,<log>…][&loop=<s>]  (M5 W10) play recorded sessions back, drawn, no menus: their per-step
//                                               hashes and the frame times in window.__result (READY); loop: again
//                                               until that many seconds have passed (no per-step hashes then)
//   index.html?stats                            a frame-time readout (#frame-stats), once a second
//   index.html?check=<take>&steps=<n>           no renderer and no menus: replays recorded input from the build in the
//                                               entry scene with a hash after every step (window.__result, READY), as
//                                               the minimal runtime did; how acceptance/m5/build.mjs plays a build
import { installPortableMath } from '@vrmxg/dmath';
import * as engineCore from '@vrmxg/core';
import { openBuild, fetchReader, moduleImports } from '@vrmxg/bundle';
import * as core from '@vrmxa-core/index.js';
import * as anim from '@vrmxa-core/anim/index.js';
import * as closet from '@vrmxa-core/closet/index.js';
import '../../playground/src/sqljs.js'; // vrmxa-core's sql.js, for character bundles with a database (Mira's)

window.__errors = [];
addEventListener('error', (e) => window.__errors.push(`${e.message} @${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => window.__errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));

installPortableMath(); // before anything parses a VRM or steps a world
globalThis.VRMXG_CORE = engineCore; // what the import map's @vrmxg/core hands the project's behaviours
const characters = { vrmxaCore: { ...core, ...anim }, closet };
const q = new URLSearchParams(location.search);

async function check(build) {
  const { loadRapier } = await import('@vrmxg/physics');
  const { playScene } = await import('../../../engine/packages/bundle/runtime/play.js');
  const { readLexerCases } = await import('../../../engine/packages/bundle/runtime/lexer-cases.js');
  const { game, manifest } = build;
  const status = document.getElementById('status');
  const behaviours = await build.behaviours((path) => import(/* @vite-ignore */ new URL(path, location.href).href));
  const scene = q.get('scene') ?? game.entry, take = q.get('check') || null;
  const r = await playScene({ R: await loadRapier(), bytes: build.bytes, scene, behaviours, actions: await build.actions(), ...characters, take, steps: +(q.get('steps') ?? 600) });
  window.__result = {
    game: game.id, entry: scene, runtime: `${manifest.runtime.name} ${manifest.runtime.version}`, digest: manifest.digest, files: manifest.files.length,
    take, steps: r.steps, components: r.components, final: r.final, hashes: r.hashes, verified: build.checked.size,
    lexer: readLexerCases(moduleImports), modules: game.behaviours ? await build.modules(game.behaviours) : [], ua: navigator.userAgent,
  };
  if (status) status.textContent = `${game.title}: ${r.steps} steps of ${scene}, final ${r.final}`;
}

async function main() {
  const build = await openBuild(fetchReader('./'));
  document.title = build.game.title;
  if (q.has('check')) { await check(build); return; }
  const { createApp } = await import('vue');
  const { default: App } = await import('./App.vue');
  createApp(App, { build, characters }).mount('#app');
}

main().catch((e) => {
  window.__errors.push(String(e?.stack ?? e));
  const status = document.getElementById('status');
  if (status) status.textContent = `This game can't be played: ${e?.message ?? e}`;
}).finally(() => { if (q.has('check')) window.READY = true; });
