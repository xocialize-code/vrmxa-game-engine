// Writes takes/follow.json (M3 W12, AB-T-0551): a fixture conversation with a follower. In cafe-follow.vrmxs Hana follows
// Mira (the follower preset); Mira walks in (input/walk-in.json); the person, speaking as Mira, asks Hana to wait by the
// door, talks about the weather (she shrugs), calls her along (she follows again) and teases her (she laughs). The director
// runs the split turn on a scripted model (her lines and verdicts below), so the take is the same every time it is made;
// it replays with no model. The second fixture beside takes/conversation.json (M3 W4).
//   node content/sample/tools/make-follow-take.mjs        (needs vrmxa-core beside the repo, as the tests do)
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { installDirector, scriptedModel, makeTake } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../behaviours.js';

installPortableMath();
const here = path.resolve(import.meta.dirname, '..'), STEPS = 4200, SCENE = 'cafe-follow.vrmxs';
// step the person finishes speaking → what they said; her line and verdict for it
const TALK = [
  [520, 'Hana, wait by the door for me.', 'Sure, I will wait right here.', { emotion: 'relaxed', goal: { name: 'waitAt', params: { target: 'entrance-left' } } }],
  [1500, 'Do you think it will rain today?', 'Who knows! I left my umbrella at home.', { emotion: 'relaxed', gesture: 'shrug' }],
  [2400, 'Come on in, follow me.', 'Right behind you!', { emotion: 'happy', goal: { name: 'follow', params: { target: 'Mira' } } }],
  [3400, 'You should see your face right now.', 'Ha! You are one to talk.', { emotion: 'happy', gesture: 'laugh' }],
];
const isVerdict = (req) => !req.tools.length && /Fill in this JSON object/.test(req.messages.at(-1).content);
const model = scriptedModel((req) => {
  const heard = isVerdict(req) ? /said to Hana: "(.*)"/.exec(req.messages[0].content)?.[1] : req.messages.at(-1).content;
  const t = TALK.find((x) => x[1] === heard);
  return { text: isVerdict(req) ? JSON.stringify(t?.[3] ?? {}) : t?.[2] ?? 'Mm-hm.' };
}, { latency: 24 });

const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(here, ref)));
const sample = await loadSample(bytes, SCENE);
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const W = await buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
const walkIn = JSON.parse(fs.readFileSync(path.join(here, 'input/walk-in.json'), 'utf8'));
W.input.replay(walkIn);
const director = installDirector(W.tree, { model, user: 'mira', userName: 'Mira', persona: (id) => W.personas.forDirector(id) });
const hana = /** @type {any} */ (W.tree.find('hana-1'));
const said = [], gestures = [], goals = [];
W.tree.listen(hana, 'spoke', (a) => said.push(`${W.tree.clock.step} ${a.text}`));
const act = hana.startAction.bind(hana);
hana.startAction = (slot) => { gestures.push(`${W.tree.clock.step} ${slot}`); return act(slot); };
let lastGoal = null;
while (W.tree.clock.step < STEPS) {
  while (!W.tree.step()) await W.tree.settle();
  director.pump();
  await new Promise((r) => setImmediate(r));
  const step = W.tree.clock.step, g = hana.behaviours.find((b) => b.name === 'brain')?.bb.goal ?? null;
  if (JSON.stringify(g?.name ?? null) !== JSON.stringify(lastGoal)) { lastGoal = g?.name ?? null; goals.push(`${step} ${lastGoal} ${JSON.stringify(g?.params ?? {})}`); }
  for (const [at, text] of TALK) {
    const len = Math.round(text.split(' ').length * 0.3 * 60);
    if (step === at - len) director.speaking('hana-1', true);
    if (step === at) { director.speaking('hana-1', false); director.talk('hana-1', text); }
  }
}
const take = makeTake({ scene: SCENE, cast: {}, input: walkIn, ai: W.ai.record(), steps: STEPS, note: 'M3 W12 fixture: tools/make-follow-take.mjs (scripted director, a follower)' });
fs.writeFileSync(path.join(here, 'takes/follow.json'), JSON.stringify(take) + '\n');
const p = hana.object3d.position;
console.log(`takes/follow.json: ${STEPS} steps, ${take.ai.length} logged events; Hana ends at [${[p.x, p.y, p.z].map((v) => v.toFixed(2))}]
  said:     ${said.join('\n            ')}
  gestures: ${gestures.join(', ')}
  goals:    ${goals.join(', ')}`);
