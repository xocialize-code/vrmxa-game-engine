// @vrmxg/ai — M2 W7 (AB-T-0530). NPC brains: a behaviour tree runtime with a utility selector, blackboards, stimulus
// memory, perception, the action vocabulary, role presets and the recorded-input hook for M3's director.
import { BrainBehaviour } from './brain.js';
import { AiService } from './service.js';
export { BrainBehaviour } from './brain.js';
export { AiService } from './service.js';
export { ACTIONS, actionSchemas, approach, positionOf } from './actions.js';
export { NODE_TYPES, TESTS, INPUTS, STATUS, compile, tick, resolve } from './bt.js';
export { CURVES, curve } from './curves.js';
export { PRESETS } from './presets.js';

/** Give a tree the `brain` behaviour and the "ai" service. Install after nav and interaction. */
export function installAi(tree) {
  tree.behaviourClasses.set('brain', BrainBehaviour);
  return tree.addService('ai', new AiService(tree));
}
