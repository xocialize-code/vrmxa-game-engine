// The Morning Rush's behaviours (M5 W10, AB-D-0293): the sample's (wander, greet, switchedBy), and two of the game's own.
// Both run inside the step and read only simulation state (the input service's latched frame, the game state, the
// inventory, a character's seat), so a recorded session replays them on the same steps everywhere. No transcendental
// maths here: nothing needs it.
//
// They change the game through the game service and the nodes' own actions, as @vrmxg/game's README says a behaviour
// does, and emit no signals of their own: a project's behaviours can't declare signals to the registry, and a scene
// connection from an undeclared signal fails validation (the editor's save, MCP's validate).
import { Behaviour } from '@vrmxg/core';

export * from '../behaviours.js';

// `pressToStart`: on the step one of its `actions` goes down (interact, jump), asks the game to change to `to`.
export class pressToStart extends Behaviour {
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
