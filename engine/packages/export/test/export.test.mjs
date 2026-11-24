// M1 W8 (AB-T-0520) in Node: the frame plan, the export loop against a stand-in renderer and GL (what the frames show,
// at which steps and α, the simulation untouched, two exports the same), and the take's mix shifted one step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour, frameToStep } from '@vrmxg/core';
import { installCameras } from '@vrmxg/camera';
import { worldHashes } from '@vrmxg/snapshot';
import { RenderHost } from '@vrmxg/render';
import { wavInfo, wavSamples } from '@vrmxg/audio';
import { exportTake, mixTake, hashSink, framesFor, stepsFor, audioSamples, secondsOf, framePlan, RATES } from '@vrmxg/export';

installPortableMath();
const reg = m0Registry();

// Moves +X at 3 m/s on the simulation clock.
class Mover extends Behaviour { physicsProcess(dt) { this.node.object3d.position.x += 3 * dt; } }
function world() {
  const tree = new SceneTree({ registry: reg, behaviours: new Map([['mover', Mover]]), seed: 1 });
  installCameras(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'w8', nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'box', type: 'Node3D', parent: 'root', behaviours: [{ use: 'mover' }] },
    { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0, 1, 5] } },
  ] });
  return tree;
}

// A renderer + GL stand-in: render() notes where the box is drawn; readPixels writes that and a frame count.
function fakeRenderer(tree) {
  const gl = { drawingBufferWidth: 0, drawingBufferHeight: 0, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, drawnX: NaN, renders: 0,
    readPixels(x, y, w, h, f, t, out) { const dv = new DataView(out.buffer, out.byteOffset, out.byteLength); dv.setFloat64(0, this.drawnX); dv.setUint32(8, this.renders); } };
  return {
    gl, shadowMap: { enabled: false }, ratio: 1,
    setPixelRatio(r) { this.ratio = r; }, getPixelRatio() { return this.ratio; },
    setSize(w, h) { gl.drawingBufferWidth = w * this.ratio; gl.drawingBufferHeight = h * this.ratio; },
    getContext() { return gl; }, dispose() {},
    render(scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld?.(); gl.drawnX = tree.find('box').object3d.matrixWorld.elements[12]; gl.renders++; },
  };
}
function recordingSink() {
  const s = { frames: [], job: null, wav: null, ended: false, cancelled: false,
    begin(job) { s.job = job; return { id: 't' }; },
    frame(n, bytes) { const dv = new DataView(bytes.buffer, bytes.byteOffset); s.frames.push({ n, x: dv.getFloat64(0), render: dv.getUint32(8) }); return new Promise((r) => setTimeout(r, 0)); },
    audio(wav) { s.wav = wav; }, end() { s.ended = true; return { ok: true }; }, cancel() { s.cancelled = true; } };
  return s;
}

test('the frame plan: every rate lands on exact steps and α', () => {
  assert.deepEqual(framePlan(3, RATES['30']), [{ step: 0, alpha: 0 }, { step: 2, alpha: 0 }, { step: 4, alpha: 0 }]);
  assert.deepEqual(framePlan(3, RATES['24']).map((f) => [f.step, f.alpha]), [[0, 0], [2, 0.5], [5, 0]]);
  assert.equal(framesFor(10, RATES['29.97']), 300, '10 s at 29.97 rounds to 300 frames');
  assert.equal(secondsOf(300, RATES['29.97']), 10.01, '300 frames at 30000/1001 last 10.01 s');
  assert.equal(stepsFor(300, RATES['30']), 600);
  assert.equal(frameToStep(300, RATES['29.97']).step, 600, '…and step 600.6 → 600');
  assert.equal(audioSamples(300, RATES['30']), 480000);
  assert.equal(audioSamples(300, RATES['29.97']), 480480);
});

test('an export shows what live play shows, frame for frame, and never changes the simulation', async () => {
  const fps = RATES['24'], frames = framesFor(2, fps);
  const tree = world(), host = new RenderHost({ renderer: fakeRenderer(tree), dprCap: 1 });
  const sink = recordingSink();
  const r = await exportTake({ tree, host, fps, frames, width: 64, height: 36, sink, audio: false, job: { codec: 'h264' } });
  assert.equal(sink.frames.length, frames);
  assert.deepEqual(sink.frames.map((f) => f.n), [...Array(frames).keys()], 'in order, each once');
  assert.deepEqual(sink.job, { width: 64, height: 36, fps: [24, 1], frames, audio: false, topDown: false, codec: 'h264' });
  assert.ok(sink.ended && !sink.cancelled);
  // frame n blends steps s − 1 and s at α: the box at 3 m/s × (s − 1 + α) / 60, exactly live play's lag. Frame 0 would
  // reach back to step 0, the world before anything ran, so it shows step 1 as simulated (AB-T-0595)
  for (const f of sink.frames) {
    const { step, alpha } = frameToStep(f.n, fps);
    const want = (3 * Math.max(1, step - 1 + alpha)) / 60;
    assert.ok(Math.abs(f.x - want) < 1e-9, `frame ${f.n}: drawn at ${f.x}, want ${want}`);
  }
  assert.deepEqual(sink.frames.map((f) => f.render), [...Array(frames).keys()].map((n) => n + 1), 'one render per frame, read back in its own frame (no warm-up draw off WebGPU)');
  assert.equal(r.steps, frameToStep(frames - 1, fps).step, 'no tail without sound');
  // the simulation after the export = a headless run of as many steps
  const headless = world(); headless.run(r.steps);
  assert.deepEqual(worldHashes(tree), worldHashes(headless));
});

test('two exports of the same take hash the same frame for frame; a started tree is refused', async () => {
  const run = async () => {
    const tree = world(), host = new RenderHost({ renderer: fakeRenderer(tree), dprCap: 1 }), sink = hashSink();
    await exportTake({ tree, host, fps: RATES['29.97'], frames: 40, width: 32, height: 18, sink, audio: false });
    return sink.hashes;
  };
  const a = await run(), b = await run();
  assert.equal(a.length, 40);
  assert.deepEqual(a, b);
  assert.ok(new Set(a).size > 30, 'the frames differ from each other');
  const tree = world(); tree.step();
  await assert.rejects(exportTake({ tree, host: new RenderHost({ renderer: fakeRenderer(tree) }), fps: 30, frames: 2, width: 8, height: 8, sink: hashSink(), audio: false }), /step 0/);
});

test('a cancelled export tells the sink', async () => {
  const tree = world(), host = new RenderHost({ renderer: fakeRenderer(tree), dprCap: 1 }), sink = recordingSink();
  const signal = { aborted: false };
  await assert.rejects(exportTake({ tree, host, fps: 30, frames: 30, width: 16, height: 9, sink, audio: false, signal, onProgress: (p) => { if (p.n >= 10) signal.aborted = true; } }), /cancelled/);
  assert.ok(sink.cancelled && !sink.ended);
});

// An OfflineAudioContext stand-in: renders each source as an impulse where it starts.
class ImpulseContext {
  constructor({ numberOfChannels, length, sampleRate }) { Object.assign(this, { numberOfChannels, length, sampleRate }); this.when = null; this.destination = { connect() {} }; this.listener = {}; }
  createBufferSource() { const ctx = this; return { buffer: null, loop: false, connect: (x) => x, start(when) { ctx.when = when; }, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {} }, connect: (x) => x }; }
  createPanner() { return { connect: (x) => x }; }
  async startRendering() {
    const d = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
    for (const c of d) c[Math.round(this.when * this.sampleRate)] = 0.5;
    return { numberOfChannels: this.numberOfChannels, getChannelData: (c) => d[c] };
  }
}

test("the take's mix: a sound begun on step k is heard from (k + 1) / 60 s, cut to the frames' length", async () => {
  const sounds = (step) => (step >= 30 ? [{ key: 'node:door', startStep: 30, ref: 'door.wav', loop: false, gain: 1 }] : []);
  const steps = Array.from({ length: 61 }, (_, step) => ({ step, sounds: sounds(step), listener: null }));
  const sound = { recording: () => ({ from: 0, to: 61, steps }), library: { buffer: async () => ({ duration: 1 }) } };
  const m = await mixTake(sound, 30, RATES['30'], { OfflineAudioContext: ImpulseContext });
  const info = wavInfo(m.wav);
  assert.equal(info.sampleRate, 48000);
  assert.equal(m.samples, 48000, '30 frames at 30 fps: 1 s');
  const ch = wavSamples(m.wav).data[0];
  assert.equal(ch.length, 48000);
  const onset = ch.findIndex((v) => v !== 0);
  assert.equal(onset, (31 * 48000) / 60, `onset at sample ${onset}: step 30 + 1`);
});

test('a take is exported at its world\'s fixed aspect (M3 W4, AB-T-0538): another shape is refused, not reframed', async () => {
  const tree = world();
  await assert.rejects(exportTake({ tree, host: new RenderHost({ renderer: fakeRenderer(tree), dprCap: 1 }), fps: 30, frames: 2, width: 8, height: 8, sink: hashSink(), audio: false }), /fixed aspect of 1\.7778; 8×8/);
});

test('a cancel at the last frame still stops the export before the sink finishes the file (M4 W5)', async () => {
  const tree = world(), host = new RenderHost({ renderer: fakeRenderer(tree), dprCap: 1 }), sink = recordingSink();
  const signal = { aborted: false };
  // frames 0..10: the last frame's progress (n 10) is where the cancel lands; the frame loop has no frame left to check it
  await assert.rejects(exportTake({ tree, host, fps: 30, frames: 11, width: 16, height: 9, sink, audio: false, signal, onProgress: (p) => { if (p.n === 10 && p.phase === 'frames') signal.aborted = true; } }), /cancelled/);
  assert.ok(sink.cancelled && !sink.ended, 'the sink cancelled (the shell removes the file), never ended');
});
