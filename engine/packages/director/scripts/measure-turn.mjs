// M3 W3 (AB-T-0542): how long a spoken turn takes, end of speech to the start of the reply's audio, through the loopback
// stand-ins, with the director's design and model (AB-D-0265): the split turn on LFM3-Omni-2B 4-bit.
//
// Each turn: the person's line is synthesised (Kokoro, a different voice) and sent to /transcribe (Omni's own ASR); the
// transcript goes into Hana's line request (persona, history, situation); her line is checked and synthesised by
// /speak. First audio = STT + line + TTS, round trip; the verdict call follows while she speaks, so it is reported
// beside it, not added. The voice-activity detector's end-of-speech wait (EnergyVAD endMs, 450 ms) comes before all of it.
//   node engine/packages/director/scripts/measure-turn.mjs [--url http://127.0.0.1:5191] [--tts http://127.0.0.1:5190]
//       [--model omni4] [--turns 10]
// Writes engine/packages/director/results/turn-<model>.json.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { describeMoment, validate, httpModel, lineRequest, verdictRequest, parseVerdict, cleanLine, salvage } from '@vrmxg/director';
import { corePersona, layer } from '@vrmxg/persona';
import { PRESETS } from '@vrmxg/ai';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const url = opt('--url', 'http://127.0.0.1:5191'), ttsUrl = opt('--tts', url), name = opt('--model', 'omni4'), turns = Number(opt('--turns', 10));
const here = import.meta.dirname, sample = path.resolve(here, '../../../../content/sample');
const app = JSON.parse(fs.readFileSync(path.join(sample, 'personas.json'), 'utf8')).characters['cc97eb67-3eac-41c3-9e91-c15029fb6595'];
const persona = { ...layer(corePersona(JSON.parse(fs.readFileSync(path.join(sample, app.core), 'utf8'))), app), allowedExpressions: ['happy', 'relaxed', 'surprised', 'sad'] };
const moment = {
  agent: 'hana-1', user: 'mira', characters: [],
  items: [{ id: 'stool-1', name: 'Stool', verbs: ['sit'] }, { id: 'stool-2', name: 'Stool', verbs: ['sit'] }, { id: 'door-1', name: 'Staff door', verbs: ['close', 'open'] }],
  expressions: persona.allowedExpressions, gestures: ['cheer', 'greet', 'nod', 'sip'], goals: PRESETS.host.goals,
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

const post = async (base, p, body, type = 'application/json') => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': type }, body: type === 'application/json' ? JSON.stringify(body) : body });
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r.json();
};
const model = httpModel(`${url}/v1/chat/completions`, { model: name, temperature: 0 });

const history = [], rows = [];
for (let i = 0; i < turns; i++) {
  const said = LINES[i % LINES.length];
  const spoken = await post(ttsUrl, '/speak', { text: said, voice: 'af_sky' }); // the person (not timed)
  let t = performance.now();
  const heard = await post(url, '/transcribe', Buffer.from(spoken.wav, 'base64'), 'audio/wav');
  const sttMs = performance.now() - t;
  const base = { persona, history, situation: describeMoment(moment, { userName: 'Mira' }), moment: heard.text };
  t = performance.now();
  const l = await model.respond({ ...lineRequest(base), maxTokens: 90 });
  const lineMs = performance.now() - t;
  const line = cleanLine(l.text, persona.name);
  const ok = validate({ toolCalls: [{ name: 'say', arguments: { text: line, to: 'user' } }] }, moment).ok;
  let ttsMs = null;
  if (ok) { t = performance.now(); await post(ttsUrl, '/speak', { text: line, voice: 'af_heart' }); ttsMs = performance.now() - t; }
  t = performance.now();
  const v = await model.respond({ ...verdictRequest({ moment, name: persona.name, userName: 'Mira', heard: heard.text, line }), maxTokens: 120 });
  const verdictMs = performance.now() - t;
  const s = salvage(line, parseVerdict(v.text) ?? {}, moment, { heard: heard.text, userName: 'Mira', validate });
  history.push({ role: 'user', content: heard.text });
  if (ok) history.push({ role: 'assistant', content: line });
  const row = {
    said, heard: heard.text, line, valid: ok, sttMs: r1(sttMs), lineMs: r1(lineMs), ttsMs: ttsMs && r1(ttsMs), verdictMs: r1(verdictMs),
    firstAudioMs: ok ? r1(sttMs + lineMs + ttsMs) : null, calls: s.ok ? s.calls.filter((c) => c.name !== 'say').map((c) => ({ name: c.name, ...c.args })) : null, face: s.ok ? s.calls[0].args : null, dropped: s.ok ? s.dropped : null,
  };
  rows.push(row);
  console.log(`${String(i + 1).padStart(2)} ${row.firstAudioMs ?? '   —  '} ms  stt ${row.sttMs} line ${row.lineMs} tts ${row.ttsMs} (verdict ${row.verdictMs})  heard "${heard.text}" → "${line}" ${JSON.stringify(row.calls)}`);
}

const good = rows.filter((r) => r.firstAudioMs !== null), steady = good.slice(1);
const stat = (k, xs = steady) => { const v = xs.map((r) => r[k]).sort((a, b) => a - b); return v.length ? { median: v[Math.floor(v.length / 2)], max: v.at(-1), mean: r1(v.reduce((s, x) => s + x, 0) / v.length) } : null; };
const out = {
  when: new Date().toISOString(), url, ttsUrl, hardware: 'Mac Studio M5 Max (Mac17,14)', design: 'split',
  models: { llm: `${name} (greedy)`, stt: name === 'omni4' ? 'LFM3-Omni-2B 4-bit, its own ASR' : 'the stand-in\'s', tts: 'mlx-community/Kokoro-82M-bf16' },
  turns: rows.length, validLines: good.length, heardExactly: rows.filter((r) => r.heard.replace(/[^a-z ]/gi, '').toLowerCase().trim() === r.said.replace(/[^a-z ]/gi, '').toLowerCase().trim()).length,
  steady: { firstAudioMs: stat('firstAudioMs'), sttMs: stat('sttMs'), lineMs: stat('lineMs'), ttsMs: stat('ttsMs'), verdictMs: stat('verdictMs') },
  vadEndMs: 450, note: 'firstAudioMs = STT + line + whole-line TTS round trips, steady state (first turn left out); the verdict follows while she speaks; end of speech to first audio adds the detector\'s 450 ms wait',
  rows,
};
fs.mkdirSync(path.join(here, '../results'), { recursive: true });
fs.writeFileSync(path.join(here, `../results/turn-${name}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ ...out, rows: undefined }, null, 1));
function r1(x) { return Math.round(x * 10) / 10; }
