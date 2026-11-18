// Scrubbing (M2 W1): show any frame of a sequence exactly, as playing up to it would. Sequences are simulation (the
// characters walk, the doors swing, physics runs), so a frame can only be reached by stepping; the player keeps a
// snapshot every `every` steps and seeks by restoring the nearest one at or before the frame's step and stepping the
// rest (or stepping on from where the world already is, when that is nearer). The result is the exact world of a
// straight play, bit for bit: what the export renders. Editing the sequence or the set invalidates the snapshots after
// the edit (invalidate(fromFrame)).
import { captureWorld, restoreWorld } from '@vrmxg/snapshot';

export class SequencePlayer {
  /**
   * @param {any} tree a sequence world, at step 0
   * @param {{ every?: number }} [o] steps between snapshots (default 120: 2 s)
   */
  constructor(tree, { every = 120 } = {}) {
    this.tree = tree;
    this.every = every;
    /** step → snapshot */ this.snaps = new Map([[tree.clock.step, captureWorld(tree)]]);
  }

  get service() { return this.tree.services.get('sequence'); }

  async stepTo(step) {
    const tree = this.tree;
    let n = 0;
    while (tree.clock.step < step) {
      while (!tree.step()) await tree.settle();
      n++;
      if (tree.clock.step % this.every === 0 && !this.snaps.has(tree.clock.step)) this.snaps.set(tree.clock.step, captureWorld(tree));
    }
    return n;
  }

  /** Put the world on a frame: { step, alpha } for the render host's frameAt, and how it got there. */
  async seek(frame) {
    const { step, alpha } = this.service.stepOf(frame);
    const now = this.tree.clock.step;
    let best = -1;
    for (const s of this.snaps.keys()) if (s <= step && s > best) best = s;
    let restored = null;
    if (!(now <= step && now >= best)) { restoreWorld(this.tree, this.snaps.get(best)); restored = best; }
    const stepped = await this.stepTo(step);
    return { frame, step, alpha, restored, stepped };
  }

  /** Forget the snapshots after a frame (an edit there changes everything after it); 0 forgets all but the first. */
  invalidate(fromFrame = 0) {
    const from = fromFrame <= 0 ? 0 : this.service.stepOf(fromFrame).step;
    const first = Math.min(...this.snaps.keys());
    for (const s of [...this.snaps.keys()]) if (s > from && s !== first) this.snaps.delete(s);
  }
}
