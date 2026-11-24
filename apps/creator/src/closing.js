// The creator's questions about unsaved work (M4 W5 review; closing: shell 0.9.0, AB-T-0593), as plain functions over
// the host, so they are tested with a real session, script and short list and a write that fails
// (test/closing.test.mjs). The window asks through @vrmxg/editor-ui's `questions`: one at a time, every one answered.
import { closingQuestion } from '@vrmxg/editor-ui';

/**
 * Before the open short goes (another short, New Short, Open Project, a script that opens another short): unsaved work
 * is saved, discarded or kept, as the person says. → true to go on. A save that fails keeps the short, shows why, and
 * leaves it unsaved.
 * @param {any} cr the CreatorHost @param {{ ask: (title: string, text: string, options: any[]) => Promise<string>, onError?: (e: any) => void }} o
 */
export async function guardShort(cr, { ask, onError = () => {} }) {
  if (!cr?.isDirty()) return true;
  const title = cr.short?.title ?? 'This short';
  const c = await ask('Unsaved changes', `${title} has changes that aren't saved${cr.short && !cr.short.saved ? ' (it has never been saved)' : ''}.`, [{ id: 'save', label: 'Save' }, { id: 'discard', label: 'Don\'t Save' }, { id: 'cancel', label: 'Cancel' }]);
  if (c === 'cancel') return false;
  if (c === 'discard') { cr.discardChanges(); return true; }
  try { await cr.saveShort(); return true; } catch (e) { onError(e); return false; }
}

/**
 * Before the window closes or the app quits (the Mac shell asks): the same sheet, when work would be lost. In a
 * project folder that is the unsaved-changes sheet every other leave shows (Save, Don't Save, Cancel). The bundled
 * sample saves only into memory, so there Save can't keep anything: the sheet says so and offers to close anyway.
 * → true to go on closing
 * @param {any} cr the CreatorHost
 * @param {{ ask: (title: string, text: string, options: any[]) => Promise<string>, asking: () => boolean, reason?: 'close' | 'quit', onError?: (e: any) => void }} o
 */
export async function creatorClosing(cr, { ask, asking, reason = 'close', onError = () => {} }) {
  if (asking()) return false; // a question is already up in the window: that one first
  if (!cr?.session) return true;
  const q = closingQuestion({ dirty: cr.isDirty(), canSave: !!cr.project?.writable, memory: cr.project?.unsaved?.() ?? [], title: cr.short?.title ?? 'This short', neverSaved: !!cr.short && !cr.short.saved, project: cr.project?.name, reason });
  if (!q) return true;
  if (q.options.some((o) => o.id === 'save')) return guardShort(cr, { ask, onError });
  return (await ask(q.title, q.text, q.options)) === 'discard';
}

/** Is there work a close would lose (what the shell is told, for its own alert when the page can't answer)? */
export function unsavedWork(cr) {
  return !!cr?.session && (cr.isDirty() || (!cr.project?.writable && (cr.project?.unsaved?.() ?? []).length > 0));
}
