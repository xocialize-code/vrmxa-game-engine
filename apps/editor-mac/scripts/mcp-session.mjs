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
// --rush: M5 W11 (AB-T-0621), check 9 on the sample game itself (HAND-TEST-M5-MCP-RUSH: The Morning Rush open on its
// level): the agent reads its rules, adds a fourth regular and a goal, validates, saves and exports;
// → mcp-editor-session-m5-rush.json, on 5193 too.
// --w8: M6 W8 (AB-T-0649), an agent adds a level to "After Hours" (HAND-TEST-M6-MCP-AFTER-HOURS: the game open on its
// level): it reads the rules, copies the level into a second one, adds a book and a shelf with the game's own `shelf`
// behaviour and its connections, names the level in the game with a licence row, sends the first level on to it, and
// validates and exports. It runs in a folder of its own with the repository's vrmxg skill installed: the Skill tool is
// allowed beside the editor's tools, and the client's own ToolSearch (which loads deferred tool schemas, and touches
// no file) can still appear in the record; Bash, Read, Edit and the rest are refused. It is told to follow the
// skill's building rules (AB-T-0678); → mcp-editor-session-m6-after-hours.json, on 5193.
// --headless <project> --out <file>: the same session against vrmxg-mcp headless on a copy of the project (its first
// level open, builds checked into <project>/../builds), to rehearse a prompt before the Mac run; never the record.
//   node apps/editor-mac/scripts/mcp-session.mjs [--model sonnet] [--m2 | --m3 | --m5 | --rush | --w8] [--port N] [--headless <dir> --out <file>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const model = opt('--model', 'sonnet'), m2 = argv.includes('--m2'), m3 = argv.includes('--m3'), rush = argv.includes('--rush'), w8 = argv.includes('--w8'), m5 = argv.includes('--m5') || rush, port = opt('--port', m5 || w8 ? '5193' : '5183');
const server = path.resolve(import.meta.dirname, '../../../engine/packages/mcp/src/server.js');
const headless = opt('--headless', null);
if (headless && (!w8 || !opt('--out', null))) { console.error('--headless rehearses --w8, and needs --out (never the committed record)'); process.exit(2); }
const out = headless ? path.resolve(opt('--out')) : path.join(import.meta.dirname, `../docs/hand-test/results/mcp-editor-session${m2 ? '-m2' : m3 ? '-m3' : rush ? '-m5-rush' : m5 ? '-m5' : w8 ? '-m6-after-hours' : ''}.json`);
const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-mcp-session-')), 'mcp.json');
const serve = headless
  ? [server, path.resolve(headless), 'after-hours/level.vrmxs', '--builds', path.resolve(headless, '../builds'), '--runtime', path.resolve(import.meta.dirname, '../../game/dist')]
  : [server, '--editor', '--port', port];
if (headless) fs.mkdirSync(path.resolve(headless, '../builds'), { recursive: true });
fs.writeFileSync(config, JSON.stringify({ mcpServers: { 'vrmxg-editor': { command: process.execPath, args: serve } } }));

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
const promptRush = `You are connected to the VRMXG editor, which has the sample game "The Morning Rush" open on its level, game/level.vrmxs. The project is that game (game.json). Using only the vrmxg-editor tools:
1. Read the game's rules (game) and validate the project (game op=validate). Report the level's counters, timers and goals, and what wins and loses the game.
2. Add a fourth regular, as ONE edit (the edit tool) with the label "Add a customer": a character made from the same asset as the regular aoi, with id kai and name "Kai", standing at [1.2, 0, 10.5] facing the cafe as aoi does, controlled as an NPC, with the same brain behaviour as aoi (the preset game/brains/regular.json) but with the vars arrive 120 and seat stool-7. Read aoi before you make Kai.
3. Add a goal, as ONE edit with the label "Add the greet goal". Under the level's existing GameRules node (rules), add: a GameCounter "greeted" labelled "Greeted"; a GameGoal "greet-kai" with the text "Greet Kai", done once greeted is at least 1; and what counts it: an Area "kai-zone" at [-3.75, 1, -2.2], a 1.5 x 2 x 1.5 m box, whose bodyEntered signal adds 1 to greeted. Change nothing else of the rules.
4. Read the game's rules again and validate the project again, and report what each says. Make no other edits.
5. Save the scene, then export the game (game op=export). Report the build's path, its number of files and its manifest digest.
Describe a node type before you first use it. Do not undo. Finish with a short report of each step.`;
const promptW8 = `You are connected to the VRMXG editor, which has the game "After Hours" open on its first level, after-hours/level.vrmxs. The project is that game (game.json). Add a second level to it, using only the vrmxg-editor tools. Load the vrmxg skill first and follow it, its building rules included.
1. Read the game's rules (game) and validate the project (game op=validate). Describe the project's shelf behaviour.
2. Start the second level as a copy of the first: game op=open with scene after-hours/level-2.vrmxs and from after-hours/level.vrmxs.
3. As ONE edit (the edit tool) labelled "A second book": an Item book-2, named "Second book", from the same asset as the book, lying on the phone's table 0.4 m along x from the phone, at the phone's height; and an Item book-2-shelved, named "Second book (on its shelf)", from the same asset in its "away" state, on the store shelf (shelf-store) where phone-shelved sits on shelf-phones.
4. As ONE edit labelled "Open the store shelf": an Area zone-store, named "Store shelf (in front)", in front of the store shelf where zone-phones stands in front of shelf-phones, the same size and shape, standing on the floor. Give it the shelf behaviour with the book's VRMXI id as its item (read it from zone-books). Connect its placed signal to shelved's add and to book-2-shelved's enterState with the state "shelved", and its refused signal to mistakes' add and to hana's say with the text "The store shelf is for the second book."
5. As ONE edit labelled "Four things tonight": shelved's max becomes 4, and the tidy goal is done once shelved is at least 4 (with mistakes still under 2), its text "Put the scarf, the phone and both books on their shelves".
6. Validate the scene and save it. Name the second level in the game's scenes (game op=settings), and give it a licence row with the licence "Xocialize original" and the source "After Hours' second level: a second book for the store shelf, made by an agent through the editor's MCP tools".
7. Validate the project (game op=validate). If it reports a problem in the second level, fix it there and save again.
8. Open the first level again (game op=open). As ONE edit labelled "Go on to the second night": when its rules signal won, the scene changes to after-hours/level-2.vrmxs after 3 seconds with reset true (the second night starts as a new game, its counters from zero), in place of the change to after-hours/won.vrmxs. Change nothing else. Save.
9. Validate the project again and report what it says; make no more edits. Then export the game (game op=export) with the name "after-hours", the folder this hand test checks. Report the build's path, its number of files and its manifest digest.
Describe a node type before you first use it. Do not undo. Finish with a short report of each step, including where you put book-2, book-2-shelved and zone-store, and which building rule decided each.`;
const prompt = m2 ? promptM2 : m3 ? promptM3 : rush ? promptRush : m5 ? promptM5 : w8 ? promptW8 : promptM1;
// --w8: a folder of its own with the repository's skill installed (.claude/skills/vrmxg), so the session can load it
let cwd = process.cwd();
if (w8) {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-mcp-w8-'));
  execFileSync(process.execPath, [path.resolve(import.meta.dirname, '../../../skills/install.mjs'), '--project', cwd]);
}

const args = ['-p', prompt, '--model', model, '--mcp-config', config, '--strict-mcp-config', '--output-format', 'stream-json', '--verbose',
  '--allowedTools', 'mcp__vrmxg-editor__*', ...(w8 ? ['Skill'] : []),
  // the editor's tools only: a first M2 run read the .vrmxs from disk to learn the tracks (sequence {path} now does that)
  '--disallowedTools', 'Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent'];
const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
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
  date: new Date().toISOString().slice(0, 10), client: `claude -p (${init?.claude_code_version ? `Claude Code ${init.claude_code_version}` : 'Claude Code'}, ${model}), --mcp-config with vrmxg-mcp ${headless ? 'headless (a rehearsal)' : `--editor --port ${port}`}`,
  exitCode: code, mcpServers: init?.mcp_servers ?? null, ...(w8 ? { skills: (init?.skills ?? []).filter((k) => /vrmxg/.test(typeof k === 'string' ? k : k?.name ?? '')) } : {}), prompt, calls,
  failed: calls.filter((c) => c.isError).length, costUSD: result?.total_cost_usd ?? null, final: result?.result ?? null,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
// no home folder in a committed record: the editor's container paths (an export's folder) are written from ~
// nor the --w8 session's own temporary folder (the Skill tool's answer names where the skill is)
let text = JSON.stringify(record, null, 1);
if (w8) for (const d of new Set([fs.realpathSync(cwd), cwd])) text = text.split(d).join('<session folder>');
fs.writeFileSync(out, text.split(os.homedir()).join('~') + '\n');
console.log(`${calls.length} tool calls, ${record.failed} failed, $${record.costUSD} → ${path.relative(process.cwd(), out)}`);
for (const c of calls) console.log(`${c.isError ? '✖' : '✔'} ${c.tool.replace('mcp__vrmxg-editor__', '')} ${JSON.stringify(c.input).slice(0, 120)}`);
console.log(`\n${record.final ?? ''}`);
process.exit(code ?? 1);
