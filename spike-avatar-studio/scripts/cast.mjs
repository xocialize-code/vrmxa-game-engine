// Cast a studio-made .vrmxa as Mira in the engine's cafe and run acceptance check 3's walk.
import fs from 'node:fs'; import path from 'node:path';
import { installPortableMath } from '../../engine/packages/dmath/src/index.js';
import { loadRapier } from '../../engine/packages/physics/src/index.js';
import { loadSample, buildWorld } from '../../apps/playground/src/world.js';
import { runSimulation } from '../../apps/playground/src/acceptance.js';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
installPortableMath();
const here = import.meta.dirname, content = path.resolve(here, '../../content/sample'), who = process.argv[2] && path.resolve(process.argv[2]);
const bytes = async (ref) => new Uint8Array(fs.readFileSync(ref === 'characters/mira.vrmxa' && who ? who : path.join(content, ref)));
const sample = await loadSample(bytes);
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const opts = { vrmxaCore: await vrmxaCore(), closet, behaviours: new Map(), stubTextures: true };
const t = performance.now();
const r = await runSimulation(await loadRapier(), sample, opts);
const W = await buildWorld(await loadRapier(), sample, opts); const m = W.tree.find('mira');
console.log(JSON.stringify({ file: who ? path.basename(who) : 'sample mira', ms: Math.round(performance.now() - t), final: r.final,
  states: r.play.states, maxSpeed: r.play.maxSpeed, jump: r.play.maxHeight, slots: r.play.slots, idle: r.play.idleClip, equipped: r.play.equipped,
  snapshot: r.snapshot.rerunMatches, stepMs: r.stepMs, expressions: Object.keys(m.vrm?.expressionManager?.expressionMap ?? {}).length,
  persona: m.persona?.name ?? W.personas?.forDirector?.('mira')?.name ?? null }, null, 1));
