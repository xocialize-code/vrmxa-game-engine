// Saving a scene (AB-T-0593 review): the text is written first, and the session is marked saved only once the write
// has succeeded. Marked before (as it was), a write that failed (the volume gone, the folder moved, a full disk) left
// a document that said "saved" with nothing on disk, and the next close lost it without asking.

/**
 * Write the session's document into the project as `ref`, after any prefab an Apply changed (M5 W6: each prefab is
 * marked saved once its own write has succeeded, so a failure part way leaves the rest unsaved). → { text, written } (written: what the project's write
 * returned). Throws what the write throws, with the session still unsaved.
 * @param {any} session an EditorSession @param {{ write: (ref: string, text: string) => Promise<any> }} project
 */
export async function saveScene(session, project, ref) {
  // Save As over a prefab this scene places (or one that leads to it): the file would be an instance of itself (M5 W6)
  const loop = session.cycleIfSavedAs?.(ref);
  if (loop) throw new Error(`${ref} can't be this scene's file: it places ${loop}${loop === ref ? '' : `, which leads to ${ref}`}, and an instance of itself would be a cycle`);
  for (const p of session.dirtyPrefabs?.() ?? []) {
    const t = session.prefabText(p);
    await project.write(p, t);
    session.markPrefabSaved(p, t);
  }
  const text = session.text();
  const written = await project.write(ref, text);
  session.markSaved(text, ref);
  return { text, written };
}
