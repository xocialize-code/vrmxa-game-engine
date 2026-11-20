// M3 W3 (AB-T-0542): listening without a microphone or a model. The energy detector on synthetic frames (start after
// 80 ms of speech, end after 450 ms of quiet, the pre-roll kept, short blips flagged, a rising noise floor followed), the
// WAV encoder, the STT providers' wire shapes, and listenTo driving a director: speaking on and off, then the transcript.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnergyVAD, encodeWav, decodeWav, wavFrames, listenTo, httpSTT, shellSTT, shellListen } from '@vrmxg/voice';

const RATE = 16000, N = 320; // 20 ms frames
const quiet = (a = 0.001) => Float32Array.from({ length: N }, (_, i) => a * Math.sin(i * 0.7));
const loud = (a = 0.2) => Float32Array.from({ length: N }, (_, i) => a * Math.sin(i * 0.3));

test('the detector: starts after 80 ms of speech, ends after 450 ms of quiet, keeps the pre-roll, flags blips', () => {
  const vad = new EnergyVAD({ rate: RATE });
  const events = [];
  const run = (frame, n) => { for (let i = 0; i < n; i++) events.push(...vad.feed(frame)); };
  run(quiet(), 50); run(loud(), 50); run(quiet(), 30);
  const [start, end] = events;
  assert.equal(start.type, 'start'); assert.equal(start.frame, 50 + 4, 'four loud frames (80 ms) start it');
  assert.equal(end.type, 'end'); assert.equal(end.frame, 100 + 23, 'about 23 quiet frames (450 ms) end it');
  assert.equal(end.short, false);
  assert.equal(end.audio.length, (10 + 50 + 23) * N, 'the utterance: 200 ms of pre-roll, all 50 loud frames, the trailing quiet');
  events.length = 0; run(loud(), 6); run(quiet(), 30);
  assert.equal(events.at(-1).short, true, 'a 120 ms blip is flagged short');
  const noisy = new EnergyVAD({ rate: RATE });
  for (let i = 0; i < 200; i++) assert.deepEqual(noisy.feed(quiet(0.02)), [], 'steady room noise never starts speech');
  assert.ok(noisy.threshold > 0.02, `the threshold followed the noise (${noisy.threshold.toFixed(4)})`);
});

test('the WAV encoder writes 16-bit mono PCM', () => {
  const w = encodeWav(Float32Array.from([0, 0.5, -1, 1]), RATE), v = new DataView(w.buffer);
  assert.equal(new TextDecoder().decode(w.subarray(0, 4)), 'RIFF');
  assert.equal(v.getUint32(24, true), RATE); assert.equal(v.getUint16(34, true), 16); assert.equal(v.getUint32(40, true), 8);
  assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)], [0, 16383, -32768, 32767]);
});

test('the STT providers: the loopback posts the WAV, the shell sends base64', async () => {
  let sent = null;
  const http = httpSTT('http://127.0.0.1:5191/transcribe', { fetch: async (url, o) => { sent = { url, o }; return { ok: true, json: async () => ({ text: ' Hello. ', ms: 90 }) }; } });
  assert.deepEqual(await http.transcribe(new Uint8Array([1, 2, 3])), { text: 'Hello.', ms: 90 });
  assert.equal(sent.o.headers['Content-Type'], 'audio/wav');
  let call = null;
  const shell = shellSTT({ call: async (m, a) => { call = [m, a]; return { text: 'Hi' }; } });
  assert.equal((await shell.transcribe(new Uint8Array([1, 2, 3]))).text, 'Hi');
  assert.deepEqual(call, ['stt.transcribe', { wav: 'AQID' }]);
});

test('listenTo: speaking on at the start, off at the end, then the transcript to the director; blips and noise tags dropped', async () => {
  const told = [];
  const director = { speaking: (agent, on) => told.push(['speaking', agent, on]), talk: (agent, text) => told.push(['talk', agent, text]) };
  const texts = ['Could I get a latte?', '[BLANK_AUDIO]'];
  const l = listenTo({ director, agent: 'hana-1', stt: { transcribe: async () => ({ text: texts.shift() }) } });
  const feed = (f, n) => { for (let i = 0; i < n; i++) l.feed(f); };
  feed(quiet(), 20); feed(loud(), 40); feed(quiet(), 30);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(told, [['speaking', 'hana-1', true], ['speaking', 'hana-1', false], ['talk', 'hana-1', 'Could I get a latte?']]);
  feed(loud(), 5); feed(quiet(), 30); // a blip: no transcription
  feed(loud(), 40); feed(quiet(), 30); // whisper's tag for silence: not said to her
  await new Promise((r) => setImmediate(r));
  assert.equal(told.filter((t) => t[0] === 'talk').length, 1);
});

test('decodeWav reads back what encodeWav wrote (16-bit) and 32-bit float', () => {
  const x = Float32Array.from({ length: 100 }, (_, i) => Math.sin(i / 5) * 0.5);
  const { samples, rate } = decodeWav(encodeWav(x, 24000));
  assert.equal(rate, 24000);
  assert.equal(samples.length, 100);
  for (let i = 0; i < 100; i++) assert.ok(Math.abs(samples[i] - x[i]) < 1e-4);
  const f = new Uint8Array(44 + 8), v = new DataView(f.buffer);
  f.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); f.set([...'WAVEfmt '].map((c) => c.charCodeAt(0)), 8);
  v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint16(34, 32, true);
  f.set([...'data'].map((c) => c.charCodeAt(0)), 36); v.setUint32(40, 8, true); v.setFloat32(44, 0.25, true); v.setFloat32(48, -0.5, true);
  assert.deepEqual([...decodeWav(f).samples], [0.25, -0.5]);
  assert.throws(() => decodeWav(new Uint8Array(12)), /not a WAV/);
});

test('wavFrames: a recording as a live microphone, paced by the clock, with lead and tail silence, then the detector hears it', async () => {
  const speech = Float32Array.from({ length: 16000 }, (_, i) => 0.2 * Math.sin(i * 0.3)); // 1 s at 16 kHz
  let clock = 0, pump = null;
  const frames = [], ends = [];
  const feed = wavFrames(encodeWav(speech, 16000), (f) => frames.push(Float32Array.from(f)), {
    leadMs: 400, tailMs: 600, now: () => clock, onSpeechEnd: (t) => ends.push(t), tick: (fn) => { pump = fn; return 1; }, untick: () => { pump = null; },
  });
  clock = 100; pump(); assert.equal(frames.length, 5, 'only the frames due by the clock');
  clock = 5000; pump();
  await feed.done;
  assert.equal(frames.length, 100, '0.4 + 1 + 0.6 s of 20 ms frames');
  assert.deepEqual(ends, [5000], 'the end of speech is reported once, when its last frame went in');
  assert.ok(frames[0].every((s) => s === 0) && frames[99].every((s) => s === 0) && frames[50].some((s) => s !== 0));
  const vad = new EnergyVAD(), events = frames.flatMap((f) => vad.feed(f)).map((e) => e.type);
  assert.deepEqual(events, ['start', 'end']);
});

test('shellListen: the shell\'s microphone events drive the director, and it reopens after each utterance until stopped', async () => {
  const calls = [], handlers = new Map(), said = [], speaking = [];
  const native = {
    async call(m, p) { calls.push([m, p]); return m === 'stt.listen' ? { listening: true } : { listening: false }; },
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
  };
  const director = { speaking: (a, on) => speaking.push([a, on]), talk: (a, t) => said.push([a, t]) };
  const heard = [];
  const l = shellListen({ native, director, agent: 'hana-1', onTranscript: (t) => heard.push(t.text) });
  await l.start();
  const emit = (e) => handlers.get('stt.event')(e);
  emit({ type: 'listening' }); emit({ type: 'speechStarted' }); emit({ type: 'partial', text: 'a lat' }); emit({ type: 'speechEnded' });
  emit({ type: 'final', text: ' A latte, please. ' });
  emit({ type: 'final', text: '[noise]' });
  assert.deepEqual(speaking, [['hana-1', true], ['hana-1', false]]);
  assert.deepEqual(said, [['hana-1', 'A latte, please.']], 'noise tags are not said');
  assert.deepEqual(heard, ['A latte, please.']);
  assert.equal(calls.filter(([m]) => m === 'stt.listen').length, 3, 'opened, then reopened after each final');
  await l.stop();
  assert.deepEqual(calls.at(-1), ['stt.stop', { cancel: true }]);
  assert.equal(handlers.has('stt.event'), false, 'unsubscribed');
});
