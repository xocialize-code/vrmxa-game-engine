// The roles in a sequence the script built (@vrmxg/script, M4 W4). A role is a speaking character: the set's node
// the script's cue maps to (the title page's "Cast: HANA = hana-1", else the set's Character by name). Its id is that
// node id, which the script keeps stable across re-scripts; its lines are the dialogue clips the script generated for
// it (src "<beat>#say"), and its performance is every other track aimed at it (moves, gestures, expressions, looks).
import { readRow, BAKE_FIELDS } from '@vrmxg/script';

const beatOf = (src) => String(src ?? '').split('#')[0];

/** The node type a role must be: only characters are cast. */
export const ROLE_TYPE = 'Character';

/**
 * The roles of a sequence document, in order of first line (then id). A role is a node the dialogue speaks for, one
 * already cast (`sequence.roles`), or a `sequence.cast` entry whose node is a Character. Given the set, a node that
 * isn't a Character (the music player in cafe-morning's `cast`) is never a role; without it, a `cast` entry counts only
 * when the sequence's own nodes say it is a Character.
 * @param {any} doc a sequence document (.vrmxs with a sequence block), as the script built it
 * @param {{ set?: any }} [o] the set document the sequence films
 * @returns {Role[]}
 *
 * @typedef {{ id: string, cue: string, lines: Line[], dialogue: string[], performance: string[], cast: any | null }} Role
 * @typedef {{ beat: string | null, src: string | null, text: string, start: number, end: number, track: string, index: number, baked: boolean, voice: string | null }} Line
 */
export function rolesOf(doc, { set = null } = {}) {
  const seq = doc?.sequence;
  if (!seq) throw new Error('casting needs a sequence document (a sequence block the script built)');
  const cueOf = new Map((seq.script?.beats ?? []).map(readRow).map((r) => [r.id, r.cue]));
  const tracks = seq.tracks ?? [];
  const typeOf = nodeTypes(doc, set);
  const ids = new Set(Object.keys(seq.roles ?? {}));
  for (const t of tracks) if (t.type === 'dialogue' && t.target) ids.add(t.target);
  for (const id of Object.keys(seq.cast ?? {})) if (typeOf.get(id) === ROLE_TYPE) ids.add(id);
  for (const id of ids) if (typeOf.has(id) && typeOf.get(id) !== ROLE_TYPE) ids.delete(id);
  const out = [];
  for (const id of ids) {
    const dialogue = tracks.filter((t) => t.type === 'dialogue' && t.target === id);
    const lines = [];
    for (const t of dialogue) {
      (t.clips ?? []).forEach((c, index) => {
        if (!c.text) return;
        lines.push({ beat: c.src ? beatOf(c.src) : null, src: c.src ?? null, text: c.text, start: c.start, end: c.end, track: t.id, index, baked: BAKE_FIELDS.some((f) => c[f] !== undefined), voice: c.voice ?? null });
      });
    }
    lines.sort((a, b) => a.start - b.start || (a.track < b.track ? -1 : a.track > b.track ? 1 : a.index - b.index));
    const cue = lines.map((l) => cueOf.get(l.beat)).find(Boolean) ?? seq.roles?.[id]?.cue ?? id.toUpperCase();
    out.push({ id, cue, lines, dialogue: dialogue.map((t) => t.id), performance: tracks.filter((t) => t.target === id && t.type !== 'dialogue').map((t) => t.id), cast: seq.cast?.[id] ?? null });
  }
  const first = (r) => (r.lines.length ? r.lines[0].start : Infinity);
  return out.sort((a, b) => first(a) - first(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** One role by id (or by its cue, HANA), or an error naming the roles there are (and why a node that isn't one isn't). */
export function roleOf(doc, idOrCue, { set = null } = {}) {
  const roles = rolesOf(doc, { set });
  const r = roles.find((x) => x.id === idOrCue) ?? roles.find((x) => x.cue === idOrCue);
  if (r) return r;
  const type = nodeTypes(doc, set).get(idOrCue);
  const list = `its roles: ${roles.map((x) => `${x.cue} = ${x.id}`).join(', ') || 'none'}`;
  if (type && type !== ROLE_TYPE) throw new Error(`"${idOrCue}" is a ${type}, not a ${ROLE_TYPE}: only characters are cast (${list})`);
  throw new Error(`no role "${idOrCue}" in ${doc.id ?? 'the sequence'} (${list})`);
}

/** Node id → type, from the set and the sequence's own nodes (the sequence's win). */
function nodeTypes(doc, set) {
  return new Map([...(set?.nodes ?? []), ...(doc.nodes ?? [])].map((n) => [n.id, n.type]));
}
