// A per-node state machine (AB-D-0247): named states with enter / step / exit hooks, stepped by the
// tree once per simulation step after the node's behaviours. Transitions happen when `go` is called,
// so a state that changes state inside `step` exits and enters within the same step, in order.

/**
 * @typedef {{ enter?: (sm: StateMachine) => void, step?: (sm: StateMachine, dt: number) => void, exit?: (sm: StateMachine) => void }} State
 */
export class StateMachine {
  /**
   * @param {Record<string, State>} states
   * @param {string} initial
   */
  constructor(states, initial) {
    if (!states[initial]) throw new Error(`no state "${initial}"`);
    this.states = states;
    this.current = null;
    /** Steps spent in the current state. */
    this.steps = 0;
    this._initial = initial;
  }

  /** Enter the initial state; the tree calls this when the node is ready. */
  start() { if (this.current === null) this.go(this._initial); }

  /** Change state now: exit the current one, enter `name`. */
  go(name) {
    if (!this.states[name]) throw new Error(`no state "${name}" (has: ${Object.keys(this.states).join(', ')})`);
    if (this.current !== null) this.states[this.current].exit?.(this);
    this.current = name;
    this.steps = 0;
    this.states[name].enter?.(this);
  }

  step(dt) {
    if (this.current === null) return;
    const before = this.current;
    this.states[before].step?.(this, dt);
    if (this.current === before) this.steps++;
  }

  getState() { return { current: this.current, steps: this.steps }; }
  setState(s) { this.current = s.current; this.steps = s.steps; }
}
