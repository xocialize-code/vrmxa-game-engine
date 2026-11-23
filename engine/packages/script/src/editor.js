// Re-scripting in the editor (and the creator): one build, applied to an editor-core session as one undo step (the
// sequence block, and the nodes the build adds, updates or removes). The
// session is duck-typed (doc, setDoc, isSequence, run), so this package doesn't depend on editor-core.
import { buildSequence } from './build.js';
import { canonical } from './hash.js';

/**
 * Re-script the session's sequence from a script: the new sequence block and any nodes the build places (cameras,
 * the brain, marks), as one undo step labelled "Re-script …". Nothing changes when the script has errors (they come
 * back with their lines) or when the build changes nothing.
 * @param {{ doc: any, setDoc?: any, isSequence: boolean, run: (label: string, ops: any[]) => void }} session
 * @param {string} text
 * @param {Parameters<typeof buildSequence>[1]} [o]
 */
export function applyScript(session, text, o = {}) {
  if (!session.isSequence) throw new Error('re-scripting needs a sequence document (a set it films and a sequence block)');
  const r = buildSequence(text, { ...o, previous: session.doc, set: o.set ?? session.setDoc ?? null });
  if (!r.ok) return { ...r, changed: false };
  // canonically: a sequence read back from its file has its keys in the file's order, not the build's (M4 W5)
  const same = canonical(r.doc.sequence) === canonical(session.doc.sequence) && !r.addNodes.length && !r.setNodes.length && !r.removeNodes.length;
  if (same) return { ...r, changed: false };
  const { added, removed, changed } = r.report;
  const parts = [added.length && `${added.length} added`, changed.length && `${changed.length} changed`, removed.length && `${removed.length} cut`].filter(Boolean);
  const label = `Re-script${parts.length ? ` (${parts.join(', ')})` : ''}`;
  session.run(label, [
    ...r.addNodes.map((node) => ({ op: 'add', node })),
    ...r.setNodes.map(({ id, path, value }) => ({ op: 'set', id, path, value })),
    { op: 'setDoc', path: 'sequence', value: r.doc.sequence },
    ...r.removeNodes.map((id) => ({ op: 'remove', id })),
  ]);
  return { ...r, changed: true, label };
}
