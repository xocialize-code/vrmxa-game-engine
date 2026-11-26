#!/usr/bin/env node
// Export a game from the command line: the same exporter the editor's Export Game calls.
//
//   vrmxg-export <project> <out> [--runtime <folder>]     write the build into <out>
//   … --game <ref>                                        export the game a document in the project describes
//                                                         (content/sample's game/game.json) as the project's game.json
//   vrmxg-export <project> --check [--runtime <folder>]   run every check and print the manifest's digest; write nothing
//   vrmxg-export --verify <build>                         is the folder the build its manifest describes?
//   vrmxg-export --worker <build> <out> [--name <worker>] a Cloudflare Worker folder serving the build as static assets
//                                                         (hosting.js; deploying it is the operator's step)
//
// --runtime defaults to the game app (apps/game/dist: `npm run build -w @vrmxg/game-app`; M5 W1, AB-D-0286), the runtime
// every game is made with. Without it built the command stops and says so: it never takes another runtime instead, since
// the runtime's bytes are part of a build's identity. The minimal runtime in this package (runtime/dist,
// `npm run build:runtime -w @vrmxg/bundle`) goes in only when --runtime names it.
// Exit 1 on a refused export, with the reason; a file with no licence row is named.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { exportBuild } from './export.js';
import { exportToFolder, folderReader, checkFolder, checkRuntimeSources, projectWithGame, behavioursImporter } from './node.js';
import { workerFolder } from './hosting.js';

const args = process.argv.slice(2), flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1] ?? ''; };
const GAME_RUNTIME = path.resolve(import.meta.dirname, '../../../../apps/game/dist');
// the game app's source stamp, beside its dist (apps/game/vite.config.js writes it): a dist older than the checkout's
// sources is refused, since every build made with it would carry an old engine without a word
const GAME_SOURCES = path.resolve(GAME_RUNTIME, '../dist-sources.json');
const worker = flag('--worker'), workerAs = flag('--name');
const verify = flag('--verify'), runtime = flag('--runtime') ?? GAME_RUNTIME, gameFile = flag('--game');
const check = args.includes('--check'), rest = args.filter((a) => !a.startsWith('--'));

try {
  if (worker !== null) {
    const out = args.find((a) => !a.startsWith('--'));
    if (!worker || !out) { console.error('usage: vrmxg-export --worker <build> <out> [--name <worker>]'); process.exit(2); }
    const r = checkFolder(worker);
    if (!r.ok) { console.error(`${worker} is not a whole build (${r.state}): export it again`); process.exit(1); }
    console.log(JSON.stringify(workerFolder({ build: worker, out, name: workerAs ?? undefined }), null, 1));
    process.exit(0);
  }
  if (verify !== null) {
    const r = checkFolder(verify);
    console.log(JSON.stringify(r, null, 1));
    if (r.state === 'incomplete') console.error(`incomplete: ${r.missing.length} of the ${r.files} files the manifest lists are not there. The export was cut short, or the folder was copied in part: export again`);
    else if (!r.ok) console.error(`not the build its manifest describes: ${r.changed.length} changed, ${r.extra.length} not listed`);
    process.exit(r.ok ? 0 : 1);
  }
  if (gameFile === '') { console.error('--game needs a game document in the project: --game game/game.json'); process.exit(2); }
  const [project, out] = rest;
  if (!project || (!out && !check)) { console.error('usage: vrmxg-export <project> <out> [--runtime <folder>] [--game <ref>] | <project> --check [--game <ref>] | --verify <build>'); process.exit(2); }
  if (!fs.existsSync(path.join(runtime, 'vrmxg-runtime.json'))) {
    console.error(runtime === GAME_RUNTIME ? `no game runtime at ${runtime}: build the game app first (npm run build -w @vrmxg/game-app), or name a runtime with --runtime <folder>` : `no runtime at ${runtime}: a runtime is a built folder with its vrmxg-runtime.json`);
    process.exit(1);
  }
  if (path.resolve(runtime) === GAME_RUNTIME) {
    const s = checkRuntimeSources(GAME_SOURCES);
    if (!s.ok) {
      const what = s.digest === null ? 'was built without its source stamp (apps/game/dist-sources.json)' : `is older than this checkout: ${[...s.changed, ...s.missing].length} of its source files changed since it was built (${[...s.changed, ...s.missing].slice(0, 4).join(', ')}${[...s.changed, ...s.missing].length > 4 ? ', …' : ''})`;
      console.error(`the game runtime at ${runtime} ${what}: build it again (npm run build -w @vrmxg/game-app)`);
      process.exit(1);
    }
    // the runtime bundles vrmxa-core from ../vrmxa-core: off the commit vrmxa-core.json pins, its builds differ from
    // everyone else's and recorded logs won't replay on them (AB-A-0337)
    const pinScript = path.resolve(import.meta.dirname, '../../../../scripts/vrmxa-core.mjs');
    if (fs.existsSync(pinScript)) { const pin = (await import(pinScript)).pinState(); if (!pin.ok) console.error(`warning: ${pin.problem}`); }
  }
  const src = gameFile ? projectWithGame(project, gameFile) : folderReader(project);
  const r = check
    ? await exportBuild({ project: { files: src.files, read: src.read }, runtime: folderReader(runtime), game: /** @type {any} */ (src).game ?? null, write: null, importModule: behavioursImporter(project) })
    : await exportToFolder({ project, runtime, out, gameFile });
  console.log(JSON.stringify({ game: r.manifest.game.id, entry: r.manifest.game.entry, runtime: `${r.manifest.runtime.name} ${r.manifest.runtime.version}`, files: r.files, bytes: r.bytes, digest: r.manifest.digest, manifest: r.sha256, licensedByPattern: r.byPattern, ...(check ? {} : { out: /** @type {any} */ (r).out }) }, null, 1));
} catch (e) {
  if (e?.name !== 'BuildError') throw e;
  console.error(`export refused (${e.code}): ${e.message}`);
  process.exit(1);
}
