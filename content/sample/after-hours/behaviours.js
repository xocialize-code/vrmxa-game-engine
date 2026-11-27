// "After Hours" (M6 W10, AB-T-0651): the game's one behaviour of its own, written by hand. Everything else in the game is
// scene data built in the editor: the counters, the goal and the clock, and the connections that turn this behaviour's
// signals into a point scored, a wrong shelf counted, a thing shown on its shelf and a word from Hana.
//
// `shelf`, on an Area in front of a shelf. While the player stands in the area and presses the interact button with
// something in her inventory, the shelf checks what she holds:
//   - the thing that belongs on it (`item`, its VRMXI id): out of her inventory, and the shelf emits `placed` (once);
//   - only other things: she keeps them, and it emits `refused` with the first of them.
// Once it has placed or refused, it takes no more presses until she has left the area: a second press, or a double tap,
// at the same shelf is neither a second wrong shelf (two lose the game) nor anything at all on a shelf already done. A
// press with empty hands, or while a conversation is on, does nothing. It names no scene, node or item in its code: a
// scene says which item belongs on which shelf, so another level can use it as it is.
//
// It runs inside the step and reads only simulation state (the input service's latched frame, the inventory, the
// dialogue, the bodies in its area), so a recorded session replays it on the same steps everywhere. No maths at all.
// It declares itself (M6 W0): params and signals as JSON Schema, and the state its getState returns.
import { Behaviour } from '@vrmxg/core';

export class shelf extends Behaviour {
  static describe = {
    description: 'A shelf the player puts things on (an Area in front of it): she stands there and presses interact; the thing that belongs here leaves her inventory and `placed` is emitted, anything else stays in her hands and `refused` is. One answer a visit: it takes no more presses until she has left the area.',
    on: ['Area'],
    params: {
      item: { type: 'string', minLength: 1, description: 'The VRMXI id of the thing that belongs on this shelf.' },
      player: { type: 'string', nodeRef: true, default: 'mira', description: 'Who puts things on it (the player\'s Character).' },
      action: { type: 'string', minLength: 1, default: 'interact', description: 'The input action that puts things down (the game\'s action map names it).' },
    },
    signals: {
      placed: { description: 'The thing that belongs here was put on it (once): it left the player\'s inventory.', args: { item: { type: 'string', description: 'Its VRMXI id.' } } },
      refused: { description: 'The player offered something that doesn\'t belong here: she keeps it. At most once a visit.', args: { item: { type: 'string', description: 'The VRMXI id of the first thing she held.' } } },
    },
    state: {
      type: 'object', additionalProperties: false, required: ['inside', 'done', 'answered'],
      properties: {
        inside: { type: 'boolean', description: 'The player stands in the area.' },
        done: { type: 'boolean', description: 'The thing that belongs here was put on it.' },
        answered: { type: 'boolean', description: 'It placed or refused on this visit: presses are ignored until she leaves.' },
      },
    },
  };

  ready() {
    this.inside = false; this.done = false; this.answered = false;
    this.tree.listen(this.node, 'bodyEntered', ({ body }) => { if (body === this.player) this.inside = true; });
    this.tree.listen(this.node, 'bodyExited', ({ body }) => { if (body === this.player) { this.inside = false; this.answered = false; } });
  }

  get player() { return this.params.player ?? 'mira'; }

  physicsProcess() {
    if (!this.inside || this.answered) return;
    const services = this.tree.services, p = this.params;
    if (!services.get('input')?.pressed(p.action ?? 'interact')) return;
    if (services.get('game')?.view().outcome || services.get('dialogue')?.view() != null) return;
    const held = services.get('inventory')?.list(this.player) ?? [];
    if (!held.length) return;
    this.answered = true;
    if (!this.done && held.some((e) => e.id === p.item)) {
      services.get('interact')?.release(this.player, p.item);
      this.done = true;
      this.emit('placed', { item: p.item });
      return;
    }
    this.emit('refused', { item: held[0].id });
  }

  getState() { return { inside: this.inside, done: this.done, answered: this.answered }; }
  setState(s) { this.inside = s.inside; this.done = s.done; this.answered = s.answered; }
}
