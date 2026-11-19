// M3 W1 on the sample cafe (needs vrmxa-avatar-studio beside the repo): each character's VRMXA id, core persona (Mira's
// from her bundle, Hana's from the exchange file her app persona names) and app persona; the director's prompt, faces
// and goals from the persona; @vrmxg/ai's trait input reading the profile; setProfile changing the project's document,
// never the bundle; and the world itself unchanged by personas (they are data, not state).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { installDirector, scriptedModel } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);
const HANA = 'cc97eb67-3eac-41c3-9e91-c15029fb6595', MIRA = 'a585e579-4903-4a2b-a593-f72a6d5b779f';

async function cafe({ personas = true } = {}) {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  if (!personas) sample.personas = null;
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [{ use: 'brain', preset: 'server' }] } : n.id === 'mira' ? { ...n, behaviours: [{ use: 'brain', preset: 'customer' }] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
}

test('personas in the cafe: ids, core and app personas, the director, the trait input, and the bundle untouched', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const W = await cafe(), P = W.personas;
  assert.equal(P.vrmxaIdOf('hana-1'), HANA); assert.equal(P.vrmxaIdOf('mira'), MIRA);
  assert.equal(P.coreOf('mira').personality, 'Curious and plain-spoken.', "Mira's core persona from her bundle");
  assert.equal(P.coreOf('hana-1').name, 'Hana', "Hana's from the exchange file her app persona names");
  assert.match(P.personaOf('hana-1').story, /run the cafe/, 'with the app persona laid over');
  const d = P.forDirector('hana-1');
  assert.deepEqual(d.allowedExpressions, ['happy', 'relaxed', 'surprised', 'sad']);
  assert.deepEqual(d.goals.map((g) => g.name), ['takeOrder']);
  assert.equal(W.ai.trait('hana-1', 'talkativeness'), 0.7, 'the trait input reads the profile');
  assert.equal(W.ai.trait('door-1', 'talkativeness'), 0.5, 'and 0.5 without one');

  // the director, on the persona service
  P.memory = (id) => (id === HANA ? 'Mira usually has an oat latte.' : null);
  const director = installDirector(W.tree, { model: scriptedModel([{ toolCalls: [] }]), user: 'mira', userName: 'Mira', persona: (id) => P.forDirector(id), memory: (id) => P.memoryOf(id) });
  for (let i = 0; i < 400; i++) W.tree.step();
  director.talk('hana-1', 'Morning!');
  const req = director.requests[0].request, sys = req.messages[0].content;
  assert.ok(sys.includes('You are Hana.') && sys.includes('Warm and quick') && sys.includes('Your situation: You run the cafe'), 'the persona in the prompt');
  assert.ok(sys.indexOf('Warm and quick') < sys.indexOf('Mira usually has an oat latte.'), 'then what the app remembers (§11)');
  assert.ok(sys.includes('Dangerous words in a cafe.'), 'with her example exchanges');
  const tools = Object.fromEntries(req.tools.map((t) => [t.name, t.parameters.properties]));
  assert.ok(tools.say.emotion.enum.length >= 2 && !tools.say.emotion.enum.includes('angry'), `only her faces (${tools.say.emotion.enum})`);
  assert.deepEqual(tools.setGoal.goal.enum, ['takeOrder'], 'and her goals');

  // a profile edit goes to the project's document, never the bundle
  const before = JSON.stringify(W.lib.characters.get('hana-1')), doc = P.setProfile('hana-1', { talkativeness: 0.2 });
  assert.equal(doc.characters[HANA].profile.talkativeness, 0.2);
  assert.equal(W.ai.trait('hana-1', 'talkativeness'), 0.2);
  assert.equal(JSON.stringify(W.lib.characters.get('hana-1')), before, "the bundle's persona is untouched");
  assert.ok(!JSON.stringify(W.lib.characters.get('mira').persona).includes('talkativeness'), 'no profile in a bundle');
});

test('personas are data: the cafe steps to the same world with and without them', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const run = async (personas) => { const W = await cafe({ personas }); for (let i = 0; i < 900; i++) W.tree.step(); return hashValue(worldHashes(W.tree, { physicsBytes: true })); };
  assert.equal(await run(true), await run(false));
});
