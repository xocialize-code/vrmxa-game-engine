// captureWorld / restoreWorld as the spike uses them, with shims for two engine gaps the spike found. Each is a
// finding in the README and a task; the shims show what rollback costs and whether it holds once they are fixed.
//
// 1. jump: a Character's snapshot keeps its intent's `move` but not its `jump` (engine/packages/character/src/
//    character.js, getState: `ctrl: { ...this.ctrl, move: [...this.input.move] }`). The player controller sets
//    `input.jump` on the step the button goes down and the character takes it on the next, so a snapshot taken between
//    the two loses the jump, and a world restored from it (fresh or in place) parts on the next step. The shim carries
//    the flag beside the snapshot.
// 2. nav: the nav service's restore bakes the whole navmesh again whenever the live mesh has changed since its bake
//    (engine/packages/nav/src/service.js, restore: `if (!this.build || this.st.version !== 0 || !this.mesh)
//    this.bake()`), then replaces it with the snapshot's own mesh when the snapshot has one. In the cafe the doors
//    change the mesh from the first step, so every restore spends about 15 ms (Node) on a bake it throws away. The shim
//    skips the bake when the snapshot carries the mesh and the service has baked once (its build data is the same).
//
// SHIM=0 turns both off; SHIM=jump or SHIM=nav keeps only that one. Default: both.
import { captureWorld as capture, restoreWorld as restore } from '@vrmxg/snapshot';

const env = process.env.SHIM ?? 'jump,nav';
export const SHIMS = env === '0' ? [] : env === '1' ? ['jump', 'nav'] : env.split(',').filter(Boolean);
export const SHIM = SHIMS.join(',') || 'none';

export function captureWorld(tree, opts) {
  const snap = capture(tree, opts);
  if (SHIMS.includes('jump')) {
    const jumps = {};
    for (const n of tree.all()) if (n.input && typeof n.input.jump === 'boolean' && n.input.jump) jumps[n.id] = true;
    snap.shim = { jumps };
  }
  return snap;
}

export function restoreWorld(tree, snap) {
  const nav = SHIMS.includes('nav') ? tree.services.get('nav') : null;
  const skipBake = nav && nav.build && nav.mesh && snap.services.nav?.data?.mesh;
  if (skipBake) nav.bake = () => {}; // an own property over the prototype's, deleted after
  try { restore(tree, snap); } finally { if (skipBake) delete nav.bake; }
  if (SHIMS.includes('jump') && snap.shim) for (const n of tree.all()) if (n.input && typeof n.input.jump === 'boolean') n.input.jump = !!snap.shim.jumps[n.id];
  return tree;
}
