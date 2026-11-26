// A node's behaviours and connections as the inspector shows them (M6 W1, AB-T-0638), as plain data from the registry
// and the document: no Vue, no session. BehavioursPanel.vue and ConnectionsPanel.vue draw it; the editor's session does
// the edits (EditorSession addBehaviour, setBehaviourParam, connect, setConnection, …), each one undo step.
//
// A behaviour's params are fields like a node's props (propFields: its schema and meta, the registry's own or a project
// behaviour's static describe). A connection is four picks: the signal (the node's type's and its behaviours'), the target
// (a node of the scene), the action (the target's), and the arguments, fields by the action's schema.
import { propFields } from './fields.js';

const named = (o) => Object.entries(o ?? {}).map(([name, m]) => ({ name, description: m?.description ?? '' }));

/**
 * @param {any} reg the registry (with the project's behaviours declared)
 * @param {any} doc the scene document
 * @param {string} id the node
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
export function wiringView(reg, doc, id) {
  const nodes = doc?.nodes ?? [];
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const t = reg.get(node.type);
  const behaviours = (node.behaviours ?? []).map((b) => {
    const d = reg.behaviours.get(b.use);
    const { use, ...values } = b;
    return { use, description: d?.description ?? '', project: d?.source === 'project', known: !!d, fields: d ? propFields(d.params, values) : [] };
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
    const target = byId.get(c.to) ?? null;
    const act = target ? reg.surface(target).actions[c.call] : null;
    const problem = !signals.some((s) => s.name === c.signal) && t ? `${id} has no signal ${c.signal}`
      : !target ? (c.to?.includes('/') ? null : `no node ${c.to}`)
      : reg.get(target.type) && !act ? `${c.to} has no action ${c.call}` : null;
    connections.push({ index, signal: c.signal, to: c.to, call: c.call, args: c.args ?? null, fields: act ? propFields(act.args, c.args) : [], problem });
  });
  return { id, behaviours, addable, signals, targets: nodes.map((n) => n.id), actions, connections, incoming };
}

/** The node after `id` in the document's order (what the inspector's Before menu shows), or '' when it is the last. */
export function nodeAfter(doc, id) {
  const i = (doc?.nodes ?? []).findIndex((n) => n.id === id);
  return i >= 0 ? doc.nodes[i + 1]?.id ?? '' : '';
}
