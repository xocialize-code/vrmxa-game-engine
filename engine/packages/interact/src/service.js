// The interaction service ("interact", M1 W3): once per step, before the nodes, for every character that has the
// `player` behaviour (and any added with addActor):
//   focus    the item it is facing: a forward ray from its chest first, then any item offering a verb it can reach:
//            inside the verb's `reach` sensor, or within `range` (1.5 m) of the item and facing it (VRMXI §8)
//   prompt   kept as data (prompts()) for the app to draw; `focusChanged` on the character when it changes
//   do       on the `interact` action, the focused verb: the character turns to the item (or goes to its `at` node),
//            plays the verb's animation slot, and the item does it; `sit` seats it on the nearest free seat point
//            (moving or interacting again stands it up; in a vehicle's seat moving drives, and interact gets out once it
//            has nearly stopped); `take` removes the item from the world, into the closet
//            service when the item is takeable and one is installed (M1 W4), else into the inventory
// NPCs and scripts use request(actor, item, verb). All of it is simulation: deterministic and in the snapshot.

export class InteractService {
  /**
   * @param {any} tree @param {{ range?: number, rayLength?: number, chest?: number, facing?: number }} [opts]
   */
  constructor(tree, { range = 1.5, rayLength = 2, chest = 1.2, facing = 0.5 } = {}) {
    this.tree = tree;
    this.range = range; this.rayLength = rayLength; this.chest = chest; this.facing = facing;
    /** @type {Set<string>} */ this.extra = new Set();
    /** actor id → { item, verb, prompt } */ this.focus = new Map();
  }

  addActor(id) { this.extra.add(id); }

  actors() {
    return this.tree.all().filter((n) => n.type === 'Character' && n.graph && (this.extra.has(n.id) || n.behaviours.some((b) => b.name === 'player')));
  }

  /** What each actor could do now, for the app's prompt: [{ actor, item, verb, prompt }]. */
  prompts() { return [...this.focus].map(([actor, f]) => ({ actor, ...f })); }

  /** An actor's action-name prefix: its player behaviour's player (split screen, M3 W9); '' for player 1 and NPCs. */
  prefixOf(actor) { const n = actor.behaviours.find((b) => b.name === 'player')?.params.player ?? 1; return n > 1 ? `p${n}.` : ''; }

  physicsProcess() {
    const input = this.tree.services.get('input');
    for (const actor of this.actors()) {
      const pre = this.prefixOf(actor);
      const pressed = input?.pressed(`${pre}interact`) ?? false;
      if (actor.ctrl.seat) {
        // a vehicle's seat: moving drives (or does nothing, as a passenger); interact gets out once it has (nearly) stopped
        const seatItem = /** @type {any} */ (this.tree.find(actor.ctrl.seat.item));
        if (seatItem?.manifest?.type === 'vehicle') {
          if (pressed && Math.abs(seatItem.vehicleSpeed()) < 1) this.standUp(actor);
          this.setFocus(actor, null);
          continue;
        }
        const mx = input?.axis(`${pre}move_x`) ?? 0, my = input?.axis(`${pre}move_y`) ?? 0;
        if (!actor.graph.busy || actor.graph.state === 'sitIdle') { if (pressed || mx * mx + my * my > 0.25) { this.standUp(actor); continue; } }
        this.setFocus(actor, null);
        continue;
      }
      const f = actor.busy ? null : this.findFocus(actor);
      this.setFocus(actor, f);
      if (pressed && f) this.run(actor, this.tree.find(f.item), f.verb);
    }
  }

  setFocus(actor, f) {
    const was = this.focus.get(actor.id) ?? null;
    if ((was?.item ?? null) === (f?.item ?? null) && (was?.verb ?? null) === (f?.verb ?? null) && (was?.prompt ?? null) === (f?.prompt ?? null)) return;
    if (f) this.focus.set(actor.id, f); else this.focus.delete(actor.id);
    actor.emit('focusChanged', f ?? { item: null, verb: null, prompt: null });
  }

  /** The item and verb an actor would act on now, or null. */
  findFocus(actor) {
    const physics = this.tree.services.get('physics');
    const p = actor.object3d.position, yaw = actor.ctrl.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const items = this.tree.all().filter((n) => n.type === 'Item' && n.manifest && n.offered().length);
    const reachable = (item) => item.offered().find((v) => this.canReach(actor, item, v, physics, p, fx, fz)) ?? null;
    let best = null;
    const hit = physics?.raycast([p.x, p.y + this.chest, p.z], [fx, 0, fz], this.rayLength, { excludeBody: actor.body });
    if (hit) { const item = this.tree.find(hit.node); if (item?.type === 'Item' && item.manifest) { const v = reachable(item); if (v) best = { item, v }; } }
    if (!best) {
      let bestD = Infinity;
      for (const item of items) {
        const v = reachable(item);
        if (!v) continue;
        const q = item.object3d.getWorldPosition(item.object3d.position.clone()), d = Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z));
        if (d < bestD) { bestD = d; best = { item, v }; }
      }
    }
    return best ? { item: best.item.id, verb: best.v.verb, prompt: best.v.prompt ?? best.v.verb } : null;
  }

  canReach(actor, item, v, physics, p, fx, fz) {
    if (v.reach) {
      const h = item.sensorHandles?.get(v.reach);
      return h !== undefined && actor.collider !== undefined && physics.world.overlapping(h).includes(actor.collider);
    }
    const q = item.object3d.getWorldPosition(item.object3d.position.clone());
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > (v.range ?? this.range)) return false;
    return d < 1e-6 || (dx * fx + dz * fz) / d >= this.facing;
  }

  /** An NPC or a script asks an actor to do a verb with an item (no focus needed). */
  request(actorId, itemId, verb) {
    const actor = this.tree.find(actorId), item = this.tree.find(itemId);
    if (!actor || !item) throw new Error(`no ${!actor ? `actor "${actorId}"` : `item "${itemId}"`}`);
    return this.run(actor, item, verb);
  }

  /** Do a verb: face the item (or go to its `at` node), play the slot, let the item do it. Returns what happened. */
  run(actor, item, verbName) {
    const v = item.offered().find((x) => x.verb === verbName);
    if (!v) return null;
    if (v.at && item.part(v.at)) {
      const n = item.part(v.at); n.updateWorldMatrix(true, false);
      const e = n.matrixWorld.elements;
      actor.placeAt(e[12], actor.object3d.position.y, e[14], Math.atan2(e[8], e[10]));
    } else {
      const q = item.object3d.getWorldPosition(item.object3d.position.clone()), p = actor.object3d.position;
      if ((q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z) > 1e-8) actor.placeAt(p.x, p.y, p.z, Math.atan2(q.x - p.x, q.z - p.z));
    }
    const slot = item.slotOf(v);
    let result;
    if (v.verb === 'sit') {
      const taken = new Set(this.tree.all().filter((n) => n.type === 'Character' && n.ctrl?.seat?.item === item.id).map((n) => n.ctrl.seat.point));
      const points = item.seatPoints();
      const p = actor.object3d.position;
      let pick = -1, bestD = Infinity;
      points.forEach((pt, i) => { if (taken.has(i) || !pt.node) return; const w = pt.node.getWorldPosition(pt.node.position.clone()), d = (w.x - p.x) * (w.x - p.x) + (w.z - p.z) * (w.z - p.z); if (d < bestD) { bestD = d; pick = i; } });
      if (pick < 0) return null; // every seat taken
      result = item.perform({ verb: 'sit', by: actor.id });
      actor.sitOn(item, pick);
    } else if (v.verb === 'take') {
      result = item.perform({ verb: 'take', by: actor.id });
      if (slot) actor.startAction(slot === 'take' ? 'take' : slot);
      const closet = this.tree.services.get('closet');
      let into;
      if (item.manifest.takeable && closet) { closet.take(actor, item); into = 'closet'; }
      else { this.tree.services.get('inventory')?.add(actor.id, item); into = 'inventory'; }
      this.tree.remove(item.id); // the item leaves the world (VRMXI §9 rule 4)
      result = { ...result, into };
    } else {
      result = item.perform({ verb: v.verb, by: actor.id });
      if (slot && ['use', 'take', 'talk'].includes(slot)) actor.startAction(slot);
      // the hand goes to the item's grip (M2 W8): the verb's `grip` part, else a Grip, Knob or Handle part
      const grip = v.grip ?? ['Grip', 'Knob', 'Handle', 'handle'].find((n) => item.part(n));
      if (grip && item.part(grip) && actor.reach) actor.reach({ hand: 'right', target: item.id, part: grip, seconds: Math.max(0.6, actor.graph?.durationOf?.(slot ?? 'use') ?? 0.8) });
    }
    actor.emit('interacted', { item: item.id, verb: v.verb });
    this.setFocus(actor, null);
    return result;
  }

  standUp(actor) {
    const seat = actor.ctrl.seat;
    actor.standUp();
    actor.emit('interacted', { item: seat.item, verb: 'stand' });
  }

  getState() { return { focus: Object.fromEntries(this.focus) }; }
  setState(s) { this.focus = new Map(Object.entries(s.focus)); }
}
