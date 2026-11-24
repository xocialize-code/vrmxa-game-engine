// Saving a scene (AB-T-0593 review): the text is written first, and the session is marked saved only once the write
// has succeeded. Marked before (as it was), a write that failed (the volume gone, the folder moved, a full disk) left
// a document that said "saved" with nothing on disk, and the next close lost it without asking.

/**
 * Write the session's document into the project as `ref`. → { text, written } (written: what the project's write
 * returned). Throws what the write throws, with the session still unsaved.
 * @param {any} session an EditorSession @param {{ write: (ref: string, text: string) => Promise<any> }} project
 */
export async function saveScene(session, project, ref) {
  const text = session.text();
  const written = await project.write(ref, text);
  session.markSaved(text, ref);
  return { text, written };
}
