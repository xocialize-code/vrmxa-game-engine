// W10 (AB-T-0533): live lines are presentation (the simulation is the same with or without a provider, and while an
// export records), and bakePlan / applyBake turn a sequence's text-only dialogue into clips. Skips the world tests
// without vrmxa-avatar-studio and spec.vrm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { installCharacters } from '@vrmxg/character';
import { installAudio } from '@vrmxg/audio';
import { worldHashes } from '@vrmxg/snapshot';
import { installVoice, bakePlan, applyBake, httpTTS } from '../src/index.js';
import { available, read, vrmxaCore, testAnimations } from '../../character/test/fixtures.mjs';

installPortableMath();
const OK = available('spec', 'core', 'coreAnim');
const SKIP = OK ? false : 'needs spec.vrm and vrmxa-avatar-studio beside this repository';
const SAMPLE = path.join(import.meta.dirname, '../../../../content/sample');
const file = (ref) => new Uint8Array(fs.readFileSync(path.join(SAMPLE, ref)));
const anims = OK ? await testAnimations(await vrmxaCore()) : null;
const TEXT = 'Two lattes and a croissant, please.';

async function world(provider) {
  const tree = new SceneTree({ registry: m0Registry(), seed: 5 });
  const audio = installAudio(tree, { resolve: file });
  const chars = installCharacters(tree, { resolve: () => read('spec'), stubTextures: true });
  chars.setAnimations('spec.vrm', anims);
  const voice = installVoice(tree, { resolve: file });
  if (provider) voice.useLive(provider, { voices: { kai: 'am_adam' } });
  const doc = { format: 'vrmxs', version: 1, id: 'live', assets: [{ id: 'body', type: 'vrmxa', ref: 'spec.vrm' }],
    nodes: [{ id: 'kai', type: 'Character', asset: 'body', transform: { p: [0, 0, 0] } }],
    connections: [{ from: 'kai', signal: 'ready', to: 'kai', call: 'say', args: { text: TEXT } }] };
  await audio.prepare(doc); await chars.prepare(doc); await voice.prepare(doc);
  tree.instantiate(doc);
  return { tree, audio, voice };
}

// a provider that answers after a few event-loop turns with a real clip (Hana's welcome, as bytes)
function fakeProvider() {
  const calls = [];
  return { calls, name: 'fake', async speak(req) { calls.push(req); await new Promise((r) => setTimeout(r, 5)); return { wav: file('voice/hana-welcome.wav'), words: [] }; } };
}

const run = async (w, steps, onStep) => { const hashes = []; for (let i = 0; i < steps; i++) { w.tree.step(); if (i % 20 === 0) await new Promise((r) => setTimeout(r, 1)); onStep?.(i); hashes.push(JSON.stringify(worldHashes(w.tree))); } return hashes; };

test('a live line is heard once its clip arrives (from that step, its voice by speaker), and the simulation is the same as without a provider', { skip: SKIP }, async () => {
  const p = fakeProvider();
  const live = await world(p), plain = await world(null);
  const heard = [];
  const a = await run(live, 200, () => { const s = live.audio.sounds().find((x) => x.key === 'voice:kai'); if (s) heard.push(s); });
  const b = await run(plain, 200);
  assert.deepEqual(a, b, 'the same hashes, step by step');
  assert.deepEqual(p.calls, [{ text: TEXT, voice: 'am_adam' }], 'asked once, with the speaker\'s voice');
  assert.ok(heard.length > 0 && heard[0].ref.startsWith('live:'), 'the clip is heard');
  assert.ok(heard[0].startStep > 0, `heard from the step it arrived on (${heard[0].startStep}), not the line's start`);
  assert.equal(live.voice.live.stats.ready, 1);
});

test('while the audio service records (an export), live clips are left out', { skip: SKIP }, async () => {
  const w = await world(fakeProvider());
  w.audio.record();
  let heard = 0;
  await run(w, 120, () => { if (w.audio.sounds().some((x) => x.key === 'voice:kai')) heard++; });
  assert.equal(heard, 0);
});

test('a failing provider is given up after three failures; lines still run on their estimate', { skip: SKIP }, async () => {
  const errors = [];
  const w = await world({ name: 'down', speak: async () => { throw new Error('no endpoint'); } });
  w.voice.live.onError = (e) => errors.push(e.message);
  for (let i = 0; i < 5; i++) { w.tree.call(w.tree.find('kai'), 'say', { text: `${TEXT} ${i}` }); await run(w, 10); }
  assert.equal(errors.length, 3, 'three tries, then silent');
  assert.ok(w.voice.speaking('kai'));
});

test('httpTTS posts { text, voice } as text/plain and decodes the base64 clip', async () => {
  let sent = null;
  const wav = new Uint8Array([82, 73, 70, 70]);
  const f = async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ wav: Buffer.from(wav).toString('base64'), sampleRate: 24000, words: [{ text: 'Hi', start: 0, duration: 0.2 }] }) }; };
  const r = await httpTTS('http://127.0.0.1:5190/speak', { fetch: f }).speak({ text: 'Hi', voice: 'af_heart' });
  assert.equal(sent.init.headers['Content-Type'], 'text/plain');
  assert.deepEqual(JSON.parse(sent.init.body), { text: 'Hi', voice: 'af_heart' });
  assert.deepEqual([...r.wav], [...wav]);
  assert.equal(r.words[0].text, 'Hi');
});

test('bakePlan lists the text-only dialogue (stable ids, voices by speaker); applyBake points it at the clips', () => {
  const doc = { format: 'vrmxs', version: 1, id: 'Morning', nodes: [], connections: [{ from: 'a', signal: 'ready', to: 'kai', call: 'say', args: { text: 'Hello.' } }],
    sequence: { fps: 24, duration: 100, tracks: [
      { id: 'hana-says', type: 'dialogue', target: 'hana-1', clips: [{ start: 0, end: 40, clip: 'voice/hana-welcome.wav', text: 'Oh, hi!' }, { start: 50, end: 90, text: 'Coming right up!' }] },
      { id: 'kai-says', type: 'dialogue', target: 'kai', clips: [{ start: 10, end: 30, text: 'A latte, please.' }] },
    ] } };
  const plan = bakePlan(doc, { voices: { kai: 'am_adam' } });
  assert.deepEqual(plan.map((p) => [p.id, p.voice, p.clip]), [
    ['morning-hana-says-2', 'af_heart', 'voice/morning-hana-says-2.wav'],
    ['morning-kai-says-1', 'am_adam', 'voice/morning-kai-says-1.wav'],
    ['morning-say-kai-1', 'am_adam', 'voice/morning-say-kai-1.wav'],
  ]);
  const baked = applyBake(doc, plan);
  assert.equal(baked.sequence.tracks[0].clips[1].clip, 'voice/morning-hana-says-2.wav');
  assert.equal(baked.sequence.tracks[0].clips[1].text, 'Coming right up!', 'the text stays, as the caption');
  assert.equal(baked.sequence.tracks[0].clips[1].voice, 'af_heart', 'the voice it was baked in is recorded');
  assert.equal(baked.connections[0].args.clip, 'voice/morning-say-kai-1.wav');
  assert.equal(doc.sequence.tracks[1].clips[0].clip, undefined, 'the input is left alone');
  assert.deepEqual(bakePlan(baked), [], 'nothing left to bake');
});
