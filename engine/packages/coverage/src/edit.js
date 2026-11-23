// Replacing a shot's camera (M4 W8): one edit, one undo step. The shot's camera clips (those that start inside it, or
// a clip laid over the one live at its start when that began earlier) take the new camera, and a new VirtualCamera,
// when one is given, is added in the same step.
// In a script's sequence the clip keeps its src, so the re-script merge sees a hand edit: the person's camera stays
// through later re-scripts and still follows its shot's timing (@vrmxg/script README, rule 2).
//
// The session is duck-typed like @vrmxg/script's applyScript (doc, setDoc?, run(label, ops)), so this package doesn't
// depend on editor-core.
import { checkSequence, clipAt } from '@vrmxg/sequence';
import { rigDefaults, RIGS } from '@vrmxg/camera/rigs';
import { allNodes } from './lint.js';

/** A shot by id or by number ("030"). */
export function findShot(seq, ref) {
  const s = (seq?.shots ?? []).find((x) => x.id === ref) ?? (seq?.shots ?? []).find((x) => x.name === ref);
  if (!s) throw new Error(`no shot "${ref}"`);
  return s;
}

/**
 * A VirtualCamera on one of M2's rig presets, ready to add: the rig's defaults apply, `props` override any part.
 * @param {{ id: string, rig: string, name?: string, p?: number[], target?: string, targets?: string[], props?: any }} o
 */
export function cameraOnRig({ id, rig, name, p, target, targets, props = {} }) {
  if (!RIGS[rig]) throw new Error(`unknown rig "${rig}" (${Object.keys(RIGS).join(', ')})`);
  const d = rigDefaults(rig);
  const aim = { ...(target ? { target } : {}), ...(targets ? { targets } : {}), ...(props.aim ?? {}) };
  const type = props.body?.type ?? d.body.type; // a body that follows takes the target too
  const body = { ...(type !== 'fixed' && target ? { target } : {}), ...(props.body ?? {}) };
  return { id, type: 'VirtualCamera', ...(name ? { name } : {}), ...(p ? { transform: { p: [...p] } } : {}), props: { ...props, rig, ...(Object.keys(aim).length ? { aim } : {}), ...(Object.keys(body).length ? { body } : {}) } };
}

/**
 * Put a camera on a shot as one undo step.
 * @param {{ doc: any, setDoc?: any, run: (label: string, ops: any[]) => void }} session
 * @param {string} shotRef the shot's id or number
 * @param {string | any} camera an existing VirtualCamera's id (the sequence's or the set's), or a new VirtualCamera node
 *   to add with it (cameraOnRig makes one)
 * @returns {{ label: string, camera: string, shot: string, previous: string | null }}
 */
export function replaceShotCamera(session, shotRef, camera) {
  const doc = session.doc, seq = doc.sequence;
  if (!seq) throw new Error('this document has no sequence');
  const shot = findShot(seq, shotRef);
  const nodes = [...allNodes(session.setDoc ?? null), ...allNodes(doc)];
  const add = typeof camera === 'object' && camera ? structuredClone(camera) : null;
  const id = add ? add.id : camera;
  if (add) {
    if (add.type !== 'VirtualCamera') throw new Error('a new camera is a VirtualCamera node');
    if (!add.id || nodes.some((n) => n.id === add.id)) throw new Error(`a node "${add.id}" already exists; give the new camera an id of its own`);
  } else {
    const n = nodes.find((x) => x.id === id);
    if (!n) throw new Error(`no camera "${id}"`);
    if (n.type !== 'VirtualCamera') throw new Error(`"${id}" is a ${n.type}, not a VirtualCamera`);
  }
  const next = structuredClone(seq);
  let tracks = next.tracks.filter((t) => t.type === 'camera');
  if (!tracks.length) { const t = { id: 'cameras', type: 'camera', clips: [] }; next.tracks.unshift(t); tracks = [t]; }
  // the shot's camera clips: every clip that starts inside it (a shot cut at a move has more than one), and, when the
  // clip live at its start began before it, a clip laid over that one for the shot (clipAt takes the later start)
  let previous = null, same = true;
  for (const t of tracks) {
    t.clips ??= [];
    const live = clipAt(t, shot.start);
    if (t === tracks[0] || live) previous ??= live?.camera ?? null;
    const inside = t.clips.filter((c) => c.start >= shot.start && c.start < shot.end);
    for (const c of inside) { if (c.camera !== id) same = false; c.camera = id; }
    if (live && live.start < shot.start) {
      same = false;
      const end = Math.min(shot.end, ...inside.map((c) => c.start));
      t.clips.push({ start: shot.start, end, camera: id });
      t.clips.sort((a, b) => a.start - b.start);
    } else if (!live && !inside.length && t === tracks[0]) {
      same = false;
      t.clips.push({ start: shot.start, end: shot.end, camera: id });
      t.clips.sort((a, b) => a.start - b.start);
    }
  }
  if (same && !add && (shot.camera ?? id) === id) throw new Error(`shot ${shot.name ?? shot.id} already shows ${id}`);
  const ns = next.shots.find((s) => s.id === shot.id);
  if (ns.camera !== undefined) { previous ??= ns.camera; ns.camera = id; }
  if (session.setDoc) {
    const ids = new Set([...nodes.map((n) => n.id), ...(add ? [add.id] : [])]);
    const problems = checkSequence(next, { nodeIds: ids });
    if (problems.length) throw new Error(`camera for shot ${shot.name ?? shot.id}: ${problems.join('; ')}`);
  }
  const label = `Shot ${shot.name ?? shot.id}: camera ${id}`;
  session.run(label, [...(add ? [{ op: 'add', node: add }] : []), { op: 'setDoc', path: 'sequence', value: next }]);
  return { label, camera: id, shot: shot.id, previous };
}
