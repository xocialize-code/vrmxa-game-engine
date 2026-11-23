// Casting a role (M4 W6): pure data in, data out, as one edit.
//
// The casting lives in the sequence's own block, `sequence.roles` ({ <role id>: Role entry }), not in `sequence.cast`:
// the script generates `cast` entries (marks, behaviours) and would take a cast written there as a hand edit and stop
// updating it. `roles` is the creator's, and a re-script carries it over as it is.
//   { "hana-1": { "cue": "HANA", "asset": "cast-hana",
//       "character": { "ref": "characters/hana.vrmxa", "sha256": "…", "vrmxaId": "…", "name": "Hana" },
//       "voice": { "engine": "kokoro-82m", "preset": "af_heart", "from": "persona", "id": "<voice id>" },
//       "expressions": ["happy", "relaxed", "surprised", "sad", "neutral"], "rest": "relaxed",
//       "wardrobe": { "outfit": null, "worn": ["…"] } } }
// `asset` names a vrmxa asset of the sequence (or the set's own, when the set already uses that file); composing the
// sequence (@vrmxg/sequence composeSequence) gives the role's node that asset, so the character is swapped and the
// set's file is untouched.
//
// Recasting keeps the performance: every track aimed at the role (moves, gestures, expressions, looks) and the
// dialogue's words and times stay byte for byte. Only a line's baked voice goes (the script's BAKE_FIELDS: clip,
// timings, visemes, words, voice, audio), and only when the voice changes: the line is then listed for re-baking in
// the new voice (W7's bake fills it), and speaks from its text, live, until then. Undo puts the old bake back, so a
// re-bake writes a new file rather than over the old one: the list names each clip by its line, voice and words
// (clipFor), never bakePlan's `voice/<line>.wav`.
import { BAKE_FIELDS } from '@vrmxg/script';
import { rolesOf, roleOf } from './roles.js';
import { resolveVoice, allowedExpressions, pickWardrobe, basename } from './card.js';

/**
 * Cast a role from a character card (readCharacter), or recast it.
 * @param {any} doc the sequence document now
 * @param {string} roleId the role's id (its node id, hana-1) or its cue (HANA)
 * @param {import('./card.js').Card} card
 * @param {{ set?: any, voice?: string, presets?: Record<string, string>, outfit?: string | null, dir?: string, unknown?: 'keep' | 'rebake' }} [o]
 *   set: the set document (an asset it already has for this file is reused; a node that isn't a Character is no
 *   role); voice: a Kokoro preset picked by hand; presets: role id → Kokoro preset, for characters whose persona
 *   names none (the sample's map); outfit: one of her outfits, by id or name; dir: where baked clips go (voice/);
 *   unknown: what to do with a line baked in a voice nobody recorded (no `voice` on the clip): keep it with a warning
 *   (the default), or re-bake it
 * @returns {CastResult}
 *
 * @typedef {{ ok: true, changed: boolean, doc: any, ops: any[], label: string, role: any, previous: any | null,
 *   rebake: Rebake[], warnings: string[] }} CastResult
 * @typedef {{ id: string, where: string, speaker: string, text: string, voice: string, engine: string, clip: string,
 *   beat: string | null, src: string | null, track: string, index: number, start: number, end: number,
 *   reason: 'recast' | 'unbaked' | 'unknown' }} Rebake
 */
export function castRole(doc, roleId, card, o = {}) {
  const { set = null, presets = {}, dir = 'voice', unknown = 'keep' } = o;
  const role = roleOf(doc, roleId, { set });
  const seq = doc.sequence, prev = seq.roles?.[role.id] ?? null;
  const warnings = [];

  // the asset: the set's or the sequence's for this very file, else a new one
  const setAssets = set?.assets ?? [], own = doc.assets ?? [];
  const ops = [], post = [];
  let asset = setAssets.find((a) => a.type === 'vrmxa' && a.ref === card.ref)?.id ?? null;
  if (!asset) {
    const mine = own.find((a) => a.type === 'vrmxa' && a.ref === card.ref);
    if (mine) {
      asset = mine.id;
      if (card.sha256 && mine.sha256 !== card.sha256) { // the file changed since it was cast: record the new bytes, in place (nodes may use it)
        ops.push({ op: 'setAsset', id: mine.id, asset: { ...mine, sha256: card.sha256 } });
      }
    } else {
      const taken = new Set([...setAssets, ...own].map((a) => a.id));
      const base = `cast-${slug(basename(card.ref))}`;
      asset = base;
      for (let n = 2; taken.has(asset); n++) asset = `${base}-${n}`;
      ops.push({ op: 'addAsset', asset: { id: asset, type: 'vrmxa', ref: card.ref, ...(card.sha256 ? { sha256: card.sha256 } : {}) } });
    }
  }

  // voice, expressions, wardrobe. The other roles' voices: their casting's, else the map's (as voicesFor gives them).
  // A free voice also skips what the map holds for roles this sequence lacks, so one map voices a whole project apart.
  const others = Object.entries(voicesFor(doc, { presets, set })).filter(([id]) => id !== role.id);
  const taken = [...others.map(([, p]) => p), ...Object.entries(presets).filter(([id]) => id !== role.id).map(([, p]) => p)];
  const v = resolveVoice(card, role.id, { voice: o.voice, presets, taken });
  // the same character again with no voice of her own: she keeps the one handed to her, not the next free one
  if (v.voice.from === 'default' && prev?.voice?.from === 'default' && prev.character?.ref === card.ref) v.voice = { ...prev.voice };
  warnings.push(...v.warnings);
  const cues = new Map(rolesOf(doc, { set }).map((x) => [x.id, x.cue]));
  const shared = others.filter(([, p]) => p === v.voice.preset).map(([id]) => cues.get(id) ?? id).sort();
  if (shared.length) warnings.push(`${role.cue} speaks in ${v.voice.preset}, as ${shared.join(' and ')} ${shared.length > 1 ? 'do' : 'does'}: pick another voice if they shouldn't sound alike`);
  const expressions = allowedExpressions(card);
  const wardrobe = pickWardrobe(card, o.outfit);
  const entry = {
    cue: role.cue, asset,
    character: { ref: card.ref, ...(card.sha256 ? { sha256: card.sha256 } : {}), vrmxaId: card.vrmxaId, name: card.name },
    voice: v.voice,
    expressions,
    ...(card.persona?.rest_expression ? { rest: card.persona.rest_expression } : {}),
    wardrobe,
  };

  // the lines: a bake in another voice goes, and the line is listed for re-baking; a line never baked is listed too
  const next = structuredClone(seq);
  // Only the clip's own record (`voice`, which applyBake, regenerateLine and a folded bake write) says what a line was
  // baked in: a guess from the map or the old casting could keep a line in the wrong voice.
  const rebake = [];
  const base = slug(doc.id ?? 'scene');
  for (const line of role.lines) {
    const clip = next.tracks.find((t) => t.id === line.track).clips[line.index];
    let reason = /** @type {Rebake['reason']} */ ('unbaked');
    if (line.baked) {
      const bakedIn = clip.voice ?? null;
      if (bakedIn === v.voice.preset) continue; // already in this voice
      if (bakedIn === null && unknown !== 'rebake') { warnings.push(`${role.cue}'s line "${short(line.text)}" was baked in a voice nobody recorded; it is kept: re-bake it if it isn't ${v.voice.preset} (unknown: 'rebake')`); continue; }
      for (const f of BAKE_FIELDS) delete clip[f];
      reason = bakedIn === null ? 'unknown' : 'recast';
    }
    const id = `${base}-${slug(line.track)}-${line.index + 1}`;
    rebake.push({ id, where: `tracks.${line.track}.clips[${line.index}]`, speaker: role.id, text: line.text, voice: v.voice.preset, engine: v.voice.engine, clip: clipFor(dir, id, v.voice.preset, line.text), beat: line.beat, src: line.src, track: line.track, index: line.index, start: line.start, end: line.end, reason });
  }

  // allowed expressions: the performance is kept as it is, so a face the persona doesn't allow is only reported
  if (expressions) for (const name of expressionsUsed(seq, role.id)) if (!expressions.includes(name)) warnings.push(`${role.cue}'s performance wears "${name}", which ${card.name}'s persona doesn't allow (${expressions.join(', ')}); it is kept`);

  const roles = { ...(next.roles ?? {}), [role.id]: entry };
  next.roles = Object.fromEntries(Object.keys(roles).sort().map((k) => [k, roles[k]]));

  // an asset the old casting added and nothing uses any more goes
  if (prev?.asset && prev.asset !== asset && own.some((a) => a.id === prev.asset) && !setAssets.some((a) => a.id === prev.asset)
    && !Object.values(next.roles).some((r) => /** @type {any} */ (r).asset === prev.asset) && !(doc.nodes ?? []).some((n) => n.asset === prev.asset)) {
    post.push({ op: 'removeAsset', id: prev.asset });
  }

  const changed = ops.length + post.length > 0 || canonical(seq) !== canonical(next);
  const label = labelOf(role, prev, entry);
  if (!changed) return { ok: true, changed: false, doc, ops: [], label, role: entry, previous: prev, rebake: [], warnings };
  ops.push({ op: 'setDoc', path: 'sequence', value: next }, ...post);
  return { ok: true, changed: true, doc: applyOps(doc, ops), ops, label, role: entry, previous: prev, rebake, warnings };
}

/**
 * Fold a bake into a cast (W7's, through applyCast's hook): the bake fields for each listed line go into the same
 * edit, so the cast and its bake are one undo step. `bakes` lines up with `r.rebake`; an entry is the clip's new bake
 * fields (the script's BAKE_FIELDS: clip, timings, visemes, words, voice, audio), or null for a line left to speak live.
 * Each baked clip records its voice (the line's, unless the bake says). The lines not baked stay in `rebake`.
 * @param {CastResult} r a castRole result @param {(Record<string, any> | null | undefined)[]} bakes
 * @returns {CastResult & { baked: number }}
 */
export function withBake(r, bakes) {
  if (!Array.isArray(bakes) || bakes.length !== r.rebake.length) throw new Error(`a bake answers each line to re-bake: ${r.rebake.length} lines, ${Array.isArray(bakes) ? bakes.length : typeof bakes} answers`);
  const i = r.ops.findIndex((x) => x.op === 'setDoc' && x.path === 'sequence');
  if (i < 0) return { ...r, baked: 0 };
  const seq = structuredClone(r.ops[i].value), left = [];
  let baked = 0;
  r.rebake.forEach((line, k) => {
    const b = bakes[k];
    if (!b) { left.push(line); return; }
    const odd = Object.keys(b).filter((f) => !BAKE_FIELDS.includes(f));
    if (odd.length) throw new Error(`a bake sets only ${BAKE_FIELDS.join(', ')}; line ${line.id} has ${odd.join(', ')}`);
    if (typeof b.clip !== 'string' || !b.clip) throw new Error(`line ${line.id}'s bake has no clip`);
    Object.assign(seq.tracks.find((t) => t.id === line.track).clips[line.index], structuredClone(b), { voice: b.voice ?? line.voice });
    baked++;
  });
  const ops = r.ops.map((x, j) => (j === i ? { ...x, value: seq } : x));
  return { ...r, ops, doc: { ...r.doc, sequence: structuredClone(seq) }, rebake: left, baked };
}

/**
 * Where a line's bake goes: by line, voice and words (a short FNV-1a of the voice and text), so a recast, a re-script or
 * a voice picked by hand never writes over a clip that undo can bring back.
 * @param {string} dir @param {string} id the line's id (bakePlan's) @param {string} voice @param {string} text
 */
export function clipFor(dir, id, voice, text) {
  const key = `${voice}\n${text}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return `${dir}/${id}-${slug(voice)}-${(h >>> 0).toString(16).padStart(8, '0')}.wav`;
}

/**
 * The voice of every role, as bakePlan and the live lines take it (@vrmxg/voice: speaker id → Kokoro preset): a cast
 * role's own, else the caller's map.
 * @param {any} doc @param {{ presets?: Record<string, string>, set?: any }} [o]
 * @returns {Record<string, string>}
 */
export function voicesFor(doc, { presets = {}, set = null } = {}) {
  const out = {};
  for (const r of rolesOf(doc, { set })) {
    const p = doc.sequence.roles?.[r.id]?.voice?.preset ?? presets[r.id];
    if (p) out[r.id] = p;
  }
  return out;
}

/** The lines still to bake for a role (or every role): text-only lines, with the role's voice and clipFor's file. */
export function linesToBake(doc, { presets = {}, dir = 'voice', role: only = null, set = null } = {}) {
  const voices = voicesFor(doc, { presets, set }), base = slug(doc.id ?? 'scene'), out = [];
  for (const r of rolesOf(doc, { set })) {
    if (only && r.id !== only && r.cue !== only) continue;
    const role = doc.sequence.roles?.[r.id];
    for (const l of r.lines) {
      if (l.baked || !voices[r.id]) continue;
      const id = `${base}-${slug(l.track)}-${l.index + 1}`;
      out.push({ id, where: `tracks.${l.track}.clips[${l.index}]`, speaker: r.id, text: l.text, voice: voices[r.id], engine: role?.voice?.engine ?? 'kokoro-82m', clip: clipFor(dir, id, voices[r.id], l.text), beat: l.beat, src: l.src, track: l.track, index: l.index, start: l.start, end: l.end, reason: 'unbaked' });
    }
  }
  return out;
}

/** The expressions a role's expression tracks key, sorted. */
export function expressionsUsed(seq, roleId) {
  const names = new Set();
  for (const t of seq.tracks ?? []) if (t.type === 'expression' && t.target === roleId) for (const [k, keys] of Object.entries(t.keys ?? {})) if ((keys ?? []).some((x) => x[1] > 0)) names.add(k);
  return [...names].sort();
}

/** The same edit ops @vrmxg/scene's editor runs, on a copy (so the pure result and the editor's agree byte for byte). */
export function applyOps(doc, ops) {
  const d = structuredClone(doc);
  for (const op of ops) {
    if (op.op === 'setDoc') { d[op.path] = structuredClone(op.value); continue; }
    if (op.op === 'addAsset') { d.assets ??= []; d.assets.splice(op.index ?? d.assets.length, 0, structuredClone(op.asset)); continue; }
    if (op.op === 'removeAsset') { const i = (d.assets ?? []).findIndex((a) => a.id === op.id); if (i >= 0) d.assets.splice(i, 1); continue; }
    if (op.op === 'setAsset') { const i = (d.assets ?? []).findIndex((a) => a.id === op.id); if (i >= 0) d.assets[i] = { ...structuredClone(op.asset), id: op.id }; continue; }
    throw new Error(`castRole made an op it can't apply: ${op.op}`);
  }
  return d;
}

function labelOf(role, prev, entry) {
  if (!prev) return `Cast ${role.cue}: ${entry.character.name}`;
  if (prev.character?.ref !== entry.character.ref) return `Recast ${role.cue}: ${prev.character?.name ?? '?'} → ${entry.character.name}`;
  if (prev.voice?.preset !== entry.voice.preset) return `Recast ${role.cue}'s voice: ${prev.voice?.preset ?? '?'} → ${entry.voice.preset}`;
  return `Recast ${role.cue}`;
}

/** Sorted-key JSON, for comparing data. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const short = (s) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);
