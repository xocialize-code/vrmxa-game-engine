// Live-line latency (M2 W10 receipt): times httpTTS against a running loopback TTS server (content/sample/tools/
// tts-server.py, Kokoro-82M through mlx-audio) for the sample's short NPC lines in two voices. Writes results/live-tts.json.
//   node engine/packages/voice/tools/tts-bench.mjs [http://127.0.0.1:5190/speak]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { httpTTS } from '../src/index.js';
import { wavInfo } from '@vrmxg/audio';

const url = process.argv[2] ?? 'http://127.0.0.1:5190/speak';
const p = httpTTS(url);
const lines = ['Welcome in!', 'Hi! What can I get you?', 'A latte, please.', 'Coming right up!', 'Here you go. Enjoy!',
  'Careful with that sword. The last person who swung it broke a lamp.', 'Morning! The usual? I saw you walk past yesterday and thought you might come in.'];
await p.speak({ text: 'Warm up.', voice: 'af_heart' });
const runs = [];
for (const voice of ['af_heart', 'am_adam']) for (let rep = 0; rep < 2; rep++) for (const text of lines) {
  const t0 = performance.now(); const r = await p.speak({ text, voice }); const ms = performance.now() - t0;
  const info = wavInfo(r.wav);
  runs.push({ voice, rep, words: text.split(/\s+/).length, ms: +ms.toFixed(1), audio: +info.duration.toFixed(3), timedWords: r.words?.length ?? 0 });
}
const ms = runs.map((r) => r.ms).sort((a, b) => a - b);
const q = (f) => ms[Math.min(ms.length - 1, Math.floor(f * ms.length))];
const out = { url: url.replace(/\/\/[^/]+/, '//loopback'), model: 'Kokoro-82M bf16 (mlx-audio)', machine: `${os.cpus()[0].model}, ${Math.round(os.totalmem() / 2 ** 30)} GB`, node: process.version,
  lines: runs.length, ms: { p50: q(0.5), p90: q(0.9), max: ms.at(-1) }, stepsLate: { p50: Math.ceil(q(0.5) / (1000 / 60)), p90: Math.ceil(q(0.9) / (1000 / 60)) },
  rtf: +(runs.reduce((a, r) => a + r.ms / 1000 / r.audio, 0) / runs.length).toFixed(4), everyWordTimed: runs.every((r) => r.timedWords === r.words), runs };
fs.mkdirSync(path.join(import.meta.dirname, '../results'), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, '../results/live-tts.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ ...out, runs: undefined }));
