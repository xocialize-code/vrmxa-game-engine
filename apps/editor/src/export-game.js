// Export Game (M5 W0, AB-T-0615): the open project as a game build, through @vrmxg/bundle's exporter, the one Node's
// `vrmxg-export` calls. The page reads the project's files and the runtime it ships with (./game-runtime/, built ahead
// of time: nothing is compiled here), and in the Mac app writes the build into a folder the person picks
// (`build.begin`, `build.write`, `build.end`). A browser tab has nowhere to write a folder, so there the export is
// checked and hashed only, as a video export is.
import { exportBuild, defaultGame, fetchReader, GAME_FILE } from '@vrmxg/bundle';
import { toBase64 } from '@vrmxg/export';
import { inShell, call } from '../../shell/js/shell.js';

/** Where the editor keeps the runtime a build is made with (vite.config.js copies it in). */
export const RUNTIME_BASE = './game-runtime/';

/**
 * @param {import('./project.js').Project} project
 * @param {{ scene?: string | null, name?: string, onProgress?: (done: number, total: number, path: string, phase: string) => void }} [o]
 *   scene: the open scene, the game's entry when the project has no game.json; name: the build folder's name (the
 *   game's id)
 */
export async function exportGame(project, { scene = null, name = '', onProgress = null } = {}) {
  const src = { files: project.files, read: (ref) => project.bytes(ref) };
  const runtime = { read: fetchReader(RUNTIME_BASE) };
  let game = null;
  if (!project.has(GAME_FILE)) {
    if (!scene) throw new Error(`the project has no ${GAME_FILE}, and no scene is open to export as the game`);
    game = defaultGame({ files: project.files, entry: scene });
  }
  // every check first: a refused export asks for no folder and replaces no earlier build
  const checked = await exportBuild({ project: src, runtime, game, onProgress: (d, t, p) => onProgress?.(d, t, p, 'checking') });
  const id = checked.manifest.game.id;
  const about = { id, title: checked.manifest.game.title, entry: checked.manifest.game.entry, runtime: `${checked.manifest.runtime.name} ${checked.manifest.runtime.version}`, files: checked.files, bytes: checked.bytes, digest: checked.manifest.digest, manifest: checked.sha256 };
  if (!inShell) return { ...about, written: false, path: null };
  const began = await call('build.begin', { name: name || id, title: 'Export Game' });
  const r = await exportBuild({
    project: src, runtime, game, onProgress: (d, t, p) => onProgress?.(d, t, p, 'writing'),
    write: (path, bytes) => call('build.write', { path, base64: toBase64(bytes) }),
  });
  const ended = await call('build.end');
  if (r.sha256 !== checked.sha256) throw new Error(`the project changed while it was exported (${began.path} holds the later build)`);
  return { ...about, written: true, path: ended.path, name: ended.name };
}
