// M3 W1 (AB-T-0540). Without a world: core personas from a bundle's database and from the exchange form, the app's
// overrides laid over, profiles from traits and from a model (with the fallback), and utility weighted by a trait.
// On the sample cafe (needs vrmxa-core): each character's VRMXA id, core and app persona, the director's prompt
// and faces from the persona, the trait input reading the profile, and setProfile changing the project's document only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { RandomStream } from '@vrmxg/core';
import { compile, tick } from '@vrmxg/ai';
import { corePersona, layer, profileFromTraits, clampProfile, deriveProfile, TRAITS } from '@vrmxg/persona';
import { scriptedModel } from '@vrmxg/director';

installPortableMath();

/** Mira's row as vrmxa-core's readCharacterDb gives it: JSON columns as text. */
const MIRA_DB = {
  persona: { id: 1, name: 'Mira', age: 'mid-twenties', summary: 'A test character.', personality: 'Curious and plain-spoken.', traits: '["curious","plain-spoken"]', languages: '["en"]', allowed_expressions: '["happy","angry","sad","relaxed","surprised"]', rest_expression: 'neutral', tags: '[]', extensions: '{}' },
  examples: [{ id: 1, seq: 0, user_text: 'Where to?', character_text: 'Wherever the road goes.' }],
};

test('core personas from a bundle database and from the exchange form; the app laid over', () => {
  const m = corePersona(MIRA_DB);
  assert.deepEqual(m.traits, ['curious', 'plain-spoken']);
  assert.deepEqual(m.allowed_expressions, ['happy', 'angry', 'sad', 'relaxed', 'surprised']);
  assert.deepEqual(m.examples, [{ user: 'Where to?', character: 'Wherever the road goes.' }]);
  assert.equal(m.tags, undefined, 'tags and extensions are not for the model');
  const hana = corePersona(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../content/sample/personas/hana.persona.json'), 'utf8')));
  assert.equal(hana.name, 'Hana'); assert.equal(hana.examples.length, 2);
  const p = layer(m, { overrides: { name: 'Mira the Swift' }, story: 'You are a regular here.' });
  assert.equal(p.name, 'Mira the Swift'); assert.equal(p.story, 'You are a regular here.'); assert.equal(p.personality, m.personality);
  assert.equal(m.name, 'Mira', 'the core is not changed');
  assert.equal(corePersona(null), null); assert.equal(layer(null, null), null);
});

test('profiles: from traits (deterministic), clamped, and from a model with a fallback', async () => {
  const p = profileFromTraits(corePersona(MIRA_DB));
  assert.deepEqual(Object.keys(p), Object.keys(TRAITS));
  assert.equal(p.curiosity, 0.85); assert.equal(p.patience, 0.5, 'unsaid traits stay neutral');
  assert.deepEqual(profileFromTraits(corePersona(MIRA_DB)), p, 'the same every time');
  assert.deepEqual(clampProfile({ talkativeness: 3, energy: -1, bogus: 1 }), { sociability: 0.5, curiosity: 0.5, boldness: 0.5, energy: 0, talkativeness: 1, personalSpace: 0.5, patience: 0.5 });
  const good = await deriveProfile(corePersona(MIRA_DB), scriptedModel([{ toolCalls: [{ name: 'profile', arguments: JSON.stringify({ sociability: 0.6, curiosity: 0.9, boldness: 0.7, energy: 0.6, talkativeness: 0.35, personalSpace: 0.5, patience: 0.4 }) }] }], { latency: 0 }));
  assert.equal(good.from, 'model'); assert.equal(good.profile.curiosity, 0.9);
  const bad = await deriveProfile(corePersona(MIRA_DB), scriptedModel([{ toolCalls: [{ name: 'profile', arguments: { curiosity: 0.9 } }] }], { latency: 0 }));
  assert.equal(bad.from, 'traits'); assert.deepEqual(bad.profile, p); assert.match(bad.error, /lacks/);
});

test('a trait weights utility: a talkative character chats, a reserved one gets back to work, deterministically', () => {
  const tree = { type: 'utility', rate: 1, children: [
    { name: 'chat', considerations: [{ input: 'trait', name: 'talkativeness', curve: { type: 'linear' } }], tree: { type: 'action', do: 'wait', args: { seconds: 1 } } },
    { name: 'work', considerations: [{ input: 'trait', name: 'talkativeness', curve: { type: 'inverse' } }], tree: { type: 'action', do: 'wait', args: { seconds: 1 } } },
  ] };
  const choose = (talk) => {
    const nodes = compile(tree), state = {};
    const ctx = { node: { id: 'hana-1', ctrl: {} }, tree: { find: () => null, services: new Map() }, ai: { trait: (id, name) => (name === 'talkativeness' ? talk : 0.5) }, brain: { memory: {}, recall: () => null }, bb: {}, step: 1, rng: new RandomStream(1, 't') };
    tick(nodes, state, ctx);
    return state[0].cur;
  };
  assert.equal(choose(0.9), 0, 'talkative: chat');
  assert.equal(choose(0.2), 1, 'reserved: work');
  assert.equal(choose(0.9), choose(0.9));
  const neutral = compile(tree), st = {};
  tick(neutral, st, { node: { id: 'x', ctrl: {} }, tree: { find: () => null, services: new Map() }, ai: {}, brain: { memory: {}, recall: () => null }, bb: {}, step: 1, rng: new RandomStream(1, 't') });
  assert.deepEqual(st[0].scores, [0.5, 0.5], 'without a persona service every trait is 0.5');
});
