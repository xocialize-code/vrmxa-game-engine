// One simulated network between peers, in virtual time (milliseconds on an event queue, no wall clock), seeded: the
// same profile and seed deliver the same packets at the same times on every run.
//
// Two delivery modes, the real difference between the two browser transports:
//   reliable    WebSocket (TCP): every packet arrives, in order. A lost packet is sent again by fast retransmit, once
//               three later packets have drawn duplicate ACKs (one RTT plus three send intervals, 50 ms at 60 packets/s);
//               if that copy is lost too, after the retransmission timeout (RTO = max(RTO_MIN, 2·RTT)), doubling each
//               time. Every packet behind it waits for it (head-of-line blocking).
//   unreliable  a WebRTC data channel opened { ordered: false, maxRetransmits: 0 } (SCTP over DTLS over UDP): a lost
//               packet is gone and packets may arrive out of order; the protocol resends what wasn't acknowledged.
//
// Profiles are one-way: latency + jitter (a triangular spread of ± jitter around it, so packets reorder when jitter
// exceeds the send interval), and loss per packet.
import { mulberry32 } from './inputs.mjs';

export const PROFILES = {
  lan: { latency: 2, jitter: 1, loss: 0 },
  good: { latency: 20, jitter: 5, loss: 0.005 },
  typical: { latency: 50, jitter: 15, loss: 0.01 },
  poor: { latency: 100, jitter: 30, loss: 0.03 },
  bad: { latency: 150, jitter: 50, loss: 0.05 },
};

export const RTO_MIN = 200; // ms: Linux's TCP minimum; Darwin's is about the same order
export const FAST_RETRANSMIT_GAP = 1000 / 60; // ms: three later packets at 60 packets/s draw the duplicate ACKs

// Bytes on the wire around a payload, IPv4 (estimates; see the README):
//   WebSocket: IP 20 + TCP 20 + TCP timestamps 12 + WS frame 2 (server → client) or 6 (client → server, masked) ≈ 56;
//              plus TCP's ACKs, often piggybacked at 60 packets/s both ways, not counted
//   WebRTC:    IP 20 + UDP 8 + DTLS 1.2 record with AES-GCM 13 + 8 + 16 + SCTP common header 12 + DATA chunk 16 ≈ 93;
//              plus SCTP SACKs, which an unreliable channel still sends, not counted
export const OVERHEAD = { reliable: 56, unreliable: 93 };

export class Network {
  /** @param {{ latency: number, jitter: number, loss: number }} profile @param {'reliable' | 'unreliable'} mode @param {number} seed */
  constructor(profile, mode, seed = 1) {
    this.p = profile; this.mode = mode; this.rnd = mulberry32(seed);
    this.queue = []; // [time, seq, fn] kept sorted
    this.seq = 0; this.now = 0;
    this.lastDelivery = new Map(); // reliable: per direction, the last delivery time (ordering)
    this.sent = new Map(); this.lost = 0; this.retransmits = 0; this.packets = 0;
  }
  at(time, fn) {
    const e = [time, this.seq++, fn];
    let lo = 0, hi = this.queue.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; const q = this.queue[mid]; if (q[0] < time || (q[0] === time && q[1] < e[1])) lo = mid + 1; else hi = mid; }
    this.queue.splice(lo, 0, e);
  }
  delay() { return Math.max(0.1, this.p.latency + (this.rnd() + this.rnd() - 1) * this.p.jitter); }
  /** Send `bytes` (a Uint8Array) from `from` to `to`; `deliver(bytes)` runs when it arrives. */
  send(from, to, bytes, deliver) {
    this.packets++;
    const key = `${from}>${to}`;
    const s = this.sent.get(key) ?? { packets: 0, payload: 0 };
    s.packets++; s.payload += bytes.length; this.sent.set(key, s);
    const copy = bytes.slice();
    if (this.mode === 'unreliable') {
      if (this.rnd() < this.p.loss) { this.lost++; return; }
      this.at(this.now + this.delay(), () => deliver(copy));
      return;
    }
    // reliable: retransmit until it gets through, then deliver no earlier than everything sent before it on this path
    let t = this.now, arrive = null, tries = 0;
    let rto = Math.max(RTO_MIN, 4 * this.p.latency);
    for (;;) {
      if (this.rnd() < this.p.loss) {
        this.lost++; this.retransmits++;
        if (tries++ === 0) t += 2 * this.p.latency + 3 * FAST_RETRANSMIT_GAP; // fast retransmit
        else { t += rto; rto *= 2; } // the timeout, backing off
        continue;
      }
      arrive = t + this.delay(); break;
    }
    arrive = Math.max(arrive, this.lastDelivery.get(key) ?? 0);
    this.lastDelivery.set(key, arrive);
    this.at(arrive, () => deliver(copy));
  }
  /** Run every event due up to `time`. */
  runUntil(time) {
    while (this.queue.length && this.queue[0][0] <= time) { const [t, , fn] = this.queue.shift(); this.now = t; fn(); }
    this.now = time;
  }
}
