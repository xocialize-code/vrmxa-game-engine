// The MCP tools: generic, with schemas from the registry (AB-R-0933: one tool per node type costs about
// 660 tokens each and doesn't scale; `describe` returns a type's schema on demand instead).
//   scene:   describe, tree, get_node, add_node, set, remove_node, reparent, connect, validate, undo, redo, save
//   engine:  engine_load, engine_step, physics, call_action; tree and get_node with live=true read the
//            running engine instead of the file
// Every edit goes through @vrmxg/scene's editor (undoable, checked against the schema); save writes the
// canonical form and refuses a scene with errors.
import fs from 'node:fs';
import path from 'node:path';
import { createValidator, parse, serialize, createEditor, flatten, describeType, describeBehaviour, changedLines } from '@vrmxg/scene';
import { EngineSession } from './engine.js';

/**
 * @param {{ registry: any, project: import('./project.js').Project, scene: string }} opts scene: path under the project
 */
export function createTools({ registry: reg, project, scene }) {
  const scenePath = project.file(scene);
  const { check } = createValidator(reg);
  const doc = parse(fs.readFileSync(scenePath, 'utf8'));
  let savedText = serialize(doc);
  const prefabs = () => project.prefabs(doc);
  const editor = createEditor(reg, doc, { prefabs });
  const engine = new EngineSession(project);
  const types = [...reg.types.keys()];
  const ID = { type: 'string', description: 'Node id ("instance/inner" inside prefabs)' };
  const LIVE = { type: 'boolean', description: 'Read the running engine (engine_load) instead of the file' };
  const none = { type: 'object', properties: {} };

  const tools = [
    { name: 'describe', description: 'List node types and behaviours, or one type\'s JSON Schema, units, signals, actions and accepted behaviours. Call before using a type.',
      inputSchema: { type: 'object', properties: { type: { type: 'string', enum: types }, behaviour: { type: 'string', enum: [...reg.behaviours.keys()] } } } },
    { name: 'tree', description: 'The scene as an indented tree. flatten expands prefab instances; live shows the running engine with world positions.',
      inputSchema: { type: 'object', properties: { flatten: { type: 'boolean' }, live: LIVE } } },
    { name: 'get_node', description: 'A node as stored, with its signals and actions; live: its simulated state (transform, behaviours, body, character, camera).',
      inputSchema: { type: 'object', required: ['id'], properties: { id: ID, live: LIVE } } },
    { name: 'add_node', description: 'Add a node; props are checked against its type (see describe).',
      inputSchema: { type: 'object', required: ['node'], properties: {
        node: { type: 'object', required: ['id', 'type'], properties: { id: { type: 'string' }, type: { type: 'string', enum: types }, parent: { type: 'string' }, name: { type: 'string' }, asset: { type: 'string' }, transform: { type: 'object', description: '{ p: [x,y,z], q: [x,y,z,w], s: [x,y,z] }' }, props: { type: 'object' }, behaviours: { type: 'array', items: { type: 'object' } }, overrides: { type: 'object' } } },
        index: { type: 'integer', minimum: 0 } } } },
    { name: 'set', description: 'Set a value at a dotted path, e.g. "props.focalLength", "transform.p". Omit value to delete.',
      inputSchema: { type: 'object', required: ['id', 'path'], properties: { id: ID, path: { type: 'string' }, value: {} } } },
    { name: 'remove_node', description: 'Remove a node, its descendants and their connections.', inputSchema: { type: 'object', required: ['id'], properties: { id: ID } } },
    { name: 'reparent', description: 'Move a node under another (root when parent is omitted).', inputSchema: { type: 'object', required: ['id'], properties: { id: ID, parent: ID, index: { type: 'integer', minimum: 0 } } } },
    { name: 'connect', description: 'Connect a node\'s signal to another node\'s action (see get_node for both).',
      inputSchema: { type: 'object', required: ['from', 'signal', 'to', 'call'], properties: { from: ID, signal: { type: 'string' }, to: ID, call: { type: 'string' }, args: { type: 'object' } } } },
    { name: 'validate', description: 'Check the scene: schema errors, broken references; unknown data as warnings.', inputSchema: none },
    { name: 'undo', description: 'Undo the last edit.', inputSchema: none },
    { name: 'redo', description: 'Redo the last undone edit.', inputSchema: none },
    { name: 'save', description: 'Write the scene in canonical form (refused with errors); returns lines changed.', inputSchema: none },
    { name: 'engine_load', description: 'Start a headless engine (physics, characters, input, cameras) from the scene as edited.', inputSchema: none },
    { name: 'engine_step', description: 'Step the engine at 60 Hz. hold: input actions held meanwhile, e.g. {"move_y": 1, "run": true}; replay: an input recording file. Returns signals fired.',
      inputSchema: { type: 'object', properties: { steps: { type: 'integer', minimum: 1, maximum: 36000 }, hold: { type: 'object' }, replay: { type: 'string' } } } },
    { name: 'physics', description: 'The running engine\'s physics: moving bodies (pose, velocity, sleeping), what each sensor holds, solid contacts.', inputSchema: none },
    { name: 'call_action', description: 'Call an action on a live node, e.g. open on a hinge, goTo or say on a character.',
      inputSchema: { type: 'object', required: ['id', 'action'], properties: { id: ID, action: { type: 'string' }, args: { type: 'object' } } } },
  ];

  const treeText = (nodes) => {
    const kids = new Map();
    for (const n of nodes) { const k = n.parent ?? ''; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(n); }
    const out = [];
    const walk = (p, depth) => { for (const n of kids.get(p) ?? []) { out.push(`${'  '.repeat(depth)}${n.id} (${n.type}${n.name ? `, "${n.name}"` : ''})`); walk(n.id, depth + 1); } };
    walk('', 0);
    return out.join('\n');
  };

  const handlers = {
    describe({ type, behaviour }) {
      if (type) return describeType(reg, type);
      if (behaviour) return describeBehaviour(reg, behaviour);
      return { types: types.map((t) => ({ type: t, extends: reg.get(t).extends, description: reg.get(t).description })), behaviours: [...reg.behaviours.values()].map((b) => ({ behaviour: b.name, on: b.on, description: b.description })) };
    },
    tree({ flatten: flat, live }) { return live ? engine.treeText() : treeText(flat ? flatten(doc, prefabs()).nodes : doc.nodes); },
    get_node({ id, live }) {
      if (live) return engine.nodeState(id);
      const n = (id.includes('/') ? flatten(doc, prefabs()).nodes : doc.nodes).find((x) => x.id === id);
      if (!n) throw new Error(`no node "${id}"`);
      const s = reg.surface(n);
      return { node: n, signals: Object.keys(s.signals), actions: Object.keys(s.actions) };
    },
    add_node({ node, index }) { editor.apply({ op: 'add', node, index }); return `added ${node.id}`; },
    set({ id, path: p, value }) { editor.apply({ op: 'set', id, path: p, value }); return `${id}.${p} = ${JSON.stringify(value)}`; },
    remove_node({ id }) { editor.apply({ op: 'remove', id }); return `removed ${id}`; },
    reparent({ id, parent, index }) { editor.apply({ op: 'reparent', id, parent, index }); return `${id} now under ${parent ?? '(root)'}`; },
    connect(a) { editor.apply({ op: 'connect', ...a }); return `connected ${a.from}.${a.signal} -> ${a.to}.${a.call}`; },
    validate() { return check(doc, { prefabs: prefabs() }); },
    undo() { return editor.undo() ? 'undone' : 'nothing to undo'; },
    redo() { return editor.redo() ? 'redone' : 'nothing to redo'; },
    save() {
      const r = check(doc, { prefabs: prefabs() });
      if (!r.ok) throw new Error(`not saved: ${r.errors.length} errors\n${r.errors.join('\n')}`);
      const text = serialize(doc);
      const n = changedLines(savedText, text);
      fs.writeFileSync(scenePath, text); savedText = text;
      return { saved: path.relative(project.root, scenePath), changedLines: n, warnings: r.warnings };
    },
    async engine_load() { return engine.load(structuredClone(doc), prefabs()); },
    engine_step(a) { return engine.step(a); },
    physics() { return engine.physicsState(); },
    call_action({ id, action, args }) { return engine.callAction(id, action, args); },
  };

  /** Run a tool: { text, isError }. Errors come back as text, so an agent can read them and retry. */
  async function call(name, args = {}) {
    const fn = handlers[name];
    if (!fn) return { isError: true, text: `unknown tool ${name}` };
    try {
      const out = await fn(args ?? {});
      return { isError: false, text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) };
    } catch (e) { return { isError: true, text: e.message }; }
  }

  return { tools, call, doc, editor, engine };
}
