// The 180° rule as a lint (M4 W8): flag a cut whose two cameras stand on opposite sides of the line between the people
// it cuts between. It reads the sequence document (and its set) as it is, so it checks hand edits too: a camera
// swapped for one across the line is flagged; coverage by rule never is.
//
// For each cut on a camera track (one clip to the next):
//   - each camera plays to its subjects (aim target or targets, body target); a lone subject's eyeline (whom her lookAt
//     track has her look at) makes a pair, so a close-up's line, and a shot / reverse's, is the eyeline;
//   - the lines kept are the pairs both cameras play to (a wide of three cutting to a shot / reverse of two keeps that
//     pair's line), or, when they share none, the line between the two people they show; each runs between where the
//     two stand at the cut (cast transforms, transform tracks, shot overrides);
//   - each camera's place comes from its body (fixed: its transform; follow, thirdPerson, orbit, firstPerson: from its
//     target), as the rig preset and its props set it;
//   - the cut crosses the line when the two cameras are off it, more than `margin` metres, on opposite sides. A camera
//     on the line (a neutral shot) is the way across, and isn't flagged.
// A shot with "crossLine": true crosses on purpose and isn't flagged. A camera whose place can't be known (a dolly on
// a path) isn't checked; `unchecked` lists those cuts.
import { rigDefaults } from '@vrmxg/camera/rigs';
import { cameraPoint, sideOf } from './geometry.js';

/** Every node of a document, nested children included. */
export function allNodes(doc) {
  const out = [];
  const walk = (ns) => { for (const n of ns ?? []) { out.push(n); walk(n.children); } };
  walk(doc?.nodes);
  return out;
}

/** A VirtualCamera's settings: its rig preset's defaults under its own props (as VirtualCameraNode.settings()). */
export function cameraSettings(node) {
  const d = rigDefaults(node?.props?.rig), p = node?.props ?? {};
  return { body: { ...d.body, ...(p.body ?? {}) }, aim: { ...d.aim, ...(p.aim ?? {}) }, lens: { ...d.lens, ...(p.lens ?? {}) } };
}

/** The people a camera films: its aim's target or targets and its body's target (ids, without "#head"). */
export function subjectsOf(node) {
  const { body, aim } = cameraSettings(node);
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
  const keyAt = (keys, f) => { let v = null; for (const k of keys ?? []) if (k[0] <= f) v = k[1]; return v; };
  /** A node's transform at frame f: the set's, the sequence's cast, its transform tracks, the shot's override. */
  const tfAt = (id, f) => {
    let tf = seq.cast?.[id]?.transform ?? byId.get(id)?.transform ?? null;
    for (const t of tracks) if (t.type === 'transform' && t.target === id && Array.isArray(t.keys)) { const v = keyAt([...t.keys].sort((a, b) => a[0] - b[0]), f); if (v) tf = { ...(tf ?? {}), ...v }; }
    const shot = (seq.shots ?? []).find((s) => f >= s.start && f < s.end);
    const o = shot?.overrides?.[id]?.transform;
    if (o) tf = { ...(tf ?? {}), ...o };
    return tf;
  };
  const posAt = (id, f) => { const tf = tfAt(id, f); return tf ? [tf.p?.[0] ?? 0, tf.p?.[1] ?? 0, tf.p?.[2] ?? 0] : null; };
  /** Whom a person looks at on frame f (a person's id), from her lookAt track. */
  const lookAt = (id, f) => {
    for (const t of tracks) if (t.type === 'lookAt' && t.target === id) for (const c of t.clips ?? []) if (f >= c.start && f < c.end && people.has(c.at)) return c.at;
    return null;
  };
  const cameraAt = (camId, f) => { const n = byId.get(camId); return n ? cameraPoint(n, cameraSettings(n).body, (id) => tfAt(id, f)) : null; };
  return { seq, byId, people, tfAt, posAt, lookAt, cameraAt };
}

/** The people a camera plays to at frame f: its subjects, and a lone subject's eyeline (whom she looks at). */
function peopleOf(S, cam, f, posFrame) {
  const who = subjectsOf(cam).filter((id) => S.people.has(id));
  if (who.length === 1) { const to = S.lookAt(who[0], f); if (to && to !== who[0]) who.push(to); }
  return who.filter((id) => S.posAt(id, posFrame)).sort();
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
 * Check the 180° rule at every cut.
 * @param {any} doc the sequence document @param {{ set?: any, margin?: number }} [o]
 * @returns {{ issues: { frame: number, shots: [string | null, string | null], cameras: [string, string], line: [string, string], sides: [number, number], message: string }[], unchecked: { frame: number, cameras: [string, string] }[] }}
 */
export function lintLine(doc, { set = null, margin = 0.05 } = {}) {
  const S = sceneAt(doc, set);
  const issues = [], unchecked = [];
  const shotName = (f) => { const s = (S.seq.shots ?? []).find((x) => f >= x.start && f < x.end); return s ? s.name ?? s.id : null; };
  for (const t of S.seq.tracks ?? []) {
    if (t.type !== 'camera') continue;
    const clips = [...(t.clips ?? [])].sort((a, b) => a.start - b.start);
    for (let i = 1; i < clips.length; i++) {
      const A = clips[i - 1], B = clips[i], f = B.start;
      if (!A.camera || !B.camera || A.camera === B.camera) continue;
      const shot = (S.seq.shots ?? []).find((s) => s.start === f);
      if (shot?.crossLine) continue;
      const nA = S.byId.get(A.camera), nB = S.byId.get(B.camera);
      if (!nA || !nB) continue; // checkSequence reports missing cameras
      const pA = peopleOf(S, nA, f - 1, f), pB = peopleOf(S, nB, f, f);
      const lines = linesOf(pA, pB);
      if (!lines.length) continue;
      const pa = S.cameraAt(A.camera, f - 1), pb = S.cameraAt(B.camera, f);
      if (!pa || !pb) { unchecked.push({ frame: f, cameras: [A.camera, B.camera] }); continue; }
      for (const [x, y] of lines) {
        const a = S.posAt(x, f), b = S.posAt(y, f);
        const sa = sideOf(a, b, pa, margin), sb = sideOf(a, b, pb, margin);
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
