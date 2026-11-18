// W5 (AB-T-0517): sound as presentation over a simulated playing state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { worldHashes, hashValue, captureWorld, restoreWorld } from '@vrmxg/snapshot';
import { installAudio, AudioOutput, writeWav, wavInfo, wavSamples } from '../src/index.js';
import { FakeAudioContext } from './fake-context.mjs';

installPortableMath();
const tone = (seconds, rate = 24000) => { const n = Math.round(seconds * rate), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate); return writeWav([a], rate); };
const files = { 'sounds/click.wav': tone(0.5), 'sounds/hum.wav': tone(2) };
const doc = () => ({
  format: 'vrmxs', version: 1, id: 'audio',
  assets: [{ id: 'click', type: 'audio', ref: 'sounds/click.wav' }, { id: 'hum', type: 'audio', ref: 'sounds/hum.wav' }],
  nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'music', type: 'AudioPlayer', parent: 'root', asset: 'hum', props: { bus: 'music', loop: true, autoplay: true, volume: 0.5 } },
    { id: 'door-sound', type: 'AudioPlayer3D', parent: 'root', asset: 'click', transform: { p: [3, 1, -2] }, props: { refDistance: 2 } },
    { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0, 1.6, 5] } },
  ],
});

async function world(output = null) {
  const tree = new SceneTree({ registry: m0Registry(), seed: 1 });
  const { installCameras } = await import('@vrmxg/camera');
  installCameras(tree);
  const audio = installAudio(tree, { resolve: (r) => files[r], output });
  const d = doc();
  await audio.prepare(d);
  tree.instantiate(d);
  return { tree, audio, door: tree.find('door-sound'), music: tree.find('music') };
}

test('WAV headers give a clip\'s exact length; samples read back', () => {
  const info = wavInfo(files['sounds/click.wav']);
  assert.deepEqual([info.sampleRate, info.channels, info.frames, info.duration], [24000, 1, 12000, 0.5]);
  assert.ok(Math.abs(wavSamples(files['sounds/click.wav']).data[0][100] - 0.5 * Math.sin((2 * Math.PI * 440 * 100) / 24000)) < 1e-4);
});

test('a player plays from the step play() is called on and finishes on the step its clip ends; loops never finish', async () => {
  const w = await world();
  const seen = [];
  w.door.on('started', () => seen.push(['started', w.tree.clock.step]));
  w.door.on('finished', (p) => seen.push(['finished', w.tree.clock.step, p.stopped]));
  assert.ok(w.music.playing, 'autoplay');
  w.tree.run(10);
  w.door.call('play');
  assert.deepEqual(w.door.getState(), { playing: true, startStep: 10 });
  w.tree.run(40);
  assert.deepEqual(seen, [['started', 10], ['finished', 39, false]], '0.5 s = 30 steps: steps 10 to 39');
  w.tree.run(200);
  assert.ok(w.music.playing, 'a loop keeps playing');
  w.door.call('play'); w.door.call('stop');
  assert.deepEqual(seen.at(-1), ['finished', 250, true]);
});

test('sound never changes the simulation: the same run hashes the same with an output and without; snapshots restore mid-clip', async () => {
  const run = async (output) => {
    const w = await world(output);
    const hashes = [];
    for (let i = 0; i < 180; i++) {
      if (i === 20 || i === 100) w.door.call('play');
      w.tree.step();
      w.tree.present(i / 60, 0.5); // what a render host does every frame
      if (output) { output.ctx.currentTime += 1 / 60; await null; } // decodes resolve between frames
      hashes.push(hashValue(worldHashes(w.tree)));
    }
    return { hashes, w };
  };
  const quiet = await run(null);
  const out = new AudioOutput({ context: /** @type {any} */ (new FakeAudioContext()) });
  const loud = await run(out);
  assert.deepEqual(loud.hashes, quiet.hashes);
  await new Promise((r) => setTimeout(r, 0)); // decodes resolve
  assert.ok(out.ctx.started.length >= 2, 'the music and the door were scheduled');
  // snapshot while the door plays, restore on a fresh tree: the door is still playing from the same step
  const a = await world();
  a.tree.run(5); a.door.call('play'); a.tree.run(10);
  const snap = captureWorld(a.tree);
  const b = await world();
  restoreWorld(b.tree, snap);
  assert.deepEqual(b.door.getState(), { playing: true, startStep: 5 });
});

test('live: a sound starts at the offset the step clock gives (plus the output latency), positional ones at their place; stop and restart follow', async () => {
  const ctx = new FakeAudioContext();
  const out = new AudioOutput({ context: /** @type {any} */ (ctx) });
  const w = await world(out);
  w.tree.run(30);
  w.door.call('play');           // step 30
  w.tree.run(12);                // clock at 42
  w.tree.present(0, 0.5);        // showing step 41.5: 11.5 steps into the clip
  await new Promise((r) => setTimeout(r, 0));
  const door = w.audio.voices.get('node:door-sound');
  assert.ok(Math.abs(door.offset - (11.5 / 60 + 0.02)) < 1e-9, `offset ${door.offset}`);
  assert.deepEqual([door.panner.positionX.value, door.panner.positionY.value, door.panner.positionZ.value], [3, 1, -2]);
  assert.equal(ctx.listener.positionZ.value, 5, 'the listener is the current camera');
  w.door.call('stop'); w.tree.step(); w.tree.present(0, 1);
  assert.ok(!w.audio.voices.has('node:door-sound'));
  // the music bus: volume and mute are settings, not simulation
  out.setBus('music', { volume: 0.25 }); out.setBus('music', { muted: true });
  assert.deepEqual(out.settings().music, { volume: 0.25, muted: true });
  assert.equal(out.buses.music.gain.gain.value, 0);
});

test('the recorder keeps, per step, what plays and where the listener is (plain data for the offline mix)', async () => {
  const w = await world();
  w.audio.record();
  w.tree.run(5); w.door.call('play'); w.tree.run(5);
  const r = w.audio.recording();
  assert.equal(r.steps.length, 10);
  assert.deepEqual(r.steps[0].sounds.map((s) => s.key), ['node:music']);
  assert.deepEqual(r.steps[5].sounds.map((s) => [s.key, s.startStep]), [['node:music', 0], ['node:door-sound', 5]]);
  assert.deepEqual(r.steps[5].sounds[1].position, [3, 1, -2]);
  assert.deepEqual(r.steps[0].listener.p, [0, 1.6, 5]);
  assert.doesNotThrow(() => JSON.stringify(r));
});
