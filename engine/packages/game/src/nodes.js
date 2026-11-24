// The game nodes (M5 W2): scene data that declares the game's rules. Each registers with the "game" service when it
// enters the tree and implements its type's actions by calling the service, so a connection in the scene
// ({ from: 'till', signal: 'verb', to: 'rules', call: 'setFlag', args: { flag: 'tillClosed' } }) is all a rule needs.
// The values are the service's, not the nodes': a node holds nothing a snapshot must keep. Without the service (a
// scene open in the editor, not playing) the nodes are plain data and their actions do nothing.
import { Node } from '@vrmxg/core';

class GameNode extends Node {
  /** @returns {import('./service.js').GameService | null} */
  get game() { return this.tree?.services.get('game') ?? null; }
  /** The name of what this node declares in the game state. */
  get key() { return this.props.key ?? this.id; }
  get kind() { return /** @type {any} */ (this.constructor).kind; }
  // enterTree runs parent first, siblings in order: the declarations are in tree order, the order goals are checked in
  enterTree() { this.game?.declare(this.kind, this); }
  exitTree() { this.game?.undeclare(this.kind, this); }
}

export class GameRulesNode extends GameNode {
  static kind = 'rules';
  win() { this.game?.win(); }
  lose() { this.game?.lose(); }
  setFlag(args) { this.game?.setFlag(args?.flag, args?.value ?? true); }
  clearFlag(args) { this.game?.clearFlag(args?.flag); }
  changeScene(args) { this.game?.changeScene({ to: args?.to, after: args?.after, reset: args?.reset }); }
  restart(args) { this.game?.restart({ after: args?.after }); }
}

export class GameCounterNode extends GameNode {
  static kind = 'counter';
  // a connection without args passes the signal's payload: `by` is then absent, and the counter goes up by one
  add(args) { this.game?.add(this.key, typeof args?.by === 'number' ? args.by : 1); }
  set(args) { if (typeof args?.value !== 'number') throw new Error(`GameCounter "${this.id}": set needs { value }`); this.game?.set(this.key, args.value); }
  reset() { this.game?.set(this.key, Number(this.props.start ?? 0)); }
}

export class GameTimerNode extends GameNode {
  static kind = 'timer';
  start() { this.game?.startTimer(this.key); }
  stop() { this.game?.stopTimer(this.key); }
  reset() { this.game?.resetTimer(this.key); }
  addTime(args) { if (typeof args?.seconds !== 'number') throw new Error(`GameTimer "${this.id}": addTime needs { seconds }`); this.game?.addTime(this.key, args.seconds); }
}

export class GameGoalNode extends GameNode {
  static kind = 'goal';
  complete() { this.game?.completeGoal(this.key); }
}

export class CheckpointNode extends GameNode {
  static kind = 'checkpoint';
  write() { this.game?.takeCheckpoint(this); }
}

/** Node classes by registry type. */
export const GAME_NODES = { GameRules: GameRulesNode, GameCounter: GameCounterNode, GameTimer: GameTimerNode, GameGoal: GameGoalNode, Checkpoint: CheckpointNode };
