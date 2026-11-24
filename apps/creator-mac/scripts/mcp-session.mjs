// M4 W11's acceptance session (AB-T-0583; M4 check 9): a Claude Code session (claude -p) with only `vrmxg-mcp --creator`
// makes the sample short's six edits in the creator that is open (the Mac app on the sample project, or a browser with
// ?mcp): it patches the script, recasts a role, re-voices a line, changes a shot's camera, renders a frame and queues an
// export. Its tool calls are recorded in docs/hand-test/results/mcp-creator-session.json. Afterwards each edit is a step
// of the creator's own Undo marked "(MCP)" (HAND-TEST-M4-MCP.scenario.md walks them back and forth).
//   node apps/creator-mac/scripts/mcp-session.mjs [--model sonnet] [--skill] [--port N]
// --skill (M5 W9, AB-T-0608): the same edits by a fresh session that has only the vrmxg skill (skills/vrmxg) and the
// creator's server. It runs in a new folder outside the repository, with the skill installed there as that folder's own
// (skills/install.mjs --project), no file, shell or web tools, and a prompt that names the edits but no tool, so what
// it knows of VRMXG is the skill and what the tools answer; → mcp-creator-session-skill.json. --port: the bridge's port
// (the creator polls it when launched with VRMXG_QUERY=mcp=<port>; default 5184).
// The re-voicing speaks through the Mac app's own tts.speak (Kokoro on MLXEngine, AB-T-0614): launch it with
// VRMXG_SHELL_MODELS=models after scripts/hand-test-fixtures.sh, or choose the models folder once in the app. In a
// browser, ?tts=http://127.0.0.1:5190/speak and content/sample/tools/tts-server.py.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const model = opt('--model', 'sonnet'), skill = argv.includes('--skill'), port = opt('--port', '5184');
const server = path.resolve(import.meta.dirname, '../../../engine/packages/mcp/src/server.js');
const out = path.join(import.meta.dirname, `../docs/hand-test/results/mcp-creator-session${skill ? '-skill' : ''}.json`);
const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-mcp-creator-')), 'mcp.json');
fs.writeFileSync(config, JSON.stringify({ mcpServers: { 'vrmxg-creator': { command: process.execPath, args: [server, '--creator', '--port', port] } } }));
// --skill: a folder of its own, outside the repository, whose only project skill is vrmxg
const cwd = skill ? fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-skill-session-')) : process.cwd();
if (skill) {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [path.resolve(import.meta.dirname, '../../../skills/install.mjs'), '--project', cwd], { stdio: 'inherit' });
}

const prompt = `You are connected to the VRMXG creator, which has the sample short "The Order" (cafe-order) open: Hana runs a cafe and Mira orders. Using only the vrmxg-creator tools:
1. Read the short's outline, then its script and its lines.
2. Patch the script so that Mira's "A latte, please." becomes "A latte, please. To go." and report the undo step it made.
3. Recast the role HANA with the character file characters/hana.vrmxa in the voice af_nicole. Report the new voice, how many lines were re-voiced and any warnings.
4. Re-voice Mira's line "Is it always this quiet in the morning?" with the new words "Is it always this quiet before nine?".
5. Give shot 030 a new camera: a close-up of Mira (rig closeUp, target mira) with an 85 mm lens.
6. Render frame 200 at 960×540 and say what it shows, with its shot and world hash.
7. Queue an export of the short at the review preset (don't run it).
8. Read the short's history and list the undo steps you made.
Do not undo or save. If a command is refused, read the error, fix the arguments and try again. Finish with a short report of each step.`;

// The same six edits, said as a person would, with no tool named: the skill has to carry the rest.
const promptSkill = `The VRMXG creator is open on the sample short "The Order" (cafe-order): Hana runs a cafe and Mira orders. Use the vrmxg skill to work out how. Make these changes to the short:
1. Mira's line "A latte, please." becomes "A latte, please. To go."
2. Recast the role HANA with the character file characters/hana.vrmxa in the voice af_nicole.
3. Re-voice Mira's line "Is it always this quiet in the morning?" with the new words "Is it always this quiet before nine?".
4. Shot 030 gets a new camera: a close-up of Mira with an 85 mm lens.
5. Render frame 200 at 960×540 and say what it shows.
6. Queue an export of the short at the review preset, without running it.
Don't undo or save. At the end, list the undo steps you made.`;
const args = ['-p', skill ? promptSkill : prompt, '--model', model, '--mcp-config', config, '--strict-mcp-config', '--output-format', 'stream-json', '--verbose',
  // --skill: no user settings, so none of this machine's own skills load beside the one installed in the session's folder
  ...(skill ? ['--setting-sources', 'project,local'] : []),
  '--allowedTools', 'mcp__vrmxg-creator__*', ...(skill ? ['Skill'] : []),
  '--disallowedTools', 'Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent'];
const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'inherit'], cwd });
let buf = '';
const events = [];
child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) { try { events.push(JSON.parse(line)); } catch { /* not JSON */ } } } });
const code = await new Promise((r) => child.on('close', r));

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
      call.result = parts.map((p) => (p.type === 'image' ? '[image]' : p.text)).join('\n').replace(/\[Image: source: [^\]]*\]/g, '[image saved by Claude Code]').slice(0, 500);
      call.isError = !!c.is_error;
    }
  }
}
const home = os.homedir();
const record = {
  date: new Date().toISOString().slice(0, 10), client: `claude -p (${init?.claude_code_version ? `Claude Code ${init.claude_code_version}` : 'Claude Code'}, ${model}), --mcp-config with vrmxg-mcp --creator`,
  exitCode: code, mcpServers: init?.mcp_servers ?? null, tools: (init?.tools ?? []).filter((t) => t.startsWith('mcp__') || t === 'Skill'),
  ...(skill ? { skill: 'vrmxg, installed as the session folder\'s own (outside the repository); no file, shell or web tools', skills: init?.skills ?? null } : {}),
  prompt: skill ? promptSkill : prompt, calls,
  failed: calls.filter((c) => c.isError).length, costUsd: result?.total_cost_usd ?? null, turns: result?.num_turns ?? null, report: result?.result ?? null,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(record, null, 1).split(home).join('~')}\n`); // no home paths in committed results
console.log(`${calls.length} tool calls, ${record.failed} failed, $${record.costUsd ?? '?'} → ${path.relative(process.cwd(), out)}`);
console.log(record.report ?? '(no report)');
