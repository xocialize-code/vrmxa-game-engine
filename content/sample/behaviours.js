// The sample project's behaviours, under the names its scenes use. `wander`: pick a point within `radius`
// of home from the behaviour's own random stream, walk to it, wait one to three seconds, repeat.
import { Behaviour } from '@vrmxg/core';

export class wander extends Behaviour {
  ready() { const p = this.node.object3d.position; this.home = [p.x, p.z]; this.target = null; this.wait = 0; }
  physicsProcess() {
    const n = /** @type {any} */ (this.node), p = n.object3d.position;
    if (n.speaking) { n.input.move = [0, 0]; return; } // stand still while talking
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

// `switchedBy`: the node is shown while an item (a light switch) is in `state`, hidden otherwise. Visibility is in the
// world snapshot (hidden nodes are), so a restore needs nothing from here.
export class switchedBy extends Behaviour {
  ready() {
    const item = /** @type {any} */ (this.node.tree.find(this.params.item));
    if (!item) return;
    this.apply(item.current);
    item.on('stateChanged', ({ to }) => this.apply(to));
  }
  apply(state) { this.node.object3d.visible = state === (this.params.state ?? 'on'); }
  getState() { return null; }
}

// `greet`: when `target` (the player) comes within `radius`, look at them and say a line (a clip with its word timings,
// or text), then not again for `cooldown` seconds. Distances in the ground plane; the step clock decides everything.
export class greet extends Behaviour {
  ready() { this.until = 0; }
  physicsProcess() {
    const n = /** @type {any} */ (this.node), step = n.tree.clock.step;
    if (step < this.until || n.speaking) return;
    const t = n.tree.find(this.params.target);
    if (!t) return;
    const a = n.object3d.position, b = t.object3d.position, dx = b.x - a.x, dz = b.z - a.z, r = this.params.radius ?? 2;
    if (dx * dx + dz * dz > r * r) return;
    n.lookAt({ target: t.id });
    n.say({ clip: this.params.clip, text: this.params.text });
    this.until = step + Math.round((this.params.cooldown ?? 20) * 60);
  }
  getState() { return { until: this.until }; }
  setState(s) { this.until = s.until; }
}
