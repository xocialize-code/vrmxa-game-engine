// Export Game (M5 W0, AB-T-0615): the open project as a game build, through @vrmxg/bundle's exporter, the one Node's
// `vrmxg-export` calls. The page reads the project's files and the runtime it ships with (./game-runtime/, built ahead
// of time: nothing is compiled here), and in the Mac app writes the build into a folder the person picks
// (`build.begin`, `build.write`, `build.end`). A browser tab has nowhere to write a folder, so there the export is
// checked and hashed only, as a video export is.
//
// Every check runs before a folder is asked for, each file is read and hashed once, and the shell stages what is
// written, checks it against the manifest (each file's size and SHA-256) and moves it in at the end. An export that fails on the way is aborted (`build.abort`), which leaves the
// folder as it was: an earlier build whole, and the same folder free for the next try.
//
// The game's behaviours module is imported for each export, as Node's exporter imports it (exportBuild's importModule,
// M6 W0 and W5): read from the project as it is now, its relative imports rewritten to blob: URLs of their own bytes,
// so neither the editor's open-time declarations nor the page's module cache can hand the build an older describe.
// The export's checks and its save-compatibility fingerprint read that one import, and a project gives the same
// manifest and the same verdict here and in Node (a module that won't import refuses the export, bad_behaviours).
import * as core from '@vrmxg/core';
import { exportBuild, defaultGame, fetchReader, moduleGraph, linkModules, GAME_FILE } from '@vrmxg/bundle';
import { toBase64 } from '@vrmxg/export';
import { inShell, call } from '../../shell/js/shell.js';

/** Where the editor keeps the runtime a build is made with (vite.config.js copies it in). */
export const RUNTIME_BASE = './game-runtime/';
/** The most bytes of a file in one bridge message: a larger file crosses in pieces, so no message outgrows this. */
export const CHUNK = 4 << 20;

const blobUrl = (_ref, src) => URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));

/**
 * The page's importer of a project's modules for an export (exportBuild's `importModule`): the module and every module
 * it imports relatively, read from the project now (moduleGraph), linked to URLs of their own text (linkModules: blob:
 * URLs, revoked once imported) and imported. A fresh graph every time; `@vrmxg/core` reaches it through the page's
 * import map. A graph with an import cycle can't be linked this way and refuses the export.
 * @param {{ bytes: (ref: string) => Promise<Uint8Array> }} project
 * @param {{ url?: (ref: string, source: string) => string, onGraph?: ((sources: Map<string, string>) => void) | null }} [o] url: a
 *   module's URL from its text (tests: a file); onGraph: hears the graph's text as read, before it is imported (the
 *   editor's hot reload, reload.js, watches those files and compares that text)
 * @returns {(ref: string) => Promise<Record<string, any>>}
 */
export function freshImporter(project, { url = blobUrl, onGraph = null } = {}) {
  return async (ref) => {
    globalThis.VRMXG_CORE = core; // what the import map's @vrmxg/core hands project modules (as project.js does)
    const sources = await moduleGraph({ top: ref, read: (r) => project.bytes(r) });
    onGraph?.(sources);
    const made = [];
    try {
      const top = linkModules({ top: ref, sources, url: (r, src) => { const u = url(r, src); made.push(u); return u; } });
      return await import(/* @vite-ignore */ top);
    } finally { for (const u of made) if (u.startsWith('blob:')) URL.revokeObjectURL(u); }
  };
}

/**
 * @param {{ files: string[], has: (ref: string) => boolean, bytes: (ref: string) => Promise<Uint8Array>, truncated?: boolean }} project
 * @param {{ scene?: string | null, name?: string, onProgress?: ((done: number, total: number, path: string) => void) | null, signal?: AbortSignal | null,
 *   shell?: { inShell: boolean, call: (method: string, params?: any) => Promise<any> }, runtime?: { read: (path: string) => Promise<Uint8Array> }, chunk?: number, importModule?: ((ref: string) => Promise<any>) | null, registry?: any }} [o]
 *   scene: the open scene, the game's entry when the project has no game.json; name: the build folder's name (the
 *   game's id); signal: stops the export between two writes (the window is closing), and the folder is left as it was;
 *   shell, runtime, chunk: the Mac shell, the runtime's files and the piece size (tests pass their own); importModule:
 *   how the game's behaviours module is imported (default: freshImporter, from the project as it is now); registry: a
 *   registry to trace with instead, its project behaviours already declared (tests; it skips the import)
 */
/** What Export Game says when Play would run the root behaviours.js but game.json doesn't name it (M6 W9). */
export const UNNAMED_BEHAVIOURS = 'behaviours.js runs when you play here, but game.json doesn\'t name it, so the build would leave it out: choose it in File › Project Settings › Behaviours, then export again';

/**
 * Play in place falls back to the root behaviours.js when game.json names no module (project.js behavioursRef), but a
 * build takes only the module game.json names (@vrmxg/bundle checkGame). So an export from a project in that state
 * would play without its behaviours and nothing would say so: it is refused, and the message says how to name it.
 * A game.json that doesn't parse is left to the export, which says so.
 */
async function namedBehaviours(project) {
  if (!project.has('behaviours.js')) return;
  let doc = null;
  try { doc = JSON.parse(new TextDecoder().decode(await project.bytes(GAME_FILE))); } catch { return; }
  if (doc && typeof doc === 'object' && (doc.behaviours === undefined || doc.behaviours === null)) throw Object.assign(new Error(UNNAMED_BEHAVIOURS), { code: 'unnamed_behaviours' });
}

export async function exportGame(project, { scene = null, name = '', onProgress = null, signal = null, shell = { inShell, call }, runtime = { read: fetchReader(RUNTIME_BASE) }, chunk = CHUNK, importModule = freshImporter(project), registry = undefined } = {}) {
  let game = null;
  if (!project.has(GAME_FILE)) {
    if (!scene) throw new Error(`the project has no ${GAME_FILE}, and no scene is open to export as the game`);
    game = defaultGame({ files: project.files, entry: scene });
  } else await namedBehaviours(project);
  let id = null; // the shell's handle on this export, once a folder is chosen
  const stopped = () => { if (signal?.aborted) throw Object.assign(new Error('the export was stopped'), { code: 'aborted' }); };
  const write = async (path, bytes) => {
    // each piece says where it begins, so the shell refuses one that arrives twice or out of turn
    for (let at = 0; at === 0 || at < bytes.length; at += chunk) {
      stopped();
      await shell.call('build.write', { id, path, base64: toBase64(bytes.subarray(at, at + chunk)), offset: at });
    }
  };
  try {
    const r = await exportBuild({
      project: { files: project.files, read: (ref) => project.bytes(ref), truncated: project.truncated === true }, runtime, game, registry, importModule,
      onProgress: (done, total, path) => { stopped(); onProgress?.(done, total, path); },
      // every check has passed: only now is a folder asked for, so a refused export asks for none and replaces nothing
      ready: shell.inShell ? async (plan) => { stopped(); id = (await shell.call('build.begin', { name: name || plan.game.id, title: 'Export Game' })).id; } : null,
      write: shell.inShell ? write : null,
    });
    const g = r.manifest.game;
    const about = { id: g.id, title: g.title, entry: g.entry, runtime: `${r.manifest.runtime.name} ${r.manifest.runtime.version}`, files: r.files, bytes: r.bytes, digest: r.manifest.digest, manifest: r.sha256, compat: r.manifest.compat?.digest ?? null, byPattern: r.byPattern.length };
    if (!shell.inShell) return { ...about, written: false, path: null };
    stopped();
    const ended = await shell.call('build.end', { id });
    id = null;
    return { ...about, written: true, path: ended.path, name: ended.name };
  } catch (e) {
    // a failure after the folder was chosen: drop what this export wrote, so the folder is as it was
    if (id !== null) { try { await shell.call('build.abort', { id }); } catch { /* the shell has already let go of it */ } }
    throw e;
  }
}

/**
 * The editor's answer, while a game is being exported, when the Mac shell asks before the window closes or the app
 * quits (shell 0.9.0's question, AB-T-0593; asked before the one about unsaved changes, closing.js). A build half
 * written is not lost work, but the person should know the export stops: Keep Exporting, or Stop and Close, which
 * stops it between two writes and has the shell drop what was written, so the folder is as it was. → true to go on.
 * @param {any} ed the EditorHost (its gameExporting and cancelGameExport)
 * @param {{ ask: (title: string, text: string, options: any[]) => Promise<string>, asking: () => boolean }} o the window's questions (@vrmxg/editor-ui `questions`)
 */
export async function exportClosing(ed, { ask, asking }) {
  if (!ed?.gameExporting) return true;
  if (asking()) return false; // a question is already up: that one first
  const c = await ask('A game is being exported', 'The build is still being written. Closing now stops the export, and the folder is left as it was.', [{ id: 'cancel', label: 'Keep Exporting' }, { id: 'stop', label: 'Stop and Close' }]);
  if (c !== 'stop') return false;
  await ed.cancelGameExport(); // settles once the export has let go of its folder (or had already finished)
  return true;
}
