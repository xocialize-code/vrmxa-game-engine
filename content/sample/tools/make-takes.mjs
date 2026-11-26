// The sample's performance takes (M4 W9, AB-T-0581): three takes over "The Regular", one of each kind, recorded here in
// Node by the real recorder (@vrmxg/takes startTake) in the film's own world, from scripted performers: keys pressed on
// a virtual keyboard, a scripted model answering the director, and a synthetic face session. Each take is recorded over
// the film with the takes before it kept, as a person would layer them.
//   take-1  puppet    Mira: walks from her mark, looks about, nods, runs a few steps, hops, waves
//   take-2  director  Hana: told to mention the scones (a line, a smile, a wave), then to walk over (a goal)
//   take-3  face      Mira: blinks, smiles, raises and lowers her brows, talks, winks and turns her head
// The logs go to content/sample/performances/the-regular/. They are not kept in the film (sequences/the-regular.vrmxs is
// untouched): the tests, the acceptance (acceptance/m4/takes.mjs) and the creator's hand test apply them.
//   node content/sample/tools/make-takes.mjs [--check]
// Needs vrmxa-core beside the repo (it reads the characters).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import { composeSequence } from '@vrmxg/sequence';
import { hashValue } from '@vrmxg/snapshot';
import { VirtualDevice } from '@vrmxg/input';
import { installDirector, scriptedModel } from '@vrmxg/director';
import { startTake, takeWorldDoc, withTake, stepOfFrame, syntheticFace, takeRef } from '@vrmxg/takes';

const content = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHORT = 'sequences/the-regular.vrmxs';
/** The sample's take logs, in the order they were layered. */
export const SAMPLE_TAKES = ['take-1', 'take-2', 'take-3'].map((id) => takeRef('the-regular', id));

const flush = () => new Promise((r) => setImmediate(r));

/** The puppet's keys: [from step, to step, key code], steps from the take's start. */
export const PUPPET_KEYS = [
  [20, 170, 'KeyW'], [110, 170, 'KeyD'], [200, 260, 'ArrowLeft'], [260, 290, 'ArrowUp'], [300, 304, 'Digit2'],
  [330, 380, 'ShiftLeft'], [330, 380, 'KeyW'], [390, 394, 'Space'], [420, 424, 'KeyR'], [440, 444, 'Digit1'],
];
/** What the director is told, by the step (from the take's start) it is said on, and what the scripted model answers. */
export const DIRECTIONS = { 10: 'Tell Mira the scones are fresh.', 200: 'Walk over to her.' };
const REPLIES = {
  'Tell Mira the scones are fresh.': ['The scones just came out, Mira!', '{"emotion": "happy", "gesture": "greet"}'],
  'Walk over to her.': ['On my way.', '{"goal": {"name": "goTo", "params": {"target": "mira"}}}'],
};
const isVerdict = (req) => !req.tools?.length && /Fill in this JSON object/.test(req.messages.at(-1).content);
export const sampleModel = () => scriptedModel((req) => {
  const text = req.messages.map((m) => m.content).join('\n');
  const heard = Object.keys(REPLIES).find((h) => (isVerdict(req) ? text.includes(h) : req.messages.at(-1).content.includes(h)));
  const [line, verdict] = REPLIES[heard] ?? ['Mm-hm.', '{}'];
  return { text: isVerdict(req) ? verdict : line };
}, { latency: 20 });

/**
 * Record the three sample takes. `build(doc)` makes a world from a composed scene document (a sequence in its set).
 * `observe({ id, step, tree })` sees the take world after each recorded step (the tests compare it with the film).
 * @param {{ build: (doc: any) => Promise<any>, short: any, set: any, observe?: (o: { id: string, step: number, tree: any }) => void }} o
 * @returns {Promise<any[]>} the take documents
 */
export async function recordSampleTakes({ build, short, set, observe = null }) {
  const fps = short.sequence.fps, takes = [];
  let film = short;
  const record = async ({ kind, target, id, from, steps, setup = {}, before = () => ({}), each = () => {} }) => {
    const W = await build(composeSequence(takeWorldDoc(film, { kind, target }), set));
    const tree = W.tree, start = stepOfFrame(from, fps);
    while (tree.clock.step < start) while (!tree.step()) await tree.settle();
    const ctx = before(W);
    const rec = startTake(tree, { kind, target, id, fps, sequence: { id: film.id, hash: hashValue(film.sequence) }, setup, devices: ctx.devices ?? [] });
    for (let k = 0; k < steps; k++) {
      each(k, { rec, ...ctx });
      while (!tree.step()) await tree.settle();
      ctx.director?.pump(); await flush();
      observe?.({ id, step: tree.clock.step, tree });
    }
    const take = rec.stop();
    takes.push(take);
    film = withTake(film, take);
    W.audio?.dispose?.();
    return take;
  };

  await record({ kind: 'puppet', target: 'mira', id: 'take-1', from: 96, steps: 520,
    before: () => { const keys = new VirtualDevice(); return { keys, devices: [keys] }; },
    each: (k, { keys }) => { for (const [a, b, code] of PUPPET_KEYS) { if (k === a) keys.press(code); if (k === b) keys.release(code); } } });

  await record({ kind: 'director', target: 'hana-1', id: 'take-2', from: 300, steps: 600,
    before: (W) => ({ director: installDirector(W.tree, { model: sampleModel(), user: null, persona: (n) => W.personas?.forDirector(n) ?? null }) }),
    each: (k, { director }) => { if (DIRECTIONS[k]) director.talk('hana-1', DIRECTIONS[k]); } });

  const start = stepOfFrame(560, fps), face = syntheticFace({ start, seconds: 9, fps: 15 });
  let i = 0;
  await record({ kind: 'face', target: 'mira', id: 'take-3', from: 560, steps: 560, setup: { source: 'synthetic', rate: 15 },
    each: (k, { rec }) => { while (i < face.length && face[i].step <= start + k) { const { step, ...sample } = face[i++]; void step; rec.pushFace(sample); } } });
  return takes;
}

/** A take as the text its file holds. */
export const takeText = (take) => `${JSON.stringify(take)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  installPortableMath();
  const { loadSample, buildWorld } = await import('../../../apps/playground/src/world.js');
  const { vrmxaCore, PATHS } = await import('../../../engine/packages/character/test/fixtures.mjs');
  const projectBehaviours = await import('../behaviours.js');
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const R = await loadRapier(), core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  const short = parse(fs.readFileSync(path.join(content, SHORT), 'utf8')), set = parse(fs.readFileSync(path.join(content, short.set), 'utf8'));
  const build = async (doc) => { const sample = await loadSample(bytes, short.set); sample.doc = doc; return buildWorld(R, sample, { vrmxaCore: core, closet, behaviours, stubTextures: true }); };
  const takes = await recordSampleTakes({ build, short, set });
  const check = process.argv.includes('--check');
  let same = true;
  takes.forEach((take, n) => {
    const file = path.join(content, SAMPLE_TAKES[n]), text = takeText(take), had = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (had !== text) { same = false; if (!check) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); } }
    console.log(`${SAMPLE_TAKES[n]}: ${take.kind} of ${take.target}, steps ${take.start} to ${take.end}, ${text.length} bytes, hash ${hashValue(take)}${had === text ? ' (unchanged)' : check ? ' (DIFFERS)' : ' (written)'}`);
  });
  process.exit(check && !same ? 1 : 0);
}
