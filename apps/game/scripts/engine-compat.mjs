// What the engine in the game app means for saves (M6 W5, AB-T-0631), for the runtime's table (vite.config.js passes
// it to @vrmxg/bundle's Vite plugin): the snapshot format, @vrmxg/dmath's version and its maths' fingerprint, the
// default action map, and the state each of the registry's behaviours declares. A build's save-compatibility
// fingerprint (@vrmxg/bundle's compat.js) reads it from the table, so the engine part of a save's check is the engine
// that was bundled. Node only (it reads dmath's package.json).
import fs from 'node:fs';
import { engineCompat } from '@vrmxg/bundle';
import { SNAPSHOT_FORMAT } from '@vrmxg/snapshot';
import { mathsFingerprint } from '@vrmxg/save';
import { DEFAULT_ACTIONS } from '@vrmxg/input';
import { m0Registry } from '@vrmxg/registry/m0';

/** → the table's `engine` (compat.js engineCompat) */
export function runtimeEngine() {
  const dmath = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.resolve('@vrmxg/dmath')), 'utf8')).version; // its entry is src/index.js
  return engineCompat({ snapshot: SNAPSHOT_FORMAT, dmath, maths: mathsFingerprint(), actions: DEFAULT_ACTIONS, registry: m0Registry() });
}
