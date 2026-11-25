// The game app's test game (M5 W1): the sample project with a title, a level and an ending of its own
// (apps/game/test/fixtures/game). Its files go into the project under game/, its game.json replaces the sample's, and
// its licence rows are added to the sample's LICENCES.md. Nothing is copied on disk: this is a project reader, as
// @vrmxg/bundle's exportBuild takes one.
//
//   node apps/game/scripts/test-game.mjs <out> [--runtime <folder>]   export it with the game app's runtime
import fs from 'node:fs';
import path from 'node:path';
import { folderReader, checkRuntimeSources } from '@vrmxg/bundle/node';

const root = path.resolve(import.meta.dirname, '../../..');
export const SAMPLE = path.join(root, 'content/sample');
export const FIXTURE = path.join(root, 'apps/game/test/fixtures/game');
export const GAME_RUNTIME = path.join(root, 'apps/game/dist');

/**
 * Refuse the game app's dist when it is older than this checkout's sources (its stamp, apps/game/dist-sources.json), as
 * vrmxg-export does: a build made with it would carry an old engine without a word. Another runtime folder isn't checked.
 * @param {string} runtime
 */
export function assertFreshRuntime(runtime) {
  if (path.resolve(runtime) !== GAME_RUNTIME) return;
  const s = checkRuntimeSources(path.join(GAME_RUNTIME, '..', 'dist-sources.json'));
  if (s.ok) return;
  const changed = [...s.changed, ...s.missing];
  throw new Error(`the game runtime at ${runtime} ${s.digest === null ? 'was built without its source stamp (apps/game/dist-sources.json)' : `is older than this checkout: ${changed.length} of its source files changed since it was built (${changed.slice(0, 4).join(', ')}${changed.length > 4 ? ', …' : ''})`}: build it again (npm run build -w @vrmxg/game-app)`);
}

/** @returns {{ files: string[], read: (ref: string) => Promise<Uint8Array>, game: any }} */
export function testGameProject() {
  const sample = folderReader(SAMPLE);
  const own = new Map(fs.readdirSync(FIXTURE).filter((f) => f !== 'LICENCES.md' && f !== 'game.json').map((f) => [`game/${f}`, path.join(FIXTURE, f)]));
  const game = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'game.json'), 'utf8'));
  const licences = `${fs.readFileSync(path.join(SAMPLE, 'LICENCES.md'), 'utf8').trimEnd()}\n\n${fs.readFileSync(path.join(FIXTURE, 'LICENCES.md'), 'utf8')}`;
  const extra = new Map([['LICENCES.md', new TextEncoder().encode(licences)], ['game.json', new TextEncoder().encode(`${JSON.stringify(game, null, 1)}\n`)]]);
  const files = [...new Set([...sample.files, ...own.keys(), ...extra.keys()])].sort();
  const read = async (ref) => extra.get(ref) ?? (own.has(ref) ? new Uint8Array(fs.readFileSync(own.get(ref))) : sample.read(ref));
  return { files, read, game };
}

/**
 * Export the test game into `out` (staged and moved in whole, as exportToFolder does).
 * @param {string} out @param {{ runtime?: string }} [o] → what the export wrote
 */
export async function exportTestGame(out, { runtime = GAME_RUNTIME } = {}) {
  const { exportBuild } = await import('@vrmxg/bundle');
  const { stageFolder } = await import('@vrmxg/bundle/node');
  assertFreshRuntime(runtime);
  const p = testGameProject();
  let stage = null;
  try {
    const r = await exportBuild({ project: { files: p.files, read: p.read }, runtime: folderReader(runtime), game: p.game, ready: () => { stage = stageFolder(path.resolve(out)); }, write: (f, bytes) => stage.write(f, bytes) });
    stage.commit();
    return { game: r.manifest.game.id, entry: r.manifest.game.entry, files: r.files, bytes: r.bytes, digest: r.manifest.digest, manifest: r.sha256, out: stage.root };
  } catch (e) { stage?.abort(); throw e; }
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2), at = args.indexOf('--runtime');
  const runtime = at >= 0 ? path.resolve(args[at + 1]) : GAME_RUNTIME;
  const out = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--runtime');
  if (!out) { console.error('usage: node apps/game/scripts/test-game.mjs <out> [--runtime <folder>]'); process.exit(2); }
  if (!fs.existsSync(path.join(runtime, 'vrmxg-runtime.json'))) { console.error(`no runtime at ${runtime}: npm run build -w @vrmxg/game-app`); process.exit(1); }
  try { console.log(JSON.stringify(await exportTestGame(out, { runtime }), null, 1)); } catch (e) { console.error(e.message); process.exit(1); }
}
