// Saving the open short (M4 W5; the order is AB-T-0593's review): its sequence, its script and the project's
// shorts.json are written, and only when all three are on disk is any of it marked saved. Marked before the writes
// (as it was), a write that failed left a short that said "saved" with nothing on disk, and the next close lost it
// without asking; marked file by file, a sequence that was written and a shorts.json that wasn't left the short clean
// with its coverage setting only in memory. Plain functions over the host's parts, so the real code is tested with a
// project whose write fails (test/closing.test.mjs).
import { SHORTS_FILE, slugOf } from './shorts.js';

/**
 * Unsaved work the window must ask about before it goes: the sequence, the script, a short never saved, or a saved
 * short whose own fields (its coverage) shorts.json doesn't hold yet.
 */
export function shortDirty({ session, desk, short }) {
  return !!session && (session.dirty || !!desk?.dirty || (short ? !short.saved || !!short.unwritten : false));
}

/** Throw away the open short's unsaved work (the window asked): a short never saved leaves the list, a saved one gets its fields back. */
export function discardShort(h) {
  if (!h.short) return;
  if (!h.short.saved) { h.shorts.discard(h.short.id); return; }
  if (h.short.unwritten) { h.short = h.shorts.revert(h.short.id); if (h.desk) h.desk.short = h.short; }
}

/**
 * Save the short: its sequence, its script and shorts.json (saved shorts only). Save As gives it a new name with a
 * free id (a new short beside the old one; a short never saved just takes the new name).
 * @param {any} h the creator host, or its parts: { short, desk, shorts, session, project, applyScript(), sceneSaved?(ref, text) };
 *   `short` and `desk.short` are updated as the short is renamed and saved
 * @returns {Promise<{ sequence: any, script: any, shorts: any }>} what each write returned (script: null when it wasn't written)
 */
export async function saveShortFiles(h, asTitle = null) {
  if (h.desk?.pending) h.applyScript(); // typing not yet applied; an applied script isn't built again (M4 W11)
  if (asTitle) {
    const old = h.short;
    const id = h.shorts.freeId(slugOf(asTitle), h.project.files);
    const { unwritten: _, ...now } = old; // the new short takes the short as it is now; the old one stays as shorts.json holds it
    const short = { ...now, id, title: asTitle, script: `scripts/${id}.fountain`, sequence: `sequences/${id}.vrmxs` };
    h.shorts.addDraft(short);
    if (!old.saved) h.shorts.discard(old.id); else h.shorts.revert(old.id);
    h.short = h.shorts.byId(id); h.desk.short = h.short; h.desk.saved = null;
    h.session.path = short.sequence;
  }
  const ref = h.short.sequence, sequenceText = h.session.text();
  const withScript = h.desk.dirty || !h.project.has(h.short.script), scriptText = h.desk.text;
  const written = await h.project.write(ref, sequenceText);
  const script = withScript ? await h.project.write(h.short.script, scriptText) : null;
  // shorts.json lists the saved shorts: it is written with this one in it, as it is now
  const shorts = await h.project.write(SHORTS_FILE, h.shorts.manifest(h.short.id));
  // every file of the save is on disk: only now is any of it saved (a throw above leaves all of it unsaved)
  h.session.markSaved(sequenceText, ref);
  if (withScript) h.desk.markSaved(scriptText);
  h.short = h.shorts.markSaved(h.short.id); h.desk.short = h.short;
  const sequence = h.sceneSaved?.(ref, sequenceText) ?? written; // the host's own record of the saved scene
  return { sequence, script, shorts };
}
