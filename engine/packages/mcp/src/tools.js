// The MCP tools: generic, with schemas from the registry (AB-R-0933: one tool per node type costs about
// 660 tokens each and doesn't scale; `describe` returns a type's schema on demand instead). One list, two targets:
//   headless (server.js <root> <scene>): the scene file, edited with undo, and a headless engine in Node
//   editor   (server.js --editor): the scene open in the VRMXG editor, edited through its command log (each edit is
//            one step of the editor's own Undo), its play world driven and read, screenshots of its view
// No Node APIs here: the editor runs these handlers in the page.
//   scene:   describe, tree, get_node, add_node, set, remove_node, reparent, connect, validate, undo, redo, save
//   engine:  engine_load (headless) or play (editor), engine_step, physics, call_action, interact; screenshot (editor);
//            tree and get_node with live=true read the running world instead of the file
import { createValidator, flatten, describeType, describeBehaviour } from '@vrmxg/scene';

/**
 * The tool list for a target.
 * @param {any} reg the registry @param {'headless' | 'editor'} mode
 */
export function toolList(reg, mode = 'headless') {
  const types = [...reg.types.keys()];
  const ID = { type: 'string', description: 'Node id ("instance/inner" inside prefabs)' };
  const LIVE = { type: 'boolean', description: mode === 'editor' ? 'Read the play world instead of the scene' : 'Read the running engine (engine_load) instead of the file' };
  const none = { type: 'object', properties: {} };
  const tools = [
    { name: 'describe', description: 'List node types and behaviours, or one type\'s JSON Schema, units, signals, actions and accepted behaviours. Call before using a type.',
      inputSchema: { type: 'object', properties: { type: { type: 'string', enum: types }, behaviour: { type: 'string', enum: [...reg.behaviours.keys()] } } } },
    { name: 'tree', description: 'The scene as an indented tree. flatten expands prefab instances; live shows the running world with world positions.',
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
    { name: 'undo', description: mode === 'editor' ? 'Undo the editor\'s last edit (yours or the person\'s).' : 'Undo the last edit.', inputSchema: none },
    { name: 'redo', description: 'Redo the last undone edit.', inputSchema: none },
    { name: 'save', description: 'Write the scene in canonical form (refused with errors).', inputSchema: none },
    mode === 'editor'
      ? { name: 'play', description: 'Play the scene in the editor (play), stop (the scene comes back unchanged), pause or resume.',
        inputSchema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['play', 'stop', 'pause', 'resume'] } } } }
      : { name: 'engine_load', description: 'Start a headless engine (physics, characters, input, cameras) from the scene as edited.', inputSchema: none },
    { name: 'engine_step', description: `Step at 60 Hz${mode === 'editor' ? ' (paused: at once; playing: in real time)' : ''}. hold: input actions held meanwhile, e.g. {"move_y": 1, "run": true}; replay: an input recording file. Returns signals fired.`,
      inputSchema: { type: 'object', properties: { steps: { type: 'integer', minimum: 1, maximum: 36000 }, hold: { type: 'object' }, replay: { type: 'string' } } } },
    { name: 'physics', description: 'The running world\'s physics: moving bodies (pose, velocity, sleeping), what each sensor holds, solid contacts.', inputSchema: none },
    { name: 'call_action', description: 'Call an action on a live node, e.g. open on a hinge, goTo, say or lookAt on a character.',
      inputSchema: { type: 'object', required: ['id', 'action'], properties: { id: ID, action: { type: 'string' }, args: { type: 'object' } } } },
    { name: 'interact', description: 'A character does an item\'s verb (take, use, sit, open), as the player\'s interact would.',
      inputSchema: { type: 'object', required: ['actor', 'item', 'verb'], properties: { actor: ID, item: ID, verb: { type: 'string' } } } },
  ];
  if (mode === 'editor') tools.push({ name: 'screenshot', description: 'A PNG of the editor\'s view (the play camera while playing).', inputSchema: { type: 'object', properties: { width: { type: 'integer', minimum: 64, maximum: 1920 }, height: { type: 'integer', minimum: 64, maximum: 1080 } } } });
  return tools;
}

const treeText = (nodes) => {
  const kids = new Map();
  for (const n of nodes) { const k = n.parent ?? ''; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(n); }
  const out = [];
  const walk = (p, depth) => { for (const n of kids.get(p) ?? []) { out.push(`${'  '.repeat(depth)}${n.id} (${n.type}${n.name ? `, "${n.name}"` : ''})`); walk(n.id, depth + 1); } };
  walk('', 0);
  return out.join('\n');
};

/**
 * The handlers over a target:
 *   doc(), prefabs(): the scene being edited     apply(op, label): one undoable edit     undo(), redo(): booleans
 *   save(): what was written                     live(): a LiveView of the running world (throws if none)
 *   load() (headless) | play(action) (editor)    recording(ref): an input recording, read     step(view, opts)?: how to step
 *   screenshot({ width, height })?: { data: base64 PNG, width, height }
 * @param {any} reg @param {any} target
 */
export function createHandlers(reg, target) {
  const { check } = createValidator(reg);
  const types = [...reg.types.keys()];
  return {
    describe({ type, behaviour }) {
      if (type) return describeType(reg, type);
      if (behaviour) return describeBehaviour(reg, behaviour);
      return { types: types.map((t) => ({ type: t, extends: reg.get(t).extends, description: reg.get(t).description })), behaviours: [...reg.behaviours.values()].map((b) => ({ behaviour: b.name, on: b.on, description: b.description })) };
    },
    tree({ flatten: flat, live }) { const doc = target.doc(); return live ? target.live().treeText() : treeText(flat ? flatten(doc, target.prefabs()).nodes : doc.nodes); },
    get_node({ id, live }) {
      if (live) return target.live().nodeState(id);
      const doc = target.doc();
      const n = (id.includes('/') ? flatten(doc, target.prefabs()).nodes : doc.nodes).find((x) => x.id === id);
      if (!n) throw new Error(`no node "${id}"`);
      const s = reg.surface(n);
      return { node: n, signals: Object.keys(s.signals), actions: Object.keys(s.actions) };
    },
    add_node({ node, index }) { target.apply({ op: 'add', node, index }, `Add ${node.id}`); return `added ${node.id}`; },
    set({ id, path: p, value }) { target.apply({ op: 'set', id, path: p, value }, `Set ${id} ${p}`); return `${id}.${p} = ${JSON.stringify(value)}`; },
    remove_node({ id }) { target.apply({ op: 'remove', id }, `Delete ${id}`); return `removed ${id}`; },
    reparent({ id, parent, index }) { target.apply({ op: 'reparent', id, parent, index }, `Move ${id} under ${parent ?? 'the root'}`); return `${id} now under ${parent ?? '(root)'}`; },
    connect(a) { target.apply({ op: 'connect', ...a }, `Connect ${a.from} ${a.signal}`); return `connected ${a.from}.${a.signal} -> ${a.to}.${a.call}`; },
    validate() { return check(target.doc(), { prefabs: target.prefabs() }); },
    undo() { return target.undo() ? 'undone' : 'nothing to undo'; },
    redo() { return target.redo() ? 'redone' : 'nothing to redo'; },
    save() {
      const r = check(target.doc(), { prefabs: target.prefabs() });
      if (!r.ok) throw new Error(`not saved: ${r.errors.length} errors\n${r.errors.join('\n')}`);
      return target.save(r);
    },
    engine_load() { return target.load(); },
    play({ action }) { return target.play(action); },
    async engine_step({ steps, hold, replay }) {
      const view = target.live();
      const opts = { steps, hold, recording: replay ? await target.recording(replay) : undefined };
      return target.step ? target.step(view, opts) : view.step(opts);
    },
    physics() { return target.live().physicsState(); },
    call_action({ id, action, args }) { return target.live().callAction(id, action, args); },
    interact({ actor, item, verb }) { return target.live().interact(actor, item, verb); },
    async screenshot({ width = 960, height = 540 }) { if (!target.screenshot) throw new Error('no view to take a screenshot of'); return { image: await target.screenshot({ width, height }) }; },
  };
}

/**
 * Run a tool: { text, isError, image? }. Errors come back as text, so an agent can read them and retry.
 * @param {Record<string, (args: any) => any>} handlers
 */
export function caller(handlers) {
  return async function call(name, args = {}) {
    const fn = handlers[name];
    if (!fn) return { isError: true, text: `unknown tool ${name}` };
    try {
      const out = await fn(args ?? {});
      if (out?.image) return { isError: false, text: `${out.image.width}×${out.image.height} PNG`, image: out.image };
      return { isError: false, text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) };
    } catch (e) { return { isError: true, text: e.message }; }
  };
}
