# Spike: networking, lockstep against rollback (AB-T-0622)

*Runs alongside M6 (M6-PLAN "Running alongside M6"). Receipts: AB-R-1162 (lockstep delay), AB-R-1163 (rollback
depth and cost), AB-R-1164 (snapshot size), AB-R-1165 (bandwidth), AB-R-1166 (what rolls back). Engine findings filed
as AB-T-0657, AB-T-0658 and AB-T-0659.*

**Verdict: lockstep now, over a WebRTC data channel; rollback later, once three engine gaps are closed.**

Determinism holds over the network. In all 38 networked runs (30 in virtual time, 8 in real time over real loopback
sockets), both peers and the reference landed on the same world hash at every step (1,200 per run in virtual time, 600 in real time). That held for
lockstep and rollback, over both delivery modes, under every profile from LAN to 150 ± 50 ms with 5 % loss.

Lockstep needs nothing for that. Rollback needs the harness's jump shim (AB-T-0657). As the engine is, rollback peers
part: at step 26 on the typical profile and step 189 on lan, both of them off the reference (`results/netcode-no-jump-shim.json`).
The in-band hash checks catch it. With the shim, what separates the two models is what they cost and what the engine
can do today.

- **Lockstep works today, with no engine change.** It never restores a snapshot, so it asks no more of the engine than
  a replay does.
  - **Run here:** the cafe, with move, run, jump and look.
  - **Following from M0 to M5's replay results, not run over the network here:** items taken, the closet, GameFlow's
    scene changes (the sample game's recorded sessions replay identically in WKWebView, AB-R-1143 to 1154).
  - **Injected ai events** (a director's decisions) stay in sync only if they travel to both peers like inputs, on a
    step both know.

  Over an unreliable data channel with inputs resent until acknowledged, the input delay that keeps stalls under 1 % is:

  | Network | Felt delay | Ticks felt |
  |---|---|---|
  | lan | 17 ms | 1 |
  | good | 33 ms | 2 |
  | typical | 83 ms | 5 |
  | poor | 133 ms | 8 |
  | bad | 200 ms | 12 |

  A lockstep tick, its step included, costs 0.17 ms (p50) in the cafe. That's fine for a co-op game, a party game or a turn-heavy game, the kind
  this engine makes now. It's poor for a fighting game.
- **Rollback holds wherever a snapshot covers the step, and that isn't everywhere yet.**
  - **Where it holds:** restoring a snapshot into the same live tree and re-simulating lands on the unbroken run's
    hashes, Rapier's whole serialisation included. That held for 4,435 rollbacks over 35,480 re-simulated steps, in
    the two-player cafe, the cafe's items take and inside the sample game's level, with three brains, dialogue choices
    and the game service.
  - **Engine gaps:** a pending jump is missing from a Character's snapshot (AB-T-0657). A node removed during the
    window, such as an item taken, can't come back. Injected ai events past the restored step are dropped (AB-T-0659).
  - **Limits:** a window can't cross a scene change.
  - **Cost:** in Node, about 1.3 ms a tick at rest (a snapshot every step costs 1.1 ms, five times the step), plus
    1.8 ms of restore and 1.35 ms per re-simulated step on a rollback. That's p95 4–9 ms and p99 up to 18 ms a tick at
    depth 12. It holds only once the nav service stops re-baking its navmesh on every restore (AB-T-0658): today a
    restore costs 17 ms, a whole frame.
- **WebSocket is out for both models beyond about 1 % loss.** TCP's head-of-line blocking holds every later input
  behind a lost one. On the poor profile (3 % loss), lockstep stalls 24 % of ticks even at 15 steps of delay, and
  rollback's window fills 33–40 % of the time. A data channel `{ ordered: false, maxRetransmits: 0 }` that resends
  unacknowledged inputs loses nothing but a few bytes. WebSocket is a fallback for a relay, not the transport.

So the first networked game should be lockstep over WebRTC. Rollback is the model to grow into: it removes the delay
entirely (0 steps felt, at 3 rollbacks a second of depth 1 to 11) and costs the engine no new determinism. It needs
AB-T-0657, AB-T-0658 and AB-T-0659 first, plus a lockstep barrier at scene changes. Whether networking becomes a
workstream is the operator's call (M6-PLAN decision 2).

Measured 2026-11-25 on a Mac Studio M5 Max (Mac17,14), macOS 27.3, Node 26.12.1 (V8), three r187,
`@dimforge/rapier3d-deterministic-compat` 0.21.0 (the engine's one Rapier build), `@vrmxg/dmath` installed. Node only:
no GPU, no browser. JSC runs the engine's step about twice as fast as V8 (AB-R-0941), so every millisecond here is a
Node number, not the shipped one.

## What was asked

Lockstep against rollback on the engine's fixed 60 Hz step, over WebSocket and WebRTC, with two peers and one simulated
network (latency, loss, jitter). The spike was to measure lockstep's input delay, how deep a rollback goes and what it
costs per step, the snapshot size and the bandwidth per peer. Rapier's snapshots, `ai.inject`, the input service's
recorded inputs and the director's log decide what can roll back.

## How

- **The world.** Each peer steps its own copy of the sample cafe for two players: M3 W9's split-screen scene, built by
  the playground's `buildWorld` with `players: 2`. Mira is player 1 and Hana player 2, both Characters on Rapier with
  follow cameras. The engine is untouched: input reaches the simulation through the input service's replay, with each
  peer writing `rec.frames[step]` before the step runs (`lib/world.mjs`).
- **The players.** Two seeded bots hold a direction for 20 to 60 steps, run about a third of the time, jump about once
  a second and turn the camera a little. One player's input for one step is 4 bytes (`lib/inputs.mjs`). Every peer,
  the local one included, simulates the decoded bytes.
- **The network** (`lib/net.mjs`) runs in virtual time from a seed, so a run is the same run every time. It has two
  delivery modes, and the difference between them is the real difference between the two browser transports:
  - **reliable**, like a WebSocket over TCP: in order; a lost packet comes back by fast retransmit (one RTT plus three
    send intervals), then by a doubling RTO from 200 ms; everything behind it waits (head-of-line blocking).
  - **unreliable**, like a WebRTC data channel `{ ordered: false, maxRetransmits: 0 }`: a lost packet is gone, and
    packets reorder when the jitter exceeds the 16.7 ms send interval.

  It has five one-way profiles: lan 2 ± 1 ms with no loss; good 20 ± 5 ms, 0.5 %; typical 50 ± 15 ms, 1 %;
  poor 100 ± 30 ms, 3 %; bad 150 ± 50 ms, 5 %.
- **The protocol** (`lib/peer.mjs`). One packet a tick from each peer carries an ack, the inputs (each input once over
  reliable delivery, every unacknowledged input over unreliable delivery) and, every 30 confirmed steps, a world hash.
  - **Lockstep:** a step runs when both inputs for it have arrived. Inputs are produced `delay` steps ahead, and a
    peer catches up by up to 4 steps a tick.
  - **Rollback:** the local step runs on time, with the other player's input predicted as their last known one. A
    snapshot is taken before every step. When a real input arrives that differs from the prediction, the peer restores
    the snapshot of that step **into the same live tree** and re-simulates to now. If the prediction window (12 steps)
    is full, the peer waits.
- **What's checked.** The world hash after every step each peer settles on (`worldHashes`, hashed) is compared with the
  other peer's and with a reference: one world stepping the true inputs alone. The rollback sweeps also compare
  `physics:bytes` (Rapier's whole serialisation) on every step.

## Results

Raw JSON: `results/rollback.json`, `results/netcode.json`, `results/live.json`. All times are Node 26 (V8) on the
M5 Max: p50 / p95 / p99 / max where four numbers are given.

### What can roll back (`rollback.mjs`)

Each world ran a reference, then the same world in one tree. Every 4 steps, the sweep restored the snapshot from 8
steps back into the live tree and re-simulated, so every step lay inside some window. Each re-simulated step was
compared with the reference on every component, `physics:bytes` included.

| World | Steps | Rollbacks | Re-simulated | Result |
|---|---|---|---|---|
| cafe-2p: two players, bots, Rapier, characters, cameras, input | 1,200 | 299 | 2,392 | **Every step matches** (with the jump shim) |
| cafe-2p, `SHIM=0` or `SHIM=nav` | 1,200 | 299 | 2,392 | Parts at step 13 (`rng`, Hana, her camera, `physics`): the jump gap |
| cafe-items: the sword into the closet, cupboard, a seat, the lights, Hana's voiced greeting, her wander stream | 1,668 | 414 | 3,312 | **Every step matches**; 2 windows refused: the sword left the tree |
| cafe-follow-inject: a follower brain, 4 `ai.inject` events (lookAt, emote, say, bb) | 600 | 149 | 1,192 | Snapshot alone: parts at step 112 in `service:ai` (850 steps off) |
| the same, logged events past the restored step re-queued | 600 | 149 | 1,192 | **Every step matches** |
| rush-level: the sample game through GameFlow, scripted player, three brains, dialogue choices, game service | 14,400 | 3,573 | 28,584 | **Every step matches**; won at step 5,331 as in the reference; 12 windows refused (trays carried), 14 skipped (scene changes) |

Line by line:

| Engine piece | In place? | |
|---|---|---|
| Rapier (`takeSnapshot` / `restoreSnapshot`, handles kept) | yes | 0.35 ms of the restore |
| Characters (pose, springs, look-at, expressions, graph, controller, `move`), cameras | yes | |
| A Character's pending `jump` | **no** | Not in its state (AB-T-0657); shimmed here |
| The input service's latched frame; inputs fed per step | yes | Through `replay` (a frame-source API is proposed in AB-T-0659) |
| Doors, cupboard, light switch, seats, the voice service's line, timers, random streams | yes | cafe-items |
| A node removed in the window (an item taken) | **no** | `SceneTree.setState` refuses; the forward run carries on unharmed (AB-T-0659) |
| `ai.inject` (the director's hook) and its log | with help | The snapshot keeps only due events; re-queueing the log past the restored step makes it exact. The director with a model uses the same hook and log, but wasn't run |
| GameFlow's game service, dialogue choices (in the input frame), brains | yes, within a scene | rush-level |
| A scene change | **no** | The world a snapshot came from is freed |
| The nav service | yes, but slowly | It re-bakes the navmesh on every restore: about 15 ms of a 17 ms restore (AB-T-0658); shimmed here |
| A step held by a closet redraw | not exercised | The only window that crossed an equip was refused first |

### Snapshot size and cost (`rollback.mjs`)

| | Cafe, two players | Sample game level |
|---|---|---|
| Snapshot (`v8.serialize`) | 211 KB | 280 KB |
| of which nav (the navmesh copy) | 117 KB | 148 KB |
| of which Rapier's bytes | 62 KB | 57 KB |
| of which nodes' own state / core | 26 KB / 5 KB | 62 KB / 13 KB |
| Capture | 1.14 / 1.49 / 1.88 / 2.58 ms | 1.61 / 2.26 / 2.66 / 5.64 ms |
| Restore, in place, nav shim | 1.77 / 2.34 / 2.76 / 5.56 ms | 2.58 / 3.41 / 3.83 / 5.19 ms |
| Restore, in place, as the engine is | 16.9 / 18.3 / 22.5 / 30.5 ms | — |
| Step (and a re-simulated step) | 0.24 / 0.42 / 0.81 ms | 0.44 / 0.74 / 1.30 ms |

A 12-step ring of snapshots is about 2.5 MB (cafe) or 3.4 MB (level).

### Lockstep against rollback on the simulated network (`netcode.mjs`)

**Lockstep's input delay.** This is the smallest delay keeping stalls under 1 % of ticks, from a sweep of 0 to 15
over 1,200 steps per profile with no worlds (stalls depend only on when packets arrive). A lockstep input is taken one
tick before its step, so delay D is felt as D + 1 ticks. Rollback's D is felt as D ticks. The engine's own one-step
player-controller latency is common to both and not counted.

| Profile (one way) | Reliable (WebSocket) | Unreliable (data channel) |
|---|---|---|
| lan 2 ± 1 ms | 0 (17 ms) | 0 (17 ms) |
| good 20 ± 5 ms, 0.5 % | 6 (117 ms) | 1 (33 ms); under 0.1 %: 2 |
| typical 50 ± 15 ms, 1 % | 12 (217 ms) | 4 (83 ms) |
| poor 100 ± 30 ms, 3 % | none up to 15 | 7 (133 ms); under 0.1 %: 8 |
| bad 150 ± 50 ms, 5 % | none up to 15 | 11 (200 ms); under 0.1 %: 12 |

**With the worlds.** Peer A's view, 1,200 steps; peer B's is alike. With the harness's shims, every run has both peers
and the reference on the same hash at every step, and 7 to 40 in-band hash checks per run, none failed. Without the
jump shim (`SHIM=nav`, `results/netcode-no-jump-shim.json`), lockstep is unchanged. Every rollback run parts, at step
189 on lan and step 26 on typical, over both delivery modes.

| Profile | Delivery | Model | Stalls | Rollbacks / s | Depth p50 / p95 / max | Tick p50 / p95 / p99 ms | Wire B/s |
|---|---|---|---|---|---|---|---|
| lan | unreliable | lockstep d0 | 0.08 % | | | 0.17 / 0.24 / 0.34 | 6,504 |
| lan | unreliable | rollback d0 | 0 | 3.4 | 1 / 1 / 1 | 1.33 / 4.20 / 5.30 | 6,504 |
| lan | unreliable | rollback d2 | 0 | 0 | | 1.27 / 2.01 / 2.41 | 6,504 |
| good | unreliable | lockstep d1 | 0.58 % | | | 0.20 / 0.44 / 0.64 | 6,992 |
| good | unreliable | rollback d0 | 0 | 3.4 | 2 / 2 / 2 | 1.42 / 5.88 / 7.20 | 6,991 |
| typical | reliable | lockstep d12 | 0 | | | 0.18 / 0.35 / 0.50 | 4,287 |
| typical | reliable | rollback d0 | 0.91 % | 3.3 | 4 / 5 / 9 | 1.35 / 7.89 / 9.29 | 4,277 |
| typical | unreliable | lockstep d4 | 0 | | | 0.17 / 0.30 / 0.43 | 7,937 |
| typical | unreliable | rollback d0 | 0 | 3.2 | 4 / 5 / 5 | 1.30 / 7.06 / 9.33 | 7,929 |
| typical | unreliable | rollback d2 | 0 | 3.1 | 2 / 3 / 3 | 1.29 / 4.26 / 6.56 | 7,930 |
| poor | reliable | lockstep d15 | 24.3 % | | | | 3,510 |
| poor | reliable | rollback d0 | 39.7 % | 2.1 | 7 / 11 / 12 | | 4,268 |
| poor | unreliable | lockstep d7 | 0.50 % | | | 0.16 / 0.23 / 0.36 | 9,339 |
| poor | unreliable | rollback d0 | 0 | 3.0 | 7 / 8 / 8 | 1.30 / 9.28 / 13.1 | 9,316 |
| poor | unreliable | rollback d2 | 0 | 2.9 | 5 / 6 / 6 | 1.32 / 3.96 / 10.9 | 9,324 |
| bad | reliable | lockstep d15 | 86.5 % | | | | 1,520 |
| bad | unreliable | lockstep d11 | 0.17 % | | | 0.18 / 0.28 / 0.41 | 10,656 |
| bad | unreliable | rollback d0 | 0.17 % | 2.8 | 10 / 11 / 12 | 1.31 / 2.64 / 17.7 | 10,621 |
| bad | unreliable | rollback d2 | 0 | 2.7 | 8 / 9 / 10 | 1.30 / 2.55 / 14.4 | 10,624 |

The rest of the 30 runs are in `results/netcode.json`. The max tick is 17–34 ms in every rollback run, and up to 32 ms
in lockstep: garbage collection over the snapshots, two worlds in one process.

**Rollback's cost per step.**
- **At rest:** a tick costs about 1.3 ms, against lockstep's 0.17 ms, because every step takes a snapshot (1.1 ms) to
  roll back to.
- **On a rollback of depth d:** restore (1.8 ms) plus d × (capture + step), about 1.35 ms a step. Depth 5 is about
  8.5 ms; depth 12 about 18 ms.
- **What a JSC runtime would do:** run it about twice as fast (AB-R-0941). Rendering still has to fit in the same
  frame.
- **Depth:** it follows the one-way latency in steps plus the half-tick offset between peers. An input delay of 2
  halves it and, on a LAN, removes rollbacks entirely.
- **Prediction:** "repeat their last input" was wrong for 68–96 steps per run, about 3 rollbacks a second, with bots
  that hold a direction for 20 to 60 steps. Twitchier play rolls back more often, not deeper.

**Bandwidth per peer.**
- **Payload:** 60 packets a second.
  - Reliable delivery sends each input once: 0.9 KB/s.
  - Unreliable delivery resends what isn't acknowledged: 0.9 KB/s on a LAN to 5.1 KB/s at 150 ms and 5 % loss.
- **On the wire:** IPv4 headers dominate a 4-byte input.
  - WebSocket adds about 56 bytes a packet: 4.3 KB/s.
  - The data channel adds about 93 (UDP, DTLS, SCTP): 6.5–10.7 KB/s.
  - Neither figure counts TCP's ACKs or SCTP's SACKs.
- **Either way, it's tiny.** Batching two ticks per packet would halve the overhead at a cost of 8 ms.

### Over the real transports, on loopback (`live.mjs`)

| | WebSocket (`ws`, TCP) | WebRTC data channel (werift, unordered, no retransmits) |
|---|---|---|
| Round trip, 30 bytes | 0.095 / 0.154 / 0.213 ms | 0.21 / 0.45 / 0.53 ms |
| ICE candidates | — | 127.0.0.1 only, no STUN or TURN |
| lan, lockstep d0 | same hashes; 1.8 % stalls | same hashes; 1.0 % stalls |
| lan, rollback d0 | same hashes; depth max 2 | same hashes; depth max 2 |
| typical (added in the sender), lockstep | d12: same hashes, no stalls | d4: same hashes, 0.5 % stalls |
| typical, rollback d0 | same hashes; depth p95 7, max 12; 1.8 % stalls | same hashes; depth p95 5, max 6 |

The peers ran in one process on Node's timers, 10 s per run. Ticks landed within 0.03–2.8 ms of due at p95; a few were
much later, up to 82 ms, while the other world built or garbage was collected. The stalls above the virtual runs'
figures are those late ticks. Real sockets change nothing about agreement: all 8 runs had both peers and the
reference on the same hash at every step.

## Engine findings

Each one is filed as a task. The spike's shims (`lib/snap.mjs`) show what fixing them buys; the engine is
unchanged.

1. **AB-T-0657: a Character's pending jump isn't in its snapshot** (`character.js:708` keeps `move`, not `jump`).
   A snapshot taken on the step after a jump press restores, fresh or in place, into a world that doesn't jump. No
   existing test snapshots on that step. This is a bug for saves and the editor's restore too, not only rollback.
2. **AB-T-0658: the nav service re-bakes its navmesh on every restore** once the live mesh has changed (the cafe's
   doors change it from the first step). That's about 15 ms of work it then throws away. Its snapshot also carries the
   whole navmesh once any tile changed: 117 of 211 KB.
3. **AB-T-0659: what in-place rollback needs.**
   - Removed nodes must come back (or stay detached through the window).
   - The ai service needs a rewind of its injected events.
   - The input service needs a per-step frame source: feeding it through `replay` stops silently on a missing frame,
     and `choose()` is ignored there.
   - Presentation effects (voice, sounds, GameFlow's events) must not fire again for re-simulated or mispredicted
     steps.
   - A scene change needs a lockstep barrier.

## Run it

Needs `vrmxa-avatar-studio` beside the repository (the characters, as the engine's character tests do), `npm ci` at
the root, then:

```bash
cd spike-networking && npm ci
```

```bash
node rollback.mjs
```

What can roll back: the four worlds, every 4 steps, depth 8. This takes about 15 minutes; the sample game is most of
it, and it exports the game first, so `npm run build -w @vrmxg/game-app` must have run at the root. Writes
`results/rollback.json`. Run it again with `SHIM=0`, `SHIM=nav` or `SHIM=jump` and `--worlds cafe-2p` to see each gap.

```bash
node netcode.mjs
```

Lockstep's delay sweep, then the worlds over five profiles and both delivery modes. About 10 minutes. Writes
`results/netcode.json`.

```bash
SHIM=nav node netcode.mjs --profiles lan,typical --quick --out results/netcode-no-jump-shim.json
```

The same without the jump shim: where the rollback peers part, as the engine is.

```bash
node live.mjs
```

The real transports on loopback, in real time. About 2 minutes. Writes `results/live.json`.

`lib/snap.mjs` holds the two shims (both on by default; `SHIM=0` turns them off). Nothing here touches a GPU, and the
only servers bind to 127.0.0.1.

## Dependencies

Only the spike's own `package.json` adds anything; the repository's lockfile is unchanged.

| Package | Version | Licence | Why |
|---|---|---|---|
| `ws` | 8.23.0 | MIT | The loopback WebSocket server and client |
| `werift` | 0.28.0 | MIT | WebRTC (ICE, DTLS, SCTP data channels) in Node |
| werift's dependencies | | MIT, except `ieee754` 1.2.1 (BSD-3-Clause) and `mediabunny` 1.66.4 (MPL-2.0) | `mediabunny` is werift's media code, which the spike doesn't use |

In a browser or WKWebView, both transports are built in; a shipped game would add neither.

## Caveats

- **Node, not WKWebView.** Every millisecond is V8's; JSC runs this engine's step about twice as fast. The protocol
  results (delays, depths, bandwidth, agreement) don't depend on the runtime. Determinism across runtimes is M0's
  result (AB-R-0941), and nothing here changes what a step computes.
- **Two peers.** Lockstep's delay grows with the slowest peer. Rollback's cost grows with the number of players
  mispredicted at once: more rollbacks, not deeper ones.
- **The network is a model.** Triangular jitter, independent loss and a simple TCP (fast retransmit, then a doubling
  RTO from 200 ms; no congestion window) are not a real path. Bursty loss would hurt both models more, and TCP's more.
  The real transports were measured on loopback only, with the profile added in the sender.
- **Bots, not people.** They hold a direction for 20 to 60 steps, so "repeat the last input" is usually right.
- **No game app, no two windows.** The game app was not driven here; it's the client a networked game would use.
  WebRTC inside WKWebView isn't tested. WebKit offers `RTCPeerConnection`, but whether the shell's custom scheme origin
  can open a data channel, and what WebKit does to host candidates without a capture permission, is the first thing to
  check if lockstep becomes a workstream.
- **Rollback sweeps restore every 4 steps.** Real rollbacks are rarer (3 a second) and some are deeper (up to 12). The
  netcode runs cover those, in the cafe only.
- **One Rapier build** (the engine's deterministic-compat). Snapshots restore only into the build that took them, so
  every peer must run the same one.
