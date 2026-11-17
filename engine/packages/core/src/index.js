// @vrmxg/core — the runtime core (M0 W1, AB-T-0502): node tree over three.js, lifecycle, signals,
// behaviours and per-node state machines, scene instantiation and saving, the fixed 60 Hz clock,
// seeded random streams, step-driven timers and tweens, autoload services. Inside the determinism
// boundary (AB-D-0248): install @vrmxg/dmath before anything is parsed.
export { SceneTree } from './tree.js';
export { Node } from './node.js';
export { Behaviour } from './behaviour.js';
export { StateMachine } from './statemachine.js';
export { Clock, HZ, DT, frameToStep, rationalFps } from './clock.js';
export { RandomStream, RandomStreams } from './rng.js';
export { TimerService, EASINGS } from './timers.js';
