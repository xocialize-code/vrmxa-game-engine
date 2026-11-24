// From a take to the film (M4 W9): the tracks a take becomes, and keeping or removing it as one undo step.
//
// takeTracks(take) is pure: the log in, track data out. A take's tracks are its own (each marked `take` with the take's
// id and `by` with its kind), added after the film's other tracks and released (@vrmxg/tracks), so a take holds its
// character only over its own span and plays over what the script or an earlier take gave her; a later take plays over
// an earlier one. Nothing is merged into another track, so removing a take removes exactly what keeping it added, and
// the script (@vrmxg/script, rule 5) treats its tracks as the person's own: a re-script keeps them and moves them with
// the beats they fall in.
//
// The log stays in the project beside the film (takeRef); the film never reads it to play. Replaying a take is building
// the film it was performed over with takeTracks(log) added, in any engine: replayDoc.
import { checkSequence } from '@vrmxg/sequence';
import { hashValue } from '@vrmxg/snapshot';
import { checkTake, frameOfStep } from './take.js';
import { puppetTracks } from './puppet.js';
import { directorTracks, ACTOR } from './director.js';
import { faceTracks } from './face.js';

const KIND_NAMES = { puppet: 'puppet', director: 'director', face: 'face' };

/**
 * The tracks a take becomes, and the cast change it needs (a director take that gave her something to do).
 * @param {any} take @returns {{ tracks: any[], cast: Record<string, any> | null }}
 */
export function takeTracks(take) {
  const problems = checkTake(take);
  if (problems.length) throw new Error(`take ${take?.id ?? '?'}: ${problems.join('; ')}`);
  if (take.kind === 'puppet') return { tracks: puppetTracks(take), cast: null };
  if (take.kind === 'face') return { tracks: faceTracks(take), cast: null };
  const { tracks, cast } = directorTracks(take);
  return { tracks, cast };
}

/** Where a take's log is kept in the project. */
export const takeRef = (sequenceId, takeId) => `performances/${sequenceId}/${takeId}.json`;

/** A take's first and last frame in a sequence: where its tracks' keys and clips reach. */
function spanOf(tracks) {
  let a = Infinity, b = -Infinity;
  for (const t of tracks) {
    const ks = Array.isArray(t.keys) ? t.keys : Object.values(t.keys ?? {}).flat();
    for (const k of ks) { if (k[0] < a) a = k[0]; if (k[0] > b) b = k[0]; }
    for (const c of t.clips ?? []) { if (c.start < a) a = c.start; if (c.end > b) b = c.end; }
  }
  return a <= b ? { from: a, to: b } : { from: 0, to: 0 };
}

/** The takes in a sequence, from its tracks: [{ id, kind, target, from, to, tracks: [ids] }] in the order kept. */
export function takesOf(seq) {
  const by = new Map();
  for (const t of seq?.tracks ?? []) if (typeof t.take === 'string') (by.get(t.take) ?? by.set(t.take, []).get(t.take)).push(t);
  return [...by].map(([id, tracks]) => ({ id, kind: tracks[0].by ?? null, target: tracks[0].target ?? null, ...spanOf(tracks), tracks: tracks.map((t) => t.id) }));
}

/** The next free take id ("take-4"), past the sequence's own and any others named (logs already in the project). */
export function nextTakeId(seq, taken = []) {
  let n = 0;
  for (const id of [...takesOf(seq).map((t) => t.id), ...taken]) { const m = /^take-(\d+)$/.exec(id); if (m) n = Math.max(n, Number(m[1])); }
  return `take-${n + 1}`;
}

/**
 * A sequence document with a take in it (pure): the take's tracks after every other track, the cast change if it has
 * one, and the film made long enough to hold it. A take already in (the same id) is replaced. Throws when the take has
 * nothing to keep, or the result isn't a valid sequence.
 * @param {any} doc a sequence document @param {any} take @param {{ nodeIds?: Set<string> | null }} [o]
 */
export function withTake(doc, take, { nodeIds = null } = {}) {
  if (!doc?.sequence) throw new Error('a take is kept in a sequence');
  const { tracks, cast } = takeTracks(take);
  if (!tracks.length) throw new Error(`take ${take.id} recorded nothing to keep`);
  const out = structuredClone(doc), seq = out.sequence;
  seq.tracks = [...(seq.tracks ?? []).filter((t) => t.take !== take.id), ...tracks];
  const taken = new Set(seq.tracks.slice(0, -tracks.length).map((t) => t.id));
  for (const t of tracks) if (taken.has(t.id)) throw new Error(`take ${take.id}: the sequence already has a track "${t.id}"`);
  if (cast) {
    seq.cast = { ...(seq.cast ?? {}) };
    for (const [id, c] of Object.entries(cast)) {
      const had = seq.cast[id] ?? {};
      // she keeps a brain she already has (a set's own, or an earlier take's); one with none gets the actor's
      const brained = (had.behaviours ?? []).some((b) => b.use === 'brain');
      seq.cast[id] = brained ? had : { ...had, behaviours: [...(had.behaviours ?? []), ...structuredClone(c.behaviours)] };
    }
  }
  const { to } = spanOf(tracks);
  if (Math.ceil(to) > (seq.duration ?? 0)) seq.duration = Math.ceil(to);
  const problems = checkSequence(seq, { nodeIds });
  if (problems.length) throw new Error(`take ${take.id}: ${problems.join('; ')}`);
  return out;
}

/** A sequence document without a take (pure): its tracks gone, and the actor's brain when no take needs it any more. */
export function withoutTake(doc, id) {
  const out = structuredClone(doc), seq = out.sequence;
  const mine = (seq.tracks ?? []).filter((t) => t.take === id);
  if (!mine.length) throw new Error(`no take "${id}" in this sequence`);
  seq.tracks = seq.tracks.filter((t) => t.take !== id);
  for (const target of new Set(mine.filter((t) => t.type === 'decisions').map((t) => t.target))) {
    if (seq.tracks.some((t) => t.type === 'decisions' && t.target === target)) continue;
    const c = seq.cast?.[target];
    if (c?.behaviours?.some((b) => b.use === 'brain' && b.preset === ACTOR.preset)) c.behaviours = c.behaviours.filter((b) => !(b.use === 'brain' && b.preset === ACTOR.preset));
  }
  return out;
}

const seconds = (take) => Math.round(((take.end - take.start) / 60) * 10) / 10;

/**
 * Keep a take: its tracks into the open sequence as ONE undo step ("Take 3: mira, puppet (12 s)"). Undo takes the whole
 * take out again; its log file stays in the project.
 * @param {any} session an @vrmxg/editor-core EditorSession on a sequence @param {any} take
 * @param {{ name?: string, label?: string }} [o] name: what to call the character in the label
 * @returns {{ label: string, take: string, tracks: string[], from: number, to: number, hash: string }}
 */
export function keepTake(session, take, { name = take.target, label = null } = {}) {
  if (!session?.isSequence) throw new Error('open a sequence to keep a take in it');
  const ids = session.targetIds ? new Set([...session.targetIds(), ...session.doc.nodes.map((n) => n.id)]) : null;
  const next = withTake(session.doc, take, { nodeIds: ids });
  const text = label ?? `Take ${take.id.replace(/^take-/, '')}: ${name}, ${KIND_NAMES[take.kind]} (${seconds(take)} s)`;
  session.run(text, [{ op: 'setDoc', path: 'sequence', value: next.sequence }]);
  const mine = takesOf(next.sequence).find((t) => t.id === take.id);
  return { label: text, take: take.id, tracks: mine.tracks, from: mine.from, to: mine.to, hash: hashValue(take) };
}

/** Remove a kept take: one undo step. */
export function removeTake(session, id) {
  if (!session?.isSequence) throw new Error('open a sequence to remove a take from it');
  const next = withoutTake(session.doc, id), label = `Remove take ${id.replace(/^take-/, '')}`;
  session.run(label, [{ op: 'setDoc', path: 'sequence', value: next.sequence }]);
  return { label, take: id };
}

/**
 * The film a take replays as: the sequence it was performed over with the take's tracks, made from its log alone.
 * (The same as withTake: named for what the acceptance does with it.)
 */
export const replayDoc = withTake;

/** What a take covers, for a list: { id, kind, target, seconds, from, to } (frames). */
export function describeTake(take) {
  return { id: take.id, kind: take.kind, target: take.target, seconds: seconds(take), from: frameOfStep(take.start - 1, take.fps), to: frameOfStep(take.end - 1, take.fps), hash: hashValue(take) };
}
