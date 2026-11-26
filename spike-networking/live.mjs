// The same two peers over the real transports, in real time, on loopback only (AB-T-0622):
//   websocket  a `ws` server on 127.0.0.1 (an OS-chosen port) and a client: reliable, ordered (TCP)
//   webrtc     two werift peer connections, signalled through the same loopback server, ICE bound to 127.0.0.1 with no
//              STUN or TURN server, a data channel { ordered: false, maxRetransmits: 0 } (SCTP over DTLS over UDP)
// Every gathered ICE candidate is checked to be 127.0.0.1 before anything is sent.
//
//   node live.mjs [--seconds 10] [--out results/live.json]
//
// 1. ping: 1000 packets of 30 bytes each way, round-trip times over each transport.
// 2. runs: for each transport, profiles lan (none added) and typical (50 ± 15 ms one way and 1 % loss, added in the
//    sender by the same seeded model as lib/net.mjs: a WebSocket's loss becomes a fast retransmit's delay, in order;
//    a data channel's is dropped), lockstep and rollback, both worlds stepping at 60 Hz on wall-clock ticks. Hashes
//    compared with each other and with the reference.
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { RTCPeerConnection } from 'werift';
import { RAPIER_BUILD } from '@vrmxg/physics';
import { Peer } from './lib/peer.mjs';
import { PROFILES, OVERHEAD, RTO_MIN, FAST_RETRANSMIT_GAP } from './lib/net.mjs';
import { playerInputs, mulberry32 } from './lib/inputs.mjs';
import { twoPlayerWorld, freeWorld, referenceHashes, runDigest, HAS_MODELS } from './lib/world.mjs';
import { SHIM } from './lib/snap.mjs';
import { stats } from './lib/stats.mjs';

const here = import.meta.dirname;
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const SECONDS = +opt('seconds', 10), STEPS = SECONDS * 60, OUT = path.resolve(here, opt('out', 'results/live.json'));
const LOOPBACK = '127.0.0.1';
if (!HAS_MODELS) { console.error('needs vrmxa-core beside the repository (the characters)'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// ---------------------------------------------------------------- the loopback server: a game channel and a signalling relay

const wss = new WebSocketServer({ host: LOOPBACK, port: 0 });
await new Promise((r) => wss.once('listening', r));
const { address, port } = /** @type {any} */ (wss.address());
if (address !== LOOPBACK) throw new Error(`the server is bound to ${address}, not loopback`);
const relay = new Map(); // room → sockets
wss.on('connection', (ws, req) => {
  const room = req.url;
  if (room.startsWith('/signal')) {
    const peers = relay.get(room) ?? []; peers.push(ws); relay.set(room, peers);
    ws.on('message', (m) => { for (const o of relay.get(room)) if (o !== ws) o.send(m.toString()); });
  } else wss.emit('game', ws, room);
});

/** Two connected sockets over the server, binary: [server side, client side]. */
async function websocketPair(room) {
  const server = new Promise((r) => { const on = (ws, rm) => { if (rm === room) { wss.off('game', on); r(ws); } }; wss.on('game', on); });
  const client = new WebSocket(`ws://${LOOPBACK}:${port}${room}`);
  await new Promise((r, j) => { client.once('open', r); client.once('error', j); });
  const s = await server;
  for (const w of [s, client]) { w.binaryType = 'nodebuffer'; /** @type {any} */ (w)._socket?.setNoDelay?.(true); }
  return [
    { send: (b) => s.send(b), on: (fn) => s.on('message', (m) => fn(new Uint8Array(m))), close: () => s.close() },
    { send: (b) => client.send(b), on: (fn) => client.on('message', (m) => fn(new Uint8Array(m))), close: () => client.close() },
  ];
}

const RTC = { iceServers: [], iceUseDefaultStunServer: false, iceInterfaceAddresses: { udp4: LOOPBACK }, iceUseIpv6: false, iceUseTcp: false };
const candidates = (sdp) => sdp.split(/\r?\n/).filter((l) => l.startsWith('a=candidate:')).map((l) => l.split(' ')[4]);

/** Two werift peer connections over a loopback signalling room, joined by an unreliable, unordered data channel. */
async function webrtcPair(room) {
  const sigA = new WebSocket(`ws://${LOOPBACK}:${port}/signal${room}`), sigB = new WebSocket(`ws://${LOOPBACK}:${port}/signal${room}`);
  await Promise.all([sigA, sigB].map((w) => new Promise((r) => w.once('open', r))));
  const a = new RTCPeerConnection(RTC), b = new RTCPeerConnection(RTC);
  const gathered = (pc) => new Promise((r) => { if (pc.iceGatheringState === 'complete') r(); else pc.iceGatheringStateChange.subscribe((s) => { if (s === 'complete') r(); }); });
  const seen = [];
  const check = (sdp) => { for (const c of candidates(sdp)) { seen.push(c); if (c !== LOOPBACK) throw new Error(`a non-loopback ICE candidate: ${c}`); } };
  const dcA = a.createDataChannel('inputs', { ordered: false, maxRetransmits: 0 });
  const dcB = new Promise((r) => b.onDataChannel.subscribe((dc) => r(dc)));
  sigB.on('message', async (m) => {
    const offer = JSON.parse(m.toString()); check(offer.sdp);
    await b.setRemoteDescription(offer); await b.setLocalDescription(await b.createAnswer()); await gathered(b);
    check(b.localDescription.sdp); sigB.send(JSON.stringify(b.localDescription));
  });
  const answered = new Promise((r) => sigA.on('message', async (m) => { const ans = JSON.parse(m.toString()); check(ans.sdp); await a.setRemoteDescription(ans); r(); }));
  await a.setLocalDescription(await a.createOffer()); await gathered(a);
  check(a.localDescription.sdp); sigA.send(JSON.stringify(a.localDescription));
  await answered;
  const B = await dcB;
  await Promise.all([dcA, B].map((dc) => new Promise((r) => (dc.readyState === 'open' ? r() : dc.stateChanged.subscribe((s) => { if (s === 'open') r(); })))));
  return {
    candidates: [...new Set(seen)],
    ends: [
      { send: (bytes) => dcA.send(Buffer.from(bytes)), on: (fn) => dcA.onMessage.subscribe((m) => fn(new Uint8Array(m))), close: () => a.close() },
      { send: (bytes) => B.send(Buffer.from(bytes)), on: (fn) => B.onMessage.subscribe((m) => fn(new Uint8Array(m))), close: () => b.close() },
    ],
    close: () => { sigA.close(); sigB.close(); },
  };
}

// ---------------------------------------------------------------- 1. ping

async function ping(ends, n = 1000) {
  const [x, y] = ends, rtt = [], pending = new Map();
  y.on((b) => y.send(b));
  x.on((b) => { const id = new DataView(b.buffer, b.byteOffset).getUint32(0, true); const t = pending.get(id); if (t !== undefined) { rtt.push(performance.now() - t); pending.delete(id); } });
  for (let i = 0; i < n; i++) {
    const b = new Uint8Array(30); new DataView(b.buffer).setUint32(0, i, true);
    pending.set(i, performance.now()); x.send(b);
    await sleep(2);
  }
  await sleep(200);
  return { sent: n, received: rtt.length, rttMs: stats(rtt) };
}

// ---------------------------------------------------------------- 2. runs

/** The `net` a Peer sends through: the transport, with the profile added in the sender (seeded). */
function liveNet(mode, profile, ends, seed) {
  const rnd = mulberry32(seed), p = profile, last = [0, 0];
  const net = { mode, packets: 0, lost: 0, retransmits: 0, peers: [null, null] };
  ends.forEach((e, i) => e.on((b) => net.peers[i].receive(b)));
  net.send = (from, to, bytes) => {
    net.packets++;
    const copy = bytes.slice(), d = () => Math.max(0, p.latency + (rnd() + rnd() - 1) * p.jitter);
    let wait = d();
    if (mode === 'unreliable') { if (rnd() < p.loss) { net.lost++; return; } }
    else {
      let tries = 0, rto = Math.max(RTO_MIN, 4 * p.latency);
      while (rnd() < p.loss) { net.lost++; net.retransmits++; wait += tries++ === 0 ? 2 * p.latency + 3 * FAST_RETRANSMIT_GAP : (rto *= 2) / 2; }
      const at = Math.max(performance.now() + wait, last[from]); last[from] = at; wait = at - performance.now(); // in order
    }
    if (wait <= 0) ends[from].send(copy); else setTimeout(() => ends[from].send(copy), wait);
  };
  return net;
}

async function runLive(transport, profileName, mode, delay, ends) {
  const net = liveNet(transport === 'websocket' ? 'reliable' : 'unreliable', PROFILES[profileName], ends, 7);
  const in0 = playerInputs(101, delay, STEPS), in1 = playerInputs(202, delay, STEPS);
  const [W0, W1] = [await twoPlayerWorld(), await twoPlayerWorld()];
  const A = new Peer({ id: 0, world: W0, mode, delay, window: 12, inputs: in0, net }), B = new Peer({ id: 1, world: W1, mode, delay, window: 12, inputs: in1, net });
  net.peers = [A, B];
  const done = () => (mode === 'lockstep' ? A.sim >= STEPS && B.sim >= STEPS : A.lastFinal >= STEPS - 1 && B.lastFinal >= STEPS - 1);
  const t0 = performance.now() + 50, lateness = [];
  let k = 0;
  for (; !done() && k < STEPS * 3; k++) {
    for (const [peer, other, off] of [[A, B, 0], [B, A, 7.3]]) {
      const due = t0 + k * (1000 / 60) + off;
      await sleep(due - performance.now() - 1);
      while (performance.now() < due) await new Promise((r) => setImmediate(r)); // let packets in until the tick is due
      lateness.push(performance.now() - due);
      peer.tick(k, other);
    }
  }
  await sleep(100);
  const ref = await referenceHashes(in0, in1, STEPS);
  let apart = null, off = null;
  for (let s = 0; s < STEPS; s++) { if (apart === null && A.final.get(s) !== B.final.get(s)) apart = s; if (off === null && A.final.get(s) !== ref[s]) off = s; }
  freeWorld(W0); freeWorld(W1);
  const m = A.m, secs = m.ticks / 60;
  return {
    transport, profile: profileName, mode, delay, ticks: k, finished: done(),
    hashes: { compared: STEPS, physicsBytes: true, peersAgree: apart === null, firstApart: apart, matchReference: off === null, firstOffReference: off, digestA: runDigest(Array.from({ length: STEPS }, (_, s) => A.final.get(s))), digestB: runDigest(Array.from({ length: STEPS }, (_, s) => B.final.get(s))), digestReference: runDigest(ref) },
    stallRate: +(m.stalls / m.ticks).toFixed(4), behind: stats(m.behind), tickLatenessMs: stats(lateness),
    ...(mode === 'rollback' ? { rollbacks: m.rollbacks, depth: stats(m.depths) } : {}),
    tickMs: stats(m.tickMs), payloadBytesPerSec: Math.round(m.sentBytes / secs), wireBytesPerSecEstimated: Math.round((m.sentBytes + m.sentPackets * OVERHEAD[net.mode]) / secs), // payload + the estimated header overhead
    network: { packets: net.packets, lost: net.lost, retransmits: net.retransmits },
  };
}

const out = { spike: 'networking', runtime: `node ${process.versions.node} (V8 ${process.versions.v8})`, rapier: RAPIER_BUILD, shim: SHIM, seconds: SECONDS, server: { address, port: 'os-chosen' }, ping: {}, webrtcCandidates: null, runs: [] };
let lockDelay = { 'lan|reliable': 1, 'lan|unreliable': 1, 'typical|reliable': 9, 'typical|unreliable': 5 };
try {
  const nc = JSON.parse(fs.readFileSync(path.join(here, 'results/netcode.json'), 'utf8'));
  for (const r of nc.lockstepDelay) if (r.under1pct?.max != null) lockDelay[`${r.profile}|${r.transport}`] = r.under1pct.max; // the largest over the seeds
} catch { /* the defaults */ }

for (const transport of ['websocket', 'webrtc']) {
  const pair = async (room) => (transport === 'websocket' ? { ends: await websocketPair(room), close: () => {} } : await webrtcPair(room));
  const p = await pair('/ping');
  if (p.candidates) out.webrtcCandidates = p.candidates;
  out.ping[transport] = await ping(p.ends);
  console.log(`${transport} ping: rtt p50 ${out.ping[transport].rttMs.p50} ms p95 ${out.ping[transport].rttMs.p95} ms (${out.ping[transport].received}/${out.ping[transport].sent})${p.candidates ? `, ICE candidates ${p.candidates.join(', ')}` : ''}`);
  p.ends.forEach((e) => e.close()); p.close();
  for (const profile of ['lan', 'typical']) for (const mode of ['lockstep', 'rollback']) {
    const q = await pair(`/${profile}-${mode}`);
    const delay = mode === 'lockstep' ? lockDelay[`${profile}|${transport === 'websocket' ? 'reliable' : 'unreliable'}`] : 0;
    const r = await runLive(transport, profile, mode, delay, q.ends);
    out.runs.push(r);
    console.log(`  ${r.hashes.peersAgree && r.hashes.matchReference ? 'ok  ' : 'APART'} ${transport} ${profile} ${mode} d${delay}: stalls ${(r.stallRate * 100).toFixed(2)} %, tick late p95 ${r.tickLatenessMs.p95} ms${r.depth ? `, rollbacks ${r.rollbacks} depth p95 ${r.depth.p95}` : ''}, ${r.wireBytesPerSecEstimated} B/s on the wire (estimated)`);
    q.ends.forEach((e) => e.close()); q.close();
  }
}
wss.close();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${path.relative(here, OUT)}`);
process.exit(0);
