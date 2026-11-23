// The storyboard (M4 W8): what the creator's strip (W5) shows for each shot, as plain data. A frame to take the
// thumbnail at (the middle of the shot, after any blend into it), the camera and its rig, the people it films, whether
// the camera is a hand edit, and the 180° lint's verdict on the cut into it. Thumbnails themselves come from
// thumbnails.js (a render host), keyed by shot id and frame.
import { cameraSettings, subjectsOf, lintLine } from './lint.js';
import { allNodes } from './lint.js';

/** The frame a shot's thumbnail shows: its middle, or after the blend into it when that runs longer. */
export function thumbFrame(shot, clip = null) {
  const mid = shot.start + Math.floor((shot.end - shot.start) / 2);
  const blend = clip?.blend?.frames ?? 0;
  return Math.min(shot.end - 1, Math.max(mid, shot.start + blend));
}

/**
 * @param {any} doc a sequence document @param {{ set?: any, lint?: boolean }} [o]
 * @returns {{ fps: number, duration: number, shots: { id: string, name: string, start: number, end: number, frame: number, camera: string | null, rig: string | null, subjects: string[], beat: string | null, hand: boolean, crossesLine: string | null }[] }}
 */
export function storyboard(doc, { set = null, lint = true } = {}) {
  const seq = doc.sequence ?? {};
  const byId = new Map([...allNodes(set), ...allNodes(doc)].map((n) => [n.id, n]));
  const cams = (seq.tracks ?? []).find((t) => t.type === 'camera');
  const issues = lint ? lintLine(doc, { set }).issues : [];
  const shots = [...(seq.shots ?? [])].sort((a, b) => a.start - b.start).map((s) => {
    const clip = (cams?.clips ?? []).find((c) => c.start === s.start) ?? (cams?.clips ?? []).find((c) => s.start >= c.start && s.start < c.end) ?? null;
    const camera = clip?.camera ?? s.camera ?? null, node = camera ? byId.get(camera) : null;
    const cross = issues.find((x) => x.frame === s.start);
    return {
      id: s.id, name: s.name ?? s.id, start: s.start, end: s.end, frame: thumbFrame(s, clip), camera,
      rig: node ? node.props?.rig ?? 'fixed' : null, lens: node ? cameraSettings(node).lens.focalLength ?? null : null,
      subjects: node ? subjectsOf(node) : [], beat: typeof s.src === 'string' ? s.src.split('#')[0] : null,
      hand: !!(clip?.hand || s.hand), crossesLine: cross ? cross.message : null,
    };
  });
  return { fps: seq.fps ?? 24, duration: seq.duration ?? 0, shots };
}
