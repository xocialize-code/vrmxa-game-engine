// Project behaviours for the test project: a kinematic walker the move actions drive (no character
// models needed, so the inspect tests run on CI).
import { Behaviour } from '@vrmxg/core';
export class walker extends Behaviour {
  physicsProcess(dt) {
    const i = this.tree.services.get('input'), p = this.node.object3d.position;
    p.x += i.axis('move_x') * 2 * dt;
    p.z -= i.axis('move_y') * 2 * dt;
  }
}
