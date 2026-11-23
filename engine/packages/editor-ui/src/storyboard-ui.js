// What the storyboard strip and the render queue panel show (M4 W5), as plain functions over plain data: the strip's
// cards from @vrmxg/coverage's storyboard() and the thumbnails rendered for it, and a job's one-line status.
import { timecode } from '@vrmxg/editor-core';

/**
 * The strip's cards, one per shot in film order.
 * @param {{ fps: number, shots: { id: string, name: string, start: number, end: number, frame: number, camera: string | null, cameras?: string[], subjects?: string[], beat: string | null, hand?: boolean, crossesLine?: string | null }[] } | null} board
 *   storyboard()'s result
 * @param {{ thumbs?: Record<string, { url: string, frame: number }>, beats?: Record<string, { line: number, text: string }>, playhead?: number, selected?: string | null }} [o]
 *   thumbs: by shot id (a thumbnail drawn for another frame than the shot's is stale and not shown); beats: the script's
 *   beats by id (the line a shot came from); selected: a shot id
 */
export function storyCards(board, { thumbs = {}, beats = {}, playhead = -1, selected = null } = {}) {
  if (!board) return [];
  const fps = board.fps ?? 24;
  return board.shots.map((s) => {
    const t = thumbs[s.id], b = s.beat ? beats[s.beat] : null;
    const cams = s.cameras?.length ? s.cameras : s.camera ? [s.camera] : [];
    const notes = [s.hand ? 'hand edit' : '', s.crossesLine ? 'crosses the line' : ''].filter(Boolean);
    return {
      id: s.id, name: s.name, start: s.start, end: s.end, frame: s.frame,
      time: `${timecode(s.start, fps)}–${timecode(s.end, fps)}`, length: s.end - s.start,
      camera: cams.join(' → '), subjects: (s.subjects ?? []).join(', '),
      thumb: t && t.frame === s.frame ? t.url : null,
      line: b?.line ?? null, text: b?.text ?? '',
      hand: !!s.hand, crossesLine: s.crossesLine ?? null, notes,
      current: playhead >= s.start && playhead < s.end, selected: selected === s.id,
      label: `Shot ${s.name}, ${s.end - s.start} frames from ${s.start}, camera ${cams.join(' then ') || 'none'}${notes.length ? `, ${notes.join(', ')}` : ''}`,
    };
  });
}

/** A job's status line: "queued", "rendering 120 of 960", "done: 960 frames", "failed: …". */
export function jobStatus(job) {
  switch (job.state) {
    case 'queued': return 'queued';
    case 'running': return job.progress.total ? `rendering ${job.progress.n} of ${job.progress.total}${job.progress.phase ? ` (${job.progress.phase})` : ''}` : 'starting';
    case 'done': {
      const r = job.result ?? {};
      const what = r.stub ? `${r.frames} frames counted, nothing rendered (stub)` : `${r.frames ?? '?'} frames${r.name ? ` · ${r.name}` : ''}${r.hashesDigest ? ` · frames ${r.hashesDigest}` : ''}`;
      return `done: ${what}`;
    }
    case 'failed': return `failed: ${job.error ?? 'unknown error'}`;
    case 'cancelled': return 'cancelled';
    default: return job.state;
  }
}
