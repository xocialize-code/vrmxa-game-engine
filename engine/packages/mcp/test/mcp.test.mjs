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
import { createValidator, parse } from '@vrmxg/scene';

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

test('the tool list is generic and small: 16 tools under 1,500 tokens', async () => {
  const dir = project('list', { 'cafe.vrmxs': path.join(coreFixtures, 'cafe.vrmxs'), ...prefabFiles });
  const { client } = await connect([dir, 'cafe.vrmxs']);
  const { tools } = await client.listTools();
  await client.close();
  const bytes = Buffer.byteLength(JSON.stringify(tools));
  assert.equal(tools.length, 16);
  assert.ok(bytes / 4 < 1500, `${bytes} bytes ≈ ${Math.round(bytes / 4)} tokens`);
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
  assert.deepEqual(loaded.services, ['input', 'physics', 'characters', 'cameras', 'models', 'items']);
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
