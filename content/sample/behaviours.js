// The sample project's behaviours, under the names its scenes use. `wander`: pick a point within `radius`
// of home from the behaviour's own random stream, walk to it, wait one to three seconds, repeat.
import { Behaviour } from '@vrmxg/core';

export class wander extends Behaviour {
  ready() { const p = this.node.object3d.position; this.home = [p.x, p.z]; this.target = null; this.wait = 0; }
  physicsProcess() {
    const n = /** @type {any} */ (this.node), p = n.object3d.position;
    if (this.wait > 0) { this.wait--; n.input.move = [0, 0]; return; }
    if (!this.target) {
      const a = this.rng.range(0, 2 * Math.PI), r = this.rng.range(0.5, this.params.radius ?? 3);
      this.target = [this.home[0] + Math.cos(a) * r, this.home[1] + Math.sin(a) * r];
    }
    const dx = this.target[0] - p.x, dz = this.target[1] - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.3) { this.target = null; this.wait = 60 + this.rng.int(120); n.input.move = [0, 0]; return; }
    const s = n.props.walkSpeed ?? 1.4;
    n.input.move = [(dx / d) * s, (dz / d) * s];
  }
  getState() { return { home: this.home, target: this.target, wait: this.wait }; }
  setState(s) { this.home = s.home; this.target = s.target; this.wait = s.wait; }
}
