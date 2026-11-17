#!/usr/bin/env node
// Drives src/mcp-server.js over stdio with the official MCP client, the way an agent would: list
// tools, describe, make mistakes and read the errors, edit, connect, undo, validate, save. Works on
// a copy of examples/ so the originals never change. Also measures the tool list for the default
// (generic tools) and --per-type designs. Writes results/mcp-session.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-mcp-'));
fs.cpSync(path.join(pkg, 'examples'), work, { recursive: true });
const before = fs.readFileSync(path.join(work, 'cafe.vrmxs'), 'utf8');

async function connect(extra = []) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(pkg, 'src/mcp-server.js'), work, 'cafe.vrmxs', ...extra] });
  const client = new Client({ name: 'vrmxg-spike-client', version: '0.1.0' });
  await client.connect(transport);
  return client;
}
const size = (tools) => { const bytes = Buffer.byteLength(JSON.stringify(tools)); return { tools: tools.length, bytes, approxTokens: Math.round(bytes / 4) }; };

const report = { work, toolList: {}, steps: [] };
{
  const c = await connect(['--per-type']);
  report.toolList.perType = size((await c.listTools()).tools);
  await c.close();
}
const c = await connect();
const { tools } = await c.listTools();
report.toolList.generic = size(tools);

async function call(name, args = {}, expectError = false) {
  const t0 = performance.now();
  const r = await c.callTool({ name, arguments: args });
  const text = r.content.map((x) => x.text).join('\n');
  const step = { name, args, isError: !!r.isError, ms: +(performance.now() - t0).toFixed(2), bytes: Buffer.byteLength(text), text: text.length > 400 ? `${text.slice(0, 400)}…` : text };
  report.steps.push(step);
  if (!!r.isError !== expectError) throw new Error(`${name} ${expectError ? 'should have failed' : 'failed'}: ${text}`);
  return text;
}

// An agent's session: "add a key light and a second camera on Hana, open the cafe door when she
// arrives, and make the door unlocked".
await call('describe');
await call('describe', { type: 'Camera' });
await call('tree');
await call('add_node', { node: { id: 'cam-2', type: 'Camera', parent: 'root', props: { focalLength: 2, preset: 'orbit', target: 'hana-1' } } }, true); // focalLength below minimum
await call('add_node', { node: { id: 'cam-2', type: 'Camera', parent: 'root', transform: { p: [2, 1.6, 2] }, props: { focalLength: 85, preset: 'orbit', target: 'hana-1' } } });
await call('add_node', { node: { id: 'key', type: 'PointLight', parent: 'root', transform: { p: [1, 2.5, 1] }, props: { intensity: 60, range: 8, color: '#ffe8c0' } } });
await call('get_node', { id: 'hana-1' });
await call('connect', { from: 'hana-1', signal: 'arrived', to: 'door-1', call: 'open' }, true); // Instance has no action "open": it's on the inner hinge
await call('tree', { flatten: true });
await call('connect', { from: 'hana-1', signal: 'arrived', to: 'door-1/hinge', call: 'open' }); // inner node by path
await call('set', { id: 'door-1', path: 'overrides.hinge.behaviours', value: [{ use: 'hinge', locked: false }] });
await call('set', { id: 'cam', path: 'props.fStop', value: 'wide' }, true); // wrong type
await call('set', { id: 'cam', path: 'props.fStop', value: 1.4 });
await call('undo');
await call('validate');
const saved = JSON.parse(await call('save'));
const after = fs.readFileSync(path.join(work, 'cafe.vrmxs'), 'utf8');
report.saved = saved;
report.fileDiff = { linesBefore: before.split('\n').length, linesAfter: after.split('\n').length };
await c.close();

fs.mkdirSync(path.join(pkg, 'results'), { recursive: true });
fs.writeFileSync(path.join(pkg, 'results/mcp-session.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ toolList: report.toolList, saved, steps: report.steps.map((s) => `${s.isError ? 'ERR' : 'ok '} ${s.name} ${s.ms}ms ${s.bytes}B${s.isError ? ` — ${s.text.split('\n')[0]}` : ''}`) }, null, 1));
fs.rmSync(work, { recursive: true, force: true });
