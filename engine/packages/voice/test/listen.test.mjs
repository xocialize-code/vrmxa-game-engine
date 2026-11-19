// M3 W3 (AB-T-0542): listening without a microphone or a model. The energy detector on synthetic frames (start after
// 80 ms of speech, end after 450 ms of quiet, the pre-roll kept, short blips flagged, a rising noise floor followed), the
// WAV encoder, the STT providers' wire shapes, and listenTo driving a director: speaking on and off, then the transcript.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnergyVAD, encodeWav, listenTo, httpSTT, shellSTT } from '@vrmxg/voice';

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
