// Behaviours: scripts attached to nodes (AB-D-0247). A scene names a behaviour and gives its params
// ({ "use": "hinge", "locked": true }); the project maps the name to a class. The class implements
// the behaviour's actions as methods and emits its signals through the node. Scenes carry no code.

export class Behaviour {
  /**
   * @param {import('./node.js').Node} node
   * @param {any} params the scene's entry for this behaviour; edits to it are saved with the scene
   */
  constructor(node, params) {
    this.node = node;
    this.params = params;
  }
  get tree() { return this.node.tree; }
  get name() { return this.params.use; }
  /** This behaviour's own random stream. */
  get rng() { return this.node.tree?.rng.get(`node:${this.node.id}:${this.params.use}`); }
  emit(signal, payload) { this.node.emit(signal, payload); }

  // Lifecycle, called right after the node's own hooks (ready, physicsProcess, process, exitTree).
  ready() {}
  physicsProcess(dt) {}
  process(dt, alpha) {}
  exitTree() {}

  /** What tools (MCP, the inspector) show of this behaviour while it runs: its state unless it says more. */
  inspect() { return this.getState(); }

  /** Snapshot state beyond the params (override when a behaviour keeps some). */
  getState() { return null; }
  setState(s) {}
}
