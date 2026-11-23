// Reading real .vrmxa files through vrmxa-core, and loading the cast into the engine's character library. Needs
// vrmxa-core beside the repository (the development Mac); skips, and says so, without it. The studio's Hana and Mira
// (vrmxa-avatar-studio/content/characters/out/approved/) are used when present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { composeSequence } from '@vrmxg/sequence';
import { CharacterLibrary } from '@vrmxg/character';
import { readCharacter, castRole, rolesOf } from '../src/index.js';
import { SAMPLE, STUDIO, haveCore, haveStudio, vrmxaModules, set, sequence, performance, PRESETS } from './helpers.mjs';

const skipCore = haveCore ? false : 'vrmxa-core is not beside the repository (../vrmxa-avatar-studio)';
const skipStudio = skipCore || (haveStudio ? false : 'the studio\'s Hana and Mira are not built (vrmxa-avatar-studio/content/characters/out/approved/)');
const files = { 'characters/hana.vrmxa': path.join(SAMPLE, 'characters/hana.vrmxa'), 'characters/mira.vrmxa': path.join(SAMPLE, 'characters/mira.vrmxa'), 'characters/studio/hana.vrmxa': path.join(STUDIO, 'hana.vrmxa'), 'characters/studio/mira.vrmxa': path.join(STUDIO, 'mira.vrmxa') };
const bytes = (ref) => new Uint8Array(fs.readFileSync(files[ref] ?? path.join(SAMPLE, ref)));
const read = async (ref) => readCharacter(bytes(ref), { ref, vrmxa: await vrmxaModules() });

test('the sample\'s characters: Mira\'s persona with a voice the shell can\'t speak, Hana with no persona', { skip: skipCore }, async () => {
  const mira = await read('characters/mira.vrmxa'), hana = await read('characters/hana.vrmxa');
  assert.equal(mira.name, 'Mira');
  assert.equal(mira.vrmxaId, 'a585e579-4903-4a2b-a593-f72a6d5b779f');
  assert.match(mira.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(mira.persona.allowed_expressions, ['happy', 'angry', 'sad', 'relaxed', 'surprised']);
  assert.equal(mira.voices[0].origin, 'designed');
  assert.equal(mira.wardrobe.outfits[0].name, 'Adventurer');
  assert.equal(hana.persona, null);
  // cast from them: the map voices both, Mira's designed voice is said
  const a = castRole(sequence(), 'mira', mira, { set, presets: PRESETS });
  assert.deepEqual([a.role.asset, a.role.voice.preset, a.role.voice.from, a.role.wardrobe.outfit], ['mira', 'af_bella', 'map', mira.wardrobe.outfit]);
  assert.match(a.warnings[0], /names no kokoro-82m preset/);
  assert.equal(castRole(a.doc, 'hana-1', hana, { set, presets: PRESETS }).role.voice.preset, 'af_heart');
});

test('the studio\'s Hana and Mira: each persona names her Kokoro preset (AB-A-0323); recast loads in the character library', { skip: skipStudio }, async () => {
  const hana = await read('characters/studio/hana.vrmxa'), mira = await read('characters/studio/mira.vrmxa');
  assert.deepEqual([hana.name, hana.persona.voice_id !== null, hana.voices[0].engines['kokoro-82m']], ['Hana', true, { preset: 'af_heart' }]);
  assert.deepEqual([mira.name, mira.voices[0].engines['kokoro-82m']], ['Mira', { preset: 'af_bella' }]);
  assert.equal(hana.sha256, 'dcd2e6100ab463752b573f2fc8365c4694c22ffe6bee1cb6e1f283ab8e8cedc0');

  const doc = sequence();
  let d = castRole(doc, 'hana-1', hana, { set }).doc;
  d = castRole(d, 'mira', mira, { set }).doc;
  const r = castRole(d, 'hana-1', mira, { set }); // recast Hana's role with Mira
  assert.equal(r.role.voice.preset, 'af_bella');
  assert.equal(performance(r.doc, 'hana-1'), performance(doc, 'hana-1'));
  assert.deepEqual(r.rebake.map((l) => l.voice), ['af_bella', 'af_bella', 'af_bella', 'af_bella']);
  assert.deepEqual(rolesOf(r.doc).map((x) => x.id), ['hana-1', 'mira']);

  // the composed world loads: the role's node is now the studio's Mira, persona and all
  const world = composeSequence(r.doc, set);
  const lib = new CharacterLibrary({ resolve: async (ref) => bytes(ref), vrmxaCore: await vrmxaModules(), stubTextures: true });
  await lib.prepare(world);
  assert.equal(lib.characters.get('hana-1').ref, 'characters/studio/mira.vrmxa');
  assert.equal(lib.characters.get('hana-1').persona.persona.name, 'Mira');
  assert.equal(lib.characters.get('mira').persona.persona.name, 'Mira');
});
