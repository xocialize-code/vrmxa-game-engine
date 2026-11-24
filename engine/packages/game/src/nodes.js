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
  // A declaration that is refused (a name used twice, a condition that isn't one, a countdown of no seconds) takes
  // its node back out of the tree before the error leaves: a refused tree.add leaves nothing behind.
  enterTree() {
    const tree = this.tree;
    try { this.game?.declare(this.kind, this); } catch (e) { if (tree?.byId.get(this.id) === this) tree.remove(this.id); throw e; }
  }
  // ready runs once every node of the scene has entered: the conditions can be checked against all it declares
  ready() { this.game?.checkRules(); }
  exitTree() { this.game?.undeclare(this.kind, this); }
  /**
   * Do one of this node's actions on the game. An action comes from a connection, inside a step: one that can't be
   * done (no `to`, time added to a stopwatch, a flag with no name) is refused and said as an event (`refused`), never
   * thrown there. What the scene's own connections get wrong is caught earlier, when the rules start (checkRules).
   * @param {string} action @param {(game: import('./service.js').GameService) => void} fn
   */
  act(action, fn) {
    const game = this.game;
    if (!game) return;
    try { fn(game); } catch (e) { game.refuse(this, action, e?.message ?? String(e)); }
  }
}

export class GameRulesNode extends GameNode {
  static kind = 'rules';
  win() { this.act('win', (g) => g.win()); }
  lose() { this.act('lose', (g) => g.lose()); }
  setFlag(args) { this.act('setFlag', (g) => g.setFlag(args?.flag, args?.value ?? true)); }
  clearFlag(args) { this.act('clearFlag', (g) => { if (typeof args?.flag !== 'string') throw new Error('clearFlag needs { flag }'); g.clearFlag(args.flag); }); }
  changeScene(args) { this.act('changeScene', (g) => g.changeScene({ to: args?.to, after: args?.after, reset: args?.reset })); }
  restart(args) { this.act('restart', (g) => g.restart({ after: args?.after })); }
}

export class GameCounterNode extends GameNode {
  static kind = 'counter';
  // a connection without args passes the signal's payload: `by` is then absent, and the counter goes up by one
  add(args) { this.act('add', (g) => g.add(this.key, typeof args?.by === 'number' ? args.by : 1)); }
  set(args) { this.act('set', (g) => { if (typeof args?.value !== 'number') throw new Error('set needs { value }'); g.set(this.key, args.value); }); }
  reset() { this.act('reset', (g) => g.set(this.key, Number(this.props.start ?? 0))); }
}

export class GameTimerNode extends GameNode {
  static kind = 'timer';
  start() { this.act('start', (g) => g.startTimer(this.key)); }
  stop() { this.act('stop', (g) => g.stopTimer(this.key)); }
  reset() { this.act('reset', (g) => g.resetTimer(this.key)); }
  addTime(args) { this.act('addTime', (g) => { if (typeof args?.seconds !== 'number') throw new Error('addTime needs { seconds }'); g.addTime(this.key, args.seconds); }); }
}

export class GameGoalNode extends GameNode {
  static kind = 'goal';
  complete() { this.act('complete', (g) => g.completeGoal(this.key)); }
}

export class CheckpointNode extends GameNode {
  static kind = 'checkpoint';
  write() { this.act('write', (g) => g.takeCheckpoint(this)); }
}

/** Node classes by registry type. */
export const GAME_NODES = { GameRules: GameRulesNode, GameCounter: GameCounterNode, GameTimer: GameTimerNode, GameGoal: GameGoalNode, Checkpoint: CheckpointNode };
