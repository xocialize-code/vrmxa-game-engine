// Panels you resize and fold, whose sizes an app remembers (M5 W6, AB-T-0607 item 2), as plain functions: the editor's
// Scene, Inspector, Assets and Timeline panels (the creator can use the same with its own names). A layout is plain
// JSON, { <panel>: { size, collapsed } }, kept in the app's settings (the Mac shell's settings.*; localStorage in a
// browser). What comes back from storage is checked: an unknown panel, a size out of range or a broken value falls back
// to the default, so a bad settings file can't hide a panel for good.

/** The editor's panels: their default size in CSS pixels, their range, and the side they resize from. */
export const EDITOR_PANELS = {
  scene: { size: 280, min: 160, max: 640, axis: 'x', label: 'Scene' },
  inspector: { size: 300, min: 220, max: 720, axis: 'x', label: 'Inspector' },
  assets: { size: 200, min: 96, max: 560, axis: 'y', label: 'Assets' },
  timeline: { size: 300, min: 160, max: 720, axis: 'y', label: 'Timeline' },
};
/** A folded panel's size: a rail with its name and an Expand button. */
export const FOLDED = 28;
/** One arrow-key press on a splitter, and with Shift. */
export const KEY_STEP = 16, KEY_STEP_BIG = 64;

/** The default layout. */
export function defaultLayout(panels = EDITOR_PANELS) {
  return Object.fromEntries(Object.entries(panels).map(([k, p]) => [k, { size: p.size, collapsed: false }]));
}

/** A size within the panel's range, in whole pixels. */
export function clampSize(panel, size) {
  const n = Math.round(Number(size));
  return Number.isFinite(n) ? Math.min(panel.max, Math.max(panel.min, n)) : panel.size;
}

/**
 * A layout from storage (JSON text, an object, or nothing), every panel checked: unknown keys dropped, sizes clamped,
 * missing or broken ones the default.
 */
export function readLayout(saved, panels = EDITOR_PANELS) {
  let v = saved;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const out = defaultLayout(panels);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, p] of Object.entries(panels)) {
    const s = v[k];
    if (!s || typeof s !== 'object') continue;
    if (typeof s.size === 'number' && Number.isFinite(s.size)) out[k].size = clampSize(p, s.size);
    if (typeof s.collapsed === 'boolean') out[k].collapsed = s.collapsed;
  }
  return out;
}

/** A panel resized to `size` (unfolded). → a new layout */
export function resize(layout, name, size, panels = EDITOR_PANELS) {
  const p = panels[name];
  if (!p) throw new Error(`no panel "${name}"`);
  return { ...layout, [name]: { size: clampSize(p, size), collapsed: false } };
}

/** A panel folded or unfolded (its size kept for when it opens again). → a new layout */
export function toggle(layout, name, collapsed = !layout[name]?.collapsed) {
  if (!layout[name]) throw new Error(`no panel "${name}"`);
  return { ...layout, [name]: { ...layout[name], collapsed } };
}

/**
 * A splitter's key: ←/→ (or ↑/↓) by KEY_STEP, Shift for KEY_STEP_BIG, Home / End to the range's ends, Enter folds or
 * unfolds. `grows`: the key direction that makes the panel larger (a right-hand panel grows to the left). → a new layout,
 * or null for a key that isn't the splitter's
 * @param {any} layout @param {string} name @param {{ key: string, shiftKey?: boolean }} e @param {1 | -1} grows
 */
export function splitterKey(layout, name, e, grows = 1, panels = EDITOR_PANELS) {
  const p = panels[name], cur = layout[name];
  const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
  const along = p.axis === 'x' ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
  if (e.key in along) return resize(layout, name, cur.size + along[e.key] * grows * step, panels);
  if (e.key === 'Home') return resize(layout, name, p.min, panels);
  if (e.key === 'End') return resize(layout, name, p.max, panels);
  if (e.key === 'Enter') return toggle(layout, name);
  return null;
}

/** A panel's size as drawn: its own, or the fold's rail. */
export const shownSize = (layout, name) => (layout[name]?.collapsed ? FOLDED : layout[name]?.size);

/** The layout as stored (only the panels' own keys). */
export const writeLayout = (layout, panels = EDITOR_PANELS) => JSON.stringify(Object.fromEntries(Object.keys(panels).map((k) => [k, { size: layout[k].size, collapsed: layout[k].collapsed }])));
