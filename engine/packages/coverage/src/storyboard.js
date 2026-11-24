// The storyboard (M4 W8): what the creator's strip (W5) shows for each shot, as plain data. A frame to take the
// thumbnail at (the middle of the shot, after any blend into it), the camera and its rig, the people it films, whether
// the camera is a hand edit, and the 180° lint's verdict on the cut into it. Thumbnails themselves come from
// thumbnails.js (a render host), keyed by shot id and frame.
import { clipAt } from '@vrmxg/sequence';
import { cameraSettings, subjectsOf, lintLine, allNodes } from './lint.js';

/** The frame a shot's thumbnail shows: its middle, or after the blend into it when that runs longer. */
export function thumbFrame(shot, clip = null) {
  const mid = shot.start + Math.floor((shot.end - shot.start) / 2);
  const blend = clip?.blend?.frames ?? 0;
  return Math.min(shot.end - 1, Math.max(mid, shot.start + blend));
}

/**
 * @param {any} doc a sequence document @param {{ set?: any, lint?: boolean, blockers?: any[] | null }} [o]
 *   Each shot's camera is the one live on its thumbnail's frame; `cameras` lists every camera live in it, in order (a
 *   shot cut at a move has two); `crossesLine` is the lint's message for a cut into or inside it. With `blockers` (the
 *   set's solid boxes), `inGeometry` is the lint's message for a camera of the shot standing in or behind them.
 * @returns {{ fps: number, duration: number, shots: { id: string, name: string, start: number, end: number, frame: number, camera: string | null, cameras: string[], rig: string | null, lens: number | null, subjects: string[], beat: string | null, hand: boolean, crossesLine: string | null }[] }}
 */
export function storyboard(doc, { set = null, lint = true, blockers = null } = {}) {
  const seq = doc.sequence ?? {};
  const byId = new Map([...allNodes(set), ...allNodes(doc)].map((n) => [n.id, n]));
  const cams = (seq.tracks ?? []).find((t) => t.type === 'camera');
  const all = lint ? lintLine(doc, { set, blockers }).issues : [];
  const issues = all.filter((x) => x.kind !== 'geometry'), inGeometry = all.filter((x) => x.kind === 'geometry');
  const shots = [...(seq.shots ?? [])].sort((a, b) => a.start - b.start).map((s) => {
    const first = cams ? clipAt(cams, s.start) : null, frame = thumbFrame(s, first);
    const clip = cams ? clipAt(cams, frame) ?? first : null;
    const live = cams ? [...new Set([s.start, ...(cams.clips ?? []).filter((c) => c.start > s.start && c.start < s.end).map((c) => c.start)])].sort((a, b) => a - b).map((f) => clipAt(cams, f)?.camera).filter(Boolean) : [];
    const camera = clip?.camera ?? s.camera ?? null, node = camera ? byId.get(camera) : null;
    const cross = issues.find((x) => x.frame >= s.start && x.frame < s.end);
    const stuck = inGeometry.find((x) => x.frame >= s.start && x.frame < s.end);
    return {
      id: s.id, name: s.name ?? s.id, start: s.start, end: s.end, frame, camera, cameras: live.length ? live.filter((c, i) => c !== live[i - 1]) : camera ? [camera] : [],
      rig: node ? node.props?.rig ?? 'fixed' : null, lens: node ? cameraSettings(node).lens.focalLength ?? null : null,
      subjects: node ? subjectsOf(node) : [], beat: typeof s.src === 'string' ? s.src.split('#')[0] : null,
      hand: !!(first?.hand || clip?.hand || s.hand), crossesLine: cross ? cross.message : null,
      ...(blockers ? { inGeometry: stuck ? stuck.message : null } : {}),
    };
  });
  return { fps: seq.fps ?? 24, duration: seq.duration ?? 0, shots };
}
