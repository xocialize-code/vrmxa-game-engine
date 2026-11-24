// Saving the open short (M4 W5; the order is AB-T-0593's review): its sequence, its script and the project's
// shorts.json, each marked saved only once its write has succeeded. Marked before, a write that failed left a short
// that said "saved" with nothing on disk, and the next close lost it without asking. Plain functions over the host's
// parts, so the real code is tested with a project whose write fails (test/closing.test.mjs).
import { SHORTS_FILE, slugOf } from './shorts.js';

/** Unsaved work the window must ask about before it goes: the sequence, the script, or a short never saved. */
export function shortDirty({ session, desk, short }) {
  return !!session && (session.dirty || !!desk?.dirty || (short ? !short.saved : false));
}

/**
 * Save the short: its sequence, its script and shorts.json (saved shorts only). Save As gives it a new name with a
 * free id (a new short beside the old one; a short never saved just takes the new name).
 * @param {any} h the creator host, or its parts: { short, desk, shorts, session, project, save(ref), applyScript() };
 *   `short` and `desk.short` are updated as the short is renamed and saved
 * @returns {Promise<{ sequence: any, script: any, shorts: any }>} what each write returned (script: null when it wasn't written)
 */
export async function saveShortFiles(h, asTitle = null) {
  if (h.desk?.pending) h.applyScript(); // typing not yet applied; an applied script isn't built again (M4 W11)
  if (asTitle) {
    const old = h.short;
    const id = h.shorts.freeId(slugOf(asTitle), h.project.files);
    const short = { ...old, id, title: asTitle, script: `scripts/${id}.fountain`, sequence: `sequences/${id}.vrmxs` };
    h.shorts.addDraft(short);
    if (!old.saved) h.shorts.discard(old.id);
    h.short = h.shorts.byId(id); h.desk.short = h.short; h.desk.saved = null;
    h.session.path = short.sequence;
  }
  const sequence = await h.save(h.short.sequence); // the session is saved once this is written (the editor's saveScene)
  let script = null;
  if (h.desk.dirty || !h.project.has(h.short.script)) {
    const text = h.desk.text;
    script = await h.project.write(h.short.script, text);
    h.desk.markSaved(text);
  }
  // shorts.json lists the saved shorts: it is written with this one in it, and the short is saved once it is
  const shorts = await h.project.write(SHORTS_FILE, h.shorts.manifest(h.short.id));
  h.short = h.shorts.markSaved(h.short.id); h.desk.short = h.short;
  return { sequence, script, shorts };
}
