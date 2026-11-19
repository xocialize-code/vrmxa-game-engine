// M1 W9's acceptance session (AB-T-0521): a Claude Code session (claude -p) with vrmxg-mcp --editor drives the editor
// that is open (the Mac app, on the sample project), and its tool calls are recorded in
// docs/hand-test/results/mcp-editor-session.json. Afterwards the editor's own Undo should name the session's edit.
// --m2: M2 check 9 (AB-T-0535): with "Morning at the cafe" open, the agent directs the film (a shot, a camera, an
// expression key, a line, a behaviour tree), renders a frame and reads an NPC's brain; → mcp-editor-session-m2.json.
//   node apps/editor-mac/scripts/mcp-session.mjs [--model sonnet] [--m2]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const model = opt('--model', 'sonnet'), m2 = argv.includes('--m2');
const server = path.resolve(import.meta.dirname, '../../../engine/packages/mcp/src/server.js');
const out = path.join(import.meta.dirname, `../docs/hand-test/results/mcp-editor-session${m2 ? '-m2' : ''}.json`);
const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-mcp-session-')), 'mcp.json');
fs.writeFileSync(config, JSON.stringify({ mcpServers: { 'vrmxg-editor': { command: process.execPath, args: [server, '--editor'] } } }));

const promptM1 = `You are connected to the VRMXG editor, which has the sample cafe scene open. Using only the vrmxg-editor tools:
1. Add a camera to the scene: id cam-overview, under root, at [4, 3, 6], orbit preset targeting hana-1, 85 mm lens.
2. Play the scene.
3. Hold the move_y input at 1 for 60 steps, and report Mira's live position and animation state.
4. Have Mira take the sword (item "sword", verb "take"), step 30, and report what she is holding (her live state).
5. Cue Hana: call her say action with clip "voice/hana-welcome.wav" and text "Welcome in! Take a seat anywhere.", step 60, and report Hana's live state.
6. Take a screenshot and describe briefly what it shows.
7. Stop playing, and report whether the scene came back unchanged.
Do not undo or save. Finish with a short report of each step.`;

const promptM2 = `You are connected to the VRMXG editor, which has the sequence "Morning at the cafe" (sequences/cafe-morning.vrmxs) open: a 45 s film of the sample cafe at 24 fps. Using only the vrmxg-editor tools:
1. Read the sequence's outline.
2. Rig a camera for a closing shot: add a VirtualCamera "vc-goodbye" to the sequence that frames Hana (hana-1) in a close-up: a fixed body about 1.6 m in front of her at head height, a composer aim on her, an 85 mm lens.
3. Add a sixth shot, "Goodbye", from frame 1080 to 1176 on vc-goodbye: lengthen the sequence to 1176 frames and give the camera track a clip for it, in one batch edit.
4. Key Hana's "happy" expression up to 1 at frame 1092 and back to 0 at frame 1164.
5. Add a line of dialogue for Mira (mira) from frame 1100 to 1150: "See you tomorrow, Hana!"
6. Adjust Mira's behaviour tree for the film: in the sequence's cast, replace her brain's preset (now the document brains/customer.json) with an inline preset object whose tree is a sequence of three actions: wait 2 seconds, lookAt hana-1, emote happy. (Tree nodes look like { "type": "sequence", "children": [ { "type": "action", "do": "wait", "args": { "seconds": 2 } }, … ] }.)
7. Render frame 1120 of the sequence as a screenshot (960×540) and say what it shows, with its world hash.
8. Play the sequence, step 600 steps, read Hana's brain (her running branch, goal and blackboard), then stop playing.
Do not undo or save. Finish with a short report of each step.`;
const prompt = m2 ? promptM2 : promptM1;

const args = ['-p', prompt, '--model', model, '--mcp-config', config, '--strict-mcp-config', '--output-format', 'stream-json', '--verbose',
  '--allowedTools', 'mcp__vrmxg-editor__*',
  // the editor's tools only: a first M2 run read the .vrmxs from disk to learn the tracks (sequence {path} now does that)
  '--disallowedTools', 'Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent'];
const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'inherit'] });
let buf = '';
const events = [];
child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) { try { events.push(JSON.parse(line)); } catch { /* not JSON */ } } } });
const code = await new Promise((r) => child.on('close', r));

// pair tool_use with tool_result
const uses = new Map(), calls = [];
let init = null, result = null;
for (const e of events) {
  if (e.type === 'system' && e.subtype === 'init') init = e;
  if (e.type === 'result') result = e;
  for (const c of e.message?.content ?? []) {
    if (c.type === 'tool_use') { const call = { tool: c.name, input: c.input }; uses.set(c.id, call); calls.push(call); }
    if (c.type === 'tool_result') {
      const call = uses.get(c.tool_use_id); if (!call) continue;
      const parts = Array.isArray(c.content) ? c.content : [{ type: 'text', text: String(c.content) }];
      call.result = parts.map((p) => (p.type === 'image' ? '[image]' : p.text)).join('\n').replace(/\[Image: source: [^\]]*\]/g, '[image saved by Claude Code]').slice(0, 400);
      call.isError = !!c.is_error;
    }
  }
}
const record = {
  date: new Date().toISOString().slice(0, 10), client: `claude -p (${init?.claude_code_version ? `Claude Code ${init.claude_code_version}` : 'Claude Code'}, ${model}), --mcp-config with vrmxg-mcp --editor`,
  exitCode: code, mcpServers: init?.mcp_servers ?? null, prompt, calls,
  failed: calls.filter((c) => c.isError).length, costUSD: result?.total_cost_usd ?? null, final: result?.result ?? null,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(record, null, 1) + '\n');
console.log(`${calls.length} tool calls, ${record.failed} failed, $${record.costUSD} → ${path.relative(process.cwd(), out)}`);
for (const c of calls) console.log(`${c.isError ? '✖' : '✔'} ${c.tool.replace('mcp__vrmxg-editor__', '')} ${JSON.stringify(c.input).slice(0, 120)}`);
console.log(`\n${record.final ?? ''}`);
process.exit(code ?? 1);
