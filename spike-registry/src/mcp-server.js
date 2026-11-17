#!/usr/bin/env node
// MCP server over stdio for one .vrmxs scene: describe (from the registry), inspect, edit with
// undo, validate, save. Tool input schemas are generated from the registry, so a new node type
// shows up in the tools without touching this file.
//
//   node src/mcp-server.js <project-root> <scene.vrmxs> [--per-type]
//
// --per-type adds one add_<Type> tool per node type with that type's full schema (the alternative
// the spike measures against the default: generic tools + describe on demand).
import fs from 'node:fs';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { m0Registry } from './nodes.js';
import { createValidator, parse, serialize } from './doc.js';
import { createEditor } from './edit.js';
import { flatten } from './instance.js';
import { describeType, describeBehaviour, nodeSchema } from './schema.js';
import { changedLines } from './linediff.js';

const [root, sceneRel] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PER_TYPE = process.argv.includes('--per-type');
const scenePath = path.resolve(root, sceneRel);
const reg = m0Registry();
const { check } = createValidator(reg);
let doc = parse(fs.readFileSync(scenePath, 'utf8'));
let savedText = serialize(doc);
const editor = createEditor(reg, doc, { prefabs: () => loadPrefabs(doc) });

function loadPrefabs(d, map = new Map(), depth = 0) {
  for (const a of d.assets ?? []) {
    if (a.type !== 'vrmxs' || map.has(a.ref) || depth > 16) continue;
    const file = path.resolve(root, a.ref);
    if (!fs.existsSync(file)) continue;
    const p = parse(fs.readFileSync(file, 'utf8'));
    map.set(a.ref, p);
    loadPrefabs(p, map, depth + 1);
  }
  return map;
}

const types = [...reg.types.keys()];
const ID = { type: 'string', description: 'Node id' };
const TOOLS = [
  { name: 'describe', description: 'List node types and behaviours, or describe one: its JSON Schema, units, signals, actions and which behaviours it accepts. Call this before adding or editing a type you have not used.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: types, description: 'A node type to describe' }, behaviour: { type: 'string', enum: [...reg.behaviours.keys()] } } } },
  { name: 'tree', description: 'The scene as an indented tree of id, type and name. flatten=true expands prefab instances (ids become "instance/inner").',
    inputSchema: { type: 'object', properties: { flatten: { type: 'boolean' } } } },
  { name: 'get_node', description: 'One node as stored, plus the signals and actions it has (from its type and behaviours).',
    inputSchema: { type: 'object', required: ['id'], properties: { id: ID } } },
  { name: 'add_node', description: 'Add a node. Its props are checked against the type\'s schema (see describe).',
    inputSchema: { type: 'object', required: ['node'], properties: {
      node: { type: 'object', required: ['id', 'type'], properties: { id: ID, type: { type: 'string', enum: types }, parent: ID, name: { type: 'string' }, asset: { type: 'string' }, transform: { type: 'object' }, props: { type: 'object' }, behaviours: { type: 'array', items: { type: 'object' } }, overrides: { type: 'object' } } },
      index: { type: 'integer', minimum: 0, description: 'Position in the node list (sibling order); default end' } } } },
  { name: 'set', description: 'Set a value at a dotted path on a node, e.g. path "props.focalLength" or "transform.p". Omit value to delete.',
    inputSchema: { type: 'object', required: ['id', 'path'], properties: { id: ID, path: { type: 'string' }, value: {} } } },
  { name: 'remove_node', description: 'Remove a node, its descendants and the connections that touch them.', inputSchema: { type: 'object', required: ['id'], properties: { id: ID } } },
  { name: 'reparent', description: 'Move a node under another (or to the root when parent is omitted).', inputSchema: { type: 'object', required: ['id'], properties: { id: ID, parent: ID, index: { type: 'integer', minimum: 0 } } } },
  { name: 'connect', description: 'Connect a node\'s signal to another node\'s action. Both must exist on the nodes (see get_node). Nodes inside a prefab instance are addressed by path, e.g. "door-1/hinge" (see tree with flatten).',
    inputSchema: { type: 'object', required: ['from', 'signal', 'to', 'call'], properties: { from: ID, signal: { type: 'string' }, to: ID, call: { type: 'string' }, args: { type: 'object' } } } },
  { name: 'validate', description: 'Check the whole scene: schema errors, broken references, unknown types or props kept as warnings.', inputSchema: { type: 'object', properties: {} } },
  { name: 'undo', description: 'Undo the last edit.', inputSchema: { type: 'object', properties: {} } },
  { name: 'redo', description: 'Redo the last undone edit.', inputSchema: { type: 'object', properties: {} } },
  { name: 'save', description: 'Write the scene in canonical form; returns how many lines changed since the last save.', inputSchema: { type: 'object', properties: {} } },
];
if (PER_TYPE) for (const t of types) TOOLS.push({ name: `add_${t}`, description: `Add a ${t}: ${reg.get(t).description}`, inputSchema: { type: 'object', required: ['node'], properties: { node: nodeSchema(reg, t), index: { type: 'integer' } } } });

function treeText(nodes) {
  const kids = new Map();
  for (const n of nodes) { const k = n.parent ?? ''; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(n); }
  const out = [];
  const walk = (p, depth) => { for (const n of kids.get(p) ?? []) { out.push(`${'  '.repeat(depth)}${n.id} (${n.type}${n.name ? `, "${n.name}"` : ''})`); walk(n.id, depth + 1); } };
  walk('', 0);
  return out.join('\n');
}

const handlers = {
  describe({ type, behaviour }) {
    if (type) return describeType(reg, type);
    if (behaviour) return describeBehaviour(reg, behaviour);
    return { types: types.map((t) => ({ type: t, extends: reg.get(t).extends, description: reg.get(t).description })), behaviours: [...reg.behaviours.values()].map((b) => ({ behaviour: b.name, on: b.on, description: b.description })) };
  },
  tree({ flatten: flat }) { return treeText(flat ? flatten(doc, loadPrefabs(doc)).nodes : doc.nodes); },
  get_node({ id }) { const n = (id.includes('/') ? flatten(doc, loadPrefabs(doc)).nodes : doc.nodes).find((x) => x.id === id); if (!n) throw new Error(`no node "${id}"`); const s = reg.surface(n); return { node: n, signals: Object.keys(s.signals), actions: Object.keys(s.actions) }; },
  add_node({ node, index }) { editor.apply({ op: 'add', node, index }); return `added ${node.id}`; },
  set({ id, path: p, value }) { editor.apply({ op: 'set', id, path: p, value }); return `${id}.${p} = ${JSON.stringify(value)}`; },
  remove_node({ id }) { editor.apply({ op: 'remove', id }); return `removed ${id}`; },
  reparent({ id, parent, index }) { editor.apply({ op: 'reparent', id, parent, index }); return `${id} now under ${parent ?? '(root)'}`; },
  connect(a) { editor.apply({ op: 'connect', ...a }); return `connected ${a.from}.${a.signal} -> ${a.to}.${a.call}`; },
  validate() { return check(doc, { prefabs: loadPrefabs(doc) }); },
  undo() { return editor.undo() ? 'undone' : 'nothing to undo'; },
  redo() { return editor.redo() ? 'redone' : 'nothing to redo'; },
  save() {
    const r = check(doc, { prefabs: loadPrefabs(doc) });
    if (!r.ok) throw new Error(`not saved: ${r.errors.length} errors\n${r.errors.join('\n')}`);
    const text = serialize(doc);
    const n = changedLines(savedText, text);
    fs.writeFileSync(scenePath, text); savedText = text;
    return { saved: path.relative(root, scenePath), changedLines: n, warnings: r.warnings };
  },
};
for (const t of types) handlers[`add_${t}`] = ({ node, index }) => handlers.add_node({ node: { ...node, type: t }, index });

const server = new Server({ name: 'vrmxg-scene', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const fn = handlers[req.params.name];
  if (!fn) return { isError: true, content: [{ type: 'text', text: `unknown tool ${req.params.name}` }] };
  try {
    const out = fn(req.params.arguments ?? {});
    return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: e.message }] }; // the agent reads the reason and retries
  }
});
await server.connect(new StdioServerTransport());
