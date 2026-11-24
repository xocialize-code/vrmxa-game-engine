// The 180° rule as a lint (M4 W8): flag a cut whose two cameras stand on opposite sides of the line between the people
// it cuts between. It reads the sequence document (and its set) as it is, so it checks hand edits too: a camera
// swapped for one across the line is flagged; coverage by rule never is.
//
// For each cut on a camera track (one clip to the next):
//   - each camera plays to its subjects (aim target or targets, body target); a lone subject's eyeline (whom her lookAt
//     track has her look at) makes a pair, so a close-up's line, and a shot / reverse's, is the eyeline;
//   - the lines kept are the pairs both cameras play to (a wide of three cutting to a shot / reverse of two keeps that
//     pair's line), or, when they share none, the line between the two people they show. The outgoing camera is held
//     against the line as it ran on the last frame before the cut, the incoming one against the line on the cut's frame,
//     so a move that lands on the cut is judged by what each shot shows (cast transforms, transform tracks sampled as
//     they play, shot overrides);
//   - each camera's place comes from its body (fixed: its transform, with its own transform tracks and the shot's
//     overrides; follow, thirdPerson, orbit, firstPerson: from its target), as the rig preset, its props and the shot's
//     prop overrides set it;
//   - the cut crosses the line when the two cameras are off it, more than `margin` metres, on opposite sides. A camera
//     on the line (a neutral shot) is the way across, and isn't flagged.
// Cuts are where the live camera clip changes (clipAt), so a clip laid over a longer one cuts in and back out. A cut
// inside or into a shot with "crossLine": true crosses on purpose and isn't flagged. A camera whose place can't be
// known (a dolly on a path, a turntable that turns) isn't checked; `unchecked` lists those cuts.
//
// The set (AB-T-0597): with `blockers` (the set's solid boxes, blockers.js), every camera clip is also checked where it
// starts: a camera standing in a box ("inside the set's geometry") or with a box between it and someone it films
// ("behind the set's geometry") is an issue of `kind: 'geometry'`, whoever placed it. People are seen at eye height.
import { rigDefaults } from '@vrmxg/camera/rigs';
import { clipAt, shotAt } from '@vrmxg/sequence';
import { evaluateTrack } from '@vrmxg/tracks';
import { cameraPoint, sideOf, blocked, EYE } from './geometry.js';

/** Every node of a document, nested children included. */
export function allNodes(doc) {
  const out = [];
  const walk = (ns) => { for (const n of ns ?? []) { out.push(n); walk(n.children); } };
  walk(doc?.nodes);
  return out;
}

/** Props with a shot's prop overrides on top (as SequenceService.writeOverride: each key replaced, null deletes it). */
export function overriddenProps(props, over) {
  if (!over) return props ?? {};
  const out = { ...(props ?? {}) };
  for (const [k, v] of Object.entries(over)) { if (v === null) delete out[k]; else out[k] = v; }
  return out;
}

/**
 * A VirtualCamera's settings: its rig preset's defaults under its own props (as VirtualCameraNode.settings()), with a
 * shot's prop overrides when given.
 */
export function cameraSettings(node, over = null) {
  const p = overriddenProps(node?.props, over), d = rigDefaults(p.rig);
  return { body: { ...d.body, ...(p.body ?? {}) }, aim: { ...d.aim, ...(p.aim ?? {}) }, lens: { ...d.lens, ...(p.lens ?? {}) } };
}

/** The people a camera films: its aim's target or targets and its body's target (ids, without "#head"). */
export function subjectsOf(node, over = null) {
  const { body, aim } = cameraSettings(node, over);
  const ids = [aim.target, ...(aim.targets ?? []), body.target].filter((x) => typeof x === 'string').map((x) => x.split('#')[0]);
  return [...new Set(ids)];
}

/**
 * A view of a sequence document and its set at any frame: nodes by id, where people stand, whom they look at.
 * @param {any} doc the sequence document @param {any} [set] the set document it films
 */
export function sceneAt(doc, set = null) {
  const seq = doc.sequence ?? {};
  const byId = new Map([...allNodes(set), ...allNodes(doc)].map((n) => [n.id, n]));
  const people = new Set([...allNodes(set), ...allNodes(doc)].filter((n) => n.type === 'Character').map((n) => n.id));
  for (const id of Object.keys(seq.cast ?? {})) people.add(id);
  const tracks = seq.tracks ?? [];
  const fps = seq.fps ?? 30;
  const moving = new Map();
  for (const t of tracks) if (t.type === 'transform' && t.target && Array.isArray(t.keys) && t.keys.length) moving.set(t.target, [...(moving.get(t.target) ?? []), { ...t, keys: [...t.keys].sort((a, b) => a[0] - b[0]) }]);
  /** The live shot's overrides of a node at frame f. */
  const overAt = (id, f) => { const o = shotAt(seq, f)?.overrides; return o && Object.hasOwn(o, id) ? o[id] : null; };
  /**
   * A node's transform at frame f: the set's, the sequence's cast, the live shot's override, then its transform tracks
   * sampled as they play (eased, held on twos), which the sequence writes every step.
   */
  const tfAt = (id, f) => {
    let tf = seq.cast?.[id]?.transform ?? byId.get(id)?.transform ?? null;
    const o = overAt(id, f)?.transform;
    if (o) tf = { ...(tf ?? {}), ...o };
    for (const t of moving.get(id) ?? []) { const v = evaluateTrack(t, f, fps); if (v) tf = { ...(tf ?? {}), ...v }; }
    return tf;
  };
  const posAt = (id, f) => { const tf = tfAt(id, f); return tf ? [tf.p?.[0] ?? 0, tf.p?.[1] ?? 0, tf.p?.[2] ?? 0] : null; };
  /** Whom a person looks at on frame f (a person's id), from her lookAt track. */
  const lookAt = (id, f) => {
    for (const t of tracks) if (t.type === 'lookAt' && t.target === id) for (const c of t.clips ?? []) if (f >= c.start && f < c.end && people.has(c.at)) return c.at;
    return null;
  };
  /** A camera's settings at frame f: its props under the live shot's prop overrides. */
  const settingsAt = (camId, f) => cameraSettings(byId.get(camId), overAt(camId, f)?.props ?? null);
  /** Where a camera stands at frame f, or null when that can't be known. */
  const cameraAt = (camId, f) => { const n = byId.get(camId); return n ? cameraPoint(n, settingsAt(camId, f).body, (id) => tfAt(id, f)) : null; };
  return { seq, byId, people, tfAt, posAt, lookAt, overAt, settingsAt, cameraAt };
}

/** The people a camera plays to at frame f: its subjects, and a lone subject's eyeline (whom she looks at). */
function peopleOf(S, camId, f) {
  const who = subjectsOf(S.byId.get(camId), S.overAt(camId, f)?.props ?? null).filter((id) => S.people.has(id));
  if (who.length === 1) { const to = S.lookAt(who[0], f); if (to && to !== who[0]) who.push(to); }
  return who.filter((id) => S.posAt(id, f)).sort();
}

/** The frames where a camera track's live clip changes: [frame, outgoing clip, incoming clip]. */
export function cutsOf(track) {
  const at = new Set();
  for (const c of track.clips ?? []) { at.add(c.start); at.add(c.end); }
  const out = [];
  for (const f of [...at].sort((a, b) => a - b)) {
    if (f <= 0) continue;
    const A = clipAt(track, f - 1), B = clipAt(track, f);
    if (A && B && A !== B) out.push([f, A, B]);
  }
  return out;
}
/** The lines a cut must keep: the pairs both shots play to, or, when they share none, the two people between them. */
function linesOf(a, b) {
  const pairs = (xs) => xs.flatMap((x, i) => xs.slice(i + 1).map((y) => [x, y]));
  const inB = new Set(pairs(b).map((p) => p.join('|')));
  const shared = pairs(a).filter((p) => inB.has(p.join('|')));
  if (shared.length) return shared;
  const all = [...new Set([...a, ...b])].sort();
  return all.length === 2 ? [all] : [];
}

/**
 * Check the 180° rule at every cut and, with `blockers`, that every camera stands clear of the set and sees its people.
 * @param {any} doc the sequence document @param {{ set?: any, margin?: number, blockers?: any[] | null }} [o]
 *   blockers: setBlockers(set, …); a geometry issue has `kind: 'geometry'`, `what` ('inside' | 'behind'), the box's name
 *   in `blocker`, both `shots` and both `cameras` the same, and no `line` or `sides`
 * @returns {{ issues: { frame: number, shots: [string | null, string | null], cameras: [string, string], line?: [string, string], sides?: [number, number], kind?: 'geometry', what?: string, blocker?: string, message: string }[], unchecked: { frame: number, cameras: [string, string] }[] }}
 */
export function lintLine(doc, { set = null, margin = 0.05, blockers = null } = {}) {
  const S = sceneAt(doc, set);
  const issues = [], unchecked = [];
  const shotName = (f) => { const s = shotAt(S.seq, f); return s ? s.name ?? s.id : null; };
  for (const t of S.seq.tracks ?? []) {
    if (t.type !== 'camera' || !blockers?.length) continue;
    const starts = [...new Set((t.clips ?? []).map((c) => c.start))].sort((a, b) => a - b);
    for (const f of starts) {
      const c = clipAt(t, f);
      if (!c?.camera || !S.byId.get(c.camera)) continue;
      const at = S.cameraAt(c.camera, f);
      if (!at) continue; // a dolly, a turntable: its place isn't known
      const who = subjectsOf(S.byId.get(c.camera), S.overAt(c.camera, f)?.props ?? null).filter((id) => S.people.has(id) && S.posAt(id, f));
      const heads = who.map((id) => { const p = S.posAt(id, f); return [p[0], p[1] + EYE, p[2]]; });
      const b = blocked(at, heads, blockers, 0);
      if (!b) continue;
      const name = shotName(f), seen = b.head ? who[heads.indexOf(b.head)] : null;
      issues.push({ frame: f, shots: [name, name], cameras: [c.camera, c.camera], kind: 'geometry', what: b.what, blocker: b.box.name ?? 'a collider',
        message: `frame ${f}${name ? ` (${name})` : ''}: camera ${c.camera} is ${b.what === 'inside' ? 'inside' : 'behind'} the set's geometry (${b.box.name ?? 'a collider'}${seen ? `, between it and ${seen}` : ''})` });
    }
  }
  for (const t of S.seq.tracks ?? []) {
    if (t.type !== 'camera') continue;
    for (const [f, A, B] of cutsOf(t)) {
      if (!A.camera || !B.camera || A.camera === B.camera) continue;
      if (shotAt(S.seq, f)?.crossLine) continue;
      if (!S.byId.get(A.camera) || !S.byId.get(B.camera)) continue; // checkSequence reports missing cameras
      const lines = linesOf(peopleOf(S, A.camera, f - 1), peopleOf(S, B.camera, f));
      if (!lines.length) continue;
      const pa = S.cameraAt(A.camera, f - 1), pb = S.cameraAt(B.camera, f);
      if (!pa || !pb) { unchecked.push({ frame: f, cameras: [A.camera, B.camera] }); continue; }
      for (const [x, y] of lines) {
        // each camera against the line as its own shot shows it: a move that lands on the cut isn't a cross
        const sa = sideOf(S.posAt(x, f - 1), S.posAt(y, f - 1), pa, margin), sb = sideOf(S.posAt(x, f), S.posAt(y, f), pb, margin);
        if (sa && sb && sa !== sb) {
          const names = [shotName(f - 1), shotName(f)];
          issues.push({ frame: f, shots: /** @type {[string, string]} */ (names), cameras: [A.camera, B.camera], line: [x, y], sides: [sa, sb],
            message: `frame ${f}${names[0] && names[1] ? ` (${names[0]} → ${names[1]})` : ''}: the cut from ${A.camera} to ${B.camera} crosses the line between ${x} and ${y}` });
        }
      }
    }
  }
  return { issues, unchecked };
}
