// The M0 checks that run without a renderer, in Node: the recorded walk with per-step hashes and snapshot/restore,
// and the player through devices. Writes results/node.json. Needs vrmxa-avatar-studio beside the repo (vrmxa-core
// reads the characters' bundles).
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { loadSample } from '../apps/playground/src/world.js';
import { runSimulation, runDevices, runItems, runCinematic, runSequence, runParticles, runBrains, runSave, runFilm, runConversation, runRagdoll } from '../apps/playground/src/acceptance.js';
import { vrmxaCore, PATHS } from '../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../content/sample/behaviours.js';

installPortableMath();
const here = import.meta.dirname, content = path.join(here, '../content/sample');
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const opts = { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true };
const R = await loadRapier();
const sample = await loadSample(bytes);
const simulation = await runSimulation(R, sample, opts, { now: () => performance.now() });
const devices = await runDevices(R, sample, opts);
const items = await runItems(R, sample, opts);
const cinematic = await runCinematic(R, sample, opts);
const sequence = await runSequence(R, sample, opts, { now: () => performance.now() });
const particles = await runParticles(R, sample, opts, { now: () => performance.now() });
const brains = await runBrains(R, sample, opts, { now: () => performance.now() });
const save = await runSave(R, sample, opts, { now: () => performance.now() });
const film = await runFilm(R, sample, opts, { now: () => performance.now() });
const conversation = await runConversation(R, sample, opts, { now: () => performance.now() });
const ragdoll = await runRagdoll(R, sample, opts, { now: () => performance.now() });
const out = { runtime: 'node', version: process.version, simulation, devices, items, cinematic, sequence, particles, brains, save, film, conversation, ragdoll };
fs.writeFileSync(path.join(here, 'results/node.json'), JSON.stringify(out) + '\n');
console.log(JSON.stringify({ final: simulation.final, components: simulation.components, snapshot: simulation.snapshot, play: simulation.play, stepMs: simulation.stepMs, devices, items: { ...items, run: undefined }, cinematic: { ...cinematic, run: undefined }, sequence: { ...sequence, run: undefined }, particles: { ...particles, run: undefined }, brains: { ...brains, run: undefined }, save: { ...save, run: undefined }, film: { ...film, run: undefined, subtitles: undefined }, conversation: { ...conversation, run: undefined }, ragdoll: { ...ragdoll, run: undefined } }, null, 1));
