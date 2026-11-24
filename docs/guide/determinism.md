---
title: "Determinism"
description: "Why a VRMXG scene replays bit for bit, and the rules that keep it so: the fixed 60 Hz step, portable maths, seeded randomness, snapshots and replay."
order: 3
---

# Determinism

A VRMXG scene simulates the same way every time, to the last bit, in Node, in Chromium and in the Mac apps' web view.
That is a product requirement, not a nicety. It is what lets a shot be scrubbed to any frame, rendered again next week,
and exported exactly as it was previewed.

This page says how that works and what code inside the engine must do to keep it.

## The fixed step

The simulation advances in steps of exactly 1/60 s. Nothing changes the size of a step.

- **Live play** collects real time and runs the steps that are due. Slow motion (`timeScale`) changes how many steps
  run per second of real time, never the step itself.
- **Frames at any rate** map onto steps with whole-number arithmetic. Frame *n* at 24, 25, 30, 50 or 60 frames a second,
  or at 23.976, 29.97 or 59.94, lands on a step and a fraction α between that step and the next (`frameToStep`).
- **What you see is interpolated** at α from the two steps around it. Interpolation reads simulated state and never
  writes it, so a 24 fps export and a 60 fps preview simulate the same world.

The step stays at 60 Hz rather than 120 because character spring bones (hair, skirts) move visibly differently at
another rate.

### One step, in order

1. Project services run, in the order they were declared.
2. Timers and tweens, in the order they were created.
3. Every node in tree order (a parent before its children, siblings in order): the node, then its behaviours in the
   order they were attached, then its state machine.
4. Services finish the step. Physics steps here, after the nodes have set this step's inputs, and its contact and
   sensor events fire.
5. The clock advances. A node added during a step first runs on the next one.

## Simulation and presentation

Everything in the engine is on one side of a line:

- **Simulation** is what replays: transforms, physics, animation state, spring bones, NPC decisions, the camera rigs,
  which sound is playing, particle positions.
- **Presentation** is how it is shown: rendering, interpolation, the post stack, what is heard, in-world text.

Presentation may read the simulation. It never changes it. In the [node reference](../reference/nodes), each prop says
whether it is simulated.

A package declares its side in its `package.json` (`"vrmxg": { "determinism": "simulation" }`), and the lint rule
`vrmxg/deterministic` then holds its code to the rules below. [Packages](../reference/packages) lists each package's side.

## The rules for simulation code

**1. Portable maths.** `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`, `log`, `pow`, `cbrt` and
`hypot` give slightly different results in different JavaScript engines. `@vrmxg/dmath` has versions built only from
`+ - * /` and `Math.sqrt`, which give the same bits everywhere. Install it before anything else runs:

```js
import { installPortableMath } from '@vrmxg/dmath';
installPortableMath();     // at boot, before any character, clip or effect is parsed
```

After that, `Math.sin` *is* the portable one. Simulation code never reaches for the JavaScript engine's own.

**2. No `**` operator.** `a ** b` goes straight to the JavaScript engine and bypasses the portable `Math.pow`. Write
`Math.pow(a, b)`.

**3. Only the twelve functions.** `Math.sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `expm1`, `log1p`, `log2` and
`log10` are not in `dmath`, so they are not allowed in simulation code until they are added there with tests.

**4. Seeded randomness.** Never `Math.random` or `crypto`. Every node and behaviour has its own seeded random stream
(`node.rng`, `behaviour.rng`, or `tree.rng.get(name)`), made from the scene's seed and saved in snapshots.

**5. The step clock, not the wall clock.** Never `Date.now`, `performance.now`, `setTimeout`, `setInterval` or
`requestAnimationFrame`. Time is the step count. Timers and tweens are counted in steps and belong to a node.

**6. Quaternions, not Euler angles.** Reading or writing an object's `.rotation` runs `asin` and `atan2` on every
change. Use `.quaternion`.

**7. One physics build per project.** Rapier's deterministic build is the default. Its SIMD build gives different
results, and a snapshot replays only on the build that made it.

A deliberate exception to the lint rule carries its reason on the line:
`// eslint-disable-next-line vrmxg/deterministic -- <why>`.

## What comes from outside

Anything the world can't compute for itself is recorded on the step it arrived, so a replay can feed it back:

- **Input.** Keys, mouse and gamepads are read once per step. Only that latched value reaches the simulation, and it
  can be recorded and replayed.
- **Language-model decisions.** An NPC's director runs outside the step. Its decisions enter the world through one
  logged door, so a conversation replays with no model running.
- **Camera sensing.** What the Mac's camera notices (a wave, a nod) is applied on a step and logged the same way.

A recorded performance, a *take*, is the scene, its input and its logs.

## Snapshots and replay

`@vrmxg/snapshot` captures a whole world as plain data: the clock, the random streams, the timers, every node,
physics, characters, cameras.

```js
import { captureWorld, restoreWorld, recordRun, assertSameRun } from '@vrmxg/snapshot';

const snap = captureWorld(tree);          // plain data
restoreWorld(freshTree, snap);            // onto a tree freshly made from the same scene
const run = recordRun(tree, 600);         // one hash per component, per step
assertSameRun(runA, runB, 'Node and WKWebView');   // throws, naming the first step and component that differ
```

- **Restoring** needs a tree freshly made from the same scene with the same services. Code is not data: a timer that
  code created at run time can't be restored, and restoring says so before it changes anything.
- **Hashes** are per component (`clock`, `rng`, `node:<id>`, `physics`, and so on), so when two runs differ the
  comparison names where: "diverge at step 201 in `node:mira`".
- **Scrubbing** a sequence restores the nearest snapshot before the frame and steps forward from it, so the world on a
  scrubbed frame is exactly the world a straight play reaches.
- **A save game** is a snapshot in a versioned file.

### What a replay depends on

A recording replays bit for bit only with the same:

- scene,
- portable maths (changing `@vrmxg/dmath`'s code changes results on purpose, and bumps its version),
- Rapier build,
- snapshot format.

A save file records all four (the scene and the maths as fingerprints) and refuses to load where one differs.

## What is not bit-identical

- **Pixels across renderers.** A frame is exact for a given renderer and browser engine: the same export twice gives
  the same bytes. WebGPU and WebGL draw the same scene slightly differently, within a measured tolerance. See
  [Acceptance and exactness](./acceptance).
- **Synthesised speech.** The voice model's audio differs a little from run to run, but its word timings do not. A
  voiced line is baked once and reused by name, never spoken again.
