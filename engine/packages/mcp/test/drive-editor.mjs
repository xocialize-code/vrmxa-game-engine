// Drives the open editor through vrmxg-mcp --editor, as an agent would (a check for M1 W9, not run by npm test:
// it needs an editor open, polling 127.0.0.1:<port>). Prints each call and its answer; saves the screenshots.
//   node engine/packages/mcp/test/drive-editor.mjs [--port 5183] [--out dir] [--calls calls.json: [[name, args], …]]
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const port = opt('--port', '5183'), out = opt('--out', null), calls = opt('--calls', null);
const client = new Client({ name: 'drive-editor', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(import.meta.dirname, '../src/server.js'), '--editor', '--port', port], stderr: 'inherit' }));
const log = [];
process.on('uncaughtException', async (e) => { console.error(e); await client.close().catch(() => {}); process.exit(1); }); // never leave the server holding the port
async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const img = r.content.find((c) => c.type === 'image');
  if (img && out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, `shot-${log.length}.png`), Buffer.from(img.data, 'base64')); }
  log.push({ name, args, isError: !!r.isError, text: text.slice(0, 600) });
  console.log(`${r.isError ? '✖' : '✔'} ${name} ${JSON.stringify(args)}\n   ${text.slice(0, 300).replace(/\n/g, '\n   ')}`);
  return { text, isError: !!r.isError };
}
if (calls) { for (const [name, args] of JSON.parse(fs.readFileSync(calls, 'utf8'))) await call(name, args); if (out) { fs.mkdirSync(out, { recursive: true }); } if (out) fs.writeFileSync(path.join(out, 'drive-editor.json'), JSON.stringify(log, null, 1) + '\n'); await client.close(); process.exit(0); }
await call('tree');
await call('add_node', { node: { id: 'cam-mcp', type: 'Camera', parent: 'root', transform: { p: [4, 3, 6] }, props: { focalLength: 50 } } });
await call('play', { action: 'play' });
await call('engine_step', { steps: 60, hold: { move_y: 1 } });
await call('get_node', { id: 'mira', live: true });
await call('interact', { actor: 'mira', item: 'sword', verb: 'take' });
await call('engine_step', { steps: 30 });
await call('call_action', { id: 'hana-1', action: 'say', args: { clip: 'voice/hana-welcome.wav', text: 'Welcome in! Take a seat anywhere.' } });
await call('engine_step', { steps: 30 });
await call('screenshot', { width: 960, height: 540 });
await call('get_node', { id: 'hana-1', live: true });
await call('play', { action: 'stop' });
await call('undo');
if (out) { fs.mkdirSync(out, { recursive: true }); } if (out) fs.writeFileSync(path.join(out, 'drive-editor.json'), JSON.stringify(log, null, 1) + '\n');
await client.close();
