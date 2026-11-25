// What the timeline panel decides, as plain functions (M4 W5, moved out of the editor's Timeline.vue): which command an
// edit becomes, the clip a form adds, an item's accessible label. The component only wires pointer and key events to
// these, so Node tests can check every command it can emit without a DOM.
import { CLIP_TRACKS, CHANNEL_TRACKS } from '@vrmxg/editor-core';

/** Track types whose tracks name a target node. */
export const TARGET_TRACKS = new Set(['animation', 'expression', 'dialogue', 'lookAt', 'property', 'transform']);
/** The track types the side panel offers, in its order. */
export const TRACK_TYPES = Object.freeze(['camera', 'animation', 'expression', 'dialogue', 'lookAt', 'property', 'event', 'audio', 'post', 'simulation']);
/** Eases a key may take ('' is the track's default, linear). */
export const EASES = Object.freeze(['', 'linear', 'easeIn', 'easeOut', 'easeInOut', 'step']);

export const needsTarget = (type) => TARGET_TRACKS.has(type);

/** A key's value or a clip's text as typed: JSON when it parses, else the text itself. */
export function parseValue(v) { try { return JSON.parse(v); } catch { return v; } }

/** "Key happy at 96", "Shot Shot 3 96 to 144", "Clip shot-cam 96 to 144": what accessibility and scenarios read. */
export function itemLabel(item) {
  return item.kind === 'key' ? `Key ${item.label ? `${item.label} ` : ''}at ${item.start}` : `${item.kind === 'shot' ? 'Shot' : 'Clip'} ${item.label} ${item.start} to ${item.end}`;
}

/** The selection an item makes: { row, kind, index, channel, id }. */
export function selectionOf(row, item) { return { row: row.id, kind: item.kind, index: item.index, channel: item.channel ?? null, id: item.id }; }

/** Whether an item is the selection. */
export function isSelected(sel, row, item) {
  return !!sel && sel.row === row.id && sel.kind === item.kind && (item.kind === 'shot' ? sel.id === item.id : sel.index === item.index && (sel.channel ?? null) === (item.channel ?? null));
}

/**
 * The command a move or trim commits, or null when nothing changed: ['moveKey', track, index, frame, { channel }],
 * ['moveShot', id, span] or ['moveClip', track, index, span]. `mode` 'start' / 'end' trims one edge.
 */
export function moveCommand(row, item, start, end, mode = 'move') {
  if (item.kind === 'key') return start !== item.start ? ['moveKey', row.id, item.index, start, { channel: item.channel ?? null }] : null;
  const span = mode === 'start' ? { start } : mode === 'end' ? { end } : { start, end };
  if (span.start === item.start && (span.end === undefined || span.end === item.end)) return null;
  return item.kind === 'shot' ? ['moveShot', item.id, span] : ['moveClip', row.id, item.index, span];
}

/** The command that deletes the selection, or null. */
export function removeCommand(sel) {
  if (!sel) return null;
  if (sel.kind === 'shot') return ['removeShot', sel.id];
  if (sel.kind === 'clip') return ['removeClip', sel.row, sel.index];
  if (sel.kind === 'key') return ['removeKey', sel.row, sel.index, { channel: sel.channel }];
  return null;
}

/** The command a field of the selection panel commits (start, end, frame are numbers; value is parsed; the rest as typed). */
export function fieldCommand(sel, field, raw) {
  if (!sel) return null;
  const num = ['start', 'end', 'frame'].includes(field), v = num ? Number(raw) : raw;
  if (sel.kind === 'shot') return num ? ['moveShot', sel.id, { [field]: v }] : ['setShot', sel.id, { [field]: v }];
  if (sel.kind === 'clip') return num ? ['moveClip', sel.row, sel.index, { [field]: v }] : ['setClip', sel.row, sel.index, { [field]: v }];
  if (sel.kind === 'key') {
    if (field === 'frame') return ['moveKey', sel.row, sel.index, v, { channel: sel.channel }];
    if (field === 'value') return ['setKey', sel.row, sel.index, { value: parseValue(raw) }, { channel: sel.channel }];
    if (field === 'ease') return ['setKey', sel.row, sel.index, { ease: raw || null }, { channel: sel.channel }];
  }
  return null;
}

/** The track the form adds: { type, target?, path? }. */
export function trackSpec(form) {
  const t = { type: form.type };
  if (needsTarget(form.type)) t.target = form.target;
  if (form.type === 'property') t.path = form.path;
  return t;
}

/**
 * The clip the form adds to a track at the playhead, or null for a keyed track. The value field doubles as the slot,
 * line, or audio file ('1', its default, means the type's own default).
 * @param {{ type: string, target?: string }} track
 * @param {{ value: string, clipLen: number | string, camera: string }} form
 * @param {number} playhead @param {string[]} characters
 */
export function clipSpec(track, form, playhead, characters = []) {
  if (!CLIP_TRACKS.has(track.type)) return null;
  const c = /** @type {any} */ ({ start: playhead, end: playhead + Number(form.clipLen) });
  const v = String(form.value);
  if (track.type === 'camera') c.camera = form.camera;
  if (track.type === 'animation') { c.slot = v === '1' ? 'talk' : v; c.blendIn = 6; c.blendOut = 6; }
  if (track.type === 'dialogue') c.text = v === '1' ? 'Hello!' : v;
  if (track.type === 'lookAt') c.at = form.camera === 'camera' ? 'camera' : (characters.find((x) => x !== track.target) ?? 'camera');
  if (track.type === 'simulation') c.mode = 'live';
  if (track.type === 'audio') c.asset = v;
  return c;
}

/** The key the form adds to a keyed track at the playhead: ['addKey', track, frame, value, { channel }?], or null. */
export function keyCommand(track, form, playhead) {
  if (!track || CLIP_TRACKS.has(track.type)) return null;
  return ['addKey', track.id, playhead, parseValue(form.value), CHANNEL_TRACKS.has(track.type) ? { channel: form.channel } : {}];
}

/** The command an arrow key nudges the selected item by (⇧: 10 frames), or null. */
export function nudgeCommand(row, item, dir, shift = false) {
  const by = dir * (shift ? 10 : 1);
  return moveCommand(row, item, Math.max(0, item.start + by), item.end !== undefined ? Math.max(1, item.end + by) : undefined);
}

/**
 * What a key does on the timeline (its window-level listener), as a plain function: 'play' (Space), 'scrub' with `dir`
 * (← → with nothing selected), 'nudge' with `dir` (← → with an item selected), 'remove' (Delete, Backspace), 'clear'
 * (Escape), or null. It doesn't look at `defaultPrevented`: the editor's own window listener runs first and takes Delete
 * for the scene too, and the timeline's Delete must still remove its item (the M5 W6 review); a panel edge's arrows stop
 * at the edge instead (stopPropagation).
 * @param {{ key: string, metaKey?: boolean, ctrlKey?: boolean }} e
 * @param {{ active: boolean, typing?: boolean, selected?: boolean }} s active: a sequence is shown and the timeline is enabled
 * @returns {{ action: string, dir?: -1 | 1 } | null}
 */
export function timelineKey(e, { active, typing = false, selected = false }) {
  if (!active || typing || e.metaKey || e.ctrlKey) return null;
  if (e.key === ' ') return { action: 'play' };
  const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
  if (!selected) return dir ? { action: 'scrub', dir } : null;
  if (dir) return { action: 'nudge', dir };
  if (e.key === 'Delete' || e.key === 'Backspace') return { action: 'remove' };
  if (e.key === 'Escape') return { action: 'clear' };
  return null;
}
