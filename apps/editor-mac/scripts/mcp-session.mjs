// M1 W9's acceptance session (AB-T-0521): a Claude Code session (claude -p) with vrmxg-mcp --editor drives the editor
// that is open (the Mac app, on the sample project), and its tool calls are recorded in
// docs/hand-test/results/mcp-editor-session.json. Afterwards the editor's own Undo should name the session's edit.
// --m2: M2 check 9 (AB-T-0535): with "Morning at the cafe" open, the agent directs the film (a shot, a camera, an
// expression key, a line, a behaviour tree), renders a frame and reads an NPC's brain; → mcp-editor-session-m2.json.
// --m3: M3 W10 (AB-T-0549): with the cafe open in an editor started with ?director=demo, the agent gives Hana the host
// brain, plays, talks to her, injects a decision and reads her director's answer, edits her role profile, and undoes the
// profile edit and the brain with the editor's Undo; → mcp-editor-session-m3.json.
// --m5: M5 W9 (AB-T-0619): with the scenario's copy of the sample project open (HAND-TEST-M5-MCP), the agent reads the
// game's rules, adds a customer and a goal (each one labelled edit), validates the project, saves and exports the game;
// → mcp-editor-session-m5.json. --port: the bridge's port (the scenario's editor polls 5193, so no other editor meets it).
//   node apps/editor-mac/scripts/mcp-session.mjs [--model sonnet] [--m2 | --m3 | --m5] [--port N]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const model = opt('--model', 'sonnet'), m2 = argv.includes('--m2'), m3 = argv.includes('--m3'), m5 = argv.includes('--m5'), port = opt('--port', m5 ? '5193' : '5183');
const server = path.resolve(import.meta.dirname, '../../../engine/packages/mcp/src/server.js');
const out = path.join(import.meta.dirname, `../docs/hand-test/results/mcp-editor-session${m2 ? '-m2' : m3 ? '-m3' : m5 ? '-m5' : ''}.json`);
const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-mcp-session-')), 'mcp.json');
fs.writeFileSync(config, JSON.stringify({ mcpServers: { 'vrmxg-editor': { command: process.execPath, args: [server, '--editor', '--port', port] } } }));

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
const promptM3 = `You are connected to the VRMXG editor, which has the sample cafe scene (cafe.vrmxs) open. Hana (hana-1) runs the cafe. Using only the vrmxg-editor tools:
1. Give Hana a brain: set her behaviours to [{ "use": "brain", "preset": "host" }] (one edit).
2. Play the scene. Read Hana's persona and role profile (brain op=profile).
3. Talk to Hana through her director (brain op=talk): "Good morning, Hana! Could I get a latte, please?". Step 120, then read her director (brain op=director): what did she answer, and what is she doing now (brain op=inspect: her goal)?
4. Inject a decision for Hana (brain op=inject): an action { "do": "emote", "args": { "name": "surprised" } }. Step 30 and confirm it was applied (brain op=record).
5. Stop playing. Make Hana less talkative: set her role profile's talkativeness to 0.25 (brain op=profile with profile). Read the profile back.
6. Undo twice with the editor's undo: say what each undo reverted, then read her profile again and check her behaviours are back as they were.
Do not save. Finish with a short report of each step.`;
const promptM5 = `You are connected to the VRMXG editor, which has the sample cafe project open on its scene cafe.vrmxs. The project is a game (game.json). Using only the vrmxg-editor tools:
1. Read the game's rules (game) and validate the project (game op=validate).
2. Add a customer, as ONE edit (the edit tool) with the label "Add a customer": a second character made from the same asset as Hana (hana-1), with id customer-1 and name "Customer", standing at [1.5, 0, 4], controlled as an NPC, with a brain whose preset is the project's customer brain, brains/customer.json.
3. Add a goal, as ONE edit with the label "Add the serve goal". The scene has no game rules yet, so the edit adds: a GameRules node; a GameCounter "served" labelled "Customers served"; a GameGoal "serve-customer" with the text "Serve the customer", done once served is at least 1; and what counts it: an Area "counter-zone" at [-1.5, 0.6, -2], 2 x 1 x 1 m, whose bodyEntered signal adds 1 to served.
4. Validate the project again and report what it says. Make no other edits.
5. Save the scene, then export the game (game op=export). Report the build's path, its number of files and its manifest digest.
Describe a node type before you first use it. Do not undo. Finish with a short report of each step.`;
const prompt = m2 ? promptM2 : m3 ? promptM3 : m5 ? promptM5 : promptM1;

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
  date: new Date().toISOString().slice(0, 10), client: `claude -p (${init?.claude_code_version ? `Claude Code ${init.claude_code_version}` : 'Claude Code'}, ${model}), --mcp-config with vrmxg-mcp --editor --port ${port}`,
  exitCode: code, mcpServers: init?.mcp_servers ?? null, prompt, calls,
  failed: calls.filter((c) => c.isError).length, costUSD: result?.total_cost_usd ?? null, final: result?.result ?? null,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
// no home folder in a committed record: the editor's container paths (an export's folder) are written from ~
fs.writeFileSync(out, JSON.stringify(record, null, 1).split(os.homedir()).join('~') + '\n');
console.log(`${calls.length} tool calls, ${record.failed} failed, $${record.costUSD} → ${path.relative(process.cwd(), out)}`);
for (const c of calls) console.log(`${c.isError ? '✖' : '✔'} ${c.tool.replace('mcp__vrmxg-editor__', '')} ${JSON.stringify(c.input).slice(0, 120)}`);
console.log(`\n${record.final ?? ''}`);
process.exit(code ?? 1);
