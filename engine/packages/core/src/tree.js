// The scene tree: turns a .vrmxs document into live nodes, runs the lifecycle, steps the simulation at
// a fixed 60 Hz, routes signals to actions, and turns the live tree back into a document.
//
// One step, in this order (documented because replays depend on it):
//   1. autoload services' physicsProcess, in declaration order;
//   2. timers and tweens, in creation order;
//   3. every processing node in tree order (pre-order: parent before children, siblings in order):
//      the node's physicsProcess, then its behaviours' in attachment order, then its state machine;
//   4. autoload services' afterNodes, in declaration order (the physics world steps here, after
//      nodes and behaviours have set this step's inputs, and its events dispatch);
//   5. the clock advances.
// Nodes added during a step first process on the next one. Signals dispatch immediately, in
// connection order.
import { flatten } from '@vrmxg/scene';
import { Node } from './node.js';
import { Clock, DT } from './clock.js';
import { RandomStreams } from './rng.js';
import { TimerService } from './timers.js';

const NOOP_STEP = Node.prototype.physicsProcess;
const PROCESS_MODES = new Set(['inherit', 'pausable', 'always', 'disabled']);

export class SceneTree {
  /**
   * @param {object} opts
   * @param {import('@vrmxg/registry').Registry} opts.registry node and behaviour definitions
   * @param {Map<string, typeof Node>} [opts.classes] node classes by type; types without one get Node
   * @param {Map<string, typeof import('./behaviour.js').Behaviour>} [opts.behaviours] behaviour classes by name
   * @param {Map<string, any>} [opts.prefabs] parsed .vrmxs prefab documents by ref
   * @param {number} [opts.seed] scene seed for the random streams
   */
  constructor({ registry, classes = new Map(), behaviours = new Map(), prefabs = new Map(), seed = 1 }) {
    this.registry = registry;
    this.classes = classes;
    this.behaviourClasses = behaviours;
    this.prefabs = prefabs;
    this.clock = new Clock();
    this.rng = new RandomStreams(seed);
    this.timers = new TimerService();
    /** Autoload services by name (vrmxg.json "autoload"). */
    this.services = new Map();
    this.root = new Node({ id: '', type: '__root' });
    this.root._isRoot = true;
    this.root.tree = this;
    /** @type {Map<string, Node>} */ this.byId = new Map();
    /** @type {Map<Node, Map<string, any[]>>} */ this.links = new Map();
    /** @type {Node[] | null} cached tree order for step(); null after the tree changes */
    this._order = null;
    /** Bumped whenever nodes are added or removed: presentation layers resync their views on a change. */
    this.structureVersion = 0;
    /** Actions that were called but that no node method or behaviour implements: [{ id, action }]. */
    this.unhandled = [];
    this.doc = null;
    /**
     * three.js objects that left this world's graph while it ran and won't be drawn by it again (a removed node's
     * object, a character's old body, an item's model, a wearable taken off): the host disposes them with the world, as
     * nothing under the root reaches them any more (AB-T-0626). Presentation only: never in the state or the hashes.
     * @type {Set<import('three').Object3D>}
     */
    this.detached = new Set();
  }

  /** Hand over an object that left the world's graph for good, for the host to dispose with the world (`detached`). */
  detach(object3d) { if (object3d) this.detached.add(object3d); return object3d; }

  // ---------------------------------------------------------------- building

  /**
   * Instantiate a scene. Prefab instances are expanded (inner ids become "instance/inner"),
   * every node enters the tree, then becomes ready.
   * @param {any} doc a parsed .vrmxs document
   */
  instantiate(doc) {
    this.doc = structuredClone(doc);
    const flat = flatten(doc, this.prefabs);
    const created = flat.nodes.map((data) => this._create(data));
    for (const n of created) this._attach(n, n._parentId === undefined ? this.root : this.byId.get(n._parentId));
    for (const c of flat.connections) this._link(c);
    this._baseline = this._instanceBaselines(doc);
    this._enter(this.root.children);
    return this;
  }

  /**
   * Add a node (and, for an Instance, its prefab's nodes) to the running tree.
   * @param {any} data node data as in a document
   * @param {number} [index] position among its siblings
   */
  add(data, index) {
    if (this.byId.has(data.id)) throw new Error(`node "${data.id}" already exists`);
    const parent = data.parent === undefined ? this.root : this.byId.get(data.parent);
    if (!parent) throw new Error(`parent "${data.parent}" does not exist`);
    const flat = data.type === 'Instance' ? flatten({ assets: this.doc?.assets, nodes: [data] }, this.prefabs) : { nodes: [data], connections: [] };
    const created = flat.nodes.map((d) => this._create(d));
    this._attach(created[0], parent, index);
    for (const n of created.slice(1)) this._attach(n, this.byId.get(n._parentId));
    for (const c of flat.connections) this._link(c);
    this._enter([created[0]]);
    return created[0];
  }

  /** Remove a node and its subtree: exitTree children first, then timers and connections go. */
  remove(id) {
    const node = this.byId.get(id);
    if (!node) throw new Error(`no node "${id}"`);
    const gone = [];
    const exit = (n) => { for (const c of [...n.children]) exit(c); n.exitTree(); for (const b of n.behaviours) b.exitTree(); gone.push(n); };
    exit(node);
    const parent = node.parent;
    parent.children.splice(parent.children.indexOf(node), 1);
    parent.object3d.remove(node.object3d);
    this.detach(node.object3d); // what it held: the host disposes it with the world (models, bodies: their exitTree)
    node.parent = null;
    this._order = null;
    this.structureVersion++;
    for (const n of gone) { this.byId.delete(n.id); this.links.delete(n); this.timers.cancelOwnedBy(n); n.tree = null; }
    // Connections into the removed subtree go too; code listeners (fn) stay with their emitter.
    for (const map of this.links.values()) for (const [sig, list] of map) map.set(sig, list.filter((l) => l.fn || this.byId.has(l.to)));
    return node;
  }

  _create(data) {
    const def = this.registry.get(data.type) ?? null;
    const Cls = this.classes.get(data.type) ?? Node;
    const node = new Cls(data, def);
    node._parentId = data.parent;
    return node;
  }

  _attach(node, parent, index) {
    if (!parent) throw new Error(`parent "${node._parentId}" of "${node.id}" does not exist`);
    if (this.byId.has(node.id)) throw new Error(`duplicate node id "${node.id}"`);
    node.parent = parent;
    const i = index ?? parent.children.length;
    parent.children.splice(i, 0, node);
    parent.object3d.add(node.object3d);
    this.byId.set(node.id, node);
    this._order = null;
    this.structureVersion++;
  }

  // enterTree pre-order, then behaviours attach, then ready post-order (Godot's order).
  _enter(nodes) {
    const order = [];
    const pre = (n) => { n.tree = this; order.push(n); n.enterTree(); for (const c of n.children) pre(c); };
    for (const n of nodes) pre(n);
    for (const n of order) this._attachBehaviours(n);
    const post = (n) => { for (const c of n.children) post(c); n.ready(); for (const b of n.behaviours) b.ready(); n.stateMachine?.start(); if (n !== this.root) this.emit(n, 'ready', {}); };
    for (const n of nodes) post(n);
    this._order = null;
  }

  _attachBehaviours(node) {
    node.behaviours = [];
    for (const entry of node.behaviourEntries) {
      const Cls = this.behaviourClasses.get(entry.use);
      if (Cls) node.behaviours.push(new Cls(node, entry)); // unknown or unimplemented: data kept, nothing runs
    }
  }

  // ---------------------------------------------------------------- signals and actions

  _link({ from, signal, to, call, args }) {
    const node = this.byId.get(from);
    if (!node) throw new Error(`connection from missing node "${from}"`);
    if (!this.byId.has(to)) throw new Error(`connection to missing node "${to}"`);
    this._linksOf(node, signal).push({ to, call, args });
  }
  _linksOf(node, signal) {
    let m = this.links.get(node);
    if (!m) { m = new Map(); this.links.set(node, m); }
    let l = m.get(signal);
    if (!l) { l = []; m.set(signal, l); }
    return l;
  }

  /** @returns {() => void} disconnect */
  listen(node, signal, fn) {
    const entry = { fn };
    this._linksOf(node, signal).push(entry);
    return () => { const l = this._linksOf(node, signal); const i = l.indexOf(entry); if (i >= 0) l.splice(i, 1); };
  }

  emit(node, signal, payload) {
    const list = this.links.get(node)?.get(signal);
    if (!list) return;
    for (const l of [...list]) {
      if (l.fn) l.fn(payload);
      else { const target = this.byId.get(l.to); if (target) this.call(target, l.call, l.args ?? payload); }
    }
  }

  /** Behaviours that implement the action win, then the node's own method; otherwise recorded as unhandled. */
  call(node, action, args) {
    for (const b of node.behaviours) {
      const def = this.registry.behaviours.get(b.name);
      if (def?.actions[action] && typeof b[action] === 'function') return b[action](args);
    }
    const declared = node.def?.actions?.[action] || node.constructor.actions?.includes?.(action);
    if (declared && typeof node[action] === 'function') return node[action](args);
    this.unhandled.push({ id: node.id, action });
    return undefined;
  }

  // ---------------------------------------------------------------- running

  /** Effective time scale of a node: 0 when disabled or paused, else the product of time scales up the tree. */
  scaleOf(node) {
    let scale = 1, mode = 'inherit';
    for (let n = node; n && !n._isRoot; n = n.parent) {
      if (n.processMode === 'disabled') return 0;
      if (mode === 'inherit' && n.processMode !== 'inherit') mode = n.processMode;
      scale *= n.timeScale;
    }
    if (this.clock.paused && mode !== 'always') return 0;
    return scale;
  }

  /** One fixed simulation step (see the order at the top of this file). */
  /**
   * One simulation step. A service whose work for this step isn't ready yet (a closet redraw due now, say) holds
   * it: holds() returns true and nothing runs, so the result lands on the same step in every run. Then step()
   * returns false: live play skips the step (a hitch), and a script awaits settle() and tries again.
   */
  step() {
    for (const s of this.services.values()) if (s.holds?.(this.clock.step)) return false;
    // The first step starts from current world matrices, whatever happened since instantiate (characters placed after
    // their load, a frame drawn or not): otherwise spring bones see a jump from stale matrices on step 1, and a world
    // restored at step 0 (restoreWorld updates them) steps differently from a fresh one.
    if (this.clock.step === 0) this.root.object3d.updateMatrixWorld(true);
    for (const s of this.services.values()) s.physicsProcess?.(DT);
    this.timers.step((n) => (n && this.byId.get(n.id) === n ? this.scaleOf(n) : 0));
    // Only nodes with step work (a physicsProcess override, behaviours or a state machine), in tree
    // order; the list is rebuilt after the tree changes or a state machine is attached.
    if (this._order === null) this._order = this.all().filter((n) => n.physicsProcess !== NOOP_STEP || n.behaviours.length > 0 || n.stateMachine !== null);
    for (const n of this._order) {
      if (n.tree !== this) continue; // removed earlier in this step
      const scale = this.scaleOf(n);
      if (scale === 0) continue;
      const dt = DT * scale;
      n.physicsProcess(dt);
      for (const b of n.behaviours) b.physicsProcess(dt);
      n.stateMachine?.step(dt);
    }
    for (const s of this.services.values()) s.afterNodes?.(DT);
    this.clock.step++;
    return true;
  }

  /** `count` steps. A held step is an error here (nothing can finish while this runs): use runAsync. */
  run(count) {
    for (let i = 0; i < count; i++) if (!this.step()) throw new Error(`step ${this.clock.step} is held by a service's pending work: use runAsync, or await settle() first`);
  }

  /** Whatever services are still working on (resolves when nothing is pending). */
  async settle() { for (const s of this.services.values()) if (s.settle) await s.settle(); }

  /** `count` steps, waiting out any step a service holds. */
  async runAsync(count) {
    for (let i = 0; i < count; i++) while (!this.step()) await this.settle();
  }

  /**
   * Live play: give the elapsed display time; runs the due steps, then every node's presentation
   * process at the resulting α. Returns α.
   */
  frame(elapsedSeconds) {
    const { steps, alpha } = this.clock.advance(elapsedSeconds);
    for (let i = 0; i < steps; i++) if (!this.step()) break; // held: the rest waits for the next frame
    this.present(elapsedSeconds, alpha);
    return alpha;
  }

  /** Every node's presentation process at α (a render host runs the steps itself, then calls this). */
  present(elapsedSeconds, alpha) {
    const pre = (n) => { for (const c of n.children) { if (this.scaleOf(c) > 0) { c.process(elapsedSeconds, alpha); for (const b of c.behaviours) b.process(elapsedSeconds, alpha); } pre(c); } };
    pre(this.root);
    for (const s of this.services.values()) s.present?.(elapsedSeconds, alpha); // presentation services (audio): after the nodes
  }

  // ---------------------------------------------------------------- queries

  find(id) { return this.byId.get(id) ?? null; }
  /** Nodes with a tag, in tree order. */
  query(tag) { const out = []; const pre = (n) => { for (const c of n.children) { if (c.hasTag(tag)) out.push(c); pre(c); } }; pre(this.root); return out; }
  /** Every node in tree order. */
  all() { const out = []; const pre = (n) => { for (const c of n.children) { out.push(c); pre(c); } }; pre(this.root); return out; }

  // ---------------------------------------------------------------- autoloads

  /** Add a service directly (engine systems such as physics register themselves this way). */
  addService(name, service) {
    if (this.services.has(name)) throw new Error(`service "${name}" already exists`);
    this.services.set(name, service);
    service.ready?.();
    return service;
  }

  /**
   * Start the project's autoload services (vrmxg.json { "autoload": [{ "name", "use", ...params }] }).
   * @param {any} project parsed vrmxg.json
   * @param {Map<string, any>} serviceClasses classes by "use"
   */
  loadServices(project, serviceClasses) {
    if (!project.autoload) return this;
    for (const entry of project.autoload ?? []) {
      const Cls = serviceClasses.get(entry.use);
      if (!Cls) throw new Error(`autoload "${entry.name}" uses unknown service "${entry.use}"`);
      const s = new Cls(this, entry);
      this.services.set(entry.name, s);
      s.ready?.();
    }
    return this;
  }

  // ---------------------------------------------------------------- back to a document

  // For every top-level Instance: its prefab's nodes as the prefab defines them (without this scene's
  // overrides), so saving can turn live differences back into overrides.
  _instanceBaselines(doc) {
    const base = new Map();
    for (const n of doc.nodes) {
      if (n.type !== 'Instance') continue;
      const f = flatten({ assets: doc.assets, nodes: [{ id: n.id, type: 'Instance', asset: n.asset }] }, this.prefabs);
      for (const m of f.nodes.slice(1)) base.set(m.id, m);
    }
    return base;
  }

  /**
   * The live tree as a .vrmxs document: top-level nodes as they are now; changes to nodes inside
   * instances become those instances' overrides (by inner path; behaviours by `use`).
   */
  toDocument() {
    const doc = structuredClone(this.doc ?? { format: 'vrmxs', version: 1, id: 'scene', assets: [] });
    const top = this.all().filter((n) => !n.inner);
    for (const inst of top) {
      if (inst.type !== 'Instance') continue;
      const overrides = {};
      for (const n of this.all()) {
        if (!n.id.startsWith(`${inst.id}/`)) continue;
        const base = this._baseline?.get(n.id);
        if (!base) continue;
        const o = overrideOf(base, n.toData());
        if (o) overrides[n.id.slice(inst.id.length + 1)] = o;
      }
      inst.overrides = Object.keys(overrides).length ? overrides : undefined;
    }
    doc.nodes = top.map((n) => n.toData());
    const ids = new Set(doc.nodes.map((n) => n.id));
    doc.connections = (doc.connections ?? []).filter((c) => (ids.has(c.from) || this.byId.has(c.from)) && (ids.has(c.to) || this.byId.has(c.to)));
    return doc;
  }

  // ---------------------------------------------------------------- state, for determinism checks

  /** Everything simulated, as plain data in a fixed order. */
  getState() {
    return {
      clock: this.clock.getState(),
      rng: this.rng.getState(),
      timers: this.timers.getState(),
      nodes: this.all().map((n) => ({
        id: n.id,
        p: n.object3d.position.toArray(), q: n.object3d.quaternion.toArray(), s: n.object3d.scale.toArray(),
        props: n.props, behaviours: n.behaviours.map((b) => [b.name, b.params, b.getState()]),
        sm: n.stateMachine?.getState() ?? null,
        ...(n.object3d.visible ? {} : { hidden: true }), // hide() (a light switched off); absent while shown, as before
        // How fast the subtree runs (AB-T-0627): absent at the defaults, as `hidden` is, so a scene that never sets
        // them keeps every hash; there from the step code sets them, so a restored world runs as the unbroken one.
        ...(n.timeScale === 1 ? {} : { ts: n.timeScale }),
        ...(n.processMode === 'inherit' ? {} : { pm: n.processMode }),
      })),
    };
  }

  /**
   * Restore getState() onto a tree instantiated from the same scene: clock, random streams, timers, and
   * every node's transform, props, behaviour params and state, and state machine. Systems with their own
   * state (physics, characters, cameras, input) restore theirs separately (@vrmxg/snapshot does it all).
   */
  setState(s) {
    // Nodes the run removed (an item taken, say) aren't in the snapshot: remove them here too. Nodes added at run time
    // can't be brought back this way (they need preparing), and the check below names them.
    const keep = new Set(s.nodes.map((n) => n.id));
    for (const n of this.all()) if (!keep.has(n.id) && this.byId.has(n.id) && (!n.parent || n.parent._isRoot || keep.has(n.parent.id))) this.remove(n.id);
    // Check that this is the same scene before changing anything.
    for (const ns of s.nodes) {
      const n = this.byId.get(ns.id);
      if (!n) throw new Error(`snapshot node "${ns.id}" isn't in this tree: restore onto the scene the snapshot came from`);
      ns.behaviours.forEach(([name], i) => { if (n.behaviours[i]?.name !== name) throw new Error(`"${ns.id}" behaviour ${i} is ${n.behaviours[i]?.name}, the snapshot has ${name}`); });
      if (ns.ts !== undefined && !(typeof ns.ts === 'number' && Number.isFinite(ns.ts) && ns.ts >= 0)) throw new Error(`snapshot node "${ns.id}": time scale ${JSON.stringify(ns.ts)} isn't a number of 0 or more`);
      if (ns.pm !== undefined && !PROCESS_MODES.has(ns.pm)) throw new Error(`snapshot node "${ns.id}": process mode ${JSON.stringify(ns.pm)} isn't one of ${[...PROCESS_MODES].join(', ')}`);
    }
    this.timers.setState(s.timers);
    this.clock.setState(s.clock);
    this.rng.setState(s.rng);
    for (const ns of s.nodes) {
      const n = this.byId.get(ns.id);
      n.object3d.position.fromArray(ns.p); n.object3d.quaternion.fromArray(ns.q); n.object3d.scale.fromArray(ns.s);
      n.props = structuredClone(ns.props);
      n.object3d.visible = !ns.hidden;
      n.timeScale = ns.ts ?? 1;
      n.processMode = ns.pm ?? 'inherit';
      ns.behaviours.forEach(([name, params, state], i) => {
        const b = n.behaviours[i];
        for (const k of Object.keys(b.params)) delete b.params[k];
        Object.assign(b.params, structuredClone(params));
        if (state !== null) b.setState(structuredClone(state));
      });
      if (ns.sm && n.stateMachine) n.stateMachine.setState(ns.sm);
    }
    this.root.object3d.updateMatrixWorld(true);
  }

  /** FNV-1a over the canonical JSON of getState(): one word to compare runs and engines. */
  stateHash() {
    const s = JSON.stringify(this.getState());
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

// ---------------------------------------------------------------- override diffs

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The partial node that turns `base` into `live`: changed name, transform components, props and tags;
// behaviour params by `use`. Null when nothing differs.
function overrideOf(base, live) {
  const o = {};
  if (live.name !== base.name && live.name !== undefined) o.name = live.name;
  const bt = base.transform ?? {}, lt = live.transform ?? {};
  const t = {};
  for (const k of ['p', 'q', 's']) if (lt[k] && !eq(lt[k], bt[k])) t[k] = lt[k];
  if (Object.keys(t).length) o.transform = t;
  const bp = base.props ?? {}, lp = live.props ?? {};
  const p = {};
  for (const k of Object.keys(lp)) if (!eq(lp[k], bp[k])) p[k] = lp[k];
  if (Object.keys(p).length) o.props = p;
  if (!eq(live.tags ?? [], base.tags ?? [])) o.tags = live.tags ?? [];
  const bb = new Map((base.behaviours ?? []).map((b) => [b.use, b]));
  const beh = [];
  for (const b of live.behaviours ?? []) {
    const was = bb.get(b.use);
    if (!was) { beh.push(b); continue; }
    const d = { use: b.use };
    for (const k of Object.keys(b)) if (k !== 'use' && !eq(b[k], was[k])) d[k] = b[k];
    if (Object.keys(d).length > 1) beh.push(d);
  }
  for (const b of base.behaviours ?? []) if (!(live.behaviours ?? []).some((x) => x.use === b.use)) beh.push({ use: b.use, remove: true });
  if (beh.length) o.behaviours = beh;
  return Object.keys(o).length ? o : null;
}
