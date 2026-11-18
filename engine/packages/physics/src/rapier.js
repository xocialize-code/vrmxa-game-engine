// Loading Rapier. One build per project (AB-R-0923): the deterministic build, which gives the same
// bits in every engine and replays snapshots only on the build that made them. The -compat build
// carries its WASM inline, so there is no separate fetch to fail under the wrapper's custom scheme.
import RAPIER from '@dimforge/rapier3d-deterministic-compat';

let ready = null;

/** Initialise Rapier once; resolves to the module. */
export function loadRapier() {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

export const RAPIER_BUILD = '@dimforge/rapier3d-deterministic-compat';
