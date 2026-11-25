// Conditional props (AB-T-0602): `meta.visibleIf` and `meta.enabledIf` are small expressions over a node's other props,
// `shape == 'box'`, `castShadow && kind != 'ambient'`. The inspector hides or disables the field; MCP's describe output
// carries the text, so an agent knows when a prop matters. A hidden prop's data is kept, never dropped.
//
// The language: prop names, numbers, 'strings' or "strings", true, false, null; == != < <= > >=; && || !; parentheses.
// No calls, no member access, no assignment: a recursive-descent parser over a token list, never eval or new Function.
// Modelled on PlayCanvas's script attribute expressions (@visibleif / @enabledif); written fresh, nothing copied.
//
// A name reads the node's value for that prop, or the prop's default when it isn't set. Comparisons are strict (no
// coercion: 1 == '1' is false); < and friends compare two numbers or two strings, anything else is false.
// A malformed expression fails closed: `conditionHolds` says true, so the field is shown and editable.

const TOKEN = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z_$][\w$]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(==|!=|<=|>=|&&|\|\||[<>!()]))/y;

/** @param {string} text @returns {{ t: 'num' | 'name' | 'str' | 'lit' | 'op', v: any }[]} */
function tokenize(text) {
  const out = [];
  TOKEN.lastIndex = 0;
  let at = 0;
  while (at < text.length) {
    if (/^\s*$/.test(text.slice(at))) break;
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(text);
    if (!m) throw new Error(`unexpected "${text.slice(at).trim()[0]}" at ${at}`);
    at = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push(m[2] === 'true' || m[2] === 'false' ? { t: 'lit', v: m[2] === 'true' } : m[2] === 'null' ? { t: 'lit', v: null } : { t: 'name', v: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'str', v: m[3].slice(1, -1).replace(/\\(.)/g, '$1') });
    else out.push({ t: 'op', v: m[4] });
  }
  return out;
}

/**
 * Parse a condition. Throws on a malformed one.
 * @param {string} text @returns {any} the expression tree
 */
export function parseCondition(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('an empty condition');
  const toks = tokenize(text);
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v) => toks[i]?.t === 'op' && toks[i].v === v;
  const need = (v) => { if (!isOp(v)) throw new Error(`expected "${v}"${toks[i] ? ` at "${toks[i].v}"` : ' at the end'}`); i++; };
  function or() { let l = and(); while (isOp('||')) { i++; l = { k: '||', l, r: and() }; } return l; }
  function and() { let l = cmp(); while (isOp('&&')) { i++; l = { k: '&&', l, r: cmp() }; } return l; }
  function cmp() {
    const l = unary();
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) if (isOp(op)) { i++; return { k: op, l, r: unary() }; }
    return l;
  }
  function unary() { if (isOp('!')) { i++; return { k: '!', e: unary() }; } return primary(); }
  function primary() {
    const t = peek();
    if (!t) throw new Error('the condition ends too soon');
    if (isOp('(')) { i++; const e = or(); need(')'); return e; }
    i++;
    if (t.t === 'num' || t.t === 'str' || t.t === 'lit') return { k: 'lit', v: t.v };
    if (t.t === 'name') return { k: 'name', v: t.v };
    throw new Error(`unexpected "${t.v}"`);
  }
  const e = or();
  if (i < toks.length) throw new Error(`unexpected "${toks[i].v}"`);
  return e;
}

/** The prop names a condition reads. @param {any} ast @returns {string[]} */
export function conditionRefs(ast) {
  const out = new Set();
  (function walk(n) { if (!n) return; if (n.k === 'name') out.add(n.v); walk(n.l); walk(n.r); walk(n.e); })(ast);
  return [...out];
}

const truthy = (v) => !(v === undefined || v === null || v === false || v === 0 || v === '' || Number.isNaN(v));
function value(n, read) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'name': return read(n.v);
    case '!': return !truthy(value(n.e, read));
    case '&&': return truthy(value(n.l, read)) && truthy(value(n.r, read));
    case '||': return truthy(value(n.l, read)) || truthy(value(n.r, read));
    case '==': return same(value(n.l, read), value(n.r, read));
    case '!=': return !same(value(n.l, read), value(n.r, read));
    default: { // < <= > >=: two numbers or two strings
      const a = value(n.l, read), b = value(n.r, read);
      if (!((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) return false;
      return n.k === '<' ? a < b : n.k === '<=' ? a <= b : n.k === '>' ? a > b : a >= b;
    }
  }
}
const same = (a, b) => (a === undefined ? null : a) === (b === undefined ? null : b);

const cache = new Map();
/**
 * Does a condition hold for these values? A malformed condition holds (fails closed: the field stays shown).
 * @param {string | undefined} text the condition (none: true)
 * @param {Record<string, any> | ((name: string) => any)} values a node's props with defaults filled in, or a reader
 */
export function conditionHolds(text, values) {
  if (text === undefined || text === null) return true;
  let ast = cache.get(text);
  if (ast === undefined) {
    try { ast = parseCondition(text); } catch { ast = null; }
    cache.set(text, ast);
  }
  if (ast === null) return true;
  const read = typeof values === 'function' ? values : (k) => (values && Object.hasOwn(values, k) ? values[k] : undefined);
  try { return truthy(value(ast, read)); } catch { return true; }
}

/**
 * Whether each of a node's props applies now: { key: { visible, enabled } }, from its type's props and the node's values
 * (defaults where unset).
 * @param {Record<string, { schema: any, meta?: any }>} props a type's (or behaviour's) prop definitions
 * @param {Record<string, any> | undefined} set the node's props as written
 */
export function propConditions(props, set = {}) {
  const read = (k) => (set && set[k] !== undefined ? set[k] : props[k]?.schema?.default);
  return Object.fromEntries(Object.entries(props).map(([k, p]) => [k, { visible: conditionHolds(p.meta?.visibleIf, read), enabled: conditionHolds(p.meta?.enabledIf, read) }]));
}
