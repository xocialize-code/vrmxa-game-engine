// Prefab overrides you can see, revert and apply (M5 W6, AB-T-0603), as plain functions over documents.
//
// An Instance node overrides its prefab by inner node id (PRD §4.1): `overrides: { "<inner>": { props, transform,
// behaviours, name, … } }`, merged the way flattening merges it (instance.js: behaviours by `use`, objects deeply, other
// values whole). Nested prefabs are addressed by path ("left/hinge": the inner node "hinge" of the prefab instance "left").
//
// The override view splits each inner node's override into fields, one per thing the inspector edits: a prop
// (`props.mass`), a transform part (`transform.p`), a behaviour by name (`behaviours.hinge`), or a node value (`name`,
// `tags`). For each it gives the prefab's value and the instance's (`overrideEntries`). Setting a field writes the least
// override that gives the value, and a value equal to the prefab's drops the field (`withOverride`); reverting drops it
// (`withoutOverride`), and an empty override goes, so a reverted instance saves byte for byte as one never overridden.
// Applying writes the instance's value into the prefab document itself (`applyToPrefab`): on the prefab's own node, or,
// for a nested path, as the prefab's own override of its inner instance. None of these edit in place: each returns a
// new value, and the caller makes it one undo step (editor-core's session).
import { flatten, mergeOverride } from './instance.js';

const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const same = (a, b) => JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}
const IDENTITY = { p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] };
const KINDS = { props: 'prop', transform: 'transform', behaviours: 'behaviour' };

/** The fields one inner node's override holds, in a stable order: `props.<k>`, `transform.<p|q|s>`, `behaviours.<use>`, then node keys. */
export function overrideFields(over) {
  const out = [];
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over).sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
    const v = over[k];
    if (k === 'props' && v && typeof v === 'object' && !Array.isArray(v)) out.push(...Object.keys(v).sort().map((p) => `props.${p}`));
    else if (k === 'transform' && v && typeof v === 'object' && !Array.isArray(v)) out.push(...Object.keys(v).sort().map((p) => `transform.${p}`));
    else if (k === 'behaviours' && Array.isArray(v)) out.push(...v.filter((b) => b?.use).map((b) => `behaviours.${b.use}`));
    else out.push(k);
  }
  return out;
}
const order = (k) => ({ props: 0, transform: 1, behaviours: 2 })[k] ?? 3;

/** A field's value on a node (a flattened one, or a prefab's): a transform part with its identity default. */
export function fieldValue(node, field) {
  if (!node) return undefined;
  const [head, ...rest] = field.split('.'), key = rest.join('.');
  if (head === 'props' && key) return clone(node.props?.[key]);
  if (head === 'transform' && key) return clone(node.transform?.[key] ?? IDENTITY[key]);
  if (head === 'behaviours' && key) return clone((node.behaviours ?? []).find((b) => b.use === key));
  return clone(node[field]);
}

/** The flattened nodes of a prefab by their address inside it ("hinge", "left/hinge"): the values an instance starts from. */
export function prefabNodes(prefab, prefabs) {
  return new Map(flatten(prefab, prefabs).nodes.map((n) => [n.id, n]));
}

/**
 * An instance's overrides as a diff: one entry per field it overrides, with the prefab's value (`base`) and the value the
 * instance ends up with (`value`). `change` is 'changed', 'added' (a behaviour or value the prefab doesn't have) or
 * 'removed' (a behaviour the instance drops). `missing`: the prefab has no such node (a stale override: revert it).
 * @param {any} instance the Instance node @param {any} prefab its prefab document @param {Map<string, any>} prefabs
 * @returns {Array<{ target: string, field: string, kind: string, change: string, value: any, base: any, missing: boolean, same: boolean }>}
 */
export function overrideEntries(instance, prefab, prefabs) {
  const out = [];
  const overrides = instance?.overrides ?? {};
  if (!prefab) return out;
  const nodes = prefabNodes(prefab, prefabs);
  for (const target of Object.keys(overrides).sort()) {
    const over = overrides[target], base = nodes.get(target), merged = base ? mergeOverride(base, over) : null;
    for (const field of overrideFields(over)) {
      const kind = KINDS[field.split('.')[0]] ?? 'node';
      const b = fieldValue(base, field), v = merged ? fieldValue(merged, field) : clone(rawField(over, field));
      const removed = kind === 'behaviour' && rawField(over, field)?.remove === true;
      const change = removed ? 'removed' : b === undefined ? 'added' : 'changed';
      out.push({ target, field, kind, change, value: removed ? undefined : v, base: b, missing: !base, same: !removed && same(v, b) });
    }
  }
  return out;
}

/** The raw override value of a field (what the file holds), or undefined. */
export function rawField(over, field) {
  if (!over) return undefined;
  const [head, ...rest] = field.split('.'), key = rest.join('.');
  if (head === 'props' && key) return over.props?.[key];
  if (head === 'transform' && key) return over.transform?.[key];
  if (head === 'behaviours' && key) return Array.isArray(over.behaviours) ? over.behaviours.find((b) => b?.use === key) : undefined;
  return over[field];
}

/** `over` with one field set (or with undefined, dropped), empty containers removed. → the new override, or undefined when empty */
function setRaw(over, field, raw) {
  const o = clone(over) ?? {};
  const [head, ...rest] = field.split('.'), key = rest.join('.');
  if ((head === 'props' || head === 'transform') && key) {
    const box = o[head] && typeof o[head] === 'object' && !Array.isArray(o[head]) ? o[head] : {};
    if (raw === undefined) delete box[key]; else box[key] = clone(raw);
    if (Object.keys(box).length) o[head] = box; else delete o[head];
  } else if (head === 'behaviours' && key) {
    const list = (Array.isArray(o.behaviours) ? o.behaviours : []).filter((b) => b?.use !== key);
    if (raw !== undefined) {
      const at = (Array.isArray(over?.behaviours) ? over.behaviours : []).findIndex((b) => b?.use === key);
      list.splice(at < 0 ? list.length : at, 0, clone(raw));
    }
    if (list.length) o.behaviours = list; else delete o.behaviours;
  } else if (raw === undefined) delete o[field];
  else o[field] = clone(raw);
  return Object.keys(o).length ? o : undefined;
}

/** `overrides` with `target`'s override replaced (undefined removes it). → the new overrides, or undefined when empty */
function setTarget(overrides, target, over) {
  const out = clone(overrides) ?? {};
  if (over === undefined) delete out[target]; else out[target] = over;
  return Object.keys(out).length ? out : undefined;
}

/**
 * An instance's overrides with one field of one inner node set to `value`: the least override that gives it. A value
 * equal to the prefab's drops the field instead (so editing back to the prefab's value leaves no override). For a
 * behaviour, `value` is the whole behaviour ({ use, …params }; undefined drops a behaviour the prefab has).
 * @param {any} overrides the instance's `overrides` (may be undefined) @param {string} target inner node address
 * @param {string} field @param {any} value @param {any} base the prefab's flattened node at `target` (prefabNodes)
 * @returns {any} the new overrides, or undefined when none are left
 */
export function withOverride(overrides, target, field, value, base) {
  const over = overrides?.[target];
  const b = fieldValue(base, field);
  const kind = KINDS[field.split('.')[0]];
  let raw;
  if (kind === 'behaviour') {
    if (value === undefined) raw = b ? { use: field.slice('behaviours.'.length), remove: true } : undefined;
    else {
      if (value.use !== field.slice('behaviours.'.length)) throw new Error(`${field}: the behaviour's use is "${value.use}"`);
      raw = b && same(value, b) ? undefined : behaviourDiff(b, value);
    }
  } else raw = value !== undefined && same(value, b) ? undefined : value;
  return setTarget(overrides, target, setRaw(over, field, raw));
}

/** A behaviour override: only the params that differ from the prefab's (merging keeps the rest); a removed param can't be said, so then all of them. */
function behaviourDiff(base, value) {
  if (!base) return clone(value);
  if (Object.keys(base).some((k) => !(k in value))) return clone(value);
  const out = { use: value.use };
  for (const [k, v] of Object.entries(value)) if (k !== 'use' && !same(v, base[k])) out[k] = clone(v);
  return out;
}

/** Revert one field (or, with no field, every field of `target`): the instance takes the prefab's value again. → the new overrides, or undefined */
export function withoutOverride(overrides, target, field) {
  if (!overrides?.[target]) return overrides === undefined ? undefined : clone(overrides);
  return setTarget(overrides, target, field === undefined ? undefined : setRaw(overrides[target], field, undefined));
}

/**
 * The prefab document with an instance's value for one field written into it: on its own node (`target` "hinge"), or as
 * its own override of an inner instance (`target` "left/hinge" → the prefab's node "left", override "hinge"). A value
 * equal to what the prefab would give anyway writes nothing. Doesn't change `prefab`. → a new document
 * @param {any} prefab @param {string} target @param {string} field @param {any} value the instance's value (an entry's `value`)
 * @param {Map<string, any>} prefabs every prefab by ref (for nested instances)
 */
export function applyToPrefab(prefab, target, field, value, prefabs) {
  const doc = clone(prefab);
  const [head, ...rest] = target.split('/');
  const i = doc.nodes.findIndex((n) => n.id === head);
  if (i < 0) throw new Error(`${prefabName(prefab)} has no node "${head}"`);
  const node = doc.nodes[i];
  if (rest.length) {
    if (node.type !== 'Instance') throw new Error(`"${head}" in ${prefabName(prefab)} isn't a prefab instance, so "${target}" can't be written into it`);
    const ref = (doc.assets ?? []).find((a) => a.id === node.asset)?.ref;
    const inner = prefabs.get(ref);
    if (!inner) throw new Error(`prefab ${ref} not loaded`);
    const base = prefabNodes(inner, prefabs).get(rest.join('/'));
    if (!base) throw new Error(`${ref} has no node "${rest.join('/')}"`);
    const next = withOverride(node.overrides, rest.join('/'), field, value, base);
    if (next === undefined) delete node.overrides; else node.overrides = next;
    return doc;
  }
  doc.nodes[i] = setOnNode(node, field, value);
  return doc;
}

/** A node with one field set to `value` (undefined clears it), its empty containers and identity transform parts left out. */
export function setOnNode(node, field, value) {
  const n = clone(node);
  const [head, ...rest] = field.split('.'), key = rest.join('.');
  if (head === 'props' && key) {
    const props = { ...(n.props ?? {}) };
    if (value === undefined) delete props[key]; else props[key] = clone(value);
    if (Object.keys(props).length) n.props = props; else delete n.props;
  } else if (head === 'transform' && key) {
    const t = { ...(n.transform ?? {}) };
    if (value === undefined || (IDENTITY[key] && same(value, IDENTITY[key]))) delete t[key]; else t[key] = clone(value);
    if (Object.keys(t).length) n.transform = t; else delete n.transform;
  } else if (head === 'behaviours' && key) {
    const list = [...(n.behaviours ?? [])];
    const at = list.findIndex((b) => b.use === key);
    if (value === undefined) { if (at >= 0) list.splice(at, 1); } else if (at >= 0) list[at] = clone(value); else list.push(clone(value));
    if (list.length) n.behaviours = list; else delete n.behaviours;
  } else if (/^(id|type|parent)$/.test(field)) throw new Error(`an override can't change a node's ${field}`);
  else if (value === undefined) delete n[field];
  else n[field] = clone(value);
  return n;
}

const prefabName = (p) => (p?.id ? `prefab ${p.id}` : 'the prefab');

/**
 * Every instance of the prefab `ref` in a document, nested ones included, by their flattened addresses ("door-1",
 * "entrance/left"): what an Apply to that prefab changes in this document.
 * @param {any} doc @param {Map<string, any>} prefabs @param {string} ref
 */
export function prefabUsers(doc, prefabs, ref, prefix = '', depth = 0, stack = []) {
  const out = [];
  if (depth > 16) return out;
  const assets = new Map((doc.assets ?? []).map((a) => [a.id, a]));
  for (const n of doc.nodes ?? []) {
    if (n.type !== 'Instance') continue;
    const r = assets.get(n.asset)?.ref;
    if (r === ref) out.push(prefix + n.id);
    const inner = prefabs.get(r);
    if (inner && !stack.includes(r)) out.push(...prefabUsers(inner, prefabs, ref, `${prefix}${n.id}/`, depth + 1, [...stack, r]));
  }
  return out;
}

/** An override diff as plain text, one field a line ("hinge  props.mass  12 → 20"): for a teammate, an agent, a review. */
export function overridesText(entries, { instance = '', ref = '' } = {}) {
  const show = (v) => (v === undefined ? '(none)' : JSON.stringify(v));
  const head = instance ? [`${instance}${ref ? ` (${ref})` : ''}: ${entries.length} override${entries.length === 1 ? '' : 's'}`] : [];
  return [...head, ...entries.map((e) => `${e.target}  ${e.field}  ${e.change === 'removed' ? `${show(e.base)} → removed` : e.change === 'added' ? `added ${show(e.value)}` : `${show(e.base)} → ${show(e.value)}`}${e.missing ? '  (the prefab has no such node)' : ''}`)].join('\n');
}
