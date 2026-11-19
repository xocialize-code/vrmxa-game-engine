// M3 W3 (AB-T-0542): how long a spoken turn takes, end of speech to the start of the reply's audio, through the loopback
// stand-in (content/sample/tools/voice-server.py) with the director's real prompt and tools for Hana in the cafe.
//
// Each turn: the person's line is synthesised (Kokoro, a different voice), sent to /transcribe as a WAV, the transcript
// goes into Hana's prompt (persona, history, moment) and to /v1/chat/completions with her tools, the reply is validated
// against the moment, and its line is synthesised by /speak. The turn is STT + LLM + TTS, timed here round trip; the
// voice-activity detector's end-of-speech wait (EnergyVAD endMs, 450 ms) comes before it and is reported beside it.
//   node engine/packages/director/scripts/measure-turn.mjs [--url http://127.0.0.1:5191] [--turns 10]
// Writes engine/packages/director/results/turn-t<temperature>.json. [--temp 0.6]
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildMessages, describeMoment, toolsFor, validate, httpModel } from '@vrmxg/director';
import { corePersona, layer } from '@vrmxg/persona';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const url = opt('--url', 'http://127.0.0.1:5191'), turns = Number(opt('--turns', 10));
const here = import.meta.dirname, sample = path.resolve(here, '../../../../content/sample');
const app = JSON.parse(fs.readFileSync(path.join(sample, 'personas.json'), 'utf8')).characters['cc97eb67-3eac-41c3-9e91-c15029fb6595'];
const persona = { ...layer(corePersona(JSON.parse(fs.readFileSync(path.join(sample, app.core), 'utf8'))), app), allowedExpressions: ['happy', 'relaxed', 'surprised', 'sad'] };
const moment = {
  agent: 'hana-1', user: 'mira', characters: [],
  items: [{ id: 'stool-1', name: 'Stool', verbs: ['sit'] }, { id: 'stool-2', name: 'Stool', verbs: ['sit'] }, { id: 'door-1', name: 'Staff door', verbs: ['close', 'open'] }],
  expressions: persona.allowedExpressions, gestures: ['cheer', 'greet', 'nod', 'sip'], goals: app.goals,
};
const LINES = [
  'Good morning, Hana!',
  'Could I get a latte, please?',
  'How long have you been running this place?',
  'What do you recommend today?',
  'Is it always this quiet in the morning?',
  'Can I sit by the window?',
  'That smells amazing.',
  'Do you have anything without milk?',
  'Thanks, you are the best.',
  'I should get going. See you tomorrow!',
];

const post = async (p, body, type = 'application/json') => {
  const r = await fetch(url + p, { method: 'POST', headers: { 'Content-Type': type }, body: type === 'application/json' ? JSON.stringify(body) : body });
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r.json();
};
const temperature = Number(opt('--temp', 0.6));
const model = httpModel(`${url}/v1/chat/completions`, { model: 'lfm2.5-8b-a1b-int4', temperature });

const history = [], rows = [];
for (let i = 0; i < turns; i++) {
  const line = LINES[i % LINES.length];
  const spoken = await post('/speak', { text: line, voice: 'af_sky' }); // the person (not timed)
  const wav = Buffer.from(spoken.wav, 'base64');
  let t = performance.now();
  const heard = await post('/transcribe', wav, 'audio/wav');
  const sttMs = performance.now() - t;
  const messages = buildMessages({ persona, history, situation: describeMoment(moment, { userName: 'Mira' }), moment: heard.text });
  t = performance.now();
  const reply = await model.respond({ messages, tools: toolsFor(moment), maxTokens: 160 });
  const llmMs = performance.now() - t;
  const v = validate(reply, moment);
  const sayCall = v.ok ? v.calls.find((c) => c.name === 'say') : null;
  let ttsMs = null;
  if (sayCall) { t = performance.now(); await post('/speak', { text: sayCall.args.text, voice: 'af_heart' }); ttsMs = performance.now() - t; }
  history.push({ role: 'user', content: heard.text });
  if (sayCall) history.push({ role: 'assistant', content: sayCall.args.text });
  const row = {
    said: line, heard: heard.text, seconds: heard.seconds, sttMs: r1(sttMs), llmMs: r1(llmMs), ttsMs: ttsMs && r1(ttsMs),
    turnMs: sayCall ? r1(sttMs + llmMs + ttsMs) : null, valid: v.ok, toolCalls: reply.toolCalls.length, textOnly: !reply.toolCalls.length && !!reply.text,
    calls: v.ok ? v.calls.map((c) => ({ name: c.name, ...c.args })) : null, errors: v.ok ? null : v.errors,
  };
  rows.push(row);
  console.log(`${String(i + 1).padStart(2)} ${row.turnMs ?? '   —  '} ms  stt ${row.sttMs} llm ${row.llmMs} tts ${row.ttsMs}  ${v.ok ? '' : 'INVALID '}${JSON.stringify(row.calls ?? row.errors).slice(0, 110)}`);
}

const ok = rows.filter((r) => r.turnMs !== null), steady = ok.slice(1);
const stat = (k, xs = steady) => { const v = xs.map((r) => r[k]).sort((a, b) => a - b); return v.length ? { median: v[Math.floor(v.length / 2)], max: v.at(-1), mean: r1(v.reduce((s, x) => s + x, 0) / v.length) } : null; };
const out = {
  when: new Date().toISOString(), url, hardware: 'Mac Studio M5 Max (Mac17,14)', models: { llm: 'mlx-community/LFM2.5-8B-A1B-MLX-4bit (reasoning skipped)', stt: 'mlx-community/whisper-large-v3-turbo', tts: 'mlx-community/Kokoro-82M-bf16' },
  temperature, turns: rows.length, valid: rows.filter((r) => r.valid).length, withLine: ok.length, textOnlyReplies: rows.filter((r) => r.textOnly).length,
  steady: { turnMs: stat('turnMs'), sttMs: stat('sttMs'), llmMs: stat('llmMs'), ttsMs: stat('ttsMs') },
  vadEndMs: 450, note: 'turnMs = STT + LLM + whole-line TTS round trips, steady state (first turn left out); end of speech to first audio adds the detector\'s 450 ms end-of-speech wait',
  rows,
};
fs.mkdirSync(path.join(here, '../results'), { recursive: true });
fs.writeFileSync(path.join(here, `../results/turn-t${temperature}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ ...out, rows: undefined }, null, 1));
function r1(x) { return Math.round(x * 10) / 10; }
