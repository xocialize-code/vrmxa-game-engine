// The page's side of the VRMXG Mac shell (apps/shell): call native methods, hear native events. Outside the shell
// (a browser) `inShell` is false and `call` rejects, so apps can show shell-only controls only when they work.
//
//   import { inShell, call, on } from '../../shell/js/shell.js';
//   const info = await call('shell.info');                 // { shell, app, appVersion, origin, url, methods }
//   const f = await call('file.open', { types: ['vrmxs'] }); // { path, name, size, text }
//   await call('file.save', { text, suggestedName: 'cafe.vrmxs' });
//   on('menu.save', () => …);                               // File menu commands arrive as events
const handler = globalThis.webkit?.messageHandlers?.vrmxg;

/** True inside a VRMXG Mac app. */
export const inShell = !!handler;

/** A shell error: `code` is one of bad_request, unknown_method, bad_params, cancelled, no_project, failed, … */
export class ShellError extends Error {
  constructor(code, message) { super(message); this.name = 'ShellError'; this.code = code; }
}

/** Call a native method; resolves with its result, rejects with a ShellError. */
export async function call(method, params = {}) {
  if (!handler) throw new ShellError('no_shell', 'not running in a VRMXG Mac app');
  try {
    return await handler.postMessage({ method, params });
  } catch (e) {
    let info = null;
    try { info = JSON.parse(e?.message ?? ''); } catch { /* not ours */ }
    throw info?.code ? new ShellError(info.code, info.message) : e;
  }
}

/** Hear a native event (menu.open, menu.openProject, menu.save, menu.saveAs, …). Returns an unsubscribe function. */
export function on(name, fn) {
  const listener = (e) => { if (e.detail?.name === name) fn(e.detail.payload ?? {}); };
  addEventListener('vrmxg-shell', listener);
  return () => removeEventListener('vrmxg-shell', listener);
}
