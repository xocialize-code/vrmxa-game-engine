// The editor's answer when the Mac shell asks before the window closes or the app quits (shell 0.9.0, AB-T-0593), as a
// plain function so it is tested with a real session and a write that fails (apps/creator/test/closing.test.mjs).
import { closingQuestion } from '@vrmxg/editor-ui';

/**
 * A scene with unsaved changes gets a sheet in the window: Save, Don't Save or Cancel in a project folder; the bundled
 * sample can't be saved, so there the sheet says so and offers to close anyway. → true to go on closing.
 * Save that fails keeps the window, shows why, and leaves the scene unsaved, so the next close asks again.
 * @param {any} ed the EditorHost (its session, project, sceneRef, stop and save)
 * @param {{ ask: (title: string, text: string, options: any[]) => Promise<string>, asking: () => boolean, reason?: 'close' | 'quit', onError?: (e: any) => void }} o
 *   ask, asking: the window's questions (@vrmxg/editor-ui `questions`)
 */
export async function editorClosing(ed, { ask, asking, reason = 'close', onError = () => {} }) {
  if (asking()) return false; // a question is already up: that one first
  const s = ed?.session;
  const q = s && closingQuestion({ dirty: s.dirty, canSave: !!ed.project?.writable, title: ed.sceneRef ?? 'This scene', project: ed.project?.name, reason });
  if (!q) return true;
  const c = await ask(q.title, q.text, q.options);
  if (c !== 'save') return c === 'discard';
  try {
    if (s.mode === 'playing') ed.stop();
    await ed.save();
    return true;
  } catch (e) { onError(e); return false; }
}
