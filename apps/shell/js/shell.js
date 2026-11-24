// The page's side of the VRMXG Mac shell (apps/shell): call native methods, hear native events. Outside the shell
// (a browser) `inShell` is false and `call` rejects, so apps can show shell-only controls only when they work.
//
//   import { inShell, call, on } from '../../shell/js/shell.js';
//   const info = await call('shell.info');                 // { shell, app, appVersion, origin, url, methods }
//   const f = await call('file.open', { types: ['vrmxs'] }); // { path, name, size, text }
//   await call('file.save', { text, suggestedName: 'cafe.vrmxs' });
//   on('menu.save', () => …);                               // File menu commands arrive as events
//   onClosing(async (reason) => await askAboutUnsavedWork()); // before the window closes or the app quits (shell 0.9.0)
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

/**
 * Answer the shell before the window closes or the app quits (shell 0.9.0, for an app whose ShellConfiguration sets
 * `asksBeforeClosing`). `decide(reason)` (reason: 'close' or 'quit') resolves to true to go on, or false to keep the
 * window: show the unsaved-changes sheet in it, save in it. The shell is told at once that the page is asking, so it
 * waits as long as the person takes; a page that never says so (a hung page) is closed after the shell's timeout. Asked
 * again while `decide` is still running (⌘Q with the sheet up), the page only says it is still asking. A `decide`
 * that throws keeps the window. Returns an unsubscribe function.
 */
export function onClosing(decide) {
  let deciding = false;
  return on('window.closing', async ({ id, reason }) => {
    const say = (answer) => call('window.closeReply', { id, answer }).catch(() => {});
    say('wait');
    if (deciding) return;
    deciding = true;
    let go = false;
    try { go = (await decide(reason)) === true; } catch (e) { console.error(e); } finally { deciding = false; }
    say(go ? 'close' : 'cancel');
  });
}

let edited = null;
/**
 * Tell the shell whether the window holds unsaved work (shell 0.9.0; an app with `asksBeforeClosing`). Call it whenever
 * that may have changed: only a change is sent. The window shows the edited dot, and a close or quit the page can't
 * answer in time (its main thread busy with a build, or hung) asks the person in an alert of the shell's own instead of
 * closing. Does nothing outside the shell.
 */
export function setEdited(unsaved) {
  const v = !!unsaved;
  if (!handler || v === edited) return;
  edited = v;
  call('window.setEdited', { edited: v }).catch(() => { /* a shell without it: nothing to tell */ });
}
