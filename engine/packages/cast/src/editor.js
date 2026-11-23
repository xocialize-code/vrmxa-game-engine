// Casting in the editor (and the creator): one cast or recast, applied to an editor-core session as one undo step.
// The session is duck-typed (doc, setDoc, isSequence, run), as @vrmxg/script's applyScript takes it, so this package
// doesn't depend on editor-core.
import { castRole } from './cast.js';

/**
 * Cast or recast a role in the session's sequence, as one undo step ("Cast HANA: Hana", "Recast HANA: Hana → Mira").
 * Nothing changes (and no step is added) when the casting is already so.
 *
 * The re-bake hook is W7's: after the edit lands, `rebake(lines, { role, doc, label })` gets the role's lines to bake
 * in the new voice (castRole's `rebake`). It runs outside the undo step, so the bake it starts is its own step (the
 * voicing workstream: "regenerating every line of one character is one undo step"). With no hook the list is only
 * returned.
 * @param {{ doc: any, setDoc?: any, isSequence: boolean, run: (label: string, ops: any[]) => void }} session
 * @param {string} roleId @param {import('./card.js').Card} card
 * @param {Parameters<typeof castRole>[3] & { rebake?: (lines: import('./cast.js').Rebake[], ctx: { role: string, doc: any, label: string }) => any }} [o]
 */
export function applyCast(session, roleId, card, o = {}) {
  if (!session.isSequence) throw new Error('casting needs a sequence document (a set it films and a sequence block)');
  const { rebake, ...opts } = o;
  const r = castRole(session.doc, roleId, card, { ...opts, set: opts.set ?? session.setDoc ?? null });
  if (!r.changed) return { ...r, hooked: null };
  session.run(r.label, r.ops);
  const hooked = rebake && r.rebake.length ? rebake(r.rebake, { role: r.rebake[0].speaker, doc: session.doc, label: r.label }) : null;
  return { ...r, hooked };
}
