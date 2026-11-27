// M6 W8 (AB-T-0649): MCP for building games. Each op on temporary copies of test/fixtures/build-game (a small game with
// a behaviours module: scoreZone declares itself and keys the game state by a param, as the Morning Rush's tableZone
// does; blink has no describe), through the headless target, whose edits go through the editor's own EditingSession
// commands as the open editor's do: behaviours attached, edited and removed by schema; connections checked as the
// inspector checks them; a batch one undo step, all or nothing; every step marked (MCP); project settings through the
// editor's ProjectSettings, each change a step of its own undo; scenes opened or made; a project made from a template.
// Then validate: the project's behaviours and their signals, and AB-T-0641 (optional goals are notes; a goal is a
// warning only when code could reach it, naming how), on the sample game too.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { folderReader } from '@vrmxg/bundle/node';
import { createTools } from '../src/headless.js';
import { Project } from '../src/project.js';
import { validateGame } from '@vrmxg/mcp/game';

const here = import.meta.dirname;
const fixture = path.join(here, 'fixtures/build-game');
const sample = path.join(here, '../../../../content/sample');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-mcp-build-'));
after(() => fs.rmSync(work, { recursive: true, force: true }));

/** The headless server's tools on a fresh copy of the fixture, set up as server.js sets them up. */
async function open(name, { projects = null } = {}) {
  const dir = path.join(work, name);
  fs.cpSync(fixture, dir, { recursive: true });
  const project = new Project(dir), registry = m0Registry();
  declareProjectBehaviours(registry, await project.behaviours());
  const t = createTools({ registry, project, scene: 'level.vrmxs', projects });
  const call = async (tool, a = {}, expectError = false) => {
    const r = await t.call(tool, a);
    if (r.isError !== expectError) throw new Error(`${tool} ${expectError ? 'should have failed' : 'failed'}: ${r.text}`);
    try { return JSON.parse(r.text); } catch { return r.text; }
  };
  const node = (id) => t.doc.nodes.find((n) => n.id === id);
  const undoLabel = () => t.session.history().undo;
  const depth = () => t.session.editor.peek().undoDepth;
  return { dir, t, call, node, undoLabel, depth, registry };
}

test('behaviours: attach (the project\'s and the engine\'s), params by schema, remove with the connections it made possible; each one step marked (MCP)', async () => {
  const { t, call, node, undoLabel, depth } = await open('behaviours');
  const start = t.session.text();
  assert.match(await call('edit', { ops: [{ op: 'behaviour', id: 'zone', use: 'scoreZone', params: { by: 2 } }], label: 'Score zone' }), /one undo step \("Score zone"\)/);
  assert.deepEqual(node('zone').behaviours, [{ use: 'scoreZone', by: 2 }]);
  assert.equal(undoLabel(), 'Score zone (MCP)');
  assert.equal(depth(), 1, 'attach and a param: one step');
  // refused, each leaving the scene and its history as they were: a param against its schema, one it doesn't declare, a
  // node reference to nothing, a type it doesn't attach to, a class with no describe, a node that isn't there
  const before = t.session.text();
  for (const [op, why] of [
    [{ op: 'behaviour', id: 'zone', use: 'scoreZone', params: { by: 0 } }, /must be >= 1/],
    [{ op: 'behaviour', id: 'zone', use: 'scoreZone', params: { amount: 3 } }, /scoreZone has no param "amount" \(its params: counter, by, target\)/],
    [{ op: 'behaviour', id: 'zone', use: 'scoreZone', params: { target: 'nobody' } }, /must name a node of this scene; "nobody" isn't one/],
    [{ op: 'behaviour', id: 'lamp', use: 'scoreZone' }, /scoreZone attaches to Area, not a PointLight/],
    [{ op: 'behaviour', id: 'lamp', use: 'blink' }, /no behaviour "blink".*needs a static describe/],
    [{ op: 'behaviour', id: 'ghost', use: 'switchedBy' }, /no node ghost/],
  ]) {
    const r = await t.call('edit', { ops: [op] });
    assert.ok(r.isError, JSON.stringify(op)); assert.match(r.text, why);
    assert.equal(t.session.text(), before); assert.equal(depth(), 1);
  }
  // the engine's own, on a Node3D; a param set to null goes back to its default
  await call('edit', { ops: [{ op: 'behaviour', id: 'lamp', use: 'switchedBy', params: { state: 'on' } }] });
  assert.deepEqual(node('lamp').behaviours, [{ use: 'switchedBy', state: 'on' }]);
  assert.match(undoLabel(), /\(MCP\)$/);
  await call('edit', { ops: [{ op: 'behaviour', id: 'zone', use: 'scoreZone', params: { by: null, counter: 'points' } }] });
  assert.deepEqual(node('zone').behaviours, [{ use: 'scoreZone', counter: 'points' }]);
  // removing it takes the connection from its signal with it, in the same step
  await call('connect', { from: 'zone', signal: 'scored', to: 'points', call: 'add', args: { by: 2 } });
  const wired = t.session.text(), d = depth();
  assert.match(await call('edit', { ops: [{ op: 'behaviour', id: 'zone', use: 'scoreZone', remove: true }] }), /removed 1 connection that needed it/);
  assert.equal(node('zone').behaviours, undefined);
  assert.ok(!t.doc.connections.some((c) => c.signal === 'scored'));
  assert.equal(depth(), d + 1);
  assert.equal(await call('undo'), 'undone');
  assert.equal(t.session.text(), wired, 'one undo brings both back');
  while (t.session.editor.peek().undoDepth) await call('undo');
  assert.equal(t.session.text(), start);
});

test('connections: checked as the inspector checks them; disconnect by index or by its ends; a batch is one step, all or nothing', async () => {
  const { t, call, undoLabel, depth } = await open('connections');
  await call('edit', { ops: [{ op: 'behaviour', id: 'zone', use: 'scoreZone' }] });
  // a project behaviour's signal, to a counter's action, with an argument by its schema
  assert.equal(await call('connect', { from: 'zone', signal: 'scored', to: 'points', call: 'add', args: { by: 2 } }), 'connected zone.scored -> points.add');
  assert.match(undoLabel(), /^Connect zone\.scored to points\.add \(MCP\)$/);
  for (const [a, why] of [
    [{ from: 'zone', signal: 'scored', to: 'points', call: 'add', args: { by: 'two' } }, /add's by: \/ must be number/],
    [{ from: 'lamp', signal: 'scored', to: 'points', call: 'add' }, /lamp has no signal scored/],
    [{ from: 'zone', signal: 'scored', to: 'points', call: 'explode' }, /points has no action explode/],
    [{ from: 'zone', signal: 'scored', to: 'nobody', call: 'add' }, /no node nobody/],
  ]) { const r = await t.call('connect', a); assert.ok(r.isError); assert.match(r.text, why); }
  // disconnect: by its ends when one matches, by index, and an ambiguous one names the candidates
  await call('connect', { from: 'gate', signal: 'bodyEntered', to: 'points', call: 'add' });
  const amb = await t.call('edit', { ops: [{ op: 'disconnect', from: 'gate', signal: 'bodyEntered' }] });
  assert.ok(amb.isError); assert.match(amb.text, /2 connections match \(give index: 0 gate\.bodyEntered->visits\.add, 2 gate\.bodyEntered->points\.add\)/);
  await call('edit', { ops: [{ op: 'disconnect', from: 'zone', signal: 'scored', to: 'points', call: 'add' }] });
  assert.ok(!t.doc.connections.some((c) => c.from === 'zone'));
  assert.match(undoLabel(), /^Disconnect zone\.scored from points\.add \(MCP\)$/);
  await call('edit', { ops: [{ op: 'disconnect', index: 1 }] });
  assert.deepEqual(t.doc.connections.map((c) => `${c.from}.${c.signal}->${c.to}.${c.call}`), ['gate.bodyEntered->visits.add']);
  // a batch: a node, a behaviour on it, a connection from its signal, a set: one step, undone in one
  const before = t.session.text(), d = depth();
  await call('edit', { label: 'Second zone', ops: [
    { op: 'add', node: { id: 'zone-2', type: 'Area', parent: 'root', props: { shape: 'box', size: [1, 1, 1] } } },
    { op: 'behaviour', id: 'zone-2', use: 'scoreZone', params: { counter: 'visits' } },
    { op: 'connect', from: 'zone-2', signal: 'scored', to: 'lamp', call: 'hide' },
    { op: 'set', id: 'zone-2', path: 'transform.p', value: [0, 0.6, 3] },
  ] });
  assert.equal(depth(), d + 1); assert.equal(undoLabel(), 'Second zone (MCP)');
  await call('undo');
  assert.equal(t.session.text(), before);
  await call('redo');
  assert.ok(t.doc.nodes.some((n) => n.id === 'zone-2'));
  // all or nothing: a bad op after good ones leaves the scene and the history as they were, and redo too
  await call('undo');
  const mid = t.session.text(), dm = depth(), redo = t.session.history().redo;
  const r = await t.call('edit', { ops: [
    { op: 'add', node: { id: 'zone-3', type: 'Area', parent: 'root' } },
    { op: 'behaviour', id: 'zone-3', use: 'scoreZone' },
    { op: 'connect', from: 'zone-3', signal: 'scored', to: 'points', call: 'add', args: { by: 'x' } },
  ] });
  assert.ok(r.isError); assert.match(r.text, /^ops\[2\] \(connect\): Connect: add's by: .*Nothing was applied$/);
  assert.equal(t.session.text(), mid); assert.equal(depth(), dm);
  assert.equal(redo, 'Second zone (MCP)');
  assert.equal(t.session.history().redo, redo, 'a refused batch leaves the Redo as it was (the person\'s too)');
  const single = await t.call('edit', { ops: [{ op: 'behaviour', id: 'zone-x', use: 'scoreZone' }] });
  assert.ok(single.isError); assert.equal(t.session.history().redo, redo);
});

test('project settings: read, set through the editor\'s ProjectSettings (one step each, marked, written at once), refused when wrong; its own undo takes a step back', async () => {
  const { dir, t, call } = await open('settings');
  const r = await call('game', { op: 'settings' });
  assert.deepEqual([r.settings.title, r.settings.id, r.settings.entry, r.settings.scenes, r.settings.behaviours, r.settings.layers], ['Build test', 'build-test', 'level.vrmxs', ['level.vrmxs'], 'behaviours.js', []]);
  assert.ok(r.note && r.set, 'it says how to set, and that what it read is data');
  const s1 = await call('game', { op: 'settings', set: { title: 'Built by an agent', release: '0.2.0' } });
  assert.deepEqual(s1.steps, ['Settings: title, release (MCP)']);
  const game = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
  assert.equal(game.title, 'Built by an agent'); assert.equal(game.release, '0.2.0');
  assert.equal(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'), `${JSON.stringify(game, null, 1)}\n`, 'written as the editor writes it');
  // layers, and which collide (a pair each way); a layer a node is on can't go
  assert.deepEqual((await call('game', { op: 'settings', set: { layers: ['default', 'props'] } })).steps, ['Physics layers (MCP)']);
  const c = await call('game', { op: 'settings', set: { collides: { props: ['props'] } } });
  assert.deepEqual(c.steps, ['props passes through default (MCP)']);
  assert.deepEqual(c.settings.collides, { default: ['default'], props: ['props'] });
  await call('set', { id: 'floor', path: 'props.layer', value: 'props' });
  const used = await t.call('game', { op: 'settings', set: { layers: ['default'] } });
  assert.ok(used.isError); assert.match(used.text, /"props" is in use \(level\.vrmxs: floor\)/);
  for (const [set, why] of [
    [{ entry: 'nowhere.vrmxs' }, /entry: "nowhere\.vrmxs" isn't a scene of the project/],
    [{ scenes: [] }, /level\.vrmxs is the entry scene: it stays in scenes/],
    [{ id: 'Not An Id' }, /id/],
    [{ input: {} }, /input isn't a setting here/],
    [{ behaviours: 'nothing.js' }, /behaviours: a \.js file of the project/],
  ]) { const x = await t.call('game', { op: 'settings', set }); assert.ok(x.isError, JSON.stringify(set)); assert.match(x.text, why); }
  // the settings' own history: the agent's steps are there, marked, and its undo writes game.json back
  const st = await t.target.settings();
  assert.equal(st.history().undo, 'props passes through default (MCP)');
  await st.undo();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8')).physics, { layers: ['default', 'props'] });
  await assert.rejects(st.undo(), /"props" is in use/, 'the undo is guarded as the edit is: the floor is on props');
  await call('undo'); // the floor's layer: the scene's own undo
  await st.undo();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8')).physics, undefined);
  assert.equal(st.history().undo, 'Settings: title, release (MCP)');
});

test('scenes: open a new one (empty, or a copy of another), refused over unsaved changes; saved, the game names it and validates', async () => {
  const { dir, t, call } = await open('scenes');
  await call('set', { id: 'lamp', path: 'props.intensity', value: 2 });
  const busy = await t.call('game', { op: 'open', scene: 'level-2.vrmxs' });
  assert.ok(busy.isError); assert.match(busy.text, /level\.vrmxs has unsaved changes: save first/);
  await call('save');
  const o = await call('game', { op: 'open', scene: 'level-2.vrmxs', from: 'level.vrmxs' });
  assert.deepEqual([o.open, o.new, o.from, o.nodes], ['level-2.vrmxs', true, 'level.vrmxs', 9]);
  assert.equal(t.doc.id, 'level-2');
  assert.match((await t.call('game', { op: 'open', scene: 'level.vrmxs' })).text, /level-2\.vrmxs has unsaved changes/, 'a copy is unsaved until it is saved');
  await call('edit', { ops: [{ op: 'remove', id: 'zone' }, { op: 'set', id: 'visit', path: 'props.text', value: 'Visit the gate again' }] });
  const settingsFirst = await t.call('game', { op: 'settings', set: { scenes: ['level.vrmxs', 'level-2.vrmxs'] } });
  assert.match(settingsFirst.text, /level-2\.vrmxs" isn't a scene of the project \(save a new scene before naming it\)/);
  await call('save');
  assert.ok(fs.existsSync(path.join(dir, 'level-2.vrmxs')));
  await call('game', { op: 'settings', set: { scenes: ['level.vrmxs', 'level-2.vrmxs'] } });
  await call('connect', { from: 'rules', signal: 'won', to: 'rules', call: 'changeScene', args: { to: 'level.vrmxs' } });
  await call('save');
  const unlicensed = await call('game', { op: 'validate' });
  assert.deepEqual(unlicensed.problems.map((x) => [x.check, x.file]), [['licence', 'level-2.vrmxs']]);
  const row = await call('game', { op: 'settings', set: { licence: { file: 'level-2.vrmxs', licence: 'Xocialize original', source: 'A second level | made over MCP' } } });
  assert.equal(row.licence.row, '| `level-2.vrmxs` | Xocialize original | A second level \\| made over MCP |');
  assert.match(fs.readFileSync(path.join(dir, 'LICENCES.md'), 'utf8'), /\| `level\.vrmxs` \| Xocialize original \| Written for the test \|\n\| `level-2\.vrmxs` \| Xocialize original/);
  assert.match((await t.call('game', { op: 'settings', set: { licence: { file: 'level-2.vrmxs', licence: 'CC0-1.0' } } })).text, /licensed already, by the row `level-2\.vrmxs`/);
  const v = await call('game', { op: 'validate' });
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.deepEqual(v.game.scenes, ['level-2.vrmxs', 'level.vrmxs']);
  // an empty new one, and back to one that exists; a path that isn't a scene's is refused
  assert.equal((await call('game', { op: 'open', scene: 'rooms/empty.vrmxs' })).nodes, 1);
  assert.equal((await call('game', { op: 'open', scene: 'level.vrmxs' })).new, false);
  assert.equal(t.doc.nodes.find((n) => n.id === 'lamp').props.intensity, 2);
  for (const scene of ['../outside.vrmxs', 'level.json', '.hidden.vrmxs']) assert.ok((await t.call('game', { op: 'open', scene })).isError, scene);
  assert.match((await t.call('game', { op: 'open', scene: 'level.vrmxs', from: 'level-2.vrmxs' })).text, /exists already/);
});

test('new project: the templates listed; none made without --projects; with it, made from a template and opened on its entry scene, with its own behaviours', async () => {
  const none = await open('no-projects');
  const list = await none.call('game', { op: 'new' });
  assert.deepEqual(list.templates.map((x) => x.template), ['empty', 'level']);
  const refused = await none.t.call('game', { op: 'new', template: 'level', title: 'Cafe Dash' });
  assert.ok(refused.isError); assert.match(refused.text, /without --projects <folder>/);
  assert.match((await none.t.call('game', { op: 'new', template: 'nope', title: 'X' })).text, /no template "nope" \(there are: empty, level\)/);
  const projects = path.join(work, 'projects');
  const { t, call, registry } = await open('with-projects', { projects });
  assert.ok(registry.behaviours.has('scoreZone'));
  const made = await call('game', { op: 'new', template: 'level', title: 'Cafe Dash' });
  assert.equal(made.project, path.join(projects, 'cafe-dash'));
  assert.deepEqual([made.game, made.open, made.files], [{ id: 'cafe-dash', title: 'Cafe Dash' }, 'level.vrmxs', 37]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(projects, 'cafe-dash/game.json'), 'utf8')).title, 'Cafe Dash');
  assert.ok(!registry.behaviours.has('scoreZone'), 'the last project\'s behaviours go');
  assert.ok(t.doc.nodes.some((n) => n.type === 'GameGoal'));
  const v = await call('game', { op: 'validate' });
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.equal((await call('game', { op: 'settings' })).settings.title, 'Cafe Dash');
  assert.match((await t.call('game', { op: 'new', template: 'empty', title: 'Cafe Dash' })).text, /isn't empty/, 'never into a project that is there');
});

test('a root behaviours.js that game.json doesn\'t name: validate warns (an export would leave it out), and settings names it', async () => {
  const { dir, call } = await open('unnamed-behaviours');
  fs.renameSync(path.join(dir, 'behaviours.js'), path.join(dir, 'behaviours.tmp'));
  const game = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
  delete game.behaviours;
  fs.writeFileSync(path.join(dir, 'game.json'), `${JSON.stringify(game, null, 1)}\n`);
  fs.renameSync(path.join(dir, 'behaviours.tmp'), path.join(dir, 'behaviours.js'));
  const v = await call('game', { op: 'validate' });
  assert.ok(v.warnings.some((w) => w.check === 'behaviour' && /behaviours\.js, which game\.json doesn't name: the editor's Play runs it, but an export leaves it out/.test(w.message)), JSON.stringify(v.warnings));
  assert.deepEqual((await call('game', { op: 'settings', set: { behaviours: 'behaviours.js' } })).steps, ['Settings: behaviours (MCP)']);
  assert.ok(!(await call('game', { op: 'validate' })).warnings.some((w) => /doesn't name/.test(w.message)));
});

test('new project: when the project made has a root behaviours.js that game.json doesn\'t name, it is named, one settings step', async () => {
  const { dir, t, call } = await open('code-template');
  const game = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8')); delete game.behaviours;
  fs.writeFileSync(path.join(dir, 'game.json'), `${JSON.stringify(game, null, 1)}\n`);
  // the target's own New Project is tested above; here it stands in for one that made this folder and opened it
  t.target.templates = () => [{ id: 'with-code', title: 'With code', description: '', files: [] }];
  t.target.newProject = async ({ template, title }) => ({ project: dir, template: template.id, title });
  const made = await call('game', { op: 'new', template: 'with-code', title: 'Coded' });
  assert.deepEqual(made.behaviours, { set: 'behaviours.js', steps: ['Settings: behaviours (MCP)'] });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8')).behaviours, 'behaviours.js');
});

test('prefabs load when an edit places one the scene didn\'t use: validate, the flattened tree and the engine see it', async () => {
  const { dir, t, call } = await open('prefabs');
  for (const f of ['prefabs/door.vrmxs', 'props/door-frame.glb', 'props/door-panel.glb']) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(sample, f), path.join(dir, f)); }
  await call('edit', { label: 'A door', ops: [
    { op: 'addAsset', asset: { id: 'door', type: 'vrmxs', ref: 'prefabs/door.vrmxs' } },
    { op: 'add', node: { id: 'door-1', type: 'Instance', parent: 'root', asset: 'door', transform: { p: [0, 0, -3] } } },
  ] });
  assert.ok(t.session.prefabs.has('prefabs/door.vrmxs'), 'read from the project when first asked for');
  const v = await call('validate');
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.match(await call('tree', { flatten: true }), /door-1\/hinge/);
  const inner = (await call('get_node', { id: 'door-1/hinge' })).node;
  assert.equal(inner.type, 'RigidBody');
  assert.ok((await call('engine_load')).nodes > 9);
  await call('connect', { from: 'gate', signal: 'bodyEntered', to: 'door-1/hinge', call: 'open' });
});

// ---------------------------------------------------------------- validate (documents, no server)

const files = (o) => ({ files: Object.keys(o).sort(), read: async (ref) => { if (!(ref in o)) throw new Error(`no ${ref}`); return new TextEncoder().encode(o[ref]); } });
const scene = (nodes, connections = []) => JSON.stringify({ format: 'vrmxs', version: 1, id: 'level', assets: [], nodes: [{ id: 'root', type: 'Node3D' }, { id: 'floor', type: 'Collider', parent: 'root', props: { shape: 'box', size: [9, 1, 9] } }, ...nodes], connections });
const LIC = (refs) => `| File | Licence | Source |\n|---|---|---|\n${refs.map((r) => `| \`${r}\` | Ours | Test |`).join('\n')}\n`;
async function fixtureRegistry() { const reg = m0Registry(); declareProjectBehaviours(reg, await new Project(fixture).behaviours()); return reg; }

test('validate covers the project\'s behaviours: one nobody has is a problem, one with no describe a warning, a declared one\'s signals connect', async () => {
  const reg = await fixtureRegistry();
  const game = JSON.stringify({ format: 'vrmxg-game', version: 1, id: 'b', title: 'B', entry: 'level.vrmxs', scenes: ['level.vrmxs'], behaviours: 'behaviours.js' });
  const level = scene([
    { id: 'zone', type: 'Area', parent: 'root', behaviours: [{ use: 'scoreZone' }] },
    { id: 'lamp', type: 'PointLight', parent: 'root', behaviours: [{ use: 'blink' }] },
    { id: 'sign', type: 'Node3D', parent: 'root', behaviours: [{ use: 'glow' }] },
  ], [{ from: 'zone', signal: 'scored', to: 'lamp', call: 'hide' }, { from: 'zone', signal: 'sparkled', to: 'lamp', call: 'show' }]);
  const p = files({ 'game.json': game, 'level.vrmxs': level, 'behaviours.js': fs.readFileSync(path.join(fixture, 'behaviours.js'), 'utf8'), 'LICENCES.md': LIC(['game.json', 'level.vrmxs', 'behaviours.js', 'LICENCES.md']) });
  const v = await validateGame(p, { registry: reg, behaviours: { ref: 'behaviours.js', names: ['scoreZone', 'blink'], problems: [] } });
  const msgs = (list, check) => list.filter((x) => x.check === check).map((x) => x.message);
  assert.deepEqual(v.problems.filter((x) => x.check === 'behaviour').map((x) => [x.scene, x.node]), [['level.vrmxs', 'sign']]);
  assert.match(msgs(v.problems, 'behaviour')[0], /"sign" uses the behaviour glow, which neither the engine nor the project's behaviours\.js has/);
  assert.match(msgs(v.warnings, 'behaviour')[0], /^blink \(in behaviours\.js\) has no static describe/);
  // the declared signal connects; one it doesn't declare is the scene's schema problem, naming it
  assert.deepEqual(v.problems.filter((x) => x.check === 'scene').map((x) => x.message.replace(/^\/connections\/\d+ /, '')), ['Area "zone" has no signal "sparkled" (has: ready, bodyEntered, bodyExited, scored)']);
  // a module that didn't load: one problem on its file, not one per node
  const broken = await validateGame(p, { registry: m0Registry(), behaviours: { ref: 'behaviours.js', names: null, problems: ['behaviours.js didn\'t load: SyntaxError'] } });
  assert.deepEqual(broken.problems.filter((x) => x.check === 'behaviour').map((x) => x.file), ['behaviours.js']);
});

test('validate, AB-T-0641: an optional goal nothing completes is a note; a goal code could reach is a warning naming how; a misspelled key is a problem though the code uses the game service', async () => {
  const reg = await fixtureRegistry();
  const game = JSON.stringify({ format: 'vrmxg-game', version: 1, id: 'g', title: 'G', entry: 'level.vrmxs', scenes: ['level.vrmxs'], behaviours: 'behaviours.js' });
  const goal = (id, when, more = {}) => ({ id, type: 'GameGoal', parent: 'rules', props: { text: id, ...(when ? { when } : {}), ...more } });
  const at = (key, value = 1) => ({ test: 'state', key, op: 'ge', value });
  const level = scene([
    { id: 'zone', type: 'Area', parent: 'root', behaviours: [{ use: 'scoreZone' }] }, // adds to its param's counter: "points" by default
    { id: 'rules', type: 'GameRules', parent: 'root', props: { reads: { counters: ['pionts', 'stars'] } } },
    { id: 'points', type: 'GameCounter', parent: 'rules' },
    goal('score', at('counters.points')),
    goal('typo', at('counters.pionts')),
    goal('stars', at('counters.stars')),
    goal('hint', null, { optional: true }),
  ]);
  const src = fs.readFileSync(path.join(fixture, 'behaviours.js'), 'utf8');
  const p = (code) => files({ 'game.json': game, 'level.vrmxs': level, 'behaviours.js': code, 'LICENCES.md': LIC(['game.json', 'level.vrmxs', 'behaviours.js', 'LICENCES.md']) });
  const v = await validateGame(p(src), { registry: reg, behaviours: { ref: 'behaviours.js', names: ['scoreZone', 'blink'], problems: [] } });
  const goals = (list) => list.filter((x) => x.check === 'goal').map((x) => x.node);
  assert.deepEqual(goals(v.problems), ['typo', 'stars']);
  assert.match(v.problems.find((x) => x.node === 'typo').message, /counters\.pionts never changes.*The project's behaviours use the game service, but none of them is given, or names, what it reads/);
  assert.deepEqual(goals(v.warnings), ['score']);
  assert.match(v.warnings.find((x) => x.node === 'score').message, /Code may: the project behaviour scoreZone on "zone" \(level\.vrmxs\) has counter "points" \(its default\)/);
  assert.deepEqual(goals(v.notes), ['hint']);
  assert.match(v.notes[0].message, /optional, a label only: nothing in the game's scenes completes it/);
  // a key the code writes as a string reaches it too; code that doesn't mention the game service reaches nothing
  const v2 = await validateGame(p(`${src}\nexport const STARS = 'stars';\n`), { registry: reg });
  assert.match(v2.warnings.find((x) => x.node === 'stars').message, /Code may: behaviours\.js names "stars"/);
  const quiet = src.replace("this.tree.services.get('game')?.add(this.params.counter ?? 'points', by);", '');
  const v3 = await validateGame(p(quiet), { registry: reg });
  assert.deepEqual(goals(v3.problems), ['score', 'typo', 'stars']);
  assert.deepEqual(goals(v3.notes), ['hint'], 'an optional goal is a note either way');
});

test('validate on the sample game (AB-T-0641\'s acceptance): serve is a warning naming the code path, press-start an optional-goal note', async () => {
  const src = folderReader(sample);
  const rush = { files: src.files, read: (ref) => (ref === 'game.json' ? src.read('game/game.json') : src.read(ref)) };
  const project = new Project(sample, { behaviours: 'game/behaviours.js' });
  const reg = m0Registry();
  declareProjectBehaviours(reg, await project.behaviours());
  const v = await validateGame(rush, { registry: reg, behaviours: { ref: 'game/behaviours.js', names: [...(await project.behaviours()).keys()], problems: [] } });
  assert.equal(v.game.id, 'morning-rush');
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  const serve = v.warnings.filter((x) => x.check === 'goal');
  assert.deepEqual(serve.map((x) => [x.scene, x.node]), [['game/level.vrmxs', 'serve']]);
  assert.match(serve[0].message, /Code may: the project behaviour tableZone on "table-1" \(game\/level\.vrmxs\) has served "served" \(its default\)/);
  assert.deepEqual((v.notes ?? []).map((x) => [x.scene, x.node]), [['game/title.vrmxs', 'press-start']]);
});
