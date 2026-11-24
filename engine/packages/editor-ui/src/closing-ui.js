// What a window asks before it closes or the app quits (M5 W8, AB-T-0593), as a plain function over plain data. The
// Mac shell asks the page first (apps/shell 0.9.0: `window.closing`, shell.js's `onClosing`); the editor and the
// creator answer with this question in their own sheet.

/**
 * The question to ask before closing, or null when nothing would be lost.
 * @param {{ dirty: boolean, canSave: boolean, memory?: string[], title: string, neverSaved?: boolean, project?: string, reason?: 'close' | 'quit' }} s
 *   dirty: what is open has changes that aren't saved; canSave: Save reaches the disk (a project folder, in the Mac
 *   app); memory: files saved this session that exist only in memory (the bundled sample is read-only); title: what is
 *   open ("First Light", "cafe.vrmxs"); neverSaved: it has never been saved; project: the project's name
 * @returns {null | { title: string, text: string, options: { id: 'save' | 'discard' | 'cancel', label: string }[] }}
 *   'save': save, then close; 'discard': close without saving; 'cancel': keep the window. The first option is the
 *   default: Save where saving works, Cancel where closing can only lose the work.
 */
export function closingQuestion({ dirty, canSave, memory = [], title, neverSaved = false, project = 'This project', reason = 'close' }) {
  if (canSave) {
    if (!dirty) return null;
    return {
      title: 'Unsaved changes',
      text: `${title} has changes that aren't saved${neverSaved ? ' (it has never been saved)' : ''}.`,
      options: [{ id: 'save', label: 'Save' }, { id: 'discard', label: 'Don\'t Save' }, { id: 'cancel', label: 'Cancel' }],
    };
  }
  if (!dirty && !memory.length) return null;
  const lost = [
    dirty ? `${title} has changes that aren't saved` : '',
    memory.length ? `${memory.length === 1 ? `${memory[0]} is` : `${memory.length} files are`} saved only in memory` : '',
  ].filter(Boolean).join(', and ');
  return {
    title: 'Unsaved changes',
    text: `${lost}. ${project} is read-only, so nothing can be saved to it: open a project folder to keep work. ${reason === 'quit' ? 'Quitting' : 'Closing'} now loses this.`,
    options: [{ id: 'cancel', label: 'Cancel' }, { id: 'discard', label: reason === 'quit' ? 'Quit Anyway' : 'Close Anyway' }],
  };
}
