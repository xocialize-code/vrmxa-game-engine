// M6 W9 (AB-T-0650, review of PR #69): which behaviours module the editor runs, held at the host's level. The host's
// behaviours code (host-behaviours.js: declare, read again, the classes a play world is built with), the panel's edit
// (project-settings.js settingsEdit, App.vue's settingsDo) and MCP's editor target (mcp.js) run here as the editor runs
// them, over a real Project and real ProjectSettings with the project's files in memory; host.js itself draws and
// can't be imported in Node, so its methods of the same names are one-line calls into host-behaviours.js.
// - game.json switched to a different module: Play builds with the new module; Undo goes back to the old one; MCP's
//   game op=settings route reads it too.
// - a root behaviours.js game.json doesn't name: Export Game's refusal is what the host keeps as lastGameExport, and
//   the Export line says it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SceneTree } from '@vrmxg/core';
import { m0Registry } from '@vrmxg/registry/m0';
import { behavioursImporter } from '@vrmxg/bundle/node';
import { sha256 } from '@vrmxg/bundle';
import { Project } from '../src/project.js';
import { freshBehaviours } from '../src/reload.js';
import { ProjectSettings, settingsEdit, writeJson } from '../src/project-settings.js';
import { declareBehaviours, reloadBehaviours, worldBehaviours } from '../src/host-behaviours.js';
import { exportGame, exportRefusal, gameExportLine, UNNAMED_BEHAVIOURS } from '../src/export-game.js';
import { editorTarget } from '../src/mcp.js';
import { createHandlers, caller } from '@vrmxg/mcp/tools';

// the page's importer with files for blob: URLs (Node can't import blob:), as reload.test.mjs links them
const linkedFiles = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-linked-'));
  behavioursImporter(dir); // @vrmxg/core for the modules in it
  const url = (_ref, src) => { const f = path.join(fs.realpathSync(dir), `${sha256(new TextEncoder().encode(src))}.mjs`); fs.writeFileSync(f, src); return pathToFileURL(f).href; };
  return { dir, url, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

/** A project folder in memory: reads, and writes as the shell's project.write does (the file list gains a new file). */
function memoryProject(files, linked) {
  const disk = new Map(Object.entries(files));
  const P = class extends Project {
    async bytes(ref) { if (!disk.has(ref)) throw new Error(`${ref}: 404`); return new TextEncoder().encode(disk.get(ref)); }
    async write(ref, text) { disk.set(ref, text); if (!this.files.includes(ref)) this.files = [...this.files, ref].sort(); return { path: ref, bytes: text.length }; }
  };
  const p = new P({ base: '/project/', files: [...disk.keys()].sort(), name: 'Coin Run', writable: true, importer: (q) => freshBehaviours(q, { url: linked.url }) });
  return { p, disk };
}

/** A behaviours module whose `mover` says which module it came from (its state), and one more class of its own. */
const MODULE = (which, extra) => `import { Behaviour } from '@vrmxg/core';
export class mover extends Behaviour {
  static describe = { state: { type: 'object', properties: { from: { type: 'string' } } } };
  getState() { return { from: '${which}' }; }
}
export class ${extra} extends Behaviour { static describe = { state: { type: 'null' } }; getState() { return null; } }
`;
const GAME = (behaviours) => writeJson({ format: 'vrmxg-game', version: 1, id: 'coin-run', title: 'Coin Run', entry: 'level.vrmxs', ...(behaviours ? { behaviours } : {}) });
const LEVEL = JSON.stringify({ format: 'vrmxs', version: 1, id: 'level', nodes: [{ id: 'root', type: 'Node3D' }, { id: 'a', type: 'Node3D', parent: 'root', behaviours: [{ use: 'mover' }] }], connections: [] });

/** The host's fields host-behaviours.js works on, and its reloadBehaviours (host.js calls the same function). */
function hostFor(project, registry) {
  const host = { project, behaviourProblems: [], behaviourError: '', behaviourSources: null, _bareFor: null, changes: 0, changed() { host.changes++; } };
  host.reloadBehaviours = () => reloadBehaviours(host, registry);
  return host;
}

/** What Play builds a world with now: the host's classes in a tree of the level, stepped once; who `mover` is. */
async function playedFrom(host, registry) {
  const tree = new SceneTree({ registry, behaviours: await worldBehaviours(host, host.project) }).instantiate(JSON.parse(LEVEL));
  tree.run(1);
  return tree.find('a').behaviours[0].getState().from;
}

const projectNames = (registry) => [...registry.behaviours.values()].filter((b) => b.source === 'project').map((b) => b.name).sort();

test('game.json switched to another module in Project Settings: the editor reads it at once, Play runs it, Undo goes back, MCP\'s route too', async () => {
  const linked = linkedFiles();
  try {
    const { p, disk } = memoryProject({ 'game.json': GAME('behaviours.js'), 'level.vrmxs': LEVEL, 'behaviours.js': MODULE('first', 'alpha'), 'game/other.js': MODULE('second', 'beta') }, linked);
    const registry = m0Registry(), host = hostFor(p, registry);
    await declareBehaviours(host, registry, p); // openProject
    assert.equal(p.behavioursModule.ref, 'behaviours.js');
    assert.deepEqual(projectNames(registry), ['alpha', 'mover']);
    assert.equal(await playedFrom(host, registry), 'first');

    // the panel's edit, as settingsDo makes it: one undo step, and the module read again
    const settings = await ProjectSettings.load(p);
    const reads = [];
    const onModuleChange = async (m) => { reads.push(m); return host.reloadBehaviours(); };
    await settingsEdit(settings, (s) => s.setBehaviours('game/other.js'), { onModuleChange });
    assert.equal(JSON.parse(disk.get('game.json')).behaviours, 'game/other.js', 'written to game.json');
    assert.deepEqual(reads, ['game/other.js']);
    assert.equal(p.behavioursModule.ref, 'game/other.js', 'the module game.json names now, not the one read at open');
    assert.deepEqual(projectNames(registry), ['beta', 'mover'], 'its declarations replace the old module\'s (the inspector\'s Add list)');
    assert.equal(await playedFrom(host, registry), 'second', 'Play builds with the new module');
    assert.ok(host.changes > 0, 'the host said it changed (the panels refresh)');

    // an edit that leaves the module as it was reads nothing
    await settingsEdit(settings, (s) => s.setTitle('Coin Run Deluxe'), { onModuleChange });
    assert.deepEqual(reads, ['game/other.js']);

    // Undo the title, then the module: back to behaviours.js, read again
    await settingsEdit(settings, (s) => s.undo(), { onModuleChange });
    await settingsEdit(settings, (s) => s.undo(), { onModuleChange });
    assert.deepEqual(reads, ['game/other.js', 'behaviours.js']);
    assert.equal(JSON.parse(disk.get('game.json')).behaviours, 'behaviours.js');
    assert.equal(p.behavioursModule.ref, 'behaviours.js');
    assert.equal(await playedFrom(host, registry), 'first', 'Undo puts the old module back in Play');

    // MCP's game op=settings calls the editor target's behavioursChanged once it has written game.json: the same read
    await p.write('game.json', GAME('game/other.js'));
    const r = await editorTarget(host).behavioursChanged();
    assert.equal(r.module, 'game/other.js');
    assert.deepEqual([...r.declared].sort(), ['beta', 'mover']);
    assert.equal(r.problems, undefined);
    assert.equal(await playedFrom(host, registry), 'second');
  } finally { linked.done(); }
});

test('MCP\'s game op=settings on the editor\'s target: set.behaviours reads the module again through behavioursChanged; other keys and the same module don\'t', async () => {
  // the trigger in @vrmxg/mcp's settingsOp follows the panel's own setBehaviours step ("Behaviours …"), run here end to end:
  // the game tool, the editor's target, the app's ProjectSettings and the host's read, with no hook called by hand
  const linked = linkedFiles();
  try {
    const { p, disk } = memoryProject({ 'game.json': GAME('behaviours.js'), 'level.vrmxs': LEVEL, 'behaviours.js': MODULE('first', 'alpha'), 'game/other.js': MODULE('second', 'beta') }, linked);
    const registry = m0Registry(), host = hostFor(p, registry);
    await declareBehaviours(host, registry, p);
    const reads = [];
    const read = host.reloadBehaviours;
    host.reloadBehaviours = () => { reads.push(JSON.parse(disk.get('game.json')).behaviours); return read(); };
    const settings = await ProjectSettings.load(p);
    const call = caller(createHandlers(registry, editorTarget(/** @type {any} */ (host), { settings: async () => settings })));
    const settingsCall = async (set) => { const r = await call('game', { op: 'settings', set }); assert.equal(r.isError, false, r.text); return JSON.parse(r.text); };

    // another key: game.json is written, the module isn't read
    let r = await settingsCall({ title: 'Coin Run Deluxe' });
    assert.deepEqual(r.steps, ['Settings: title (MCP)']);
    assert.equal(r.behaviours, undefined);
    assert.deepEqual(reads, []);

    // the module: written, then read by the host, and the answer says what it declared
    r = await settingsCall({ behaviours: 'game/other.js' });
    assert.deepEqual(r.steps, ['Behaviours game/other.js (MCP)']);
    assert.equal(JSON.parse(disk.get('game.json')).behaviours, 'game/other.js');
    assert.deepEqual(reads, ['game/other.js'], 'read once, after game.json names the new module');
    assert.equal(r.behaviours.module, 'game/other.js');
    assert.deepEqual([...r.behaviours.declared].sort(), ['beta', 'mover']);
    assert.equal(p.behavioursModule.ref, 'game/other.js');
    assert.deepEqual(projectNames(registry), ['beta', 'mover']);
    assert.equal(await playedFrom(host, registry), 'second', 'Play builds with the new module');

    // with another key in the same call: the game's keys one step, the module the panel's own next step, still read
    r = await settingsCall({ title: 'Coin Run', behaviours: 'behaviours.js' });
    assert.deepEqual(r.steps, ['Settings: title (MCP)', 'Behaviours behaviours.js (MCP)']);
    assert.deepEqual(settings.undoStack.slice(-2).map((x) => x.label), r.steps, 'the panel\'s own undo steps, marked');
    assert.deepEqual(reads, ['game/other.js', 'behaviours.js']);
    assert.equal(await playedFrom(host, registry), 'first');

    // the module game.json names already: no step, nothing read
    r = await settingsCall({ behaviours: 'behaviours.js' });
    assert.deepEqual(r.steps, []);
    assert.deepEqual(reads, ['game/other.js', 'behaviours.js']);
  } finally { linked.done(); }
});

test('a module that won\'t load after the switch is the host\'s problem, shown, and Play builds without it', async () => {
  const linked = linkedFiles();
  try {
    const { p } = memoryProject({ 'game.json': GAME('behaviours.js'), 'level.vrmxs': LEVEL, 'behaviours.js': MODULE('first', 'alpha'), 'broken.js': "throw new Error('half written');\n" }, linked);
    const registry = m0Registry(), host = hostFor(p, registry);
    await declareBehaviours(host, registry, p);
    const settings = await ProjectSettings.load(p);
    await settingsEdit(settings, (s) => s.setBehaviours('broken.js'), { onModuleChange: () => host.reloadBehaviours() });
    assert.match(host.behaviourError, /^The project's behaviours: .*half written/);
    assert.deepEqual(projectNames(registry), [], 'the old module\'s declarations went with it');
    assert.equal((await worldBehaviours(host, p)).size, 0, 'nothing of the old module runs either');
  } finally { linked.done(); }
});

test('a root behaviours.js game.json doesn\'t name: Export Game\'s refusal is what the host keeps (lastGameExport) and the Export line says it', async () => {
  const LICENCES = '| `game.json` | Ours | |\n| `level.vrmxs` | Ours | |\n| `behaviours.js` | Ours | |\n| `LICENCES.md` | Ours | |\n';
  const files = new Map(Object.entries({ 'game.json': GAME(null), 'level.vrmxs': LEVEL, 'behaviours.js': MODULE('first', 'alpha'), 'LICENCES.md': LICENCES }).map(([k, v]) => [k, new TextEncoder().encode(v)]));
  const project = { files: [...files.keys()], has: (f) => files.has(f), bytes: async (f) => files.get(f) };
  const calls = [];
  const shell = { inShell: true, call: async (m) => { calls.push(m); throw new Error('no folder should be asked for'); } };
  let lastGameExport = null;
  // host.js exportGame's catch: a refusal goes on the Export line, anything else to the window's error
  try { await exportGame(project, { shell }); } catch (e) { lastGameExport = exportRefusal(e); if (!lastGameExport) throw e; }
  assert.deepEqual(calls, [], 'no folder asked for');
  assert.deepEqual(lastGameExport, { refused: 'unnamed_behaviours', message: UNNAMED_BEHAVIOURS, files: undefined });
  assert.equal(gameExportLine(lastGameExport), `Game export refused (unnamed_behaviours): ${UNNAMED_BEHAVIOURS}`);
  assert.match(gameExportLine(lastGameExport), /Project Settings › Behaviours/, 'and says what to do');
  // what isn't a refusal stays the window's error
  assert.equal(exportRefusal(new Error('the disk is full')), null);
  assert.equal(exportRefusal(Object.assign(new Error('nothing was exported'), { code: 'cancelled' })), null);
});
