// The number field's decisions (AB-T-0600), with no Vue or DOM: typed arithmetic, clamping and rounding from the
// registry's min, max, step and precision, arrow-key steps and drags. NumberField.vue draws it.
//
// The drag and key behaviour follows the operator's vue-three-inspector NumberField (reference/vue-three-inspector:
// a 3 px threshold before a drag starts, a step per pixel, Enter commits, Escape restores, a comma as the decimal point).
// Changed in the port: arithmetic is this small parser, never `new Function`; Shift is the fine step (×0.1) and Alt the
// coarse one (×10), as the task asks; a drag is one undo step through the session's gesture, not a merge window in time.

/** Pixels a pointer moves before a press becomes a drag (a click focuses the field instead). */
export const DRAG_THRESHOLD = 3;

/**
 * Evaluate typed arithmetic: numbers, + - * / %, unary minus, parentheses ("1.5 * 2 + 0.25", "90/2", "-(3 - 1)").
 * A comma alone is the decimal point ("1,5"). → the value, or null when the text isn't arithmetic or isn't finite.
 * @param {string} text
 */
export function evalArithmetic(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  if (!s) return null;
  if (!s.includes('.')) s = s.replace(/,/g, '.');
  const toks = [];
  const re = /\s*(?:(\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([-+*/%()]))/iy;
  let at = 0;
  while (at < s.length) {
    if (/^\s+$/.test(s.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(s);
    if (!m) return null;
    at = re.lastIndex;
    toks.push(m[1] !== undefined ? { n: Number(m[1]) } : { op: m[2] });
  }
  let i = 0;
  const isOp = (o) => toks[i]?.op === o;
  function expr() { let v = term(); while (isOp('+') || isOp('-')) { const o = toks[i++].op; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  function term() { let v = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const o = toks[i++].op; const r = unary(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
  function unary() { if (isOp('-')) { i++; return -unary(); } if (isOp('+')) { i++; return unary(); } return atom(); }
  function atom() {
    const t = toks[i];
    if (!t) throw new Error('end');
    if (t.op === '(') { i++; const v = expr(); if (!isOp(')')) throw new Error(')'); i++; return v; }
    if (t.n === undefined) throw new Error('op');
    i++;
    return t.n;
  }
  try {
    const v = expr();
    if (i !== toks.length) return null;
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/** Round to `digits` decimals, without -0. */
export function roundTo(v, digits) {
  if (digits === undefined || digits === null) return v;
  const k = Math.pow(10, Math.max(0, Math.min(12, digits)));
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * A value as the prop may hold it: clamped to min and max, whole for an integer, rounded to the precision.
 * @param {number} v @param {{ min?: number, max?: number, integer?: boolean, precision?: number }} [o]
 */
export function constrain(v, { min, max, integer = false, precision } = {}) {
  let x = v;
  if (integer) x = Math.round(x);
  else x = roundTo(x, precision ?? 6);
  if (min !== undefined && min !== null && x < min) x = integer ? Math.ceil(min) : min;
  if (max !== undefined && max !== null && x > max) x = integer ? Math.floor(max) : max;
  return Object.is(x, -0) ? 0 : x;
}

/**
 * Typed text → the value to commit, or null to keep the old one (not a number, not finite).
 * @param {string} text @param {{ min?: number, max?: number, integer?: boolean, precision?: number }} [o]
 */
export function parseNumber(text, o = {}) {
  const v = evalArithmetic(text);
  return v === null ? null : constrain(v, o);
}

/** The step's multiplier for the keys held: Shift fine (×0.1), Alt coarse (×10). */
export const stepMultiplier = ({ shiftKey = false, altKey = false } = {}) => (shiftKey ? 0.1 : altKey ? 10 : 1);

/**
 * An arrow key's step from `v`: dir +1 (up) or -1 (down), `step` times the keys' multiplier.
 * @param {number} v @param {1 | -1} dir @param {{ step?: number, shiftKey?: boolean, altKey?: boolean, min?: number, max?: number, integer?: boolean, precision?: number }} o
 */
export function stepBy(v, dir, o = {}) {
  // a fine step below what the field shows still moves it: at least one unit of its last decimal
  const by = Math.max((o.step ?? 1) * stepMultiplier(o), o.precision !== undefined ? Math.pow(10, -o.precision) : 0);
  return constrain((v ?? 0) + dir * by, { ...o, precision: o.precision ?? decimals(by) });
}

/**
 * A drag's value: from where it started, `dx` pixels across, one `step` per pixel times the keys' multiplier.
 * @param {number} start @param {number} dx @param {{ step?: number, shiftKey?: boolean, altKey?: boolean, min?: number, max?: number, integer?: boolean, precision?: number }} o
 */
export function dragTo(start, dx, o = {}) {
  const step = o.step ?? 1;
  return constrain((start ?? 0) + dx * step * stepMultiplier(o), { ...o, precision: o.precision ?? decimals(step * stepMultiplier(o)) });
}

/** How many decimals a step has (0.05 → 2): a drag lands on its steps when the field gives no precision. A field's
 * precision wins, so what is stored is what it shows (a Shift drag of a 2-decimal field moves in hundredths). */
function decimals(step) {
  const s = String(roundTo(step, 10));
  return s.includes('e-') ? Number(s.split('e-')[1]) : (s.split('.')[1]?.length ?? 0);
}

/** A value for the field: at most `precision` decimals, trailing zeros dropped ("1.5", "2", "-0.125"). */
export function formatNumber(v, precision = 3) {
  if (v === undefined || v === null || !Number.isFinite(v)) return '';
  return String(roundTo(v, precision));
}

/** Where a value sits between min and max, 0 to 1 (null without both). */
export function fillOf(v, min, max) {
  if (min === undefined || max === undefined || min === null || max === null || !(max > min) || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}
