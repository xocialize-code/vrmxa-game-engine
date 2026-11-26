// Every app's built web folder carries THIRD-PARTY-LICENCES.txt with what it must (M6 W7, AB-T-0624): fdlibm's notice,
// the notices our own vendored and ported files carry (Ajv's in the precompiled meta-schema among them), and the licence
// text of each package named here, as the installed package ships it (or as
// engine/packages/bundle/licences/ supplies it). The lists are written by hand, apart from the plugin's own walk of the
// bundle, so a plugin that stops seeing a package fails here.
//
//   node scripts/check-notices.mjs                every app whose dist is built
//   node scripts/check-notices.mjs editor game    those apps (a dist that isn't built fails)
//
// The Mac apps' build scripts run it on their own app after the web build. Exit 1 when anything is missing.
import fs from 'node:fs';
import path from 'node:path';
import { checkNotices } from '@vrmxg/bundle/notices';

const root = path.resolve(import.meta.dirname, '..');
// vrmxa-core's own install (sql.js, @cfworker/json-schema come from there), beside the repository (AB-D-0249)
const core = path.join(root, '../vrmxa-core');
const engine = ['three', '@pixiv/three-vrm', '@pixiv/three-vrm-animation', '@dimforge/rapier3d-deterministic-compat', 'navcat', 'mathcat', 'postprocessing', 'three.quarks', '@vue/runtime-core', '@vue/runtime-dom', '@vue/reactivity', '@vue/shared'];
const fromCore = ['sql.js', '@cfworker/json-schema', 'fflate'];
// Ajv 8 as @vrmxg/scene imports it (the workspace's root holds ESLint's Ajv 6)
const ajv = ['ajv', 'engine/packages/scene'];

// the notices our own files carry, which every app's bundle includes: fdlibm's (the maths port), Ajv's (the precompiled
// meta-schema), navcat's, the lip-sync rules', three-vrm's (vendored), and the engine's own licence
const KEPT = Object.fromEntries([
  ['@vrmxg/dmath/src/index.js', 'engine/packages/dmath/src/index.js'],
  ['@vrmxg/registry/src/vendor/ajv-meta-2020.js', 'engine/packages/registry/src/vendor/ajv-meta-2020.js'],
  ['@vrmxg/nav/src/vendor/LICENSE-navcat', 'engine/packages/nav/src/vendor/LICENSE-navcat'],
  ['@vrmxg/nav/src/vendor/navcat-blocks.js', 'engine/packages/nav/src/vendor/navcat-blocks.js'],
  ['@vrmxg/voice/src/vendor/lipsync-en.js', 'engine/packages/voice/src/vendor/lipsync-en.js'],
  ['@vrmxg/three-vrm/LICENSE', 'engine/vendor/three-vrm/LICENSE'],
  ['vrmxg/LICENSE-MIT', 'LICENSE-MIT'], // the engine's own licence, MIT OR Apache-2.0
  ['vrmxg/LICENSE-APACHE', 'LICENSE-APACHE'],
].map(([name, file]) => [name, path.join(root, file)]));

/** app → its built web folder and the packages its notices must hold (a name, or [name, the folder it is imported from]) */
export const APP_NOTICES = {
  game: { dist: 'apps/game/dist', packages: [...engine, 'vue', 'es-module-lexer'] },
  playground: { dist: 'apps/playground/dist', packages: [...engine, 'troika-three-text'] },
  editor: { dist: 'apps/editor/dist', packages: [...engine, 'es-module-lexer', ajv, 'camera-controls'] },
  creator: { dist: 'apps/creator/dist', packages: [...engine, 'es-module-lexer', ajv, 'camera-controls'] },
};

/** What an app's notices miss (none: all there), or null when its dist isn't built. */
export function appNotices(app) {
  const a = APP_NOTICES[app], dir = path.join(root, a.dist), from = path.join(root, path.dirname(a.dist));
  if (!fs.existsSync(dir)) return null;
  const own = a.packages.filter((p) => typeof p === 'string'), elsewhere = a.packages.filter((p) => typeof p !== 'string');
  return [...checkNotices(dir, { packages: own, from, kept: KEPT }), ...elsewhere.flatMap(([n, f]) => checkNotices(dir, { packages: [n], from: path.join(root, f) }).filter((m) => !/fdlibm|without its licence/.test(m))),
    ...(fs.existsSync(core) ? checkNotices(dir, { packages: fromCore, from: core }).filter((m) => !/fdlibm|without its licence/.test(m)) : [`vrmxa-core is not beside the repository (${core}): ${fromCore.join(', ')} not checked`])];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const asked = process.argv.slice(2), apps = asked.length ? asked : Object.keys(APP_NOTICES);
  let bad = 0;
  for (const app of apps) {
    if (!APP_NOTICES[app]) { console.error(`no app ${app} (${Object.keys(APP_NOTICES).join(', ')})`); bad++; continue; }
    const missing = appNotices(app);
    if (missing === null) { if (asked.length) { console.error(`${app}: ${APP_NOTICES[app].dist} is not built`); bad++; } else console.log(`${app}: not built, not checked`); continue; }
    if (missing.length) { bad++; console.error(`${app}: THIRD-PARTY-LICENCES.txt misses ${missing.join('; ')}`); } else console.log(`${app}: THIRD-PARTY-LICENCES.txt holds every notice it must`);
  }
  process.exit(bad ? 1 : 0);
}
