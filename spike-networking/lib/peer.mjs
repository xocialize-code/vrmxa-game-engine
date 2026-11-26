// A networked peer: its own world (the two-player cafe), its own player (one bot), and the protocol, lockstep or
// rollback. Both run on the simulated network in virtual time; the world steps for real.
//
// Inputs are by step, not by tick: player p's input for step s is its bot's (s − delay)th value (neutral before
// `delay`), so the true inputs of a run don't depend on the network and one reference world can step them alone.
//
// Packet (binary, little-endian):
//   u8 type (1) | u32 ack: the highest step up to which every remote input arrived (−1 as 0xffffffff)
//   u32 first | u8 n | n × 4 bytes of input (steps first … first+n−1)
//   u8 hasHash | [u32 step | u32 hi | u32 lo]: a confirmed step's world hash, every HASH_EVERY confirmed steps
// Unreliable delivery resends every input the other peer hasn't acknowledged (up to MAX_INPUTS); reliable sends each
// input once.
import { frameOf, packInput, unpackInput, sameInput, NEUTRAL, INPUT_BYTES } from './inputs.mjs';
import { captureWorld, restoreWorld } from './snap.mjs';
import { stepHash } from './world.mjs';

export const HASH_EVERY = 30, MAX_INPUTS = 64, CATCH_UP = 4;
const now = () => performance.now();

export class Peer {
  /**
   * @param {{ id: 0 | 1, world: any | null, mode: 'lockstep' | 'rollback', delay: number, window?: number, inputs: number[][],
   *   net: import('./net.mjs').Network, hashes?: boolean }} o
   *   inputs: this player's input per step (already shifted by delay); world null: the protocol alone (no stepping)
   */
  constructor(o) {
    Object.assign(this, { window: 12, hashes: true }, o);
    this.local = new Map(); this.remote = new Map();
    this.remoteContig = -1;   // every remote input ≤ this has arrived
    this.remoteMax = -1;      // the highest remote step that arrived
    this.ackedByRemote = -1;  // every local input ≤ this has reached the other peer
    this.lastSent = -1;       // reliable: the highest local step sent
    this.produced = -1;       // the highest step this player's input exists for
    this.sim = 0;             // the world's clock: the next step to run
    this.used = new Map();    // rollback: the remote input each simulated step used
    this.hash = new Map(); this.hashMs = 0; this.final = new Map(); this.lastFinal = -1;
    this.ring = new Map();
    this.rollbackFrom = Infinity;
    // inputs before the delay are neutral by the protocol: both peers know them without a packet
    for (let k = 0; k < this.delay; k++) this.remote.set(k, NEUTRAL);
    this.remoteContig = this.remoteMax = this.delay - 1;
    this.m = { ticks: 0, stalls: 0, rollbacks: 0, depths: [], resimPerTick: [], tickMs: [], captureMs: [], restoreMs: [], stepMs: [], mispredicted: 0, predicted: 0, hashChecks: 0, hashMismatch: 0, sentBytes: 0, sentPackets: 0, maxAhead: 0, behind: [] };
  }

  produceTo(step) { while (this.produced < step) { this.produced++; this.local.set(this.produced, this.inputs[this.produced] ?? NEUTRAL); } }

  /** What the other peer's input is taken to be for step s: the real one when it arrived, else the last that did. */
  remoteFor(s) {
    const r = this.remote.get(s);
    if (r) return r;
    for (let k = Math.min(s - 1, this.remoteMax); k >= 0; k--) { const x = this.remote.get(k); if (x) return x; }
    return NEUTRAL;
  }

  receive(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ack = dv.getUint32(1, true), first = dv.getUint32(5, true), n = dv.getUint8(9);
    if (ack !== 0xffffffff && ack > this.ackedByRemote) this.ackedByRemote = ack;
    for (let i = 0; i < n; i++) {
      const s = first + i;
      if (this.remote.has(s)) continue;
      const inp = unpackInput(bytes, 10 + i * INPUT_BYTES);
      this.remote.set(s, inp);
      if (s > this.remoteMax) this.remoteMax = s;
      if (this.mode === 'rollback' && s < this.sim) {
        const u = this.used.get(s);
        if (u && !sameInput(u, inp)) { this.m.mispredicted++; this.rollbackFrom = Math.min(this.rollbackFrom, s); }
      }
    }
    while (this.remote.has(this.remoteContig + 1)) this.remoteContig++;
    let at = 10 + n * INPUT_BYTES;
    if (dv.getUint8(at) === 1) {
      const step = dv.getUint32(at + 1, true), h = dv.getUint32(at + 5, true).toString(16).padStart(8, '0') + dv.getUint32(at + 9, true).toString(16).padStart(8, '0');
      this.pendingChecks ??= [];
      this.pendingChecks.push([step, h]);
    }
    this.checkHashes();
  }

  checkHashes() {
    if (!this.pendingChecks) return;
    this.pendingChecks = this.pendingChecks.filter(([step, h]) => {
      const mine = this.final.get(step);
      if (mine === undefined) return true;
      this.m.hashChecks++; if (mine !== h) this.m.hashMismatch++;
      return false;
    });
  }

  send(other) {
    const reliable = this.net.mode === 'reliable';
    const first = reliable ? this.lastSent + 1 : this.ackedByRemote + 1;
    const last = Math.min(this.produced, first + MAX_INPUTS - 1);
    const n = Math.max(0, last - first + 1);
    const hashStep = this.lastFinal >= 0 && this.lastFinal % HASH_EVERY === 0 && this.lastFinal !== this.hashSent ? this.lastFinal : -1;
    const bytes = new Uint8Array(10 + n * INPUT_BYTES + 1 + (hashStep >= 0 ? 12 : 0));
    const dv = new DataView(bytes.buffer);
    bytes[0] = 1;
    dv.setUint32(1, this.remoteContig < 0 ? 0xffffffff : this.remoteContig, true);
    dv.setUint32(5, first, true); dv.setUint8(9, n);
    for (let i = 0; i < n; i++) packInput(this.local.get(first + i), bytes, 10 + i * INPUT_BYTES);
    let at = 10 + n * INPUT_BYTES;
    if (hashStep >= 0) {
      const h = this.final.get(hashStep) ?? '0'.repeat(16); // no world: a placeholder of the same size
      bytes[at] = 1; dv.setUint32(at + 1, hashStep, true); dv.setUint32(at + 5, parseInt(h.slice(0, 8), 16), true); dv.setUint32(at + 9, parseInt(h.slice(8), 16), true);
      this.hashSent = hashStep;
    }
    if (n === 0 && hashStep < 0 && reliable) return; // nothing new over a reliable stream
    if (reliable) this.lastSent = Math.max(this.lastSent, last);
    this.m.sentBytes += bytes.length; this.m.sentPackets++;
    this.net.send(this.id, other.id, bytes, (b) => other.receive(b));
  }

  frame(s) {
    const mine = this.local.get(s), theirs = this.mode === 'rollback' ? this.remoteFor(s) : this.remote.get(s);
    return this.id === 0 ? [mine, theirs] : [theirs, mine];
  }

  /** Run step s on the world (or only count it, without one). */
  runStep(s, { snapshot = false } = {}) {
    const W = this.world;
    if (this.mode === 'rollback') this.used.set(s, this.remoteFor(s));
    if (!W) return;
    if (snapshot) { const t = now(); this.ring.set(s, captureWorld(W.tree)); this.ring.delete(s - this.window - 2); this.m.captureMs.push(now() - t); }
    W.rec.frames[s] = frameOf(W.rec, this.frame(s));
    const t = now();
    if (!W.tree.step()) throw new Error(`step ${s} was held`);
    this.m.stepMs.push(now() - t);
    if (!W.input.isReplaying) throw new Error('the input service stopped replaying: a frame was missing');
    if (this.hashes) { const h = now(); this.hash.set(s, stepHash(W.tree)); this.hashMs += now() - h; }
  }

  finalize() {
    const upTo = Math.min(this.remoteContig, this.produced, this.sim - 1);
    while (this.lastFinal < upTo) { this.lastFinal++; this.final.set(this.lastFinal, this.hash.get(this.lastFinal) ?? null); }
    this.checkHashes();
  }

  /** One display tick (k: the tick's index, 60 per second). */
  tick(k, other) {
    this.m.ticks++;
    const t0 = now();
    this.hashMs = 0; // hashing every step is the spike's check, not the protocol's cost
    if (this.mode === 'lockstep') {
      // the steps due by this tick, as far as both inputs have arrived (catching up at most CATCH_UP steps a tick)
      this.produceTo(this.sim + this.delay);
      for (let ran = 0; ran < CATCH_UP && this.sim <= k && this.remote.has(this.sim); ran++) { this.runStep(this.sim); this.sim++; this.produceTo(this.sim + this.delay); }
      if (this.sim <= k) this.m.stalls++;
    } else {
      this.produceTo(k + this.delay);
      let resim = 0;
      if (this.rollbackFrom < this.sim) {
        const from = this.rollbackFrom;
        this.rollbackFrom = Infinity;
        this.m.rollbacks++; this.m.depths.push(this.sim - from);
        if (this.world) {
          const snap = this.ring.get(from);
          if (!snap) throw new Error(`no snapshot for step ${from} (window ${this.window})`);
          const t = now(); restoreWorld(this.world.tree, snap); this.m.restoreMs.push(now() - t);
        }
        for (let s = from; s < this.sim; s++) { this.runStep(s, { snapshot: true }); resim++; }
      }
      this.m.resimPerTick.push(resim);
      for (let ran = 0; ran < CATCH_UP && this.sim <= k && this.sim - (this.remoteContig + 1) < this.window; ran++) {
        if (this.remote.get(this.sim) === undefined) this.m.predicted++;
        this.runStep(this.sim, { snapshot: true }); this.sim++;
      }
      if (this.sim <= k) this.m.stalls++; // the prediction window is full: wait for the other peer
      this.m.maxAhead = Math.max(this.m.maxAhead, this.sim - 1 - this.remoteContig);
    }
    this.m.behind.push(k + 1 - this.sim);
    this.finalize();
    this.send(other);
    this.m.tickMs.push(now() - t0 - this.hashMs);
  }
}
