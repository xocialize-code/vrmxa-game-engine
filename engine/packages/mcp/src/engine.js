// A headless engine running a scene in Node, for inspection and driving over MCP: the same SceneTree,
// physics, characters, input and cameras the game runs, no renderer. Loaded from the scene as it is
// being edited (unsaved edits included); stepped on request, with input held or replayed; signals
// emitted while stepping are logged.
import { Vector3 } from 'three';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installInput } from '@vrmxg/input';
import { installCameras } from '@vrmxg/camera';
import { installModels } from '@vrmxg/model';
import { installItems } from '@vrmxg/item';
import { installInteraction } from '@vrmxg/interact';
import { installCloset } from '@vrmxg/closet';

const r = (v, d = 4) => +v.toFixed(d);
const arr = (a, d) => Array.from(a, (v) => r(v, d));

export class EngineSession {
  /** @param {import('./project.js').Project} project */
  constructor(project) { this.project = project; this.tree = null; this.signals = []; }

  /** (Re)start from a scene document. */
  async load(doc, prefabs) {
    const p = this.project;
    const tree = new SceneTree({ registry: m0Registry(), prefabs, behaviours: await p.behaviours(), seed: p.seed });
    installInput(tree);
    installPhysics(tree, await loadRapier());
    const lib = installCharacters(tree, { resolve: (ref) => p.bytes(ref), vrmxaCore: await p.vrmxaCore(), stubTextures: true, prefabs, projectAnimations: p.animations() });
    installCameras(tree);
    const models = installModels(tree, { resolve: (ref) => p.bytes(ref), stubTextures: true });
    const vrmxaCore = await p.vrmxaCore();
    const items = installItems(tree, { resolve: (ref) => p.bytes(ref), vrmxaCore, stubTextures: true });
    await models.prepare(doc);
    if (vrmxaCore) await items.prepare(doc); // .vrmxi files are ZIPs: reading them takes vrmxa-core (--vrmxa-core)
    await lib.prepare(doc);
    installInteraction(tree);
    const closetModule = vrmxaCore ? await p.vrmxaCloset() : null;
    const closet = closetModule ? installCloset(tree, { vrmxaCore, closet: closetModule, stubTextures: true }) : null;
    await closet?.prepare(doc);
    this.signals = [];
    const emit = tree.emit.bind(tree);
    tree.emit = (node, signal, payload) => { if (this.signals.length < 500) this.signals.push({ step: tree.clock.step, node: node.id, signal }); return emit(node, signal, payload); };
    tree.instantiate(doc);
    this.tree = tree;
    return { nodes: tree.all().length, step: 0, services: [...tree.services.keys()], ...(models.skipped.length ? { skipped: models.skipped } : {}) };
  }

  get live() { if (!this.tree) throw new Error('no engine running: call engine_load first'); return this.tree; }

  /**
   * Step the simulation. `hold`: action values held for these steps ({ move_y: 1, run: true });
   * `replay`: an input recording (path under the project) played from its start step.
   */
  /** @param {{ steps?: number, hold?: Record<string, number | boolean>, replay?: string }} [opts] */
  step({ steps = 1, hold, replay } = {}) {
    const tree = this.live, input = tree.services.get('input');
    if (!(steps >= 1 && steps <= 36000)) throw new Error('steps: 1 to 36000');
    if (replay) input.replay(this.project.json(replay));
    else if (hold) {
      const map = input.map;
      for (const k of Object.keys(hold)) if (!map.names.includes(k)) throw new Error(`no input action "${k}"; actions: ${map.names.join(', ')}`);
      const axes = map.axes.map((n) => Number(hold[n] ?? 0));
      let bits = 0; map.buttons.forEach((n, i) => { if (hold[n]) bits |= 1 << i; });
      input.replay({ version: 1, start: tree.clock.step, axes: [...map.axes], buttons: [...map.buttons], frames: Array.from({ length: steps }, () => [axes, bits >>> 0]) });
    }
    const from = this.signals.length;
    tree.run(steps);
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
    const physics = tree.services.get('physics');
    if (physics && n.body !== undefined) out.body = this.body(physics, n);
    const any = /** @type {any} */ (n);
    if (n.type === 'Character' && any.ctrl) {
      const ctrl = any.ctrl;
      out.character = { grounded: ctrl.grounded, jumped: ctrl.jumped, goTo: ctrl.goTo, look: ctrl.look, yaw: r(ctrl.yaw), vy: r(ctrl.vy), move: arr(any.input.move, 3), animation: any.graph?.state, speed: r(any.graph?.speed ?? 0, 3), equipped: [...any.equipped] };
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
}
