// M3 director model evaluation: which local model, and which turn design, gives Hana good replies in the cafe.
//
// 32 typed turns with checks (small talk, orders, things that only sound like orders, looking and using things,
// goodbyes and things that only sound like them, a follower's commands), each asked with the director's real prompt,
// tools and validation, in two designs:
//   one     one call with tools (W0's design: say and the actions as tool calls)
//   split   a line call, then a JSON verdict call (split.js, from the companion's spike AB-R-1017)
// of each model the loopback stand-in holds (content/sample/tools/voice-server.py --llm …), greedy. Scores: valid
// replies with a line, echoes, too-long lines, and each turn's checks; server time per reply.
//   node engine/packages/director/scripts/eval-models.mjs [--url http://127.0.0.1:5192] [--models lfm25,omni4,…] [--designs one,split]
// Writes engine/packages/director/results/models.json and models.md.
import fs from 'node:fs';
import path from 'node:path';
import { buildMessages, describeMoment, toolsFor, validate, lineRequest, verdictRequest, parseVerdict, cleanLine, salvage, isGoodbye } from '@vrmxg/director';
import { corePersona, layer } from '@vrmxg/persona';
import { PRESETS } from '@vrmxg/ai';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const url = opt('--url', 'http://127.0.0.1:5192');
const models = opt('--models', 'lfm25,omni4,lfm3fast,qwen4').split(','), designs = opt('--designs', 'one,split').split(',');
const here = import.meta.dirname, sample = path.resolve(here, '../../../../content/sample');
const app = JSON.parse(fs.readFileSync(path.join(sample, 'personas.json'), 'utf8')).characters['cc97eb67-3eac-41c3-9e91-c15029fb6595'];
const hana = { ...layer(corePersona(JSON.parse(fs.readFileSync(path.join(sample, app.core), 'utf8'))), app), allowedExpressions: ['happy', 'relaxed', 'surprised', 'sad'] };
const items = [
  { id: 'stool-1', name: 'Stool', verbs: ['sit'] }, { id: 'stool-2', name: 'Stool', verbs: ['sit'] },
  { id: 'door-1', name: 'Staff door', verbs: ['close', 'open'] }, { id: 'cupboard', name: 'Cupboard', verbs: ['close', 'open'] },
  { id: 'light-switch', name: 'Counter lights', verbs: ['toggle'] }, { id: 'entrance-left', name: 'Entrance (left)', verbs: ['close', 'open'] },
];
const HOST = { agent: 'hana-1', user: 'mira', characters: [], items, expressions: hana.allowedExpressions, gestures: ['cheer', 'greet', 'nod', 'sip'], goals: PRESETS.host.goals };
const FOLLOWER = { ...HOST, goals: PRESETS.follower.goals };
const followerPersona = { ...hana, story: 'You are out with Mira today, going where she goes and helping her. You can wait somewhere when she asks, or follow her.' };

// ---------------------------------------------------------------- the turns and their checks

const goal = (name, test = () => true) => ({ name: `goal ${name}`, ok: (c) => c.some((x) => x.name === 'setGoal' && x.args.goal === name && test(x.args.params ?? {})) });
const noGoal = { name: 'no goal', ok: (c) => !c.some((x) => x.name === 'setGoal') };
const act = (name, test) => ({ name: `${name}`, ok: (c) => c.some((x) => x.name === name && test(x.args)) });
const ends = { name: 'ends', ok: (c) => c.some((x) => x.name === 'endConversation') };
const goesOn = { name: 'does not end', ok: (c) => !c.some((x) => x.name === 'endConversation') };
const order = (item) => goal('takeOrder', (p) => String(p.order ?? '').toLowerCase().includes(item) && ['user', 'mira'].includes(p.customer));
const T = [
  ...['Good morning, Hana!', 'How long have you been running this place?', 'Is it always this quiet in the morning?', 'That smells amazing.', 'What music is this?', 'I had the strangest dream last night.', 'Thanks, you are the best.', 'Do you ever get a day off?'].map((t) => ({ kind: 'talk', text: t, checks: [noGoal, goesOn] })),
  { kind: 'order', text: 'Could I get a latte, please?', checks: [order('latte')] },
  { kind: 'order', text: "I'll have a cappuccino.", checks: [order('cappuccino')] },
  { kind: 'order', text: 'Can I order a green tea?', checks: [order('tea')] },
  { kind: 'order', text: 'One espresso to go, please.', checks: [order('espresso')] },
  { kind: 'order', text: 'Hmm, just get me a mocha.', checks: [order('mocha')] },
  { kind: 'order', text: 'Two croissants, please.', checks: [order('croissant')] },
  ...['I love the smell of coffee.', 'I already had a latte this morning.', 'Do you sell tea here?', 'Is the espresso machine new?'].map((t) => ({ kind: 'not order', text: t, checks: [noGoal] })),
  { kind: 'look', text: 'Look at that cupboard!', checks: [act('lookAt', (a) => a.target === 'cupboard')] },
  { kind: 'use', text: 'Could you open the staff door?', checks: [act('interact', (a) => a.item === 'door-1' && a.verb === 'open')] },
  { kind: 'use', text: 'Can you turn the counter lights on?', checks: [act('interact', (a) => a.item === 'light-switch')] },
  ...['I should get going. See you tomorrow!', 'Bye, Hana!', 'Thanks, have a good one!'].map((t) => ({ kind: 'goodbye', text: t, checks: [ends] })),
  ...['By the way, nice apron.', 'I see you have a new machine!'].map((t) => ({ kind: 'not goodbye', text: t, checks: [goesOn] })),
  { kind: 'command', role: 'follower', text: 'Could you wait by the door?', checks: [goal('waitAt', (p) => ['entrance-left', 'door-1'].includes(p.target))] },
  { kind: 'command', role: 'follower', text: 'Follow me, please.', checks: [goal('follow', (p) => ['user', 'mira'].includes(p.target))] },
  { kind: 'command', role: 'follower', text: 'Come with me.', checks: [goal('follow', (p) => ['user', 'mira'].includes(p.target))] },
  { kind: 'command', role: 'follower', text: 'Go wait by the cupboard.', checks: [goal('waitAt', (p) => p.target === 'cupboard')] },
  { kind: 'command', role: 'follower', text: 'Have a seat on that stool while I look around.', checks: [{ name: 'sits or waits at a stool', ok: (c) => c.some((x) => (x.name === 'interact' && /^stool/.test(x.args.item ?? '') && x.args.verb === 'sit') || (x.name === 'setGoal' && /^stool/.test(x.args.params?.target ?? ''))) }] },
];
const HISTORY = [{ role: 'user', content: 'Hi Hana!' }, { role: 'assistant', content: 'Morning, Mira! Good to see you.' }];

// ---------------------------------------------------------------- asking

async function ask(model, req, maxTokens) {
  const body = { model, messages: req.messages, max_tokens: maxTokens, temperature: 0, tools: req.tools.map((t) => ({ type: 'function', function: t })) };
  const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const j = await r.json(), m = j.choices[0].message;
  return { text: m.content ?? null, toolCalls: (m.tool_calls ?? []).map((c) => ({ name: c.function.name, arguments: c.function.arguments })), ms: j.ms, tokens: j.usage.completion_tokens };
}

const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
const echo = (line, heard) => { const a = words(line), b = words(heard); if (!a.size || !b.size) return false; let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.min(a.size, b.size) >= 0.75 && a.size <= b.size + 2; };

async function turn(model, design, t) {
  const moment = t.role === 'follower' ? FOLLOWER : HOST, persona = t.role === 'follower' ? followerPersona : hana;
  const base = { persona, history: HISTORY, situation: describeMoment(moment, { userName: 'Mira' }), moment: t.text };
  let calls, ms = 0, tokens = 0, raw;
  if (design === 'one') {
    const r = await ask(model, { messages: buildMessages(base), tools: toolsFor(moment) }, 200);
    ms = r.ms; tokens = r.tokens; raw = r;
    const v = validate(r, moment);
    if (!v.ok) return { valid: false, errors: v.errors, ms, tokens, raw };
    calls = v.calls;
    if (isGoodbye(t.text) && !calls.some((c) => c.name === 'endConversation')) calls.push({ name: 'endConversation', args: {} }); // the same rule both designs get
  } else {
    const l = await ask(model, lineRequest(base), 90);
    const line = cleanLine(l.text, persona.name);
    const vr = await ask(model, verdictRequest({ moment, name: persona.name, userName: 'Mira', heard: t.text, line }), 120);
    ms = l.ms + vr.ms; tokens = l.tokens + vr.tokens; raw = { line: l.text, verdict: vr.text, lineMs: l.ms, verdictMs: vr.ms };
    const verdict = parseVerdict(vr.text);
    const v = salvage(line, verdict ?? {}, moment, { heard: t.text, userName: 'Mira', validate });
    if (!v.ok) return { valid: false, errors: v.errors, ms, tokens, raw, lineMs: l.ms };
    calls = v.calls;
    raw.verdictParsed = !!verdict; raw.dropped = v.dropped;
  }
  const say = calls.find((c) => c.name === 'say');
  return {
    valid: true, ms, tokens, raw, lineMs: raw.lineMs ?? ms, line: say?.args.text ?? null, calls: calls.map((c) => ({ name: c.name, ...c.args })),
    echo: say ? echo(say.args.text, t.text) : false, long: say ? say.args.text.length > 200 : false,
    checks: t.checks.map((k) => ({ name: k.name, ok: k.ok(calls) })),
  };
}

// ---------------------------------------------------------------- run

const results = [];
for (const model of models) for (const design of designs) {
  const rows = [];
  for (const t of T) {
    let r;
    try { r = await turn(model, design, t); } catch (e) { r = { valid: false, errors: [e.message], ms: 0 }; }
    rows.push({ kind: t.kind, text: t.text, ...r });
  }
  const valid = rows.filter((r) => r.valid), withLine = valid.filter((r) => r.line), clean = withLine.filter((r) => !r.echo && !r.long);
  const checks = rows.flatMap((r) => r.checks ?? T.find((t) => t.text === r.text).checks.map((k) => ({ name: k.name, ok: false })));
  const passed = rows.filter((r) => r.valid && r.line && !r.echo && !r.long && r.checks.every((k) => k.ok)).length;
  const ms = valid.map((r) => r.ms).sort((a, b) => a - b), lineMs = valid.map((r) => r.lineMs).sort((a, b) => a - b);
  const byKind = {};
  for (const r of rows) { const k = (byKind[r.kind] ??= { turns: 0, passed: 0 }); k.turns++; if (r.valid && r.line && !r.echo && !r.long && r.checks.every((c) => c.ok)) k.passed++; }
  const s = { model, design, turns: rows.length, passed, valid: valid.length, withLine: withLine.length, cleanLines: clean.length, echoes: withLine.filter((r) => r.echo).length, long: withLine.filter((r) => r.long).length, checks: `${checks.filter((k) => k.ok).length}/${checks.length}`, msMedian: ms[Math.floor(ms.length / 2)] ?? null, msP90: ms[Math.floor(ms.length * 0.9)] ?? null, lineMsMedian: lineMs[Math.floor(lineMs.length / 2)] ?? null, byKind };
  results.push({ ...s, rows });
  console.log(`${model.padEnd(9)} ${design.padEnd(5)} passed ${String(passed).padStart(2)}/${rows.length}  valid ${valid.length}  lines ${withLine.length} clean ${clean.length} echo ${s.echoes} long ${s.long}  checks ${s.checks}  ms ${s.msMedian}/${s.msP90} line ${s.lineMsMedian}  ${Object.entries(byKind).map(([k, v]) => `${k} ${v.passed}/${v.turns}`).join(', ')}`);
}

fs.mkdirSync(path.join(here, '../results'), { recursive: true });
const out = { when: new Date().toISOString(), url, hardware: 'Mac Studio M5 Max (Mac17,14)', decoding: 'greedy', turns: T.length, results };
fs.writeFileSync(path.join(here, '../results/models.json'), JSON.stringify(out, null, 1) + '\n');
const md = ['# Director models: results', '', `${out.when}, ${out.hardware}, greedy, ${T.length} turns (scripts/eval-models.mjs).`, '', '| model | design | passed | valid | lines | echoes | long | checks | ms median / p90 | line ms |', '|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.model} | ${r.design} | ${r.passed}/${r.turns} | ${r.valid} | ${r.withLine} | ${r.echoes} | ${r.long} | ${r.checks} | ${r.msMedian} / ${r.msP90} | ${r.lineMsMedian} |`), '',
  '## Replies', ''];
for (const r of results) {
  md.push(`### ${r.model} · ${r.design}`, '');
  for (const x of r.rows) md.push(`- *${x.text}* → ${x.valid ? `"${x.line ?? ''}" ${JSON.stringify(x.calls.filter((c) => c.name !== 'say'))}${x.checks.every((c) => c.ok) ? '' : ` ✗ ${x.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`}${x.echo ? ' (echo)' : ''}` : `✗ ${(x.errors ?? []).join('; ').slice(0, 160)}`}`);
  md.push('');
}
fs.writeFileSync(path.join(here, '../results/models.md'), md.join('\n') + '\n');
