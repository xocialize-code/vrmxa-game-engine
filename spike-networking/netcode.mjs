// Lockstep against rollback (AB-T-0622): two peers, each with its own two-player cafe world, on one simulated network
// (lib/net.mjs: latency, jitter, loss; reliable-ordered like a WebSocket, unreliable-unordered like a WebRTC data
// channel), in virtual time. Every step each peer finally settles on is hashed and compared with the other peer's and
// with a reference world that stepped the true inputs alone.
//
//   node netcode.mjs [--steps 1200] [--profiles lan,good,typical,poor,bad] [--out results/netcode.json] [--quick]
//
// 1. Lockstep's input delay: for each profile and transport, the protocol alone (no worlds: stalls depend only on when
//    packets arrive) at input delays 0 to 15 steps, over SEEDS network seeds; the stall rate (ticks the game waits) at
//    each, and the smallest delay under 1 % (and 0.1 %) per seed.
// 2. Worlds (network seed 7): per profile and transport, lockstep at the largest of those delays over the seeds, and
//    rollback at delays 0 and 2 (prediction window 12 steps, a snapshot every step), both peers stepping their worlds
//    for real. Hashes include Rapier's whole serialisation (physics:bytes); each run's per-step hashes are kept as a
//    digest per peer and for the reference.
import fs from 'node:fs';
import path from 'node:path';
import { RAPIER_BUILD } from '@vrmxg/physics';
import { Network, PROFILES, OVERHEAD } from './lib/net.mjs';
import { Peer } from './lib/peer.mjs';
import { playerInputs } from './lib/inputs.mjs';
import { twoPlayerWorld, freeWorld, referenceHashes, runDigest, HAS_MODELS } from './lib/world.mjs';
import { SHIM } from './lib/snap.mjs';
import { stats } from './lib/stats.mjs';

const here = import.meta.dirname;
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const STEPS = +opt('steps', 1200), PROFS = opt('profiles', Object.keys(PROFILES).join(',')).split(','), QUICK = args.includes('--quick');
const OUT = path.resolve(here, opt('out', 'results/netcode.json'));
const TRANSPORTS = ['reliable', 'unreliable'];
const TICK = 1000 / 60, B_OFFSET = 7.3; // peer B's ticks fall 7.3 ms after A's
const SEEDS = Array.from({ length: +opt('seeds', 10) }, (_, i) => i + 1);
const WINDOW = 12;

async function runPair({ profile, transport, mode, delay, worlds, seed = 7 }) {
  const net = new Network(PROFILES[profile], transport, seed);
  const in0 = playerInputs(101, delay, STEPS), in1 = playerInputs(202, delay, STEPS);
  const W0 = worlds ? await twoPlayerWorld() : null, W1 = worlds ? await twoPlayerWorld() : null;
  const A = new Peer({ id: 0, world: W0, mode, delay, window: WINDOW, inputs: in0, net });
  const B = new Peer({ id: 1, world: W1, mode, delay, window: WINDOW, inputs: in1, net });
  const done = () => (mode === 'lockstep' ? A.sim >= STEPS && B.sim >= STEPS : A.lastFinal >= STEPS - 1 && B.lastFinal >= STEPS - 1);
  let k = 0;
  for (; !done() && k < STEPS * 6; k++) {
    net.runUntil(k * TICK); A.tick(k, B);
    net.runUntil(k * TICK + B_OFFSET); B.tick(k, A);
  }
  const res = { profile, transport, mode, delay, ticks: k, finished: done() };
  for (const [name, p] of [['a', A], ['b', B]]) {
    const m = p.m, secs = m.ticks / 60;
    res[name] = {
      stallRate: +(m.stalls / m.ticks).toFixed(4), stalls: m.stalls, behind: stats(m.behind),
      sentPacketsPerSec: +(m.sentPackets / secs).toFixed(1), payloadBytesPerSec: Math.round(m.sentBytes / secs),
      wireBytesPerSecEstimated: Math.round((m.sentBytes + m.sentPackets * OVERHEAD[transport]) / secs), // payload + the estimated header overhead
      ...(mode === 'rollback' ? { rollbacks: m.rollbacks, rollbacksPerSec: +(m.rollbacks / secs).toFixed(2), depth: stats(m.depths), resimPerTick: stats(m.resimPerTick), mispredictedSteps: m.mispredicted, predictedSteps: m.predicted, maxAhead: m.maxAhead } : {}),
      ...(worlds ? { tickMs: stats(m.tickMs), stepMs: stats(m.stepMs), captureMs: stats(m.captureMs), restoreMs: stats(m.restoreMs) } : {}),
      hashChecks: m.hashChecks, hashMismatch: m.hashMismatch,
    };
  }
  res.network = { packets: net.packets, lost: net.lost, retransmits: net.retransmits };
  if (worlds) {
    let firstApart = null;
    for (let s = 0; s < STEPS; s++) if (A.final.get(s) !== B.final.get(s)) { firstApart = s; break; }
    const ref = await reference(delay);
    let firstOffRef = null;
    for (let s = 0; s < STEPS; s++) if (A.final.get(s) !== ref[s]) { firstOffRef = s; break; }
    const per = (p) => Array.from({ length: STEPS }, (_, s) => p.final.get(s));
    res.hashes = { compared: STEPS, physicsBytes: true, peersAgree: firstApart === null, firstApart, matchReference: firstOffRef === null, firstOffReference: firstOffRef, final: A.final.get(STEPS - 1), digestA: runDigest(per(A)), digestB: runDigest(per(B)), digestReference: runDigest(ref.slice(0, STEPS)) };
    freeWorld(W0); freeWorld(W1);
  }
  return res;
}

const refs = new Map();
async function reference(delay) {
  if (!refs.has(delay)) refs.set(delay, await referenceHashes(playerInputs(101, delay, STEPS), playerInputs(202, delay, STEPS), STEPS));
  return refs.get(delay);
}

const out = { spike: 'networking', runtime: `node ${process.versions.node} (V8 ${process.versions.v8})`, rapier: RAPIER_BUILD, steps: STEPS, window: WINDOW, shim: SHIM, profiles: Object.fromEntries(PROFS.map((p) => [p, PROFILES[p]])), overhead: OVERHEAD, lockstepDelay: [], runs: [] };

// 1. lockstep's delay sweep (protocol only), over several network seeds
console.log(`lockstep delay sweep (${SEEDS.length} seeds)`);
const chosen = {};
for (const profile of PROFS) for (const transport of TRANSPORTS) {
  const row = { profile, transport, seeds: SEEDS, bySeed: [] };
  for (const seed of SEEDS) {
    const byDelay = [];
    for (let d = 0; d <= 15; d++) {
      const r = await runPair({ profile, transport, mode: 'lockstep', delay: d, worlds: false, seed });
      byDelay.push({ delay: d, stallRate: Math.max(r.a.stallRate, r.b.stallRate) });
    }
    row.bySeed.push({ seed, byDelay, under1pct: byDelay.find((x) => x.stallRate < 0.01)?.delay ?? null, under01pct: byDelay.find((x) => x.stallRate < 0.001)?.delay ?? null });
  }
  const range = (k) => { const v = row.bySeed.map((x) => x[k]); return v.includes(null) ? { min: Math.min(...v.filter((x) => x !== null)), max: null, none: v.filter((x) => x === null).length } : { min: Math.min(...v), max: Math.max(...v) }; };
  row.under1pct = range('under1pct'); row.under01pct = range('under01pct');
  chosen[`${profile}|${transport}`] = row.under1pct.max ?? 15;
  out.lockstepDelay.push(row);
  const f = (r) => (r.max === null ? `${Number.isFinite(r.min) ? r.min : '-'}–none (${r.none} of ${SEEDS.length} seeds never)` : r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
  console.log(`  ${profile.padEnd(8)} ${transport.padEnd(10)} delay for < 1 % stalls: ${f(row.under1pct)} steps; < 0.1 %: ${f(row.under01pct)}`);
}

// 2. worlds
if (!HAS_MODELS) { console.error('worlds need vrmxa-avatar-studio beside the repository'); }
else {
  console.log('worlds');
  for (const profile of PROFS) for (const transport of TRANSPORTS) {
    const plan = [{ mode: 'lockstep', delay: chosen[`${profile}|${transport}`] }, { mode: 'rollback', delay: 0 }, ...(QUICK ? [] : [{ mode: 'rollback', delay: 2 }])];
    for (const p of plan) {
      const r = await runPair({ profile, transport, ...p, worlds: true });
      out.runs.push(r);
      const h = r.hashes;
      console.log(`  ${h.peersAgree && h.matchReference ? 'ok  ' : 'APART'} ${profile.padEnd(8)} ${transport.padEnd(10)} ${p.mode.padEnd(8)} d${p.delay}: stalls ${(r.a.stallRate * 100).toFixed(2)} %` +
        (p.mode === 'rollback' ? `, rollbacks ${r.a.rollbacksPerSec}/s depth p95 ${r.a.depth.p95 ?? '-'} max ${r.a.depth.max ?? '-'}, tick p95 ${r.a.tickMs.p95} ms max ${r.a.tickMs.max} ms` : `, tick p95 ${r.a.tickMs.p95} ms`) +
        `, ${r.a.wireBytesPerSecEstimated} B/s on the wire (estimated)${h.peersAgree ? '' : `, apart at ${h.firstApart}`}${h.matchReference ? '' : `, off the reference at ${h.firstOffReference}`}`);
    }
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${path.relative(here, OUT)}`);
