// The "save" service (M2 W9). A save game is the world snapshot (@vrmxg/snapshot: every node, every service: physics
// bytes, inventories, the closet, the crowd, NPC brains and their memory, the flags kept here) in a versioned file that
// names what it needs to replay the same: the snapshot format, the Rapier build, a fingerprint of the portable maths
// (dmath: changing it changes every hash), the services with state, and the scene (its hash). Loading builds a fresh
// world of the same scene, checks all of that (refusing, and saying why, when anything differs), brings the bodies to
// the saved look (a closet redraw happens outside the step), and restores the snapshot: play goes on exactly as the run
// that was saved, the same per-step hashes.
import { portable } from '@vrmxg/dmath';
import { captureWorld, restoreWorld, hashValue, SNAPSHOT_FORMAT } from '@vrmxg/snapshot';
import { encode, decode } from './encode.js';

export const SAVE_FORMAT = 'vrmxg-save';
export const SAVE_VERSION = 1;

/** A fingerprint of the portable maths: the twelve functions at fixed inputs (a different dmath gives another). */
export function mathsFingerprint() {
  const xs = [0.1, 0.5, 1, 2.5, -3.75, 10];
  return hashValue(Object.entries(portable).map(([k, f]) => [k, ...xs.map((x) => (k === 'pow' || k === 'atan2' || k === 'hypot' ? f(x, 1.7) : f(k === 'acos' || k === 'asin' ? x / 11 : k === 'log' || k === 'cbrt' ? Math.abs(x) : x)))]));
}

export class SaveService {
  /** @param {any} tree @param {{ scene?: { ref: string, doc?: any, hash?: string }, app?: { name: string, version?: string } }} [o] */
  constructor(tree, { scene = null, app = null } = {}) {
    this.tree = tree;
    this.scene = scene ? { ref: scene.ref, hash: scene.hash ?? (scene.doc ? hashValue(scene.doc) : null) } : null;
    this.app = app;
    /** Game flags (story progress, a door's key found): simulation state, in the snapshot. */
    this.flags = {};
  }

  setFlag(key, value = true) { if (value === undefined || value === null || value === false) delete this.flags[key]; else this.flags[key] = structuredClone(value); }
  getFlag(key) { return this.flags[key]; }

  /** What a save made now would need to replay. */
  requires() {
    const physics = this.tree.services.get('physics');
    return {
      snapshot: SNAPSHOT_FORMAT,
      rapier: physics?.build ?? null,
      maths: mathsFingerprint(),
      services: [...this.tree.services.keys()].filter((k) => { const s = this.tree.services.get(k); return typeof s.getState === 'function' || typeof s.snapshot === 'function'; }).sort(),
      scene: this.scene,
    };
  }

  /** Why a save can't be made now (a closet redraw in flight: its result lands on a later step), or null. */
  cannotSave() {
    const closet = this.tree.services.get('closet');
    if (closet?.jobs?.length) return `a closet redraw is in flight (${closet.jobs.map((j) => j.label).join(', ')}): save after it lands`;
    return null;
  }

  /**
   * A save file of the world now (plain JSON). `savedAt` and anything else outside the simulation come from the caller.
   * @param {{ name?: string, savedAt?: string, note?: string }} [o]
   */
  save({ name = null, savedAt = null, note = null } = {}) {
    const why = this.cannotSave();
    if (why) throw new Error(`can't save: ${why}`);
    const snap = captureWorld(this.tree, { meta: { scene: this.scene?.ref ?? null } });
    const characters = this.tree.all().filter((n) => n.type === 'Character').map((n) => ({ id: n.id, name: n.name ?? n.id, p: n.object3d.position.toArray().map((v) => Math.round(v * 100) / 100) }));
    return {
      format: SAVE_FORMAT, version: SAVE_VERSION, name, savedAt, note,
      app: this.app, requires: this.requires(),
      summary: { step: snap.step, seconds: Math.round((snap.step / 60) * 10) / 10, scene: this.scene?.ref ?? null, characters, flags: structuredClone(this.flags), inventories: this.tree.services.get('inventory')?.getState?.() ?? null },
      snapshot: encode(snap),
    };
  }

  /** Problems that stop a save file loading here, as messages (empty: it loads). */
  check(doc) {
    const out = [];
    if (doc?.format !== SAVE_FORMAT) return [`not a save file (format "${doc?.format}")`];
    if (doc.version > SAVE_VERSION) out.push(`save version ${doc.version}; this build reads ${SAVE_VERSION}`);
    const have = this.requires(), need = doc.requires ?? {};
    if (need.snapshot !== have.snapshot) out.push(`snapshot format ${need.snapshot}; this build has ${have.snapshot}`);
    if (JSON.stringify(need.rapier) !== JSON.stringify(have.rapier)) out.push(`made with Rapier ${JSON.stringify(need.rapier)}; this build has ${JSON.stringify(have.rapier)} (snapshots replay only on the build that made them)`);
    if (need.maths !== have.maths) out.push('made with other portable maths (@vrmxg/dmath changed): it would not replay the same');
    const missing = (need.services ?? []).filter((s) => !have.services.includes(s));
    if (missing.length) out.push(`needs the services ${missing.join(', ')}, which this world doesn't have`);
    if (need.scene && have.scene && need.scene.hash && have.scene.hash && need.scene.hash !== have.scene.hash) out.push(`made in ${need.scene.ref} as it was (${need.scene.hash}); the scene now is ${have.scene.hash}`);
    if (need.scene && have.scene && need.scene.ref !== have.scene.ref) out.push(`made in ${need.scene.ref}, not ${have.scene.ref}`);
    return out;
  }

  /**
   * Load a save into this world, which must be freshly built from the same scene (never stepped). Checks it, brings the
   * bodies to the saved look, restores the snapshot. → the step play continues from
   */
  async load(doc) {
    const problems = this.check(doc);
    if (problems.length) throw new Error(`can't load "${doc?.name ?? 'save'}": ${problems.join('; ')}`);
    const snap = decode(doc.snapshot);
    const closet = this.tree.services.get('closet');
    const saved = snap.services?.closet?.data;
    if (closet?.adoptLook && saved) await closet.adoptLook(saved);
    restoreWorld(this.tree, snap);
    return this.tree.clock.step;
  }

  getState() { return { flags: structuredClone(this.flags) }; }
  setState(s) { this.flags = structuredClone(s.flags ?? {}); }
}
