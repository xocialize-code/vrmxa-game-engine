// Writes takes/conversation.json (M3 W4, AB-T-0543): a two-minute take of a conversation in the cafe, the fixture of
// acceptance check 17 and of sequences/conversation.vrmxs. Mira walks in (input/walk-in.json); the person, speaking as
// her, talks to Hana (the host brain) at set steps; the director runs the split turn on a scripted model (her lines and
// verdicts below), so the take is the same every time it is made. The take holds the scene, the cast, the input and the
// ai log; it replays with no model.
//   node content/sample/tools/make-conversation.mjs        (needs vrmxa-core beside the repo, as the tests do)
// With --sequence it also writes sequences/conversation.vrmxs (takeToSequence); bake its lines with tools/bake-lines.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { serialize } from '@vrmxg/scene';
import { installDirector, scriptedModel, makeTake, takeToSequence } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../behaviours.js';

installPortableMath();
const here = path.resolve(import.meta.dirname, '..'), STEPS = 7200;
const CAST = { 'hana-1': { behaviours: [{ use: 'brain', preset: 'host' }] } };
// step the person finishes speaking → what they said; her line and verdict for it
const TALK = [
  [700, 'Good morning, Hana!', 'Morning, Mira! You are early today.', { emotion: 'happy', gesture: 'greet' }],
  [1300, 'I could not sleep. Could I get a latte, please?', 'Of course. One latte, coming right up.', { emotion: 'happy', goal: { name: 'takeOrder', params: { customer: 'Mira', order: 'latte' } } }],
  [3300, 'Thank you. It smells wonderful.', 'Fresh beans this morning. Enjoy it.', { emotion: 'relaxed', gesture: 'nod' }],
  [4200, 'How long have you had this place?', 'Five years this spring. Feels like longer some days.', { emotion: 'relaxed' }],
  [5200, 'Do you ever get a day off?', 'Sundays, if the machine behaves.', { emotion: 'happy', gesture: 'cheer' }],
  [6300, 'I should get going. See you tomorrow!', 'See you tomorrow, Mira. Good luck today!', { emotion: 'happy', gesture: 'greet' }],
];
const isVerdict = (req) => !req.tools.length && /Fill in this JSON object/.test(req.messages.at(-1).content);
const model = scriptedModel((req) => {
  const heard = isVerdict(req) ? /said to Hana: "(.*)"/.exec(req.messages[0].content)?.[1] : req.messages.at(-1).content;
  const t = TALK.find((x) => x[1] === heard);
  return { text: isVerdict(req) ? JSON.stringify(t?.[3] ?? {}) : t?.[2] ?? 'Mm-hm.' };
}, { latency: 24 });

const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(here, ref)));
const sample = await loadSample(bytes);
sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (CAST[n.id] ? { ...n, ...CAST[n.id] } : n)) };
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const W = await buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
const walkIn = JSON.parse(fs.readFileSync(path.join(here, 'input/walk-in.json'), 'utf8'));
W.input.replay(walkIn);
const director = installDirector(W.tree, { model, user: 'mira', userName: 'Mira', persona: (id) => W.personas.forDirector(id) });
const said = [];
W.tree.listen(W.tree.find('hana-1'), 'spoke', (a) => said.push(`${W.tree.clock.step} ${a.text}`));
while (W.tree.clock.step < STEPS) {
  while (!W.tree.step()) await W.tree.settle();
  director.pump();
  await new Promise((r) => setImmediate(r));
  const step = W.tree.clock.step;
  for (const [at, text] of TALK) {
    const len = Math.round(text.split(' ').length * 0.3 * 60);
    if (step === at - len) director.speaking('hana-1', true);
    if (step === at) { director.speaking('hana-1', false); director.talk('hana-1', text); }
  }
}
const take = makeTake({ scene: 'cafe.vrmxs', cast: CAST, input: walkIn, ai: W.ai.record(), steps: STEPS, note: 'M3 W4 fixture: tools/make-conversation.mjs (scripted director)' });
fs.mkdirSync(path.join(here, 'takes'), { recursive: true });
fs.writeFileSync(path.join(here, 'takes/conversation.json'), JSON.stringify(take) + '\n');
console.log(`takes/conversation.json: ${STEPS} steps, ${take.ai.length} logged events; Hana said:\n  ${said.join('\n  ')}`);
if (process.argv.includes('--sequence')) {
  const seq = takeToSequence(take, { id: 'conversation' });
  fs.writeFileSync(path.join(here, 'sequences/conversation.vrmxs'), serialize(seq));
  console.log(`sequences/conversation.vrmxs: ${seq.sequence.duration} frames, ${seq.sequence.tracks.map((t) => t.id).join(', ')}`);
}
