// What the storyboard strip and the render queue panel show (M4 W5), as plain functions over plain data: the strip's
// cards from @vrmxg/coverage's storyboard() and the thumbnails rendered for it, and a job's one-line status.
import { timecode, PRESETS, resolveCheck } from '@vrmxg/editor-core';

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
      const d = r.delivery, odd = r.check?.odd?.length;
      const disk = !d?.missing ? '' : d.missing.length ? ` · missing on disk: ${d.missing.join(', ')}` : ` · ${d.files} files on disk`;
      const extras = d ? ` · ${d.stills} stills · ${d.thumbnails} thumbnails · ${d.turntables} turntable${d.turntables === 1 ? '' : 's'}${disk}` : '';
      const checked = r.check ? ` · redraw check: ${odd ? `${odd} odd draw${odd === 1 ? '' : 's'} outvoted` : 'every frame twice the same'}` : '';
      const what = r.stub ? `${r.frames} frames counted, nothing rendered (stub)` : `${r.frames ?? '?'} frames${r.name ? ` · ${r.name}` : ''}${r.hashesDigest ? ` · frames ${r.hashesDigest}` : ''}${extras}${checked}`;
      return `done: ${what}${job.lateCancel ? ' (Cancel came after the file was finished)' : ''}`;
    }
    case 'failed': return `failed: ${job.error ?? 'unknown error'}`;
    case 'cancelled': return 'cancelled';
    default: return job.state;
  }
}

/**
 * Whether the queue form's redraw check is ticked: as the person ticked it, or (`check: null`, untouched since the preset
 * or backend changed) the preset's default on the backend the job will draw on: on for a delivery drawn on WebGPU
 * (AB-D-0280), off otherwise. `viewBackend`: the view's, for a job that draws on the view's.
 * @param {{ preset: string, backend: string, check: boolean | null }} form @param {string} [viewBackend]
 */
export function checkTicked(form, viewBackend = 'webgpu') {
  if (form.check !== null && form.check !== undefined) return !!form.check;
  return !!resolveCheck({ check: PRESETS[form.preset]?.check ?? null }, form.backend || viewBackend);
}

/**
 * What the queue panel's form asks the app to queue (M4 W10): the preset and name, the backend (null: the view's), the
 * redraw check as the box shows it (checkTicked), and for a delivery preset the extras as ticked. Plain, so it is
 * tested in Node.
 * @param {{ preset: string, name: string, backend: string, check: boolean | null, stills: boolean, thumbnails: boolean, turntable: boolean }} form
 * @param {string} [viewBackend]
 */
export function queueSpec(form, viewBackend = 'webgpu') {
  const delivery = !!PRESETS[form.preset]?.delivery;
  return {
    preset: form.preset, name: form.name.trim() || null, backend: form.backend || null, check: checkTicked(form, viewBackend) ? 'redraw' : null,
    ...(delivery ? { extras: { stills: !!form.stills, thumbnails: !!form.thumbnails, turntable: !!form.turntable } } : {}),
  };
}
