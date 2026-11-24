// The test game's behaviours: the sample's, and `onAction`, which emits `pressed` on the step one of its actions goes
// down (the title's skip). It reads the input service's latched frame, so a replay presses on the same step.
import { Behaviour } from '@vrmxg/core';

export * from '../behaviours.js';

export class onAction extends Behaviour {
  physicsProcess() {
    const input = this.tree.services.get('input');
    for (const a of this.params.actions ?? ['interact']) if (input?.pressed(a)) { this.emit('pressed', { action: a }); return; }
  }
}

// `playerZone`, on an Area: emits `playerEntered` when the player's character enters it, and nothing for anything else
// that overlaps it (an item's reach, a customer). It listens to the Area's own signal, so it runs inside the step.
export class playerZone extends Behaviour {
  ready() {
    this.tree.listen(this.node, 'bodyEntered', ({ body }) => {
      const n = /** @type {any} */ (this.tree.find(body));
      if (n?.type === 'Character' && n.behaviourEntries?.some((b) => b.use === 'player')) this.emit('playerEntered', { body });
    });
  }
}
