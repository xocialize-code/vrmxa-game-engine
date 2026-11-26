// A node's behaviours and connections as the inspector shows them (M6 W1, AB-T-0638), as plain data from the registry
// and the document: no Vue, no session. BehavioursPanel.vue and ConnectionsPanel.vue draw it; the editor's session does
// the edits (EditorSession addBehaviour, setBehaviourParam, connect, setConnection, …), each one undo step.
//
// A behaviour's params are fields like a node's props (propFields: its schema and meta, the registry's own or a project
// behaviour's static describe). A connection is four picks: the signal (the node's type's and its behaviours'), the target
// (a node of the scene), the action (the target's), and the arguments, fields by the action's schema.
import { propFields, looseSchema, widgetOf } from './fields.js';

const named = (o) => Object.entries(o ?? {}).map(([name, m]) => ({ name, description: m?.description ?? '' }));

/**
 * @param {any} reg the registry (with the project's behaviours declared)
 * @param {any} doc the scene document
 * @param {string} id the node
 * @param {{ nodeOf?: (ref: string) => any }} [o] nodeOf: a node inside a prefab instance ("door-1/hinge") as the instance
 *   has it (the editor's session.endNode), so a connection into one shows its action and arguments
 * @returns {null | {
 *   id: string,
 *   behaviours: { use: string, description: string, project: boolean, known: boolean, fields: any[] }[],
 *   addable: { name: string, description: string, project: boolean }[],
 *   signals: { name: string, description: string, from: string }[],
 *   targets: string[],
 *   actions: Record<string, { name: string, description: string }[]>,
 *   connections: { index: number, signal: string, to: string, call: string, args: any, fields: any[], problem: string | null }[],
 *   incoming: { index: number, from: string, signal: string, call: string }[],
 * }}
 */
export function wiringView(reg, doc, id, { nodeOf = () => null } = {}) {
  const nodes = doc?.nodes ?? [];
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const t = reg.get(node.type);
  const behaviours = (node.behaviours ?? []).map((b) => {
    const d = reg.behaviours.get(b.use);
    const { use, ...values } = b;
    // a param the behaviour doesn't declare (or every param of one the registry doesn't know) is kept in the file: shown
    // read-only, removable
    const extra = Object.entries(values).filter(([k]) => !d?.params[k]).map(([key, value]) => {
      const schema = looseSchema(value);
      return { key, schema, meta: {}, widget: widgetOf(schema, {}, value), value, default: undefined, set: true, enabled: false, visible: true, unknown: true, description: `${use} doesn't declare ${key}: kept as it is` };
    });
    return { use, description: d?.description ?? '', project: d?.source === 'project', known: !!d, fields: [...(d ? propFields(d.params, values) : []), ...extra] };
  });
  const has = new Set(behaviours.map((b) => b.use));
  const addable = [...reg.behaviours.values()]
    .filter((b) => !has.has(b.name) && (!b.on || b.on.some((o) => reg.isA(node.type, o))))
    .map((b) => ({ name: b.name, description: b.description ?? '', project: b.source === 'project' }));
  const signals = [
    ...named(t?.signals).map((s) => ({ ...s, from: node.type })),
    ...(node.behaviours ?? []).flatMap((b) => named(reg.behaviours.get(b.use)?.signals).map((s) => ({ ...s, from: b.use }))),
  ].filter((s, i, all) => all.findIndex((x) => x.name === s.name) === i);
  const actions = Object.fromEntries(nodes.map((n) => [n.id, named(reg.surface(n).actions)]));
  const connections = [], incoming = [];
  (doc.connections ?? []).forEach((c, index) => {
    if (c.to === id && c.from !== id) incoming.push({ index, from: c.from, signal: c.signal, call: c.call });
    if (c.from !== id) return;
    const target = byId.get(c.to) ?? (c.to?.includes('/') ? nodeOf(c.to) : null);
    if (target && !actions[c.to]) actions[c.to] = named(reg.surface(target).actions); // an inner node's, for its menu
    const act = target ? reg.surface(target).actions[c.call] : null;
    const problem = !signals.some((s) => s.name === c.signal) && t ? `${id} has no signal ${c.signal}`
      : !target ? (c.to?.includes('/') ? null : `no node ${c.to}`) // an inner node whose prefab isn't loaded: not judged
      : reg.get(target.type) && !act ? `${c.to} has no action ${c.call}` : null;
    connections.push({ index, signal: c.signal, to: c.to, call: c.call, args: c.args ?? null, fields: act ? propFields(act.args, c.args) : [], problem });
  });
  return { id, behaviours, addable, signals, targets: nodes.map((n) => n.id), actions, connections, incoming };
}

/**
 * A connection's target changed in its panel: what to do with it (M6 W1 review). When the new target has the connection's
 * action, the change is sent as it is ({ set: { to } }); when it hasn't, the panel holds the new target ({ pending }) and
 * offers that target's actions, and the pick sends both at once ({ to, call }), one undo step. Back to the connection's
 * own target: nothing to hold ({ clear: true }).
 * @param {{ actions: Record<string, { name: string }[]> }} wiring @param {{ to: string, call: string }} c @param {string} to
 * @returns {{ set: { to: string } } | { pending: string } | { clear: true }}
 */
export function retarget(wiring, c, to) {
  if (to === c.to) return { clear: true };
  return (wiring.actions[to] ?? []).some((a) => a.name === c.call) ? { set: { to } } : { pending: to };
}

/** The node after `id` in the document's order (what the inspector's Before menu shows), or '' when it is the last. */
export function nodeAfter(doc, id) {
  const i = (doc?.nodes ?? []).findIndex((n) => n.id === id);
  return i >= 0 ? doc.nodes[i + 1]?.id ?? '' : '';
}
