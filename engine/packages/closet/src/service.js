// The closet at run time (the "closet" service, M1 W4): what a character wears changes during play, through
// vrmxa-core's closet protocol on the character's own bundle (injected, AB-D-0249; CLOSET.md §5).
//
// The closet's operations are asynchronous (hashing, reading items, drawing avatar.vrm) and the simulation steps
// synchronously, so the work is split by what it changes:
//   pinned items (VRMXW kind `pin`: a sword held or stowed) what the character has on changes at once, on this step:
//       the item's tags and its state's join the character's equipped tags, and its animation slots follow. The
//       bundle is updated afterwards, and the item's model hung on its state's bone as presentation (never in a
//       snapshot or a hash).
//   items that change the look (worn on the body) the bundle is updated and avatar.vrm redrawn off the step; the
//       new body is swapped in, with the new tags, exactly `latency` steps later (30: half a second). If the redraw
//       isn't done by then, that step is held until it is (tree.step() returns false; live play hitches, a script
//       awaits tree.settle()), so the swap lands on the same step in every run.
// Taking a takeable item (VRMXI §9) copies its embedded VRMXW out byte for byte, adds it (§5.1) and puts it on in the
// item's `wearable.state` (§5.2); a wearable already in the closet is put on (or moved to that state) instead.
//
// A pinned item worn when a body was drawn is part of that body (vrmxa-core draws it under its bone, nodes marked
// `extras.vrmxaFit.item`). While it stays in the state it was drawn in, that drawn copy is shown; once it changes
// state or comes off, the drawn copy is hidden (visibility isn't simulation state) and, if still worn, a copy from
// its model.glb hangs on the new bone. The hung copy has no fine-tuning (VRMXA §7.5); the next redraw has it again.
// Bundle operations run one at a time per character, in the order the simulation asked for them.
import { Group } from 'three';
import { parseGLB } from '@vrmxg/model';

const decode = (b) => JSON.parse(new TextDecoder().decode(b));

export class ClosetService {
  /**
   * @param {any} tree
   * @param {{ vrmxaCore: any, closet: any, spec?: Uint8Array | null, latency?: number, stubTextures?: boolean, now?: () => number }} opts
   *   vrmxaCore: vrmxa-core's main module (readBundle, readZip); closet: its ./closet module; spec: spec.vrm's bytes
   *   (needed to redraw avatar.vrm); now: a wall clock in ms for `timings` only (default none: every timing 0)
   */
  constructor(tree, { vrmxaCore, closet, spec = null, latency = 30, stubTextures = false, now = () => 0 }) {
    this.tree = tree; this.now = now;
    this.core = vrmxaCore; this.closet = closet; this.spec = spec; this.latency = latency; this.stubTextures = stubTextures;
    /** character id → the character's bundle (its own copy; the closet's operations change it) */ this.bundles = new Map();
    /** character id → [{ id, slot, state, pinned, tags }]: what is worn, as the simulation sees it */ this.worn = new Map();
    /** character id → Map(pinned id → state) drawn into the character's current body */ this.drawn = new Map();
    /** character id → the tail of its bundle-operation queue */ this.queues = new Map();
    /** pending swaps: { char, at, ready, prep, worn, drawn, label, error, promise } */ this.jobs = [];
    /** presentation work in flight */ this.background = new Set();
    /** what each operation cost off the step, for receipts: [{ op, ms }] */ this.timings = [];
    this.shown = false;
  }

  /** Read every .vrmxa character's bundle (call after the character library's prepare, before instantiate). */
  async prepare(doc) {
    const lib = this.tree.services.get('characters');
    const assets = new Map((doc.assets ?? []).map((a) => [a.id, a]));
    for (const n of doc.nodes) {
      if (n.type !== 'Character') continue;
      const ref = assets.get(n.asset)?.ref ?? n.asset;
      const bytes = await lib.resolve(ref);
      if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) continue; // a plain .vrm has no closet
      const bundle = await this.core.readBundle(bytes);
      this.bundles.set(n.id, bundle);
      const worn = this.wornIn(bundle);
      this.worn.set(n.id, worn);
      this.drawn.set(n.id, new Map(worn.filter((w) => w.pinned).map((w) => [w.id, w.state])));
    }
    return this;
  }

  /** What a bundle's closet says is worn, in the simulation's form. */
  wornIn(bundle) {
    const c = this.closet.closetOf(bundle);
    const out = [];
    for (const id of c.worn.items) {
      const e = c.items.find((x) => x.id === id);
      if (!e) continue;
      const state = c.worn.states[id] ?? e.states?.[0]?.name ?? null;
      out.push({ id, slot: e.slot, state, pinned: e.kind === 'pin', tags: this.closet.itemTags({ tags: e.tags, states: e.states }, state) });
    }
    return out;
  }

  wornBy(char) { return (this.worn.get(char) ?? []).map((w) => ({ ...w })); }
  closetOf(char) { return this.closet.closetOf(this.bundles.get(char)); }

  // ---------------------------------------------------------------- operations (synchronous: called inside a step)

  /** Take a takeable Item's wearable into the actor's closet and put it on (VRMXI §9). */
  take(actor, item) {
    const bytes = item.wearableBytes();
    if (!bytes) throw new Error(`${item.id} isn't takeable`);
    const wm = this.wearableManifest(bytes);
    const state = item.manifest.wearable?.state ?? wm.states?.[0]?.name ?? null;
    return this.putOnWearable(actor, wm, state, { bytes, source: item.manifest.name, from: item.id });
  }

  /**
   * Put on a wearable already in the actor's closet, in a state (default: its first).
   * @param {any} actor @param {string} id @param {{ state?: string }} [opts]
   */
  equip(actor, id, { state } = {}) {
    const e = this.entry(actor, id);
    return this.putOnWearable(actor, { id, name: e.name, kind: e.kind, slot: e.slot, tags: e.tags, states: e.states }, state ?? e.states?.[0]?.name ?? null, {});
  }

  /** Take a worn wearable off. → whether it was worn */
  unequip(actor, id) {
    const worn = this.worn.get(actor.id) ?? [];
    const w = worn.find((x) => x.id === id);
    if (!w) return false;
    const rest = worn.filter((x) => x.id !== id);
    const op = (b) => this.closet.takeOff(b, id, { redraw: false });
    if (w.pinned) this.applyNow(actor, rest, op, `take off ${id}`);
    else this.schedule(actor, rest, op, `take off ${id}`);
    return true;
  }

  /** Move a worn wearable to another of its states (a sword from stowed to held). */
  setItemState(actor, id, state) {
    const worn = this.worn.get(actor.id) ?? [];
    const w = worn.find((x) => x.id === id);
    if (!w) throw new Error(`${actor.id} doesn't wear ${id}`);
    const e = this.entry(actor, id);
    if (state != null && !(e.states ?? []).some((s) => s.name === state)) throw new Error(`${e.name} has no state "${state}"`);
    const next = worn.map((x) => (x.id === id ? { ...x, state, tags: this.closet.itemTags({ tags: e.tags, states: e.states }, state) } : x));
    const op = (b) => this.closet.setState(b, id, state, { redraw: false });
    if (w.pinned) this.applyNow(actor, next, op, `state ${id} ${state}`);
    else this.schedule(actor, next, op, `state ${id} ${state}`);
  }

  /**
   * Apply one of the closet's outfits (CLOSET.md §5.5): what is worn becomes its items in its states. Only pinned
   * items changing: on this step; anything on the body changing: a redraw and a swap, as for one item.
   * @param {any} actor @param {string} outfitId
   */
  applyOutfit(actor, outfitId) {
    const c = this.closet.closetOf(this.bundle(actor));
    const o = c.outfits.find((x) => x.id === outfitId);
    if (!o) throw new Error(`${actor.id}'s closet has no outfit ${outfitId}`);
    const next = (o.items ?? []).map((id) => {
      const e = c.items.find((x) => x.id === id);
      if (!e) throw new Error(`outfit ${o.name} names ${id}, which isn't in the closet`);
      const state = o.states?.[id] ?? e.states?.[0]?.name ?? null;
      return { id, slot: e.slot, state, pinned: e.kind === 'pin', tags: this.closet.itemTags({ tags: e.tags, states: e.states }, state) };
    });
    const body = (list) => list.filter((w) => !w.pinned).map((w) => `${w.id}:${w.state}`).sort().join('|');
    const op = (b) => this.closet.applyOutfit(b, outfitId, { redraw: false });
    const label = `outfit ${o.name}`;
    if (body(next) === body(this.worn.get(actor.id) ?? [])) { this.applyNow(actor, next, op, label); return { at: this.tree.clock.step }; }
    return { at: this.schedule(actor, next, op, label).at };
  }

  putOnWearable(actor, wm, state, { bytes = null, source = null, from = null }) {
    this.bundle(actor); // a plain .vrm character has no closet: refuse now, not later
    const pinned = wm.kind === 'pin';
    const old = this.worn.get(actor.id) ?? [];
    const displaced = new Set(old.filter((o) => o.id !== wm.id && displaces(wm.slot, o.slot)).map((o) => o.id));
    const next = [...old.filter((o) => o.id !== wm.id && !displaced.has(o.id)), { id: wm.id, slot: wm.slot, state, pinned, tags: this.closet.itemTags(wm, state), ...(from ? { from } : {}) }];
    const op = async (b) => {
      if (bytes && !this.closet.closetOf(b).items.some((x) => x.id === wm.id)) await this.closet.addItem(b, bytes, { source, spec: this.spec ?? undefined });
      await this.closet.putOn(b, wm.id, { state: state ?? undefined, redraw: false });
    };
    // a pinned item that displaces something drawn into the body changes the look: it waits for the redraw too
    const look = !pinned || [...displaced].some((id) => !old.find((o) => o.id === id)?.pinned);
    const label = `put on ${wm.name}`;
    if (!look) { this.applyNow(actor, next, op, label); return { id: wm.id, state, pinned, at: this.tree.clock.step }; }
    const job = this.schedule(actor, next, op, label);
    return { id: wm.id, state, pinned, at: job.at };
  }

  /** A change to pinned items only: tags now, the bundle and the models afterwards. */
  applyNow(actor, next, op, label) {
    actor.setEquippedTags(this.tagsOf(actor, next));
    this.worn.set(actor.id, next);
    actor.emit('dressed', { worn: next.map((w) => w.id) });
    this.enqueue(actor.id, async () => {
      const t0 = this.now(); // timing only, outside the simulation (an injected clock: the step clock is the only one here)
      await op(this.bundle(actor));
      this.timings.push({ op: 'pinned', ms: this.now() - t0 });
    }, label);
    this.later(() => this.present(actor.id), label);
  }

  // ---------------------------------------------------------------- the step

  /** A swap due now that isn't ready holds the step (see the header). */
  holds(step) { return this.jobs.some((j) => j.at <= step && !j.ready); }

  physicsProcess() {
    if (!this.shown) { this.shown = true; this.later(() => this.showWorn(), 'show worn'); }
    const step = this.tree.clock.step;
    const due = this.jobs.filter((x) => x.at <= step);
    if (!due.length) return;
    this.jobs = this.jobs.filter((x) => x.at > step);
    for (const j of due) {
      if (j.error) throw j.error;
      const actor = this.tree.find(j.char);
      if (!actor) continue;
      actor.swapVRM(j.prep);
      this.drawn.set(j.char, j.drawn);
      // later changes to pinned items (made after this redraw was asked for) stay; the rest is what the redraw drew
      const pinnedNow = (this.worn.get(j.char) ?? []).filter((w) => w.pinned);
      const merged = [...j.worn.filter((w) => !w.pinned), ...pinnedNow];
      actor.setEquippedTags(this.tagsOf(actor, merged));
      this.worn.set(j.char, merged);
      actor.emit('dressed', { worn: merged.map((w) => w.id) });
      this.later(() => this.present(j.char), 'swap');
    }
  }

  async settle() {
    while (this.jobs.some((j) => !j.ready) || this.background.size) await Promise.all([...this.jobs.map((j) => j.promise), ...this.background]);
  }

  // ---------------------------------------------------------------- helpers

  schedule(actor, worn, op, label) {
    const lib = this.tree.services.get('characters');
    const job = { char: actor.id, at: this.tree.clock.step + this.latency, ready: false, prep: null, worn, drawn: null, label, error: null, promise: null };
    job.promise = this.enqueue(actor.id, async () => {
      const t0 = this.now(); // timing only, outside the simulation (an injected clock: the step clock is the only one here)
      try {
        if (!this.spec) throw new Error(`${label}: redrawing avatar.vrm needs spec.vrm (pass spec to installCloset)`);
        const b = this.bundle(actor);
        await op(b);
        const r = await this.closet.redrawAvatar(b, { spec: this.spec });
        const vrm = await lib.parseBody(r.bytes);
        job.prep = { vrm, clips: actor.clips };
        job.drawn = new Map(this.wornIn(b).filter((w) => w.pinned).map((w) => [w.id, w.state]));
        this.timings.push({ op: 'redraw', ms: this.now() - t0 });
      } catch (e) { job.error = e; }
      job.ready = true;
    }, label);
    this.jobs.push(job);
    return job;
  }

  /** Run a bundle operation after the character's earlier ones. */
  enqueue(char, fn, label) {
    const prev = this.queues.get(char) ?? Promise.resolve();
    const p = prev.then(fn).catch((e) => { console.warn(`[closet] ${label}: ${e.message}`); });
    this.queues.set(char, p);
    this.background.add(p);
    p.finally(() => this.background.delete(p));
    return p;
  }

  later(fn, label) {
    const p = (async () => { try { await fn(); } catch (e) { console.warn(`[closet] ${label}: ${e.message}`); } })();
    this.background.add(p);
    p.finally(() => this.background.delete(p));
  }

  bundle(actor) {
    const b = this.bundles.get(actor.id);
    if (!b) throw new Error(`${actor.id} has no closet (a plain .vrm character)`);
    return b;
  }

  entry(actor, id) {
    const e = this.closet.closetOf(this.bundle(actor)).items.find((x) => x.id === id);
    if (!e) throw new Error(`${actor.id}'s closet has no ${id}`);
    return e;
  }

  /** The actor's equipped tags with the worn list replaced: its other tags (a seat's, say) kept. */
  tagsOf(actor, worn) {
    const old = new Set((this.worn.get(actor.id) ?? []).flatMap((w) => w.tags));
    const keep = [...actor.equipped].filter((t) => !old.has(t));
    return [...new Set([...keep, ...worn.flatMap((w) => w.tags)])];
  }

  wearableManifest(bytes) {
    const m = this.core.readZip(bytes).find((e) => e.name === 'vrmxw.json');
    if (!m) throw new Error('the embedded wearable has no vrmxw.json');
    return decode(m.data);
  }

  // ---------------------------------------------------------------- presentation

  /**
   * Make what is shown match what is worn: a pinned item drawn in the state it is worn in shows its drawn copy;
   * every other drawn pinned item is hidden; a worn pinned item not shown that way gets a copy hung on its bone.
   */
  async present(char) {
    const actor = this.tree.find(char);
    if (!actor?.vrm) return;
    await this.queues.get(char); // the bundle has every item the simulation has asked for
    const worn = (this.worn.get(char) ?? []).filter((w) => w.pinned);
    // drawn into this body: what the closet said when it was drawn, for the items the body really has (a bundle's
    // avatar.vrm may be older than its closet: VRMXA §4 avatar.of)
    const inBody = new Set(); actor.vrm.scene.traverse((o) => { const id = o.userData.vrmxaFit?.item; if (id) inBody.add(id); });
    const drawn = new Map([...(this.drawn.get(char) ?? [])].filter(([id]) => inBody.has(id)));
    const showDrawn = new Set(worn.filter((w) => drawn.has(w.id) && drawn.get(w.id) === w.state).map((w) => w.id));
    actor.vrm.scene.traverse((o) => { const id = o.userData.vrmxaFit?.item; if (id && inBody.has(id) && !this.isWornUnpinned(char, id)) o.visible = showDrawn.has(id); });
    for (const [id] of this.hungOn(actor)) if (!worn.some((w) => w.id === id && !showDrawn.has(id))) this.unhang(actor, id);
    for (const w of worn) if (!showDrawn.has(w.id)) await this.hang(actor, w.id, w.state);
  }

  isWornUnpinned(char, id) { return (this.worn.get(char) ?? []).some((w) => w.id === id && !w.pinned); }

  /** Show every character's pinned items (call after instantiate; the first step does it too, without waiting). */
  async showWorn() {
    this.shown = true;
    for (const char of this.worn.keys()) await this.present(char);
  }

  hungOn(actor) {
    const out = new Map();
    actor.vrm.scene.traverse((o) => { if (o.userData.presentation && o.userData.item) out.set(o.userData.item, o); });
    return out;
  }

  /** Hang a copy of a pinned item's model on its state's bone (presentation: skipped by snapshots and interpolation). */
  async hang(actor, id, state) {
    const cur = this.hungOn(actor).get(id);
    if (cur && cur.userData.state === state) return;
    const item = await this.closet.itemOf(this.bundle(actor), id);
    const m = item.manifest;
    const st = (m.states ?? []).find((s) => s.name === state) ?? m.states?.[0] ?? null;
    const bone = st?.bone ?? m.attach?.bone;
    const raw = actor.vrm.humanoid?.getRawBoneNode(bone);
    if (!raw) return;
    // the item's own meshes hang under its attach bone in the model (VRMXW §4 rig, §8): those subtrees, not its rig
    const { nodeObjects } = await parseGLB(item.entries.get(m.model?.file ?? 'model.glb'), { stubTextures: this.stubTextures });
    const rig = new Set(Object.values(m.rig?.humanBones ?? {}).map((i) => nodeObjects[i]));
    const attach = nodeObjects[m.rig?.humanBones?.[m.attach?.bone]];
    if (!attach) return;
    const group = new Group();
    group.name = `closet:${id}`;
    Object.assign(group.userData, { presentation: true, bone, item: id, state });
    for (const r of attach.children.filter((c) => !rig.has(c))) {
      if (Array.isArray(st?.matrix) && st.matrix.length === 16) { r.matrix.fromArray(st.matrix); r.matrix.decompose(r.position, r.quaternion, r.scale); }
      group.add(r);
    }
    if (this.worn.get(actor.id)?.find((w) => w.id === id)?.state !== state) return; // changed again meanwhile
    this.unhang(actor, id);
    raw.add(group);
  }

  unhang(actor, id) {
    const o = this.hungOn(actor).get(id);
    o?.parent?.remove(o);
  }

  // ---------------------------------------------------------------- snapshots

  /**
   * Bring a character's bundle in line with what the simulation says is worn (after a restore): pinned items only, as
   * the body's look is checked to match. A taken wearable the bundle lacks is read again from the item it came from
   * (`from`: the Item node, still prepared in the item library of a tree built from the same scene).
   */
  async syncBundle(actor) {
    const b = this.bundle(actor);
    const items = this.tree.services.get('items');
    const worn = (this.worn.get(actor.id) ?? []).filter((w) => w.pinned);
    for (const id of this.closet.closetOf(b).worn.items) {
      const e = this.closet.closetOf(b).items.find((x) => x.id === id);
      if (e?.kind === 'pin' && !worn.some((w) => w.id === id)) await this.closet.takeOff(b, id, { redraw: false });
    }
    for (const w of worn) {
      const c = this.closet.closetOf(b);
      if (!c.items.some((x) => x.id === w.id)) {
        const bytes = w.from ? items?.get(w.from)?.wearable : null;
        if (!bytes) throw new Error(`${actor.id} wears ${w.id}, which neither the bundle nor its item (${w.from ?? 'unknown'}) has`);
        await this.closet.addItem(b, bytes, { source: items.get(w.from).manifest?.name ?? null, spec: this.spec ?? undefined });
      }
      const now = this.closet.closetOf(b);
      const state = now.worn.states[w.id] ?? now.items.find((x) => x.id === w.id)?.states?.[0]?.name ?? null;
      if (!now.worn.items.includes(w.id)) await this.closet.putOn(b, w.id, { state: w.state ?? undefined, redraw: false });
      else if (w.state != null && state !== w.state) await this.closet.setState(b, w.id, w.state, { redraw: false });
    }
  }

  /**
   * Before restoring a snapshot into a fresh world (a save loaded): bring each character's body to the snapshot's look
   * (what is drawn into avatar.vrm), so setState finds the same body. Async and outside the step: the bundle takes the
   * saved worn set, the body is redrawn and swapped in. Pinned items need nothing here (present() shows them).
   * @param {{ worn: Record<string, any[]> }} s the closet service's state in the snapshot
   */
  async adoptLook(s) {
    const body = (list) => list.filter((w) => !w.pinned).map((w) => `${w.id}:${w.state}`).sort().join('|');
    const lib = this.tree.services.get('characters');
    for (const [char, worn] of Object.entries(s.worn ?? {})) {
      const actor = this.tree.find(char);
      if (!actor || body(this.worn.get(char) ?? []) === body(worn)) continue;
      if (!this.spec) throw new Error(`${char}'s save wears a different look: redrawing avatar.vrm needs spec.vrm (pass spec to installCloset)`);
      const b = this.bundle(actor), items = this.tree.services.get('items');
      const c = this.closet.closetOf(b);
      for (const id of c.worn.items) if (!worn.some((w) => w.id === id)) await this.closet.takeOff(b, id, { redraw: false });
      for (const w of worn) {
        if (!this.closet.closetOf(b).items.some((x) => x.id === w.id)) {
          const bytes = w.from ? items?.get(w.from)?.wearable : null;
          if (!bytes) throw new Error(`${char} wears ${w.id}, which neither the bundle nor its item (${w.from ?? 'unknown'}) has`);
          await this.closet.addItem(b, bytes, { source: items.get(w.from).manifest?.name ?? null, spec: this.spec ?? undefined });
        }
        await this.closet.putOn(b, w.id, { state: w.state ?? undefined, redraw: false });
      }
      const r = await this.closet.redrawAvatar(b, { spec: this.spec });
      actor.swapVRM({ vrm: await lib.parseBody(r.bytes), clips: actor.clips });
      this.drawn.set(char, new Map(this.wornIn(b).filter((w) => w.pinned).map((w) => [w.id, w.state])));
      this.worn.set(char, worn.map((w) => ({ ...w, tags: [...w.tags] })));
    }
  }

  getState() {
    return {
      worn: Object.fromEntries([...this.worn].map(([k, v]) => [k, v.map((w) => ({ ...w, tags: [...w.tags] }))])),
      jobs: this.jobs.map((j) => ({ char: j.char, at: j.at, label: j.label })),
      shown: this.shown, // the first step shows the worn look: a world restored at step 0 does it again, as a fresh one does
    };
  }

  setState(s) {
    if (s.shown !== undefined) this.shown = s.shown;
    if (s.jobs.length) throw new Error(`a snapshot taken while a closet redraw was pending (${s.jobs.map((j) => j.label).join(', ')}) can't be restored: snapshot before it, or after it lands`);
    for (const [char, worn] of Object.entries(s.worn)) {
      const body = (this.worn.get(char) ?? []).filter((w) => !w.pinned).map((w) => `${w.id}:${w.state}`).sort().join('|');
      const want = worn.filter((w) => !w.pinned).map((w) => `${w.id}:${w.state}`).sort().join('|');
      if (body !== want) throw new Error(`${char}'s snapshot wears a different look than this tree's body (a redraw happened): restoring across a look change isn't supported in M1`);
      this.worn.set(char, worn.map((w) => ({ ...w, tags: [...w.tags] })));
      const actor = this.tree.find(char);
      if (actor) this.enqueue(char, () => this.syncBundle(actor), 'restore');
      this.later(() => this.present(char), 'restore');
    }
  }
}

/** Does putting on an item in `slot` take off one in `other` (VRMXA §7.2; vrmxa-core's displacedBy)? */
function displaces(slot, other) {
  if (slot !== 'accessory' && other === slot) return true;
  if (slot === 'onepiece' && (other === 'tops' || other === 'bottoms')) return true;
  if ((slot === 'tops' || slot === 'bottoms') && other === 'onepiece') return true;
  return false;
}
