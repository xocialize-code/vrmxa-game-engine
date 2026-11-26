// The Morning Rush's behaviours (M5 W10, AB-D-0293): the sample's (wander, greet, switchedBy), and two of the game's own.
// Both run inside the step and read only simulation state (the input service's latched frame, the game state, the
// inventory, a character's seat), so a recorded session replays them on the same steps everywhere. No transcendental
// maths here: nothing needs it.
//
// They change the game through the game service and the nodes' own actions, as @vrmxg/game's README says a behaviour
// does. Each declares itself (M6 W0, AB-D-0297 item 4): a static `describe`, the registry's own shape (params and
// arguments as JSON Schema, the signals it emits, the state its getState returns), so the editor's inspector, scene
// validation and MCP know them, and a scene can connect their signals. Nothing listens to those signals in the game's
// own scenes, so emitting them changes no step of a recorded session. (The sample's wander, greet and switchedBy, re-
// exported here, are the engine's behaviours: the registry declares them, and their classes carry no describe.)
import { Behaviour } from '@vrmxg/core';

export * from '../behaviours.js';

// `pressToStart`: on the step one of its `actions` goes down (interact, jump), asks the game to change to `to`. It declares
// no signal: the recorded sessions leave the title on its timer, so one would never be emitted in them (a test checks).
export class pressToStart extends Behaviour {
  static describe = {
    description: 'On a title screen: the step one of its input actions goes down, asks the game to change to a scene.',
    params: {
      actions: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, default: ['interact'], description: 'The input actions that start (the game\'s action map names them).' },
      to: { type: 'string', pattern: '\\.vrmxs$', description: 'The scene the game changes to, as game.json names it.' },
    },
    state: { type: 'null', description: 'Nothing: it reads the input of the step it runs on.' },
  };
  physicsProcess() {
    const input = this.tree.services.get('input'), game = this.tree.services.get('game');
    if (!game || game.view().pending) return;
    for (const a of this.params.actions ?? ['interact']) if (input?.pressed(a)) { game.changeScene({ to: this.params.to }); return; }
  }
  getState() { return null; }
}

// `tableZone`, on an Area beside a regular's table. While the player (`player`, Mira) stands in it:
//   - the regular (`customer`) seated, her order not taken (the game flag `ordered`) and no conversation going on:
//     starts the table's order Dialogue (`dialogue`), again every half second until one starts;
//   - the player carrying this table's tray (`item`, its VRMXI id): hands it over (out of her inventory, the carry pose
//     let go), gives the regular the goal `served` with `{ right }` (the flag `right` her choice set), adds 1 to the
//     counter `served`, and `points` to `score` when the order was right or 1 to `mistakes` when it wasn't. Once.
// A tray for another table stays in her hands.
export class tableZone extends Behaviour {
  static describe = {
    description: 'Beside a regular\'s table (an Area): starts her order\'s conversation while the player stands there, and takes her tray from the player when it is hers, scoring it.',
    on: ['Area'],
    params: {
      customer: { type: 'string', nodeRef: true, description: 'The regular at this table (a Character with a brain).' },
      dialogue: { type: 'string', nodeRef: true, description: 'Her order\'s Dialogue node.' },
      item: { type: 'string', minLength: 1, description: 'The VRMXI id of her tray.' },
      ordered: { type: 'string', minLength: 1, description: 'The game flag her order sets once it is taken.' },
      right: { type: 'string', minLength: 1, description: 'The game flag her choice sets when the order was taken right.' },
      player: { type: 'string', nodeRef: true, default: 'mira', description: 'Who serves (the player\'s Character).' },
      points: { type: 'integer', minimum: 0, default: 10, description: 'Added to the score counter for a right order.' },
      served: { type: 'string', minLength: 1, default: 'served', description: 'The counter a delivery adds 1 to.' },
      score: { type: 'string', minLength: 1, default: 'score', description: 'The counter a right order adds its points to.' },
      mistakes: { type: 'string', minLength: 1, default: 'mistakes', description: 'The counter a wrong order adds 1 to.' },
    },
    signals: { served: { description: 'The tray was handed over (once): the regular has it and the counters are added to.', args: { customer: { type: 'string', nodeRef: true, description: 'The regular served.' }, right: { type: 'boolean', description: 'Whether her order was taken right.' } } } },
    state: {
      type: 'object', additionalProperties: false, required: ['inside', 'next', 'done'],
      properties: {
        inside: { type: 'boolean', description: 'The player stands in the area.' },
        next: { type: 'integer', minimum: 0, description: 'The step it may next try to start the order\'s conversation on.' },
        done: { type: 'boolean', description: 'The tray was handed over.' },
      },
    },
  };
  ready() {
    this.inside = false; this.next = 0; this.done = false;
    this.tree.listen(this.node, 'bodyEntered', ({ body }) => { if (body === this.player) this.inside = true; });
    this.tree.listen(this.node, 'bodyExited', ({ body }) => { if (body === this.player) this.inside = false; });
  }
  get player() { return this.params.player ?? 'mira'; }
  physicsProcess() {
    if (this.done || !this.inside) return;
    const tree = this.tree, p = this.params, step = tree.clock.step;
    const game = tree.services.get('game'), inventory = tree.services.get('inventory');
    if (!game || game.view().outcome) return;
    const ordered = game.getFlag(p.ordered) === true;
    if (ordered && inventory?.has(this.player, p.item)) {
      tree.services.get('interact')?.release(this.player, p.item);
      const right = game.getFlag(p.right) === true;
      const brain = tree.services.get('ai')?.brainOf(p.customer);
      if (brain) brain.bb.goal = { name: 'served', params: { right }, from: this.player, step };
      this.done = true;
      game.add(p.served ?? 'served', 1);
      if (right) game.add(p.score ?? 'score', p.points ?? 10);
      else game.add(p.mistakes ?? 'mistakes', 1);
      this.emit('served', { customer: p.customer, right });
      return;
    }
    if (ordered || step < this.next) return;
    const customer = /** @type {any} */ (tree.find(p.customer));
    const seated = !!customer?.ctrl?.seat && customer.graph?.state === 'sitIdle';
    const talking = tree.services.get('dialogue')?.view() != null;
    if (!seated || talking) return;
    this.next = step + 30;
    /** @type {any} */ (tree.find(p.dialogue))?.start?.({});
  }
  getState() { return { inside: this.inside, next: this.next, done: this.done }; }
  setState(s) { this.inside = s.inside; this.next = s.next; this.done = s.done; }
}
