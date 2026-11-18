// W7 (AB-T-0508) end to end: the server on stdio, driven by the official MCP client the way an agent
// would, on temporary copies of the scenes. The edit and the doors inspection run on CI; the cafe with
// Mira replaying the W6 recording runs where the harness assets are (snapshot/harness: make-assets.mjs).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator, parse, createEditor } from '@vrmxg/scene';
import { toolList, createHandlers, caller } from '@vrmxg/mcp';

const here = import.meta.dirname;
const server = path.join(here, '../src/server.js');
const coreFixtures = path.join(here, '../../core/test/fixtures');
const harnessModels = path.join(here, '../../snapshot/harness/public/models');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-mcp-'));
const clients = [];
after(async () => { for (const c of clients) await c.close().catch(() => {}); fs.rmSync(work, { recursive: true, force: true }); });

function project(name, files) {
  const dir = path.join(work, name);
  for (const [to, from] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true }); fs.copyFileSync(from, path.join(dir, to)); }
  return dir;
}
async function connect(args) {
  const client = new Client({ name: 'vrmxg-mcp-test', version: '0.1.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server, ...args], stderr: 'inherit' }));
  clients.push(client); // closed after the tests even when one fails
  const call = async (name, a = {}, expectError = false) => {
    const r = await client.callTool({ name, arguments: a });
    const text = r.content.map((x) => x.text).join('\n');
    if (!!r.isError !== expectError) throw new Error(`${name} ${expectError ? 'should have failed' : 'failed'}: ${text}`);
    try { return JSON.parse(text); } catch { return text; }
  };
  return { client, call };
}
const prefabFiles = { 'prefabs/door.vrmxs': path.join(coreFixtures, 'prefabs/door.vrmxs'), 'prefabs/double-door.vrmxs': path.join(coreFixtures, 'prefabs/double-door.vrmxs') };
// The engine loads Models, so engine tests use the sample content's door: its frame and panel GLBs ship with it.
const sample = path.join(here, '../../../../content/sample');
const doorFiles = Object.fromEntries(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs', 'props/door-frame.glb', 'props/door-panel.glb'].map((f) => [f, path.join(sample, f)]));

test('the tool list is generic and small: 17 tools under 1,500 tokens headless, 18 under 1,800 for the editor', async () => {
  const dir = project('list', { 'cafe.vrmxs': path.join(coreFixtures, 'cafe.vrmxs'), ...prefabFiles });
  const { client } = await connect([dir, 'cafe.vrmxs']);
  const { tools } = await client.listTools();
  await client.close();
  const bytes = Buffer.byteLength(JSON.stringify(tools));
  assert.equal(tools.length, 17);
  assert.ok(bytes / 4 < 1500, `${bytes} bytes ≈ ${Math.round(bytes / 4)} tokens`);
  const editor = toolList(m0Registry(), 'editor'), eb = Buffer.byteLength(JSON.stringify(editor));
  assert.deepEqual(editor.map((t) => t.name).filter((n) => !tools.some((t) => t.name === n)), ['play', 'screenshot']);
  assert.ok(!editor.some((t) => t.name === 'engine_load'));
  assert.ok(eb / 4 < 1800, `editor: ${eb} bytes ≈ ${Math.round(eb / 4)} tokens`);
});

// A stand-in for the editor's page: polls the bridge and runs the same handlers over a target whose edits carry labels,
// as the editor's command log does.
async function fakeEditor(port, { stop }) {
  const reg = m0Registry();
  const doc = parse(fs.readFileSync(path.join(coreFixtures, 'cafe.vrmxs'), 'utf8'));
  const prefabs = new Map(Object.keys(prefabFiles).map((k) => [k, parse(fs.readFileSync(prefabFiles[k], 'utf8'))]));
  const ed = createEditor(reg, doc, { prefabs: () => prefabs });
  const log = [];
  const target = {
    doc: () => doc, prefabs: () => prefabs,
    apply: (op, label) => { ed.apply({ ...op, label }); log.push(label); },
    undo: () => ed.undo(), redo: () => ed.redo(),
    live: () => { throw new Error('not playing: call play first'); },
    play: (action) => ({ mode: action === 'play' ? 'playing' : 'editing' }),
    screenshot: async ({ width, height }) => ({ data: Buffer.from('png').toString('base64'), width, height }),
  };
  const call = caller(createHandlers(reg, target));
  let reply = null, hello = { app: 'fake editor' };
  while (!stop.done) {
    const res = await fetch(`http://127.0.0.1:${port}/vrmxg-mcp/exchange`, { method: 'POST', body: JSON.stringify({ editor: 'a', hello, reply }) }).catch(() => null);
    hello = null; reply = null;
    if (!res) { await new Promise((r) => setTimeout(r, 50)); continue; }
    const m = await res.json();
    if (m.call) reply = { id: m.call.id, ...(await call(m.call.name, m.call.args)) };
  }
  return { ed, log };
}

test('editor mode: tool calls reach the open editor through the bridge; its edits carry labels and undo there', async () => {
  const client = new Client({ name: 'vrmxg-mcp-test', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [server, '--editor', '--port', '0', '--hold-ms', '300'], stderr: 'pipe' });
  let port = 0;
  const ready = new Promise((resolve) => transport.stderr.on('data', (d) => { const m = /127\.0\.0\.1:(\d+)/.exec(String(d)); if (m) { port = +m[1]; resolve(); } }));
  await client.connect(transport); clients.push(client);
  await ready;
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === 'screenshot'));
  const stop = { done: false };
  const page = fakeEditor(port, { stop });
  await new Promise((r) => setTimeout(r, 100));
  // a second editor polling the same bridge is told another has the link, so calls never split between them
  const other = await (await fetch(`http://127.0.0.1:${port}/vrmxg-mcp/exchange`, { method: 'POST', body: JSON.stringify({ editor: 'b' }) })).json();
  assert.ok(other.taken, 'the second editor is turned away');
  const call = async (name, a = {}) => { const r = await client.callTool({ name, arguments: a }); return r; };
  const added = await call('add_node', { node: { id: 'cam-mcp', type: 'Camera', parent: 'root', transform: { p: [4, 3, 6] }, props: { focalLength: 50 } } });
  assert.equal(added.content[0].text, 'added cam-mcp');
  const live = await call('get_node', { id: 'mira', live: true });
  assert.ok(live.isError && live.content[0].text.includes('call play first'), 'errors come back as text');
  const shot = await call('screenshot', { width: 320, height: 180 });
  assert.equal(shot.content[0].type, 'image'); assert.equal(shot.content[1].text, '320×180 PNG');
  assert.equal((await call('undo')).content[0].text, 'undone');
  stop.done = true;
  const { ed, log } = await page;
  assert.deepEqual(log, ['Add cam-mcp']);
  assert.ok(!ed.doc.nodes.some((n) => n.id === 'cam-mcp'), 'undone in the editor');
  assert.equal(ed.peek().redo.label, 'Add cam-mcp', 'the editor\'s history names it');
});

test('an agent describes Camera, adds a camera to the cafe, saves, and the file validates', async () => {
  const dir = project('edit', { 'cafe.vrmxs': path.join(coreFixtures, 'cafe.vrmxs'), ...prefabFiles });
  const { client, call } = await connect([dir, 'cafe.vrmxs']);
  const cam = await call('describe', { type: 'Camera' });
  assert.ok(JSON.stringify(cam).includes('focalLength'));
  await call('add_node', { node: { id: 'cam-2', type: 'Camera', parent: 'root', props: { focalLength: 2 } } }, true); // below the lens minimum: refused
  await call('add_node', { node: { id: 'cam-2', type: 'Camera', parent: 'root', transform: { p: [3, 1.6, 3] }, props: { focalLength: 85, preset: 'orbit', target: 'hana-1' } } });
  await call('set', { id: 'cam-2', path: 'props.fStop', value: 2.8 });
  await call('undo'); await call('redo');
  assert.ok((await call('tree')).includes('cam-2 (Camera)'));
  const saved = await call('save');
  assert.equal(saved.saved, 'cafe.vrmxs');
  await client.close();
  const doc = parse(fs.readFileSync(path.join(dir, 'cafe.vrmxs'), 'utf8'));
  const prefabs = new Map(Object.keys(prefabFiles).map((k) => [k, parse(fs.readFileSync(path.join(dir, k), 'utf8'))]));
  const r = createValidator(m0Registry()).check(doc, { prefabs });
  assert.ok(r.ok, r.errors.join('\n'));
  assert.deepEqual(doc.nodes.find((n) => n.id === 'cam-2').props, { fStop: 2.8, focalLength: 85, preset: 'orbit', target: 'hana-1' });
});

test('inspect: the walker walks through the entrance trigger, the door swings open, physics and the hinge say so', async () => {
  const dir = project('doors', { 'doors.vrmxs': path.join(here, 'fixtures/doors.vrmxs'), ...doorFiles });
  const { client, call } = await connect([dir, 'doors.vrmxs', '--behaviours', path.join(here, 'fixtures/behaviours.mjs')]);
  await call('engine_step', { steps: 1 }, true); // nothing running yet
  const loaded = await call('engine_load');
  assert.deepEqual(loaded.services, ['input', 'physics', 'characters', 'cameras', 'models', 'items', 'audio', 'voice', 'tracks', 'particles', 'nav', 'inventory', 'interact', 'ai']);
  assert.ok((await call('tree', { live: true })).includes('entrance/right/hinge (RigidBody)'));
  await call('engine_step', { steps: 10, hold: { jump_high: 1 } }, true); // unknown action: refused with the list
  const walked = await call('engine_step', { steps: 90, hold: { move_y: -1 } }); // S: 3 m towards +z, into the right door's trigger
  const waited = await call('engine_step', { steps: 90 });                     // stand there while it swings
  assert.equal(waited.step, 180);
  assert.ok(walked.signals.some((s) => s.node === 'entrance/right/trigger' && s.signal === 'bodyEntered'), JSON.stringify(walked.signals));
  assert.ok(waited.signals.some((s) => s.node === 'entrance/right/hinge' && s.signal === 'opened'), JSON.stringify(waited.signals));
  const hinge = await call('get_node', { id: 'entrance/right/hinge', live: true });
  const h = hinge.behaviours[0];
  assert.equal(h.use, 'hinge');
  assert.ok(Math.abs(h.state.angleDeg - -100) < 5, `open: ${h.state.angleDeg}°`);
  assert.equal(h.state.reported, 'opened');
  assert.equal(hinge.body.type, 'dynamic');
  const ph = await call('physics');
  assert.ok(ph.sensors.find((s) => s.sensor === 'entrance/right/trigger').holds.includes('walker-shape'));
  assert.ok(ph.bodies.some((b) => b.node === 'walker'));
  // walk back out: the trigger closes it (the walker no longer stands in its swing)
  const out = await call('engine_step', { steps: 150, hold: { move_y: 1 } });
  assert.ok(out.signals.some((s) => s.node === 'entrance/right/hinge' && s.signal === 'closed'), JSON.stringify(out.signals));
  assert.ok(Math.abs((await call('get_node', { id: 'entrance/right/hinge', live: true })).behaviours[0].state.angleDeg) < 5);
  // drive: open it with nobody there
  assert.deepEqual((await call('physics')).sensors.find((s) => s.sensor === 'entrance/right/trigger').holds, []);
  await call('call_action', { id: 'entrance/right/hinge', action: 'open' });
  await call('call_action', { id: 'walker', action: 'fly' }, true);
  await call('engine_step', { steps: 90 });
  const opened = await call('get_node', { id: 'entrance/right/hinge', live: true });
  assert.ok(Math.abs(opened.behaviours[0].state.angleDeg - -100) < 5, `opened by call_action: ${opened.behaviours[0].state.angleDeg}°`);
  await client.close();
});

const CAFE = ['cafe.vrmxs', 'input.json', 'mira.vrm', 'hana.vrm', 'animations.json'].every((f) => fs.existsSync(path.join(harnessModels, f)));
test('inspect on the cafe: Mira replays the recorded walk, the entrance door opens, the hinge reports its angle', { skip: CAFE ? false : 'needs snapshot/harness/public/models (node make-assets.mjs)' }, async () => {
  const anim = JSON.parse(fs.readFileSync(path.join(harnessModels, 'animations.json'), 'utf8'));
  const files = {
    'cafe.vrmxs': path.join(harnessModels, 'cafe.vrmxs'), 'input.json': path.join(harnessModels, 'input.json'),
    'characters/mira.vrm': path.join(harnessModels, 'mira.vrm'), 'characters/hana.vrm': path.join(harnessModels, 'hana.vrm'),
    'animations.json': path.join(harnessModels, 'animations.json'), ...doorFiles,
  };
  for (const c of anim.clips) files[c.file] = path.join(harnessModels, 'clips', `${c.sha256}.vrma`);
  const dir = project('cafe', files);
  const { client, call } = await connect([dir, 'cafe.vrmxs', '--behaviours', path.join(here, 'fixtures/cafe-behaviours.mjs')]);
  await call('engine_load');
  const r = await call('engine_step', { steps: 120, replay: 'input.json' });
  assert.ok(r.signals.some((s) => s.node === 'entrance/right/hinge' && s.signal === 'opened'), JSON.stringify(r.signals));
  const hinge = await call('get_node', { id: 'entrance/right/hinge', live: true });
  assert.ok(Math.abs(hinge.behaviours[0].state.angleDeg - -100) < 5, `${hinge.behaviours[0].state.angleDeg}°`);
  const mira = await call('get_node', { id: 'mira', live: true });
  assert.ok(mira.world.p[2] > 5, `Mira walked through (z ${mira.world.p[2]})`);
  assert.equal(mira.character.grounded, true);
  assert.equal(mira.character.animation, 'move', 'the locomotion graph is moving');
  const hana = await call('get_node', { id: 'hana-1', live: true });
  assert.equal(hana.behaviours[0].use, 'wander', 'the project behaviour runs');
  await client.close();
});
