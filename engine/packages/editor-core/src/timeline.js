// The timeline's model (M2 W5), with no UI: one geometry that the ruler, the track headers and the lanes all read, the
// adaptive ruler ticks, snapping, and the rows a sequence shows. As DesignScaffoldTimeline does it: panning and zooming
// write one value, so the three surfaces can't drift apart, and the snap threshold is in pixels, converted to frames at
// the current zoom, so snapping feels the same at every zoom (research/cinematics.md §1.1).

export const SNAP_PX = 8;
const TICK_STEPS = [1, 2, 3, 6, 12, 24, 48, 72, 120, 240, 480, 720, 1440, 2880];

export class TimelineGeometry {
  /** @param {{ pxPerFrame?: number, visibleStart?: number }} [o] visibleStart in frames (never negative) */
  constructor({ pxPerFrame = 6, visibleStart = 0 } = {}) { this.pxPerFrame = pxPerFrame; this.visibleStart = Math.max(0, visibleStart); }
  /** x in the lanes (px from their left edge) of a frame. */
  x(frame) { return (frame - this.visibleStart) * this.pxPerFrame; }
  /** The frame at an x. */
  frameAt(x) { return this.visibleStart + x / this.pxPerFrame; }
  /** A pixel distance in frames (the snap threshold, a drag). */
  frames(px) { return px / this.pxPerFrame; }
  /** Zoom to a scale keeping `anchor` (a frame) where it is on screen. Clamped to 0.25–64 px a frame. */
  zoom(pxPerFrame, anchor = this.visibleStart) {
    const ax = this.x(anchor);
    this.pxPerFrame = Math.min(64, Math.max(0.25, pxPerFrame));
    this.visibleStart = Math.max(0, anchor - ax / this.pxPerFrame);
    return this;
  }
  scroll(toFrame) { this.visibleStart = Math.max(0, toFrame); return this; }
  /** Frames visible in a width. */
  visible(width) { return [this.visibleStart, this.frameAt(width)]; }
  /**
   * Ruler ticks across a width: the smallest step (in frames) at least `minPx` apart; majors every second (or every
   * step, when the step is a second or more), labelled with timecode.
   */
  ticks(width, fps, minPx = 56) {
    const step = TICK_STEPS.find((s) => s * this.pxPerFrame >= minPx) ?? TICK_STEPS.at(-1);
    const major = step >= fps ? step : Math.max(step, Math.round(fps));
    const [a, b] = this.visible(width), out = [];
    for (let f = Math.ceil(a / step) * step; f <= b; f += step) out.push({ frame: f, x: this.x(f), major: f % major === 0, label: f % major === 0 ? timecode(f, fps) : '' });
    return { step, ticks: out };
  }
}

/** "m:ss:ff" (or "s:ff" under a minute) for a frame at fps. */
export function timecode(frame, fps) {
  const f = Math.round(frame), whole = Math.round(fps), s = Math.floor(f / whole), ff = String(f % whole).padStart(2, '0');
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}:${ff}` : `${s}:${ff}`;
}

/** Track types whose items are clips (spans); the rest are keys. */
export const CLIP_TRACKS = new Set(['camera', 'lookAt', 'dialogue', 'audio', 'animation', 'simulation']);
/** Track types whose keys are per channel ({ name: keys }). */
export const CHANNEL_TRACKS = new Set(['expression', 'post']);

/** The keys of a keyed track, flattened: [{ frame, value, ease, index, channel }]. */
export function keysOf(track) {
  if (CHANNEL_TRACKS.has(track.type)) return Object.entries(track.keys ?? {}).flatMap(([channel, ks]) => ks.map((k, index) => ({ frame: k[0], value: k[1], ease: k[2], index, channel })));
  return (track.keys ?? []).map((k, index) => ({ frame: k[0], value: k[1], ease: k[2], index, channel: null }));
}

/** A short label for a clip in a lane. */
export function clipLabel(track, c) {
  switch (track.type) {
    case 'camera': return c.camera ?? '?';
    case 'lookAt': return `→ ${c.at ?? '?'}`;
    case 'dialogue': return c.text ?? c.clip ?? '';
    case 'audio': return (c.asset ?? '').split('/').pop();
    case 'animation': return c.slot ?? c.clip ?? '';
    case 'simulation': return c.mode ?? 'live';
    default: return '';
  }
}

/**
 * The rows a sequence shows, top to bottom: the shots, then each track. Items carry what the lanes draw and what a drag
 * edits: { kind: 'shot' | 'clip' | 'key', key (a stable id for the UI), start, end?, index, channel?, label }.
 */
export function rowsOf(seq) {
  const rows = [{ id: 'shots', kind: 'shots', type: 'shots', label: 'Shots', items: (seq.shots ?? []).map((s, index) => ({ kind: 'shot', key: `shot:${s.id}`, id: s.id, index, start: s.start, end: s.end, label: s.name ?? s.id })) }];
  for (const t of seq.tracks ?? []) {
    const label = t.target ? `${t.id} · ${t.target}` : t.id;
    if (CLIP_TRACKS.has(t.type)) rows.push({ id: t.id, kind: 'clips', type: t.type, label, items: (t.clips ?? []).map((c, index) => ({ kind: 'clip', key: `${t.id}:c${index}`, index, start: c.start, end: c.end, label: clipLabel(t, c) })) });
    else rows.push({ id: t.id, kind: 'keys', type: t.type, label, items: keysOf(t).map((k) => ({ kind: 'key', key: `${t.id}:${k.channel ?? ''}:${k.index}`, index: k.index, channel: k.channel, start: k.frame, label: k.channel ?? '' })) });
  }
  return rows;
}

/**
 * Frames a drag can snap to: frame 0 and the end, markers, shot edges, keys and clip edges of every track, the playhead.
 * `except` leaves out the item being dragged ({ track, index, channel } or { shot }).
 */
export function snapTargets(seq, { except = null, playhead = null } = {}) {
  const out = new Set([0, seq.duration ?? 0]);
  if (playhead !== null) out.add(Math.round(playhead));
  for (const m of seq.markers ?? []) out.add(m.frame);
  for (const s of seq.shots ?? []) if (except?.shot !== s.id) { out.add(s.start); out.add(s.end); }
  for (const t of seq.tracks ?? []) {
    if (CLIP_TRACKS.has(t.type)) (t.clips ?? []).forEach((c, i) => { if (!(except?.track === t.id && except.index === i)) { out.add(c.start); out.add(c.end); } });
    else for (const k of keysOf(t)) if (!(except?.track === t.id && except.index === k.index && (except.channel ?? null) === k.channel)) out.add(k.frame);
  }
  return [...out].sort((a, b) => a - b);
}

/** Snap a frame: to the nearest target within `tolerance` frames, else to the whole frame. → { frame, snapped } */
export function snapFrame(frame, targets, tolerance) {
  let best = null;
  for (const t of targets) if (Math.abs(t - frame) <= tolerance && (best === null || Math.abs(t - frame) < Math.abs(best - frame))) best = t;
  return best !== null ? { frame: best, snapped: true } : { frame: Math.max(0, Math.round(frame)), snapped: false };
}
