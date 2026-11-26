// .vrmxs documents: parse, validate (schema + lint), and serialize in a canonical, line-stable form.
//
// Canonical form: fixed top-level key order; one asset, node and connection per line, with a fixed
// key order inside each node and unknown keys kept, sorted, after the known ones. Editing one
// property of one node changes one line, so git diffs, merges and review stay small (the reason
// .tscn is line-oriented too).
import { Ajv2020 } from 'ajv/dist/2020.js';
import { documentSchema } from './schema.js';
import { flatten } from './instance.js';
import { nonFinite } from './edit.js';

const TOP = ['format', 'version', 'id', 'set', 'assets', 'nodes', 'connections', 'settings', 'sequence'];
// A sequence block (M2 W1/W5): its scalars, then one shot, marker and track per line, so moving a key changes one line
const SEQ_KEYS = ['fps', 'duration', 'autoplay', 'snapshotEvery', 'shots', 'markers', 'tracks'];
const SEQ_LISTS = { shots: ['id', 'name', 'start', 'end', 'camera', 'overrides'], markers: ['frame', 'name'], tracks: ['id', 'type', 'target', 'path', 'brain', 'step', 'interp', 'keys', 'clips'] };
const NODE_KEYS = ['id', 'type', 'parent', 'name', 'asset', 'transform', 'props', 'overrides', 'behaviours', 'tags'];
const ASSET_KEYS = ['id', 'type', 'ref', 'sha256'];
const CONN_KEYS = ['from', 'signal', 'to', 'call', 'args'];

function ordered(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  for (const k of Object.keys(obj).filter((k) => !keys.includes(k)).sort()) out[k] = obj[k];
  return out;
}
// Nested objects inside a line: sorted keys, so equal data always prints identically.
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}
const line = (obj, keys) => JSON.stringify(ordered(Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sortDeep(v)])), keys));

export function serialize(doc) {
  const d = ordered(doc, TOP);
  const parts = [];
  for (const [k, v] of Object.entries(d)) {
    if (k === 'assets' || k === 'nodes' || k === 'connections') {
      const keys = k === 'assets' ? ASSET_KEYS : k === 'nodes' ? NODE_KEYS : CONN_KEYS;
      parts.push(v.length ? `  "${k}": [\n${v.map((x) => `    ${line(x, keys)}`).join(',\n')}\n  ]` : `  "${k}": []`);
    } else if (k === 'sequence' && v && typeof v === 'object' && !Array.isArray(v)) {
      const sq = ordered(v, SEQ_KEYS), rows = [];
      for (const [sk, sv] of Object.entries(sq)) {
        if (SEQ_LISTS[sk] && Array.isArray(sv)) rows.push(sv.length ? `    "${sk}": [\n${sv.map((x) => `      ${line(x, SEQ_LISTS[sk])}`).join(',\n')}\n    ]` : `    "${sk}": []`);
        else rows.push(`    "${sk}": ${JSON.stringify(sortDeep(sv))}`);
      }
      parts.push(`  "sequence": {\n${rows.join(',\n')}\n  }`);
    } else if (k === 'settings' || (v && typeof v === 'object')) {
      parts.push(`  "${k}": ${JSON.stringify(sortDeep(v), null, 2).replace(/\n/g, '\n  ')}`);
    } else parts.push(`  "${k}": ${JSON.stringify(v)}`);
  }
  return `{\n${parts.join(',\n')}\n}\n`;
}

export const parse = (text) => JSON.parse(text);

// ---------------------------------------------------------------- validation

export function createValidator(reg) {
  // compiled from the registry as it is now, and again when it changes (a project's behaviours declared, M6 W0)
  let compiled = null, at = -1;
  const validate = (doc) => {
    if (!compiled || at !== reg.version) { compiled = new Ajv2020({ allErrors: true, strict: false }).compile(documentSchema(reg)); at = reg.version; }
    const ok = compiled(doc);
    validate.errors = compiled.errors;
    return ok;
  };
  /** @type {any} */ validate.errors = null;

  // Schema errors are hard errors. Lint findings are structural problems the schema can't express
  // (references, cycles) plus warnings for things kept but not understood.
  /**
   * @param {any} doc a parsed .vrmxs document
   * @param {{ prefabs?: Map<string, object> }} [options] prefab documents by ref, for override and path checks
   * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
   */
  function check(doc, { prefabs } = {}) {
    const errors = [], warnings = [];
    { const p = nonFinite(doc); if (p) errors.push(`${p} is not a finite number (a file can't hold Infinity or NaN)`); } // one built in memory
    if (!validate(doc)) for (const e of validate.errors) errors.push(`${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);
    const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
    const byId = new Map();
    for (const [i, n] of nodes.entries()) {
      if (byId.has(n.id)) errors.push(`/nodes/${i} duplicate id "${n.id}"`);
      byId.set(n.id, n);
    }
    const assets = new Map((doc.assets ?? []).map((a) => [a.id, a]));
    for (const [i, n] of nodes.entries()) {
      const at = `/nodes/${i} (${n.id})`;
      const t = reg.get(n.type);
      if (n.parent !== undefined && !byId.has(n.parent)) errors.push(`${at} parent "${n.parent}" is not a node`);
      if (!t) { warnings.push(`${at} unknown node type "${n.type}" (kept)`); continue; }
      if (t.abstract) errors.push(`${at} type ${n.type} is abstract`);
      for (const k of Object.keys(n.props ?? {})) if (!t.props[k]) warnings.push(`${at} unknown prop "${k}" on ${n.type} (kept)`);
      if (t.asset && n.asset !== undefined) {
        const a = assets.get(n.asset);
        if (!a) errors.push(`${at} asset "${n.asset}" is not in assets`);
        else if (!t.asset.types.includes(a.type)) errors.push(`${at} asset "${n.asset}" is ${a.type}; ${n.type} needs ${t.asset.types.join(' or ')}`);
      }
      for (const [k, p] of Object.entries(t.props)) if (p.nodeRef && n.props?.[k] !== undefined && !byId.has(n.props[k])) errors.push(`${at} prop "${k}" refers to missing node "${n.props[k]}"`);
      for (const b of n.behaviours ?? []) {
        const d = reg.behaviours.get(b.use);
        if (!d) { warnings.push(`${at} unknown behaviour "${b.use}" (kept)`); continue; }
        if (d.on && !d.on.some((o) => reg.isA(n.type, o))) errors.push(`${at} behaviour "${b.use}" attaches to ${d.on.join(' or ')}, not ${n.type}`);
      }
      if (n.type === 'Instance' && n.overrides && prefabs) {
        const prefab = prefabs.get(assets.get(n.asset)?.ref);
        if (prefab) for (const inner of Object.keys(n.overrides)) if (!innerIds(prefab, prefabs).has(inner)) errors.push(`${at} override targets "${inner}", which ${assets.get(n.asset).ref} does not have`);
      }
    }
    // Cycles in the parent chain
    for (const n of nodes) {
      const seen = new Set();
      for (let x = n; x?.parent !== undefined; x = byId.get(x.parent)) {
        if (seen.has(x.id)) { errors.push(`parent cycle through "${n.id}"`); break; }
        seen.add(x.id);
      }
    }
    // Connections may address nodes inside prefab instances by path ("door-1/hinge").
    let flatById = null;
    const lookup = (id) => {
      if (!id?.includes('/')) return byId.get(id);
      if (!flatById && prefabs) { try { flatById = new Map(flatten(doc, prefabs).nodes.map((n) => [n.id, n])); } catch { flatById = new Map(); } }
      return flatById?.get(id);
    };
    for (const [i, c] of (doc.connections ?? []).entries()) {
      const from = lookup(c.from), to = lookup(c.to);
      if (!from) { errors.push(`/connections/${i} from "${c.from}" is not a node`); continue; }
      if (!to) { errors.push(`/connections/${i} to "${c.to}" is not a node`); continue; }
      if (reg.get(from.type) && !reg.surface(from).signals[c.signal]) errors.push(`/connections/${i} ${from.type} "${c.from}" has no signal "${c.signal}" (has: ${Object.keys(reg.surface(from).signals).join(', ')})`);
      if (reg.get(to.type) && !reg.surface(to).actions[c.call]) errors.push(`/connections/${i} ${to.type} "${c.to}" has no action "${c.call}" (has: ${Object.keys(reg.surface(to).actions).join(', ')})`);
    }
    // The connections inside prefab instances, as each instance's overrides leave its nodes (M5 W6): an override that drops
    // a behaviour a prefab's own connection calls breaks that connection here, as an Apply of it would break the prefab.
    if (prefabs && nodes.some((n) => n.type === 'Instance')) {
      let flat = null;
      try { flat = flatten(doc, prefabs); } catch { flat = null; } // a missing prefab or a cycle: reported where it is
      if (flat) {
        const fb = new Map(flat.nodes.map((n) => [n.id, n]));
        for (const c of flat.connections.slice(0, flat.connections.length - (doc.connections?.length ?? 0))) { // the instances' own, before the scene's
          const from = fb.get(c.from), to = fb.get(c.to);
          if (!from || !to) continue;
          if (reg.get(from.type) && !reg.surface(from).signals[c.signal]) errors.push(`prefab connection ${c.from} → ${c.to}: ${from.type} "${c.from}" has no signal "${c.signal}" here (an override removed it?)`);
          if (reg.get(to.type) && !reg.surface(to).actions[c.call]) errors.push(`prefab connection ${c.from} → ${c.to}: ${to.type} "${c.to}" has no action "${c.call}" here (an override removed it?)`);
        }
      }
    }
    return { ok: errors.length === 0, errors, warnings };
  }
  return { check, validateSchema: validate };
}

/**
 * A checker for any one JSON Schema (2020-12), as the scene's own validation reads schemas: a behaviour's params
 * (`describeBehaviour(reg, name).schema`) or the state it declares (`reg.behaviours.get(name).state`, M6 W0).
 * @param {object | boolean} schema @returns {(value: unknown) => string[]} the problems with a value (none: it fits)
 */
export function schemaChecker(schema) {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return (value) => (validate(value) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`));
}

// Every id an Instance's overrides may target: the prefab's own ids and, through nested
// Instances, "inner/innerer" paths.
export function innerIds(prefab, prefabs, prefix = '', depth = 0) {
  const out = new Set();
  if (depth > 16) return out;
  const assets = new Map((prefab.assets ?? []).map((a) => [a.id, a]));
  for (const n of prefab.nodes) {
    out.add(prefix + n.id);
    if (n.type === 'Instance') {
      const inner = prefabs.get(assets.get(n.asset)?.ref);
      if (inner) for (const id of innerIds(inner, prefabs, `${prefix}${n.id}/`, depth + 1)) out.add(id);
    }
  }
  return out;
}
