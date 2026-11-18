// The player controller behaviour: turns the move / jump / run actions into a Character's intent,
// relative to the current camera's yaw (so "forward" is away from the camera), or to the world without a
// camera. Camera rigs step with the simulation, so this stays deterministic and replayable.
//   { "use": "player", "walkSpeed": 1.4, "runSpeed": 4 }
// Behaviours run after their node in a step, so the character acts on this intent next step (one step,
// 1/60 s, of input latency; deterministic either way).
import { Behaviour } from '@vrmxg/core';

export class PlayerController extends Behaviour {
  physicsProcess() {
    const input = this.tree.services.get('input');
    if (!input) return;
    let x = input.axis('move_x'), y = input.axis('move_y');
    const len = Math.sqrt(x * x + y * y);
    if (len > 1) { x /= len; y /= len; }
    const yaw = this.tree.services.get('cameras')?.current?.rigYaw ?? 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);         // camera forward on the ground
    const rx = -fz, rz = fx;                              // its right (forward × up)
    const speed = input.isDown('run') ? this.params.runSpeed ?? 4 : this.params.walkSpeed ?? 1.4;
    const node = /** @type {any} */ (this.node);
    node.input.move = [(fx * y + rx * x) * speed, (fz * y + rz * x) * speed];
    if (input.pressed('jump')) node.input.jump = true;
  }
}
