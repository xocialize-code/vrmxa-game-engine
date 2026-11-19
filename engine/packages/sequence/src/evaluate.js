// Sequence tracks beyond @vrmxg/tracks' (research/cinematics.md §1.1), evaluated as pure functions of the frame:
//   camera      clips [{ start, end, camera, blend? }]: which VirtualCamera is live (a CameraBrain's override), and the
//               blend into it ({ frames } or { style, seconds })
//   lookAt      target (a Character); clips [{ start, end, at }]: who or what it looks at ("hana-1", "camera")
//   dialogue    target; clips [{ start, end, clip?, text }]: a voice line (audio, visemes from its timings, a subtitle)
//   post        keys { "anime.speedLines": [[frame, value, ease?], …], … }: the post stack's values (presentation)
//   simulation  clips [{ start, end, mode: live | baked }]: spans the player replays from a pose cache instead of stepping
//   decisions   target (a Character with a brain); keys [[frame, event]]: @vrmxg/ai injected events (a director's
//               requests and decisions, recorded in a take: M3 W4), injected on the step the sequence crosses the frame
//   input       recording (an @vrmxg/input recording): the player's input, replayed from the sequence's first step
// Shots: [{ id, name, start, end, camera?, overrides? }] with overrides { nodeId: { transform?, props? } } applied while
// the shot is live (anime cheats continuity); markers [{ frame, name }].
import { sampleKeys, checkTrack, TRACK_TYPES } from '@vrmxg/tracks';

export const SEQUENCE_TRACK_TYPES = [...TRACK_TYPES, 'camera', 'lookAt', 'dialogue', 'post', 'simulation', 'decisions', 'input'];

/** The clip covering a frame (the latest-starting one when clips overlap), or null. */
export function clipAt(track, frame) {
  let best = null;
  for (const c of track.clips ?? []) if (frame >= c.start && frame < c.end && (!best || c.start >= best.start)) best = c;
  return best;
}

/** The shot live at a frame, or null. */
export function shotAt(seq, frame) { return (seq.shots ?? []).find((s) => frame >= s.start && frame < s.end) ?? null; }

/** The post values a post track gives at a frame: { "anime.speedLines": 0.8, … }. */
export function samplePost(track, frame) {
  return Object.fromEntries(Object.entries(track.keys ?? {}).map(([path, keys]) => [path, sampleKeys(keys, frame, { interp: track.interp })]));
}

/** Dialogue clips that start in (from, to]: the lines playback starts when it moves from frame `from` to `to`. */
export function linesBetween(track, from, to) { return (track.clips ?? []).filter((c) => c.start > from && c.start <= to); }

/** Problems with a sequence block (and its tracks), as messages. */
export function checkSequence(seq, { nodeIds = null } = {}) {
  const out = [];
  if (!(seq.fps > 0)) out.push(`sequence: fps must be positive (${seq.fps})`);
  if (!(seq.duration > 0)) out.push(`sequence: duration (frames) must be positive (${seq.duration})`);
  const shots = [...(seq.shots ?? [])].sort((a, b) => a.start - b.start);
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (!(s.end > s.start)) out.push(`shot ${s.id}: ends before it starts (${s.start} → ${s.end})`);
    if (i > 0 && s.start < shots[i - 1].end) out.push(`shot ${s.id} overlaps shot ${shots[i - 1].id}`);
    for (const id of Object.keys(s.overrides ?? {})) if (nodeIds && !nodeIds.has(id)) out.push(`shot ${s.id}: override of "${id}", which isn't in the scene`);
  }
  for (const t of seq.tracks ?? []) {
    const id = t.id ?? '(track)';
    if (!SEQUENCE_TRACK_TYPES.includes(t.type)) { out.push(`${id}: unknown type "${t.type}" (${SEQUENCE_TRACK_TYPES.join(', ')})`); continue; }
    if (TRACK_TYPES.includes(t.type)) out.push(...checkTrack(t));
    if (['lookAt', 'dialogue', 'decisions'].includes(t.type) && !t.target) out.push(`${id}: a ${t.type} track needs a target`);
    if (t.type === 'decisions') for (const k of t.keys ?? []) if (!Array.isArray(k) || !(k[0] >= 0) || typeof k[1] !== 'object' || !(k[1].goal || k[1].action || k[1].actions?.length || k[1].bb)) out.push(`${id}: a decisions key is [frame, { goal | action | actions | bb, … }]`);
    if (t.type === 'input' && !Array.isArray(t.recording?.frames)) out.push(`${id}: an input track holds an input recording ({ frames, … })`);
    for (const c of t.clips ?? []) {
      if (!(c.end > c.start) && !TRACK_TYPES.includes(t.type)) out.push(`${id}: a clip must end after it starts (${c.start} → ${c.end})`);
      if (t.type === 'camera' && !c.camera) out.push(`${id}: a camera clip names a camera`);
      if (t.type === 'camera' && nodeIds && c.camera && !nodeIds.has(c.camera)) out.push(`${id}: camera "${c.camera}" isn't in the scene`);
      if (t.type === 'dialogue' && !c.clip && !c.text) out.push(`${id}: a dialogue clip needs a clip or text`);
      if (t.type === 'simulation' && !['live', 'baked'].includes(c.mode)) out.push(`${id}: simulation mode is live or baked`);
    }
    if (t.target && nodeIds && !nodeIds.has(t.target)) out.push(`${id}: target "${t.target}" isn't in the scene`);
  }
  return out;
}

const tc = (frame, fps) => {
  const ms = Math.round((frame / fps) * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, f = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(f, 3)}`;
};

/** SRT subtitles from the dialogue tracks (speaker names from `names`, node id → name). */
export function subtitles(seq, names = {}) {
  const lines = (seq.tracks ?? []).filter((t) => t.type === 'dialogue').flatMap((t) => (t.clips ?? []).filter((c) => c.text).map((c) => ({ ...c, who: names[t.target] ?? t.target })));
  lines.sort((a, b) => a.start - b.start);
  return lines.map((l, i) => `${i + 1}\n${tc(l.start, seq.fps)} --> ${tc(l.end, seq.fps)}\n${l.who ? `${l.who}: ` : ''}${l.text}\n`).join('\n');
}
