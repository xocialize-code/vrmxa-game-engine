// Letting go of the worlds the editor replaces (AB-T-0592), as a plain class so it is tested in Node
// (apps/creator/test/worlds.test.mjs). The host builds a world for the edit view, for the timeline's preview, for Play
// and for each export; whatever builds a world owes it a `retire` (or a `disposeWorld`, when no view ever showed it).
import { disposeWorld } from './dispose.js';

export class RetiredWorlds {
  /**
   * @param {{ showing: () => any, dispose?: (world: any) => any }} o showing: the tree the view shows now (the render
   *   host's), or null; dispose: what lets a world go (dispose.js's `disposeWorld`)
   */
  constructor({ showing, dispose = disposeWorld }) {
    this.showing = showing; this.dispose = dispose;
    /** Worlds let go of that the view still shows or some work is still using. @type {any[]} */ this.waiting = [];
  }

  /**
   * Let a world go: sound, physics and every geometry, material and texture (dispose.js). A world that is only dropped
   * keeps its WASM and GPU memory for good, and every edit builds another. One the view still shows (the old edit view
   * while its replacement builds) or that is in use (a scrub stepping and drawing it) waits: `sweep` disposes it once
   * it is free, so nothing is drawn or stepped after its physics has gone. Retiring a world twice, or one already
   * disposed, does nothing.
   */
  retire(world) {
    if (!world || world.disposed) return;
    if (!this.waiting.includes(world)) this.waiting.push(world);
    this.sweep();
  }

  /** Dispose the retired worlds nothing uses any more (the frame loop calls this every frame). → how many went */
  sweep() {
    if (!this.waiting.length) return 0;
    const free = [], shown = this.showing() ?? null;
    this.waiting = this.waiting.filter((w) => {
      if (w.inUse > 0 || (shown !== null && shown === w.tree)) return true;
      free.push(w);
      return false;
    });
    // after the list is settled, and each on its own: a dispose that throws loses no other world, and is thrown on
    let failed = null;
    for (const w of free) { try { this.dispose(w); } catch (e) { failed ??= e; } }
    if (failed) throw failed;
    return free.length;
  }

  /**
   * Work on a world across awaits (a scrub steps it, then draws it): it isn't disposed until the returned function is
   * called, even if it is retired meanwhile. Call the function exactly when the work ends (a `finally`); calling it
   * again does nothing.
   * @returns {() => void}
   */
  use(world) {
    world.inUse = (world.inUse ?? 0) + 1;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      world.inUse--;
      this.sweep();
    };
  }
}
