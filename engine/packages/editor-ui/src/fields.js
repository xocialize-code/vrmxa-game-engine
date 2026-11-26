// The inspector's decisions (AB-T-0599, 0601, 0602), with no Vue or DOM: which widget a prop gets from its JSON Schema,
// the schema a value is edited under (a branch of anyOf, the `then` of a matching if), a valid new row, edits of lists
// and maps that keep what they don't touch, the fields a node shows (with its conditions), and several nodes' fields
// merged with a "mixed" state. ValueField.vue and the apps' inspectors draw them; tests run them in Node.
//
// The design follows PlayCanvas's attribute inspectors (a field type per attribute, `json` as a nested inspector and
// `array:<type>` as a list; editor/src/editor/inspector/attributes-inspector.ts and PCUI's ArrayInput): generated from
// data, so a new prop needs no hand-written UI. Nothing is copied from their code.
import { conditionHolds } from '@vrmxg/registry';

// Props are JSON data; a copy through JSON also drops a reactive proxy's wrapping (structuredClone refuses proxies).
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
/** A plain copy of a value to hand to the session (no proxies; undefined stays undefined). */
export const plain = clone;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const typeOfValue = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v);

/** A value of this JSON type? ('integer' is a number with no fraction; 'number' takes integers too.) */
function hasType(type, v) {
  const t = typeOfValue(v);
  return type === t || (type === 'number' && t === 'integer');
}

/**
 * Does `v` fit `schema`, as far as choosing a branch needs: const, enum, type, a string's pattern and length, an object's
 * required keys, any of anyOf / oneOf. Not a validator (the session's edit check is).
 */
export function matches(schema, v) {
  if (!schema || typeof schema !== 'object') return true;
  if (v === undefined) return false;
  if (schema.const !== undefined) return JSON.stringify(schema.const) === JSON.stringify(v);
  if (schema.enum) return schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(v));
  const branches = schema.anyOf ?? schema.oneOf;
  if (branches) return branches.some((b) => matches(b, v));
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => hasType(t, v))) return false;
  }
  if (typeof v === 'string') {
    if (schema.minLength !== undefined && v.length < schema.minLength) return false;
    if (schema.pattern !== undefined) { try { if (!new RegExp(schema.pattern, 'u').test(v)) return false; } catch { /* a pattern this engine can't read: no opinion */ } }
  }
  if (isObj(v) && Array.isArray(schema.required) && !schema.required.every((k) => Object.hasOwn(v, k))) return false;
  if (Array.isArray(v) && schema.minItems !== undefined && v.length < schema.minItems) return false;
  return true;
}

/** Does an `if` (properties with const or enum, and required) hold for an object? */
function ifHolds(cond, v) {
  if (!isObj(v)) return false;
  if (Array.isArray(cond.required) && !cond.required.every((k) => Object.hasOwn(v, k))) return false;
  return Object.entries(cond.properties ?? {}).every(([k, s]) => !Object.hasOwn(v, k) || matches(s, v[k]));
}

/**
 * The schema a value is edited under: an object's properties with the `then` of each allOf if/then that holds merged in
 * (a condition's `test` picks its fields), its required keys and additionalProperties likewise.
 * @param {any} schema @param {any} value
 */
export function resolveSchema(schema, value) {
  if (!schema || !Array.isArray(schema.allOf)) return schema ?? {};
  let out = { ...schema, properties: { ...(schema.properties ?? {}) }, required: [...(schema.required ?? [])] };
  delete out.allOf;
  for (const part of schema.allOf) {
    const add = part.if ? (ifHolds(part.if, value) ? part.then : part.else) : part;
    if (!add) continue;
    for (const [k, s] of Object.entries(add.properties ?? {})) out.properties[k] = Object.keys(s).length ? s : out.properties[k] ?? s;
    for (const k of add.required ?? []) if (!out.required.includes(k)) out.required.push(k);
    if (add.additionalProperties !== undefined) out.additionalProperties = add.additionalProperties;
  }
  return out;
}

/** The branches of an anyOf / oneOf, with a word for each (for the kind picker). */
export function branchesOf(schema) {
  const list = schema?.anyOf ?? schema?.oneOf ?? [];
  const used = new Map();
  return list.map((b, i) => {
    let label = b.title ?? (b.enum ? 'choice' : b.pattern !== undefined ? 'path' : b.type === 'array' ? 'list' : b.type === 'object' ? 'fields' : b.type === 'string' ? 'text' : b.type ?? `option ${i + 1}`);
    const n = (used.get(label) ?? 0) + 1; used.set(label, n);
    if (n > 1) label = `${label} ${n}`;
    return { index: i, label, schema: b };
  });
}

/** Which branch a value is in: the first it matches, else the first of its type, else the first. */
export function branchIndex(schema, value) {
  const list = schema?.anyOf ?? schema?.oneOf ?? [];
  if (value === undefined) return 0;
  const exact = list.findIndex((b) => matches(b, value));
  if (exact >= 0) return exact;
  const t = typeOfValue(value);
  const byType = list.findIndex((b) => b.type === t || (b.enum && b.enum.some((e) => typeOfValue(e) === t)) || (b.type === 'number' && t === 'integer'));
  return byType >= 0 ? byType : 0;
}

/** A value that looks like a curve: two or more [x, y, ease?] keys with numbers first (a property track's keys). */
export function isCurve(v) {
  return Array.isArray(v) && v.length > 0 && v.every((k) => Array.isArray(k) && k.length >= 2 && k.length <= 3 && typeof k[0] === 'number' && typeof k[1] === 'number' && (k[2] === undefined || typeof k[2] === 'string'));
}
const isVecSchema = (s) => s?.type === 'array' && ['number', 'integer'].includes(s.items?.type) && s.minItems !== undefined && s.minItems === s.maxItems && s.minItems >= 2 && s.minItems <= 4;
const isCurveSchema = (s) => s?.type === 'array' && isVecSchema(s.items) && s.items.minItems === 2;

/**
 * The widget a prop gets: 'number' | 'boolean' | 'enum' | 'string' | 'color' | 'node' | 'asset' | 'vec' | 'list' |
 * 'struct' | 'map' | 'curve' | 'choice' | 'scalar' | 'const' | 'json'. From the registry's meta first (colour, node,
 * asset, vec3, quat, curve), then the schema, then, where the schema says nothing, the value's own shape. 'json' (a text
 * box) is left only for an untyped field with no value to go by.
 * @param {any} schema @param {any} [meta] @param {any} [value]
 */
export function widgetOf(schema = {}, meta = {}, value = undefined) {
  if (meta?.nodeRef) return 'node';
  const w = meta?.widget;
  if (w === 'color' || w === 'node' || w === 'asset' || w === 'curve') return w;
  if (w === 'vec3' || w === 'quat') return 'vec';
  if (meta?.assetTypes) return 'asset';
  const s = schema ?? {};
  if (s.const !== undefined) return 'const';
  if (s.enum) return 'enum';
  if (s.anyOf || s.oneOf) return 'choice';
  if (Array.isArray(s.type)) return s.type.length === 1 ? widgetOf({ ...s, type: s.type[0] }, {}, value) : 'scalar';
  switch (s.type) {
    case 'number': case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'string': return 'string';
    case 'array': return isVecSchema(s) ? 'vec' : isCurveSchema(s) || (s.items === undefined && isCurve(value)) ? 'curve' : 'list';
    case 'object': return s.properties || s.allOf || s.additionalProperties === false || s.additionalProperties === undefined || s.additionalProperties === true ? 'struct' : 'map';
    default: break;
  }
  if (s.properties || s.allOf) return 'struct';
  // no type: go by the value
  switch (typeOfValue(value)) {
    case 'number': case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'string': return 'string';
    case 'array': return isCurve(value) ? 'curve' : 'list';
    case 'object': return 'struct';
    default: return 'json';
  }
}

/** The schema of an untyped value, from what it holds (so unknown data gets real fields too). */
export function schemaOfValue(v) {
  const t = typeOfValue(v);
  if (t === 'array') return { type: 'array' };
  if (t === 'null' || t === 'undefined') return {};
  return { type: t };
}

/**
 * The schema of a key an open struct doesn't name and gives no value schema for (a brain's vars): a text, number or yes /
 * no picked by a kind menu (M6 W1), so a new key's value isn't stuck as text; a list or an object by its shape.
 */
export function looseSchema(v) {
  const t = typeOfValue(v);
  return t === 'array' || t === 'object' ? schemaOfValue(v) : { type: ['string', 'number', 'boolean'] };
}

/** A placeholder string a pattern takes, for a new required field. */
const PLACEHOLDERS = ['new', 'new-1', 'a'];

/**
 * A valid new value for a schema: its default, its const, the first of its enum, the minimum (or zero) for a number, a
 * placeholder for a string that must not be empty, `minItems` new items for a list, an object's required keys (with the
 * required keys a matching if/then adds). A required string with a pattern no placeholder fits comes back empty.
 */
export function defaultFor(schema = {}, depth = 0) {
  const s = schema ?? {};
  if (depth > 8) return undefined;
  if (s.default !== undefined) return clone(s.default);
  if (s.const !== undefined) return clone(s.const);
  if (s.enum) return clone(s.enum[0]);
  if (s.anyOf || s.oneOf) return defaultFor((s.anyOf ?? s.oneOf)[0], depth + 1);
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case 'number': case 'integer': {
      const lo = s.minimum ?? (s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + 1 : undefined);
      const v = lo !== undefined && lo > 0 ? lo : s.maximum !== undefined && s.maximum < 0 ? s.maximum : 0;
      return type === 'integer' ? Math.ceil(v) : v;
    }
    case 'boolean': return false;
    case 'string': {
      if (!(s.minLength > 0) && s.pattern === undefined) return '';
      if (s.pattern === undefined) return PLACEHOLDERS[0];
      try { const re = new RegExp(s.pattern, 'u'); return PLACEHOLDERS.find((p) => re.test(p)) ?? ''; } catch { return ''; }
    }
    case 'array': {
      if (isVecSchema(s)) return new Array(s.minItems).fill(0);
      return Array.from({ length: s.minItems ?? 0 }, () => defaultFor(s.items ?? {}, depth + 1));
    }
    case 'object': return defaultObject(s, depth);
    default:
      if (s.properties || s.allOf) return defaultObject(s, depth);
      return undefined;
  }
}
function defaultObject(s, depth) {
  const out = {};
  for (let pass = 0; pass < 3; pass++) { // a discriminator's default can bring the required keys of its branch
    const r = resolveSchema(s, out);
    let grew = false;
    for (const k of r.required ?? []) if (!Object.hasOwn(out, k)) { out[k] = defaultFor(r.properties?.[k] ?? {}, depth + 1); grew = true; }
    if (!grew) break;
  }
  return out;
}

// ---------------------------------------------------------------- edits (each returns a new value; the input is not changed)

/**
 * The value with the part at `path` replaced (undefined removes an object's key; an array's slot is set as given). Keys
 * and items the path doesn't go through are kept as they are, unknown ones included.
 * @param {any} root @param {(string | number)[]} path @param {any} v
 */
export function setIn(root, path, v) {
  if (!path.length) return clone(v);
  const [k, ...rest] = path;
  if (typeof k === 'number') {
    const arr = Array.isArray(root) ? [...root] : [];
    arr[k] = setIn(arr[k], rest, v);
    return arr;
  }
  const obj = isObj(root) ? { ...root } : {};
  const next = setIn(obj[k], rest, v);
  if (next === undefined) delete obj[k]; else obj[k] = next;
  return obj;
}

/** The part of a value at `path`. */
export const getIn = (root, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), root);

/** A list with an item added (at the end, or after `at`). */
export function listAdd(list, item, at = undefined) {
  const arr = Array.isArray(list) ? [...list] : [];
  arr.splice(at === undefined ? arr.length : at + 1, 0, clone(item));
  return arr;
}
/** A list without item `i`. */
export function listRemove(list, i) { const arr = Array.isArray(list) ? [...list] : []; arr.splice(i, 1); return arr; }
/** A list with item `i` moved by `delta` places (clamped; unchanged when it can't move). */
export function listMove(list, i, delta) {
  const arr = Array.isArray(list) ? [...list] : [];
  const j = Math.max(0, Math.min(arr.length - 1, i + delta));
  if (j === i || i < 0 || i >= arr.length) return arr;
  const [x] = arr.splice(i, 1);
  arr.splice(j, 0, x);
  return arr;
}
/** Can item `i` be removed, moved up, moved down? (A list keeps its minItems.) */
export function rowActions(list, i, schema = {}) {
  const n = Array.isArray(list) ? list.length : 0;
  return { remove: n > (schema.minItems ?? 0), up: i > 0, down: i < n - 1 };
}

/** A map with key `from` renamed to `to`, in the same place; unchanged when `to` is empty or taken. */
export function mapRename(obj, from, to) {
  const src = isObj(obj) ? obj : {};
  if (!to || to === from || Object.hasOwn(src, to) || !Object.hasOwn(src, from)) return { ...src };
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k === from ? to : k, v]));
}
/** A map with a new key (unchanged when the key is empty or already there). */
export function mapAdd(obj, key, v) {
  const src = isObj(obj) ? obj : {};
  if (!key || Object.hasOwn(src, key)) return { ...src };
  return { ...src, [key]: clone(v) };
}
/** A map without a key. */
export function mapRemove(obj, key) { const out = { ...(isObj(obj) ? obj : {}) }; delete out[key]; return out; }
/** The keys a map's next new entry may take: "key", "key-2", … */
export function freshKey(obj, base = 'key') {
  const src = isObj(obj) ? obj : {};
  if (!Object.hasOwn(src, base)) return base;
  for (let i = 2; ; i++) if (!Object.hasOwn(src, `${base}-${i}`)) return `${base}-${i}`;
}

/** A struct's rows: its schema's properties in order, then keys the value holds that the schema doesn't name (kept). */
export function structRows(schema, value) {
  const r = resolveSchema(schema ?? {}, value);
  const props = r.properties ?? {};
  const known = Object.keys(props).filter((k) => Object.keys(props[k] ?? {}).length || Object.hasOwn(value ?? {}, k));
  const extra = isObj(value) ? Object.keys(value).filter((k) => !Object.hasOwn(props, k)) : [];
  const required = new Set(r.required ?? []);
  const open = r.additionalProperties !== false;
  return {
    rows: [
      ...known.map((k) => ({ key: k, schema: props[k] && Object.keys(props[k]).length ? props[k] : schemaOfValue(value?.[k]), required: required.has(k), known: true, set: isObj(value) && Object.hasOwn(value, k) })),
      ...extra.map((k) => ({ key: k, schema: isObj(r.additionalProperties) ? r.additionalProperties : looseSchema(value[k]), required: false, known: false, set: true })),
    ],
    open, // more keys may be added
    valueSchema: isObj(r.additionalProperties) ? r.additionalProperties : null,
  };
}

/**
 * A struct after one of its fields changed: when that moved it to a branch (a condition's test) that allows only its own
 * fields, the fields it doesn't allow go and its required ones are added. Otherwise unchanged (unknown keys kept).
 */
export function fitBranch(schema, value) {
  const r = resolveSchema(schema ?? {}, value);
  if (r.additionalProperties !== false || !r.properties || !isObj(value)) return value;
  const next = Object.fromEntries(Object.entries(value).filter(([k]) => Object.hasOwn(r.properties, k)));
  for (const k of r.required ?? []) if (!Object.hasOwn(next, k)) next[k] = defaultFor(r.properties[k] ?? {});
  return next;
}

/** What a list row is called in its summary: its id, name, text, effect or type, else its number. */
export function rowTitle(item, i) {
  if (isObj(item)) for (const k of ['id', 'name', 'text', 'effect', 'type', 'test', 'key']) if (typeof item[k] === 'string' && item[k]) return item[k].length > 40 ? `${item[k].slice(0, 39)}…` : item[k];
  return `${i + 1}`;
}

/** A curve's keys as an SVG polyline's points in a w × h box (x across, y up). */
export function curvePoints(keys, w = 120, h = 40) {
  if (!isCurve(keys)) return '';
  const xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = x1 > x0 ? w / (x1 - x0) : 0, sy = y1 > y0 ? h / (y1 - y0) : 0;
  return keys.map((k) => `${round2(x1 > x0 ? (k[0] - x0) * sx : w / 2)},${round2(y1 > y0 ? h - (k[1] - y0) * sy : h / 2)}`).join(' ');
}
const round2 = (v) => Math.round(v * 100) / 100;
/** The next key a curve gets: after the last, one `step` on, at the same value. */
export function nextCurveKey(keys, step = 10) {
  const last = isCurve(keys) ? keys.at(-1) : null;
  return last ? [last[0] + step, last[1]] : [0, 0];
}

// ---------------------------------------------------------------- ids and names

/**
 * An element id part from a key, one to one: letters and digits kept, any other character as _<hex>_ ("a b" → a_20_b,
 * "a-b" → a_2d_b, "_" → _5f_). It never holds "-", so "-" can join path parts and "--" begin a control's suffix
 * (`--add`, `--up`), which no key can produce.
 */
export const idPart = (k) => String(k).replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`);
/** A child's id and accessible name: lists count from 1 in names, from 0 in ids. A field's own controls add "--…". */
export function childOf(parent, k) {
  return typeof k === 'number' ? { id: `${parent.id}-${k}`, label: `${parent.label} ${k + 1}` } : { id: `${parent.id}-${idPart(k)}`, label: `${parent.label} ${k}` };
}

// ---------------------------------------------------------------- a node's fields and several nodes' fields

/**
 * The inspector's fields for a node: one per prop of its type, from `describeType`'s schema and propMeta, with its value,
 * default, widget, range, step, precision, and whether its conditions (visibleIf, enabledIf) hold for the node now.
 * @param {{ schema: any, propMeta: Record<string, any> }} described @scene's describeType(reg, node.type)
 * @param {{ props?: Record<string, any> }} node
 */
export function inspectorFields(described, node) {
  return fieldsOf(described.schema?.properties?.props?.properties ?? {}, described.propMeta ?? {}, node?.props ?? {});
}

/**
 * Fields for a set of registry props ({ key: { schema, meta, nodeRef?, assetTypes? } }) over values: a behaviour's params
 * over its entry, an action's arguments over a connection's (M6 W1). The same fields inspectorFields makes for a node.
 * @param {Record<string, any>} defs @param {Record<string, any> | undefined} values
 */
export function propFields(defs, values) {
  const schemas = {}, metas = {};
  for (const [k, p] of Object.entries(defs ?? {})) {
    schemas[k] = p?.schema ?? {};
    metas[k] = { ...(p?.meta ?? {}), ...(p?.assetTypes ? { assetTypes: p.assetTypes } : {}), ...(p?.nodeRef ? { nodeRef: true } : {}) };
  }
  return fieldsOf(schemas, metas, values ?? {});
}

/**
 * What a field's pin writes: the value it shows while unset (its default), or a schema's fresh value when it has none
 * (false, 0, ""). Writing it makes the value the file's own, so a later change of the default doesn't change it (M6 W1).
 */
export function pinValue(f) {
  if (f.default !== undefined) return clone(f.default);
  const v = defaultFor(f.schema ?? {});
  return v === undefined ? '' : v;
}

/**
 * A collision-layer field (`meta.widget: 'layer'`, M6 W1) as a menu of the game's physics layers (game.json), the node's
 * own value kept as an option when the game doesn't have it, so it's seen (the export and Play refuse it).
 * @param {any} f a field @param {string[]} layers
 */
export function layerField(f, layers) {
  if (f.meta?.widget !== 'layer') return f;
  const options = [...layers];
  const unknown = typeof f.value === 'string' && !options.includes(f.value);
  if (unknown) options.push(f.value);
  return {
    ...f, schema: { ...f.schema, enum: options }, widget: 'enum', enum: options, unknownLayer: unknown ? f.value : null,
    description: `${f.description ? `${f.description} ` : ''}${unknown ? `"${f.value}" isn't one of the game's layers (${layers.join(', ')}).` : `The game's layers: ${layers.join(', ')} (Project Settings).`}`,
  };
}

function fieldsOf(schemas, metas, set) {
  const read = (k) => (set[k] !== undefined ? set[k] : schemas[k]?.default);
  return Object.entries(schemas).map(([key, schema]) => {
    const meta = metas[key] ?? {};
    const value = clone(set[key]);
    return {
      key, schema, meta, widget: widgetOf(schema, meta, value ?? schema.default), value, default: clone(schema.default), set: value !== undefined,
      enum: schema.enum ?? null, min: schema.minimum, max: schema.maximum, integer: schema.type === 'integer',
      step: meta.step, precision: meta.precision, unit: meta.unit ?? null, description: schema.description ?? '',
      visible: conditionHolds(meta.visibleIf, read), enabled: conditionHolds(meta.enabledIf, read),
      visibleIf: meta.visibleIf ?? null, enabledIf: meta.enabledIf ?? null,
    };
  });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** What a field shows: its value, or its default when unset. */
export const shownValue = (f) => (f.value !== undefined ? f.value : f.default);

/**
 * Several nodes' fields as one inspector (AB-T-0601): the props every node has with the same widget, in the first node's
 * order. A field whose shown values differ is mixed (no value of its own); one shown on any node is shown, one disabled
 * on any is disabled.
 * @param {ReturnType<typeof inspectorFields>[]} perNode
 */
export function sharedFields(perNode) {
  if (!perNode.length) return [];
  if (perNode.length === 1) return perNode[0].map((f) => ({ ...f, mixed: false }));
  const [first, ...rest] = perNode;
  const out = [];
  for (const f of first) {
    const others = rest.map((fs) => fs.find((g) => g.key === f.key && g.widget === f.widget));
    if (others.some((g) => !g)) continue;
    const all = [f, ...others];
    const mixed = all.some((g) => !same(shownValue(g), shownValue(f)));
    out.push({
      ...f, mixed, value: mixed ? undefined : f.value, set: all.some((g) => g.set),
      ...(f.widget === 'vec' ? { axes: vecAxes(all.map(shownValue)) } : {}),
      default: all.every((g) => same(g.default, f.default)) ? f.default : undefined,
      min: all.every((g) => g.min === f.min) ? f.min : Math.max(...all.map((g) => g.min ?? -Infinity)) === -Infinity ? undefined : Math.max(...all.map((g) => g.min ?? -Infinity)),
      max: all.every((g) => g.max === f.max) ? f.max : Math.min(...all.map((g) => g.max ?? Infinity)) === Infinity ? undefined : Math.min(...all.map((g) => g.max ?? Infinity)),
      unit: all.every((g) => g.unit === f.unit) ? f.unit : null,
      visible: all.some((g) => g.visible), enabled: all.every((g) => g.enabled),
    });
  }
  return out;
}

/** Several vectors that may be unset: each axis its common value (undefined when all unset), null where they differ. */
function vecAxes(values) {
  const n = Math.max(0, ...values.map((v) => (Array.isArray(v) ? v.length : 0)));
  return Array.from({ length: n }, (_, i) => { const a = values.map((v) => (Array.isArray(v) ? v[i] : undefined)); return a.every((x) => x === a[0]) ? a[0] : null; });
}

/** Several vectors (positions, say) as one: each axis its common value, or null where they differ. */
export function sharedAxes(vectors) {
  if (!vectors.length) return [];
  return vectors[0].map((v, i) => (vectors.every((w) => w[i] === v) ? v : null));
}

/** A field's accessible name: its label, and "(mixed values)" when several nodes differ. */
export const fieldName = (label, mixed = false) => (mixed ? `${label} (mixed values)` : label);
