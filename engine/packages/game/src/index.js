// @vrmxg/game — M5 W2 (AB-T-0617, AB-D-0283). Game flow: the game-state service (score and counters, flags, timers,
// goals, win and lose) declared as scene data and held in the world snapshot; scene changes while playing that keep
// the state; checkpoints the game writes by itself on @vrmxg/save.
import { GameService } from './service.js';
import { GAME_NODES } from './nodes.js';

export { GameService } from './service.js';
export { GameFlow, recordFlow, worldSeed, CHECKPOINT_PREFIX } from './flow.js';
export { GameRulesNode, GameCounterNode, GameTimerNode, GameGoalNode, CheckpointNode, GAME_NODES } from './nodes.js';
export { TESTS, OPS, holds, readKey, checkCondition, checkKeys, conditionKeys } from './conditions.js';
export { describeRules } from './describe.js';

/**
 * Give a tree the game nodes (GameRules, GameCounter, GameTimer, GameGoal, Checkpoint) and the "game" service. Call
 * before instantiate, and after installPhysics: the rules read each step after its contacts and sensors have fired.
 * @param {any} tree a SceneTree
 * @param {ConstructorParameters<typeof GameService>[1]} [opts] scene: this world's scene, as changeScene names scenes
 * @returns {GameService}
 */
export function installGame(tree, opts) {
  for (const [type, Cls] of Object.entries(GAME_NODES)) tree.classes.set(type, Cls);
  return tree.addService('game', new GameService(tree, opts));
}
