// Inspecting and driving a running SceneTree (MCP): the live tree with world positions, a node's simulated state,
// physics (bodies, sensors, contacts), actions, interactions, and stepping with input held or replayed. Shared by the
// headless engine (engine.js, in Node) and the editor's play world (apps/editor, in the page): no Node APIs here.
import { Vector3 } from 'three';

const r = (v, d = 4) => +v.toFixed(d);
const arr = (a, d) => Array.from(a, (v) => r(v, d));

async function runNow(tree, steps) { for (let i = 0; i < steps; i++) while (!tree.step()) await tree.settle(); }

export class LiveView {
  /** @param {any} [tree] */
  constructor(tree = null) { this.tree = null; this.signals = []; /** @type {string | null} what to say when nothing is running */ this.notRunning = null; if (tree) this.attach(tree); }

  /** Watch a tree: signals emitted from now on are logged for step results. */
  attach(tree) {
    this.tree = tree; this.signals = [];
    if (!tree.__mcpEmit) {
      const emit = tree.emit.bind(tree), view = this;
      tree.__mcpEmit = true;
      tree.emit = (node, signal, payload) => { if (view.tree === tree && view.signals.length < 500) view.signals.push({ step: tree.clock.step, node: node.id, signal }); return emit(node, signal, payload); };
    }
    return this;
  }

  get live() { if (!this.tree) throw new Error(this.notRunning ?? 'no engine running: call engine_load first'); return this.tree; }

  /**
   * Step the simulation. `hold`: action values held for these steps ({ move_y: 1, run: true });
   * `replay`: an input recording (path under the project) played from its start step.
   */
  /**
   * @param {{ steps?: number, hold?: Record<string, number | boolean>, recording?: any }} [opts] recording: an input
   *   recording (already read) played from its start step
   * @param {(tree: any, steps: number) => Promise<void>} [run] how the steps happen (default: now, waiting out held
   *   steps); the editor's live play passes one that lets its frame loop run them in real time
   */
  async step({ steps = 1, hold, recording } = {}, run = runNow) {
    const tree = this.live, input = tree.services.get('input');
    if (!(steps >= 1 && steps <= 36000)) throw new Error('steps: 1 to 36000');
    // a recording plays from its start step, or from now when the world is already past it (a take replayed mid-play)
    if (recording) input.replay({ ...structuredClone(recording), start: Math.max(recording.start ?? 0, tree.clock.step) });
    else if (hold) {
      const map = input.map;
      for (const k of Object.keys(hold)) if (!map.names.includes(k)) throw new Error(`no input action "${k}"; actions: ${map.names.join(', ')}`);
      const axes = map.axes.map((n) => Number(hold[n] ?? 0));
      let bits = 0; map.buttons.forEach((n, i) => { if (hold[n]) bits |= 1 << i; });
      input.replay({ version: 1, start: tree.clock.step, axes: [...map.axes], buttons: [...map.buttons], frames: Array.from({ length: steps }, () => [axes, bits >>> 0]) });
    }
    const from = this.signals.length;
    await run(tree, steps);
    const fired = this.signals.slice(from);
    return { step: tree.clock.step, seconds: r(tree.clock.time, 3), signals: fired.slice(0, 50), moreSignals: Math.max(0, fired.length - 50) };
  }

  /** The live tree as indented text with each node's world position. */
  treeText() {
    const tree = this.live, out = [`step ${tree.clock.step}`], v = new Vector3();
    const walk = (n, depth) => {
      for (const c of n.children) {
        const p = c.object3d.getWorldPosition(v);
        out.push(`${'  '.repeat(depth)}${c.id} (${c.type}) @ ${arr([p.x, p.y, p.z], 2).join(' ')}`);
        walk(c, depth + 1);
      }
    };
    walk(tree.root, 0);
    return out.join('\n');
  }

  /** A node's simulated state, readable. */
  nodeState(id) {
    const tree = this.live, n = /** @type {any} */ (tree.find(id));
    if (!n) throw new Error(`no live node "${id}" (prefab nodes are "instance/inner"; see tree with live)`);
    const o = n.object3d, w = o.getWorldPosition(new Vector3());
    const out = { id, type: n.type, step: tree.clock.step, local: { p: arr(o.position.toArray(), 4), q: arr(o.quaternion.toArray(), 4) }, world: { p: arr(w.toArray(), 4) }, props: n.props };
    if (n.behaviours.length) out.behaviours = n.behaviours.map((b) => ({ use: b.name, state: b.inspect() }));
    if (n.stateMachine) out.stateMachine = n.stateMachine.getState();
    if (n.type === 'Item' && typeof (/** @type {any} */ (n)).inspect === 'function') out.item = (/** @type {any} */ (n)).inspect(); // state, verbs offered, joints
    const physics = tree.services.get('physics');
    if (physics && n.body !== undefined) out.body = this.body(physics, n);
    const any = /** @type {any} */ (n);
    if (n.type === 'Character' && any.ctrl) {
      const ctrl = any.ctrl;
      out.character = { grounded: ctrl.grounded, jumped: ctrl.jumped, goTo: ctrl.goTo, look: ctrl.look, yaw: r(ctrl.yaw), vy: r(ctrl.vy), move: arr(any.input.move, 3), animation: any.graph?.state, speed: r(any.graph?.speed ?? 0, 3), equipped: [...any.equipped], speaking: !!any.speaking, seat: ctrl.seat ?? null };
    }
    if (n.type === 'Camera' && any.rig) out.camera = { preset: any.preset, rig: Object.fromEntries(Object.entries(any.rig).map(([k, v]) => [k, typeof v === 'number' ? r(v) : v])), current: tree.services.get('cameras')?.current === n };
    return out;
  }

  body(physics, n) {
    const b = physics.world.world.getRigidBody(n.body);
    if (!b) return null;
    const lv = b.linvel(), av = b.angvel();
    return { type: n.bodyType, linvel: arr([lv.x, lv.y, lv.z], 4), angvel: arr([av.x, av.y, av.z], 4), sleeping: b.isSleeping() };
  }

  /** Physics: every body that can move, what each sensor holds, and solid contacts. */
  physicsState() {
    const tree = this.live, physics = tree.services.get('physics');
    if (!physics) throw new Error('no physics in this engine');
    const nameOf = (h) => physics.colliders.get(h)?.node.id ?? `#${h}`;
    const bodies = physics.moving.filter((n) => n.body !== undefined).map((n) => { const { p } = physics.world.bodyPose(n.body); return { node: n.id, p: arr(p, 3), ...this.body(physics, n) }; });
    const sensors = [], contacts = new Set();
    const rw = physics.world.world;
    for (const [h, info] of physics.colliders) {
      const c = rw.getCollider(h);
      if (!c) continue;
      if (c.isSensor()) { sensors.push({ sensor: info.node.id, holds: physics.world.overlapping(h).map(nameOf) }); continue; }
      rw.contactPairsWith(c, (o) => {
        let touching = false;
        rw.contactPair(c, o, (m) => { if (m.numContacts() > 0) touching = true; });
        if (touching && !o.isSensor()) contacts.add([nameOf(h), nameOf(o.handle)].sort().join(' ↔ '));
      });
    }
    return { step: tree.clock.step, bodies, sensors, contacts: [...contacts].sort() };
  }

  /** Call an action on a live node (a type's action or a behaviour's: open, goTo, say, …). */
  callAction(id, action, args) {
    const tree = this.live, n = tree.find(id);
    if (!n) throw new Error(`no live node "${id}"`);
    const before = tree.unhandled.length;
    const result = tree.call(n, action, args ?? {});
    if (tree.unhandled.length > before) throw new Error(`"${id}" has no action "${action}" (see get_node)`);
    return { called: `${id}.${action}`, result: result ?? null, step: tree.clock.step };
  }

  /** An actor does a verb with an item, as an NPC would (interact service's request): take, use, sit, open. */
  interact(actor, item, verb) {
    const tree = this.live, service = tree.services.get('interact');
    if (!service) throw new Error('no interaction service in this world');
    for (const id of [actor, item]) if (!tree.find(id)) throw new Error(`no live node "${id}"`);
    const result = service.request(actor, item, verb);
    if (!result) throw new Error(`${actor} can't ${verb} ${item} (verbs it offers: ${tree.find(item).offered?.().map((v) => v.verb).join(', ') ?? 'none'})`);
    return { result, step: tree.clock.step };
  }
}
