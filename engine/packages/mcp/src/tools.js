// The MCP tools: generic, with schemas from the registry (AB-R-0933: one tool per node type costs about
// 660 tokens each and doesn't scale; `describe` returns a type's schema on demand instead). One list, two targets:
//   headless (server.js <root> <scene>): the scene file, edited with undo, and a headless engine in Node
//   editor   (server.js --editor): the scene open in the VRMXG editor, edited through its command log (each edit is
//            one step of the editor's own Undo), its play world driven and read, screenshots of its view
// No Node APIs here: the editor runs these handlers in the page.
//   scene:   describe, tree, get_node, add_node, set, remove_node, reparent, connect, validate, undo, redo, save
//   engine:  engine_load (headless) or play (editor), engine_step, physics, call_action, interact; screenshot (editor);
//            tree and get_node with live=true read the running world instead of the file
//   M2 W11:  edit (a batch of edit ops as one undo step: how sequences are edited, setDoc on sequence.*), sequence (the
//            outline, a setDoc path's value, or the world on a frame with its hash), brain (inspect / inject / record / replay); screenshot of
//            any sequence frame (editor). Answers are compact JSON, cut at OUTPUT_LIMIT characters.

/** What the server tells a client at initialize: the few rules that save an agent a round trip. */
export const INSTRUCTIONS = [
  'VRMXG scenes (.vrmxs) are node trees; call describe before using a node type or behaviour, and validate before save.',
  'Every edit is one undo step; edit batches several (add, set, remove, reparent, connect, setDoc) into one.',
  'A sequence is a scene with a "sequence" block (shots, markers, tracks); edit it with setDoc ops on paths like sequence.tracks (read what a path holds first: sequence with path).',
  'The engine is deterministic at 60 Hz: engine_step and sequence frames replay bit for bit, and sequence returns a world hash to compare.',
  'NPC brains: brain op=inspect shows the running branch and blackboard; op=inject gives a goal or an action on a step, logged for replay.',
].join(' ');

export const OUTPUT_LIMIT = 24000;

/** Pixel statistics of an RGBA still: a blank frame (one flat colour) is a failed render, not a picture. */
export function imageStats(rgba) {
  let n = 0, sum = 0, sq = 0;
  for (let i = 0; i < rgba.length; i += 16) { const y = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]; sum += y; sq += y * y; n++; }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  return { meanLuma: Math.round(mean * 10) / 10, sdLuma: Math.round(sd * 10) / 10, blank: sd < 2 };
}
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
  tools.push(
    { name: 'edit', description: 'Several edits as one undo step, all or nothing. ops: {op:"add",node} {op:"set",id,path,value} {op:"remove",id} {op:"reparent",id,parent} {op:"connect",from,signal,to,call,args} {op:"setDoc",path,value} (path under sequence or settings, e.g. "sequence.shots").',
      inputSchema: { type: 'object', required: ['ops'], properties: { ops: { type: 'array', minItems: 1, items: { type: 'object', required: ['op'] } }, label: { type: 'string' } } } },
    { name: 'sequence', description: `A sequence's outline (shots, markers, tracks, cast); with path, the value there as JSON (the paths setDoc writes, e.g. "sequence.tracks.4" or "sequence.cast.mira": read it, change it, write it back); with frame, the ${mode === 'editor' ? 'preview' : 'running'} world put on that frame exactly as playing would reach it: shot, camera, lines, and a world hash to compare replays.`,
      inputSchema: { type: 'object', properties: { frame: { type: 'number', minimum: 0 }, path: { type: 'string' } } } },
    { name: 'brain', description: 'An NPC brain in the running world. inspect: running branch, utility scores, goal, blackboard, memory. inject: a goal {name,params} or an action {do,args} on a step (logged). record: the events applied. replay: a log.',
      inputSchema: { type: 'object', properties: { op: { type: 'string', enum: ['inspect', 'inject', 'record', 'replay'] }, id: ID, goal: { type: 'object' }, action: { type: 'object' }, step: { type: 'integer', minimum: 0 }, log: { type: 'array' } } } },
  );
  if (mode === 'editor') tools.push({ name: 'screenshot', description: 'A PNG of the editor\'s view (the play camera while playing); frame: that frame of the open sequence, as exported, with its world hash and a blank-frame check.', inputSchema: { type: 'object', properties: { width: { type: 'integer', minimum: 64, maximum: 1920 }, height: { type: 'integer', minimum: 64, maximum: 1080 }, frame: { type: 'number', minimum: 0 } } } });
  return tools;
}

/** The value at a setDoc path ("sequence.tracks.4.keys", "settings.physics"): what an edit would replace. */
function docAt(doc, path) {
  const parts = String(path).split('.');
  if (parts[0] !== 'sequence' && parts[0] !== 'settings') throw new Error(`path: under sequence or settings, as setDoc writes (not "${path}")`);
  let v = doc;
  for (const [i, k] of parts.entries()) {
    if (v === null || typeof v !== 'object' || !(k in v)) throw new Error(`${parts.slice(0, i + 1).join('.')}: nothing there${v && typeof v === 'object' ? ` (has ${Object.keys(v).slice(0, 20).join(', ')})` : ''}`);
    v = v[k];
  }
  return v;
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
    async screenshot({ width = 960, height = 540, frame }) {
      if (!target.screenshot) throw new Error('no view to take a screenshot of');
      const { stats, hash, frame: f, ...image } = await target.screenshot({ width, height, frame });
      return { image, note: [f !== undefined ? `frame ${f}` : null, hash ? `hash ${hash}` : null, stats ? `luma ${stats.meanLuma}±${stats.sdLuma}${stats.blank ? ' BLANK' : ''}` : null].filter(Boolean).join(', ') };
    },
    edit({ ops, label }) {
      if (!Array.isArray(ops) || !ops.length) throw new Error('ops: one or more edit ops');
      const name = label ?? (ops.length === 1 ? `${ops[0].op} ${ops[0].id ?? ops[0].path ?? ops[0].node?.id ?? ''}`.trim() : `${ops.length} edits`);
      target.apply({ op: 'batch', ops, label: name }, name);
      return `${ops.length} edit${ops.length > 1 ? 's' : ''} applied as one undo step ("${name}")`;
    },
    async sequence({ frame, path }) {
      if (path !== undefined) return docAt(target.doc(), path);
      if (frame === undefined) {
        const seq = target.doc().sequence;
        if (!seq) throw new Error('the scene has no sequence block');
        return { fps: seq.fps ?? 24, duration: seq.duration, seconds: Math.round((seq.duration / (seq.fps ?? 24)) * 100) / 100, set: target.doc().set ?? null,
          shots: (seq.shots ?? []).map((x) => `${x.id} ${x.start}-${x.end}${x.name ? ` "${x.name}"` : ''}`), markers: (seq.markers ?? []).map((m) => `${m.frame} ${m.name}`),
          tracks: (seq.tracks ?? []).map((t, i) => `[${i}] ${t.id} (${t.type}${t.target ? ` → ${t.target}` : ''}) ${t.clips ? `${t.clips.length} clips` : 'keys'}`),
          cast: Object.keys(seq.cast ?? {}), read: 'sequence with path "sequence.tracks.<i>" (or any setDoc path) gives the value to edit' };
      }
      return target.sequenceAt ? target.sequenceAt(frame) : target.live().sequenceAt(frame);
    },
    brain(args) { return target.live().brainOp(args); },
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
      if (out?.image) return { isError: false, text: `${out.image.width}×${out.image.height} PNG${out.note ? `; ${out.note}` : ''}`, image: out.image };
      const text = typeof out === 'string' ? out : JSON.stringify(out);
      return { isError: false, text: text.length > OUTPUT_LIMIT ? `${text.slice(0, OUTPUT_LIMIT)}… (cut at ${OUTPUT_LIMIT} of ${text.length} characters: ask for less)` : text };
    } catch (e) { return { isError: true, text: e.message }; }
  };
}
