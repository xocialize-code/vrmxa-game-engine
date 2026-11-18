// W6 (AB-T-0518): voice lines, lip sync on the step clock, faces. A spec.vrm character says Hana's welcome line
// (content/sample/voice, Kokoro af_heart with its own word timings). Skips without vrmxa-avatar-studio and spec.vrm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { installCharacters } from '@vrmxg/character';
import { installAudio, wavSamples } from '@vrmxg/audio';
import { recordRun, compareRuns, captureWorld, restoreWorld } from '@vrmxg/snapshot';
import { installVoice, buildTrack, sampleMouth, estimateWords, VOWELS } from '../src/index.js';
import { available, read, vrmxaCore, testAnimations } from '../../character/test/fixtures.mjs';

installPortableMath();
const OK = available('spec', 'core', 'coreAnim');
const SKIP = OK ? false : 'needs spec.vrm and vrmxa-avatar-studio beside this repository';
const SAMPLE = path.join(import.meta.dirname, '../../../../content/sample');
const file = (ref) => new Uint8Array(fs.readFileSync(path.join(SAMPLE, ref)));
const CLIP = 'voice/hana-welcome.wav';
const timings = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'voice/hana-welcome.timings.json'), 'utf8'));
timings.words = timings.words.map((w) => ({ ...w, start: w.start + (timings.offset ?? 0) })); // as the service reads them
const anims = OK ? await testAnimations(await vrmxaCore()) : null;

const scene = () => ({
  format: 'vrmxs', version: 1, id: 'voice',
  assets: [{ id: 'body', type: 'vrmxa', ref: 'spec.vrm' }],
  nodes: [
    { id: 'hana', type: 'Character', asset: 'body', transform: { p: [0, 0, 0] } },
    { id: 'mira', type: 'Character', asset: 'body', transform: { p: [0, 0, 2], q: [0, 1, 0, 0] } },
  ],
  connections: [{ from: 'mira', signal: 'ready', to: 'hana', call: 'say', args: { clip: CLIP } }],
});

async function world() {
  const tree = new SceneTree({ registry: m0Registry(), seed: 3 });
  const audio = installAudio(tree, { resolve: file });
  const chars = installCharacters(tree, { resolve: () => read('spec'), stubTextures: true });
  chars.setAnimations('spec.vrm', anims);
  const voice = installVoice(tree, { resolve: file });
  const doc = scene();
  await audio.prepare(doc); await chars.prepare(doc); await voice.prepare(doc);
  tree.instantiate(doc);
  return { tree, voice, hana: tree.find('hana'), mira: tree.find('mira') };
}
const mouthOf = (c) => Object.fromEntries(VOWELS.map((v) => [v, c.vrm.expressionManager.getValue(v)]));
const open = (m) => VOWELS.reduce((a, v) => a + m[v], 0);

test('a scene connection makes Hana say the line: spoke now, the mouth moves on the step clock, lineEnded after the clip', { skip: SKIP }, async () => {
  const w = await world();
  const seen = [];
  w.hana.on('spoke', (p) => seen.push(['spoke', w.tree.clock.step, p.text]));
  w.hana.on('lineEnded', () => seen.push(['ended', w.tree.clock.step]));
  assert.ok(w.voice.speaking('hana') && w.hana.speaking, 'said on ready');
  assert.equal(seen.length, 0, 'spoke fired before we listened (on ready)');
  const track = buildTrack(timings.words);
  let maxOpen = 0;
  for (let k = 0; k < 330; k++) {
    w.tree.step();
    if (w.hana.speaking) {
      const t = k / 60, m = mouthOf(w.hana), want = sampleMouth(track, t);
      for (const v of VOWELS) assert.ok(Math.abs(m[v] - want[v]) < 1e-6, `step ${k} ${v}: ${m[v]} vs ${want[v]}`);
      maxOpen = Math.max(maxOpen, open(m));
    }
  }
  assert.ok(maxOpen > 0.6, `the mouth opens (${maxOpen.toFixed(2)})`);
  const ended = seen.find((x) => x[0] === 'ended');
  assert.ok(ended && Math.abs(ended[1] - Math.ceil(timings.duration * 60)) <= 1, `ended at step ${ended?.[1]} (clip ${timings.duration} s)`);
  assert.equal(open(mouthOf(w.hana)), 0, 'and the mouth closes');
  // the caption's words: the same as the timings
  w.hana.say({ text: 'One more thing.' });
  w.tree.run(30);
  const cap = w.voice.captions(1)[0];
  assert.deepEqual(cap.words, ['One', 'more', 'thing']);
  assert.ok(cap.word >= 0);
});

test('lip sync against the audio: the mouth leads or lags the clip\'s loudness by no more than 50 ms (the spike\'s measure)', { skip: SKIP }, () => {
  const pcm = wavSamples(file(CLIP)), x = pcm.data[0], rate = pcm.sampleRate;
  const hz = 100, n = Math.floor(pcm.duration * hz), win = Math.round(rate * 0.02);
  const rms = new Float64Array(n), mouth = new Float64Array(n);
  const track = buildTrack(timings.words);
  for (let i = 0; i < n; i++) {
    const c = Math.round((i / hz) * rate); let s = 0, k = 0;
    for (let j = Math.max(0, c - win / 2); j < Math.min(x.length, c + win / 2); j++) { s += x[j] * x[j]; k++; }
    rms[i] = Math.sqrt(s / Math.max(1, k));
    mouth[i] = open(sampleMouth(track, i / hz));
  }
  const corr = (lag) => { // mouth(t) against rms(t + lag): a positive lag is the mouth leading
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, m = 0;
    for (let i = 0; i < n; i++) { const j = i + lag; if (j < 0 || j >= n) continue; const a = mouth[i], b = rms[j]; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; m++; }
    return (m * sab - sa * sb) / Math.sqrt((m * saa - sa * sa) * (m * sbb - sb * sb));
  };
  let best = 0;
  for (let lag = -20; lag <= 20; lag++) if (corr(lag) > corr(best)) best = lag;
  console.log(`  best lag ${best * 10} ms (+ = mouth leads), r ${corr(best).toFixed(3)} at it, r ${corr(0).toFixed(3)} at 0`);
  assert.ok(Math.abs(best * 10) <= 50, `best lag ${best * 10} ms`);
  if (process.env.VRMXG_LIPSYNC_OUT) fs.writeFileSync(process.env.VRMXG_LIPSYNC_OUT, JSON.stringify({ bestLagMs: best * 10, r: +corr(best).toFixed(3), source: 'engine/packages/voice/test/voice.test.mjs, Hana\'s welcome line' }) + '\n');
  assert.ok(corr(best) > 0.3, 'the mouth follows the loudness');
});

test('a run with dialogue is identical twice and restores from a snapshot taken mid-line; faces blink and glance', { skip: SKIP }, async () => {
  const script = (w) => (step) => { if (step === 10) w.hana.lookAt({ target: 'mira' }); if (step === 400) w.mira.say({ text: 'Thanks, Hana. Just a coffee, please.' }); };
  const A = await world(), B = await world();
  const ra = recordRun(A.tree, 600, { onStep: script(A) }), rb = recordRun(B.tree, 600, { onStep: script(B) });
  assert.equal(compareRuns(ra, rb), null);
  // faces: blinks happened, and glances while looking
  const C = await world();
  let blinked = 0, glances = new Set();
  for (let k = 0; k < 600; k++) { script(C)(C.tree.clock.step); C.tree.step(); if (C.hana.vrm.expressionManager.getValue('blink') > 0.9) blinked++; if (C.hana.ctrl.lookOffset) glances.add(C.hana.ctrl.lookOffset.join()); }
  assert.ok(blinked >= 2, `blinks (${blinked} steps shut)`);
  assert.ok(glances.size >= 4, `glances while looking at Mira (${glances.size})`);
  // the look-at aims at Mira's head and stays inside the VRM's limits
  assert.ok(Math.abs(C.hana.vrm.lookAt.pitch) < 30 && Math.abs(C.hana.vrm.lookAt.yaw) < 30);
  // snapshot mid-line (step 150: Hana talking), restore, re-run: identical
  const D = await world();
  recordRun(D.tree, 150, { onStep: script(D) });
  assert.ok(D.hana.speaking);
  const snap = captureWorld(D.tree);
  const rest = recordRun(D.tree, 300, { onStep: script(D) });
  const E = await world();
  restoreWorld(E.tree, snap);
  assert.ok(E.hana.speaking);
  assert.equal(compareRuns(rest, recordRun(E.tree, 300, { onStep: script(E) })), null);
});

test('text-only lines mouth estimated timings; a missing timings file falls back to the same estimate', () => {
  const w = estimateWords('Hello there. How are you?');
  assert.deepEqual(w.map((x) => x.text), ['Hello', 'there', 'How', 'are', 'you']);
  assert.ok(w[2].start - (w[1].start + w[1].duration) > 0.34, 'a pause after the full stop');
  assert.ok(buildTrack(w).length > 5);
});
