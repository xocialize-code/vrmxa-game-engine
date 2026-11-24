#!/usr/bin/env node
// Export a game from the command line: the same exporter the editor's Export Game calls.
//
//   vrmxg-export <project> <out> [--runtime <folder>]     write the build into <out>
//   vrmxg-export <project> --check [--runtime <folder>]   run every check and print the manifest's digest; write nothing
//   vrmxg-export --verify <build>                         is the folder the build its manifest describes?
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
import { exportToFolder, folderReader, checkFolder } from './node.js';

const args = process.argv.slice(2), flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1] ?? ''; };
const GAME_RUNTIME = path.resolve(import.meta.dirname, '../../../../apps/game/dist');
const verify = flag('--verify'), runtime = flag('--runtime') ?? GAME_RUNTIME;
const check = args.includes('--check'), rest = args.filter((a) => !a.startsWith('--'));

try {
  if (verify !== null) {
    const r = checkFolder(verify);
    console.log(JSON.stringify(r, null, 1));
    if (r.state === 'incomplete') console.error(`incomplete: ${r.missing.length} of the ${r.files} files the manifest lists are not there. The export was cut short, or the folder was copied in part: export again`);
    else if (!r.ok) console.error(`not the build its manifest describes: ${r.changed.length} changed, ${r.extra.length} not listed`);
    process.exit(r.ok ? 0 : 1);
  }
  const [project, out] = rest;
  if (!project || (!out && !check)) { console.error('usage: vrmxg-export <project> <out> [--runtime <folder>] | <project> --check | --verify <build>'); process.exit(2); }
  if (!fs.existsSync(path.join(runtime, 'vrmxg-runtime.json'))) {
    console.error(runtime === GAME_RUNTIME ? `no game runtime at ${runtime}: build the game app first (npm run build -w @vrmxg/game-app), or name a runtime with --runtime <folder>` : `no runtime at ${runtime}: a runtime is a built folder with its vrmxg-runtime.json`);
    process.exit(1);
  }
  const src = folderReader(project);
  const r = check
    ? await exportBuild({ project: { files: src.files, read: src.read }, runtime: folderReader(runtime), write: null })
    : await exportToFolder({ project, runtime, out });
  console.log(JSON.stringify({ game: r.manifest.game.id, entry: r.manifest.game.entry, runtime: `${r.manifest.runtime.name} ${r.manifest.runtime.version}`, files: r.files, bytes: r.bytes, digest: r.manifest.digest, manifest: r.sha256, licensedByPattern: r.byPattern, ...(check ? {} : { out: /** @type {any} */ (r).out }) }, null, 1));
} catch (e) {
  if (e?.name !== 'BuildError') throw e;
  console.error(`export refused (${e.code}): ${e.message}`);
  process.exit(1);
}
