// Engine nodes. A node wraps one three.js Object3D (its transform lives there, as a position, a
// quaternion and a scale: never three's Euler `.rotation`), carries its registry type's props, tags,
// behaviours and an optional state machine, and keeps any data it doesn't understand so a scene
// survives a round-trip. Subclasses (cameras, bodies, characters in later packages) override the
// lifecycle hooks and implement their type's actions as methods.
import { Object3D } from 'three';

const KNOWN_KEYS = new Set(['id', 'type', 'parent', 'name', 'asset', 'transform', 'props', 'overrides', 'behaviours', 'tags']);
const IDENTITY = { p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] };
const sameArray = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export class Node {
  /**
   * @param {any} data the node as it appears in a (flattened) .vrmxs document
   * @param {any} [def] its registry type definition, if the type is known
   */
  constructor(data, def = null) {
    this.id = data.id;
    this.type = data.type;
    this.def = def;
    this.name = data.name;
    this.asset = data.asset;
    this.props = structuredClone(data.props ?? {});
    this.tags = [...(data.tags ?? [])];
    this.overrides = data.overrides ? structuredClone(data.overrides) : undefined; // Instance only; regenerated on save
    /** Behaviour entries ({ use, ...params }); a live behaviour's params are this same object. */
    this.behaviourEntries = structuredClone(data.behaviours ?? []);
    /** Keys this engine doesn't know, kept verbatim. */
    this.extra = Object.fromEntries(Object.entries(data).filter(([k]) => !KNOWN_KEYS.has(k)).map(([k, v]) => [k, structuredClone(v)]));
    this._transformKeys = new Set(Object.keys(data.transform ?? {}));

    this.object3d = new Object3D();
    this.object3d.name = this.id;
    const t = data.transform ?? {};
    if (t.p) this.object3d.position.fromArray(t.p);
    if (t.q) this.object3d.quaternion.fromArray(t.q);
    if (t.s) this.object3d.scale.fromArray(t.s);

    /** @type {Node | null} */ this.parent = null;
    /** @type {Node[]} */ this.children = [];
    /** @type {import('./tree.js').SceneTree | null} */ this.tree = null;
    /** @type {import('./behaviour.js').Behaviour[]} */ this.behaviours = [];
    /** @type {import('./statemachine.js').StateMachine | null} */ this.stateMachine = null;
    /** 'inherit' | 'pausable' | 'always' (runs while the tree is paused) | 'disabled' */
    this.processMode = 'inherit';
    /** Multiplies the step for this subtree (slow motion); 0 freezes it. */
    this.timeScale = 1;
    /** True for nodes that came from inside a prefab instance (id "instance/inner"). */
    this.inner = this.id.includes('/');
    /** @internal the tree's own root node */ this._isRoot = false;
    /** @internal parent id from the document, until the node is attached */ this._parentId = /** @type {string | undefined} */ (data.parent);
  }

  // ---------------------------------------------------------------- lifecycle (override in subclasses)
  /** Entered the tree; parent first, then children. */
  enterTree() {}
  /** The node and all its children are in the tree; children first, then the parent. */
  ready() {}
  /** One fixed simulation step (1/60 s × time scale). Inside the determinism boundary. */
  physicsProcess(dt) {}
  /** One display frame, with the interpolation α. Presentation only: never write simulated state. */
  process(dt, alpha) {}
  /** Leaving the tree; children first, then the parent. */
  exitTree() {}

  // ---------------------------------------------------------------- signals and actions
  /** Emit one of this node's signals: connected actions run now, in connection order. */
  emit(signal, payload) { this.tree?.emit(this, signal, payload); }
  /** Call an action on this node (its own method, or a behaviour's). */
  call(action, args) { return this.tree?.call(this, action, args); }
  /** Listen to a signal from code. Returns a function that disconnects. */
  on(signal, fn) { return this.tree?.listen(this, signal, fn); }

  /** Run `fn` after `seconds` of this node's simulated time. */
  after(seconds, fn, opts) { return this.tree?.timers.after(this, seconds, fn, opts); }
  /** Tween a value on this node ("props.intensity", "position", "quaternion"). */
  tween(path, to, seconds, opts) {
    const target = path === 'position' || path === 'quaternion' || path === 'scale' ? this.object3d : this;
    return this.tree?.timers.tween(this, target, path, to, seconds, opts);
  }
  /** This node's own random stream. */
  get rng() { return this.tree?.rng.get(`node:${this.id}`); }

  hasTag(tag) { return this.tags.includes(tag); }

  // ---------------------------------------------------------------- back to document data
  /** The node as .vrmxs data: live transform, props, tags and behaviour params, plus kept keys. */
  toData() {
    const d = { id: this.id, type: this.type };
    if (this.parent && this.parent.id !== undefined && !this.parent._isRoot) d.parent = this.parent.id;
    if (this.name !== undefined) d.name = this.name;
    if (this.asset !== undefined) d.asset = this.asset;
    const live = { p: this.object3d.position.toArray(), q: this.object3d.quaternion.toArray(), s: this.object3d.scale.toArray() };
    const transform = {};
    for (const k of ['p', 'q', 's']) if (this._transformKeys.has(k) || !sameArray(live[k], IDENTITY[k])) transform[k] = live[k];
    if (Object.keys(transform).length) d.transform = transform;
    if (Object.keys(this.props).length) d.props = structuredClone(this.props);
    if (this.overrides !== undefined) d.overrides = structuredClone(this.overrides);
    if (this.behaviourEntries.length) d.behaviours = structuredClone(this.behaviourEntries);
    if (this.tags.length) d.tags = [...this.tags];
    return { ...d, ...structuredClone(this.extra) };
  }
}
