// Casting in the editor (and the creator): one cast or recast, applied to an editor-core session as one undo step.
// The session is duck-typed (doc, setDoc, isSequence, run), as @vrmxg/script's applyScript takes it, so this package
// doesn't depend on editor-core.
import { castRole, withBake, canonical } from './cast.js';

/**
 * Cast or recast a role in the session's sequence, as one undo step ("Cast HANA: Hana", "Recast HANA: Hana → Mira").
 * Nothing changes (and no step is added) when the casting is already so.
 *
 * The re-bake hook is W7's. `rebake(lines, { role, doc, label })` gets the role's lines to bake in the new voice
 * (castRole's `rebake`, each with the clip file to write, named by voice and words), writes their audio, and answers
 * each line with its bake fields (`{ clip, timings?, words?, visemes?, audio? }`) or null to leave it speaking live.
 * Those fields go into the cast's own edit (withBake), so one undo takes back the recast and its re-bake together, as
 * regenerateLine writes its file first and then makes one step. Undo restores the old clips, whose files were never
 * written over. The hook may be async; nothing is applied until it settles, and if it fails nothing is cast. If the
 * document changes while it runs, the cast is refused (cast again on the new document).
 * @param {{ doc: any, setDoc?: any, isSequence: boolean, run: (label: string, ops: any[]) => void }} session
 * @param {string} roleId @param {import('./card.js').Card} card
 * @param {Parameters<typeof castRole>[3] & { rebake?: (lines: import('./cast.js').Rebake[], ctx: { role: string, doc: any, label: string }) => any }} [o]
 * @returns {Promise<import('./cast.js').CastResult & { baked: number }>} `rebake` then lists the lines still unbaked
 */
export async function applyCast(session, roleId, card, o = {}) {
  if (!session.isSequence) throw new Error('casting needs a sequence document (a set it films and a sequence block)');
  const { rebake, ...opts } = o;
  let r = { ...castRole(session.doc, roleId, card, { ...opts, set: opts.set ?? session.setDoc ?? null }), baked: 0 };
  if (!r.changed) return r;
  if (rebake && r.rebake.length) {
    const before = canonical(session.doc);
    const bakes = await rebake(r.rebake, { role: r.rebake[0].speaker, doc: r.doc, label: r.label });
    if (canonical(session.doc) !== before) throw new Error(`${r.label}: the document changed while its lines were baking; cast again`);
    if (bakes != null) r = withBake(r, bakes);
  }
  session.run(r.label, r.ops);
  return r;
}
