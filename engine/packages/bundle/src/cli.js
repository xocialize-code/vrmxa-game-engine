#!/usr/bin/env node
// Export a game from the command line: the same exporter the editor's Export Game calls.
//
//   vrmxg-export <project> <out> [--runtime <folder>]     write the build into <out>
//   vrmxg-export <project> --check [--runtime <folder>]   run every check and print the manifest's digest; write nothing
//   vrmxg-export --verify <build>                         is the folder the build its manifest describes?
//
// --runtime defaults to this package's built runtime (runtime/dist: `npm run build:runtime -w @vrmxg/bundle`).
// Exit 1 on a refused export, with the reason; a file with no licence row is named.
import path from 'node:path';
import process from 'node:process';
import { exportBuild } from './export.js';
import { exportToFolder, folderReader, checkFolder } from './node.js';

const args = process.argv.slice(2), flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1] ?? ''; };
const verify = flag('--verify'), runtime = flag('--runtime') ?? path.resolve(import.meta.dirname, '../runtime/dist');
const check = args.includes('--check'), rest = args.filter((a) => !a.startsWith('--'));

try {
  if (verify !== null) {
    const r = checkFolder(verify);
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.ok ? 0 : 1);
  }
  const [project, out] = rest;
  if (!project || (!out && !check)) { console.error('usage: vrmxg-export <project> <out> [--runtime <folder>] | <project> --check | --verify <build>'); process.exit(2); }
  const src = folderReader(project);
  const r = check
    ? await exportBuild({ project: { files: src.files, read: src.read }, runtime: folderReader(runtime), write: null })
    : await exportToFolder({ project, runtime, out });
  console.log(JSON.stringify({ game: r.manifest.game.id, entry: r.manifest.game.entry, runtime: `${r.manifest.runtime.name} ${r.manifest.runtime.version}`, files: r.files, bytes: r.bytes, digest: r.manifest.digest, manifest: r.sha256, ...(check ? {} : { out: /** @type {any} */ (r).out }) }, null, 1));
} catch (e) {
  if (e?.name !== 'BuildError') throw e;
  console.error(`export refused (${e.code}): ${e.message}`);
  process.exit(1);
}
