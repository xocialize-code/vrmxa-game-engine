// Per-field copy and paste in the inspector (M5 W6, AB-T-0607 item 4), as plain functions: a field's value (or a whole
// transform) copied as a typed clip, and pasted only into a field of the same type. The type of a field is its widget
// and the shape of its schema: a vector of three numbers pastes into another vector of three (a position into a
// collider's size), a number into a number within its range, an enum value into an enum that has it; a list, struct or
// map only into a field with the same schema.
import { widgetOf } from './fields.js';

/** A field's type, as copy and paste compare it. @param {{ schema?: any, meta?: any, widget?: string, value?: any, default?: any }} f */
export function fieldType(f) {
  const widget = f.widget ?? widgetOf(f.schema, f.meta, f.value ?? f.default);
  const s = f.schema ?? {};
  if (widget === 'vec') return `vec${s.minItems ?? (Array.isArray(f.value ?? f.default) ? (f.value ?? f.default).length : 3)}`;
  if (widget === 'number' || widget === 'boolean' || widget === 'string' || widget === 'color' || widget === 'node' || widget === 'asset' || widget === 'enum') return widget;
  return `schema:${JSON.stringify(s)}`;
}

/** A clip of one field's value (what it shows: its value, or its default). */
export function copyField(f) {
  const value = f.value !== undefined ? f.value : f.default;
  return { kind: 'field', type: fieldType(f), key: f.key, value: structuredClone(value) };
}

/** A clip of a transform: position, rotation in degrees (YXZ), scale. @param {{ p: number[], r: number[], s: number[] }} t */
export function copyTransform(t) {
  return { kind: 'transform', p: [...t.p], r: [...t.r], s: [...t.s] };
}

/** A clip of one transform part (Position, Rotation, Scale): a vector of three. */
export function copyPart(part, v) { return { kind: 'field', type: 'vec3', key: part, part, value: [...v] }; }

/**
 * May this clip paste into this field? → { ok: true, value } or { ok: false, reason }
 * @param {any} clip @param {{ kind?: 'field' | 'transform' | 'part', schema?: any, meta?: any, widget?: string, value?: any, default?: any, enum?: any[], min?: number, max?: number, integer?: boolean, nodes?: string[] }} f
 */
export function pasteVerdict(clip, f) {
  if (!clip) return { ok: false, reason: 'nothing copied' };
  if (f.kind === 'transform') return clip.kind === 'transform' ? { ok: true, value: clip } : { ok: false, reason: 'a whole transform pastes only into a transform' };
  if (clip.kind !== 'field') return { ok: false, reason: 'a transform pastes into a transform' };
  const type = f.kind === 'part' ? 'vec3' : fieldType(f);
  if (type !== clip.type) return { ok: false, reason: `a ${clip.type} doesn't paste into a ${type}` };
  const v = clip.value;
  if (type === 'number' && typeof v === 'number') {
    if (f.integer && !Number.isInteger(v)) return { ok: false, reason: 'not a whole number' };
    if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) return { ok: false, reason: `out of range (${f.min ?? '…'} to ${f.max ?? '…'})` };
  }
  if (type === 'enum' && !(f.enum ?? f.schema?.enum ?? []).includes(v)) return { ok: false, reason: `"${v}" isn't one of its values` };
  if (type === 'node' && f.nodes && v !== undefined && !f.nodes.includes(v)) return { ok: false, reason: `no node "${v}" here` };
  return { ok: true, value: structuredClone(v) };
}
