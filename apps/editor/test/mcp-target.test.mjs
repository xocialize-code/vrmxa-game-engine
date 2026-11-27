// M6 W8 (AB-T-0649): the editor's MCP target (src/mcp.js) over a stand-in host, in Node: behaviour, connection and
// batch edits land in the open session as steps of its own Undo, marked (MCP); game op=open opens a scene, makes a new
// one or copies one through the host; settings and New Project go to what App.vue hands it; validate hears about the
// project's behaviours module as the editor loaded it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { EditorSession } from '@vrmxg/editor-core';
import { createHandlers, caller } from '@vrmxg/mcp/tools';
import { editorTarget } from '../src/mcp.js';

const level = { format: 'vrmxs', version: 1, id: 'level', assets: [], nodes: [{ id: 'root', type: 'Node3D' }, { id: 'zone', type: 'Area', parent: 'root' }, { id: 'lamp', type: 'PointLight', parent: 'root' }], connections: [] };

function standIn() {
  const registry = m0Registry();
  const calls = [];
  const ed = {
    registry, session: new EditorSession({ registry, doc: structuredClone(level) }), sceneRef: 'level.vrmxs', error: '',
    behaviourProblems: [],
    project: { has: (ref) => ['level.vrmxs', 'ending.vrmxs'].includes(ref), files: ['level.vrmxs', 'ending.vrmxs'], behavioursModule: { ref: 'behaviours.js', classes: new Map([['blink', class {}]]) } },
    async openScene(ref) { calls.push(['openScene', ref]); this.session = new EditorSession({ registry, doc: { ...structuredClone(level), id: ref } }); this.sceneRef = ref; },
    async newScene(ref) { calls.push(['newScene', ref]); this.session = EditorSession.empty(registry, 'new'); this.sceneRef = ref; },
    async copyScene(from, ref) { calls.push(['copyScene', from, ref]); this.session = new EditorSession({ registry, doc: structuredClone(level) }); this.session.savedText = ''; this.sceneRef = ref; },
    changed() {},
  };
  const settings = { marker: 'the app\'s ProjectSettings' };
  const app = { settings: async () => settings, newProject: async (o) => ({ made: o.template.id, title: o.title, id: o.id ?? null }), templates: async () => [{ id: 'empty', title: 'Empty game', description: '', files: [{}, {}] }, { id: 'level', title: 'One level', description: '', files: [{}] }] };
  return { ed, calls, call: caller(createHandlers(registry, editorTarget(/** @type {any} */ (ed), app))), settings };
}

test('the editor\'s target: behaviours and connections are steps of the open session\'s Undo, marked (MCP)', async () => {
  const { ed, call } = standIn();
  const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r.text; };
  await ok('edit', { ops: [{ op: 'behaviour', id: 'lamp', use: 'switchedBy', params: { state: 'on' } }] });
  await ok('connect', { from: 'lamp', signal: 'ready', to: 'lamp', call: 'hide' });
  await ok('edit', { label: 'Unwire the lamp', ops: [{ op: 'disconnect', index: 0 }, { op: 'behaviour', id: 'lamp', use: 'switchedBy', remove: true }] });
  await ok('set', { id: 'lamp', path: 'props.intensity', value: 2 });
  assert.deepEqual(ed.session.editor.history().map((o) => o.label), ['switchedBy on lamp (MCP)', 'Connect lamp.ready to lamp.hide (MCP)', 'Unwire the lamp (MCP)', 'Set lamp props.intensity (MCP)']);
  assert.equal((await call('undo')).text, 'undone');
  assert.equal(ed.session.history().undo, 'Unwire the lamp (MCP)');
  // refused while playing, as the editor's own edits are
  ed.session.mode = 'playing';
  const r = await call('edit', { ops: [{ op: 'behaviour', id: 'lamp', use: 'switchedBy' }] });
  assert.ok(r.isError); assert.match(r.text, /stop playing first/);
});

test('the editor\'s target: game op=open opens, makes or copies a scene through the host, and refuses over unsaved changes', async () => {
  const { ed, calls, call } = standIn();
  assert.match((await call('game', { op: 'open', scene: 'ending.vrmxs' })).text, /"open":"ending\.vrmxs","new":false/);
  assert.match((await call('game', { op: 'open', scene: 'level-2.vrmxs', from: 'level.vrmxs' })).text, /"new":true,"from":"level\.vrmxs"/);
  assert.match((await call('game', { op: 'open', scene: 'ending.vrmxs' })).text, /level-2\.vrmxs has unsaved changes/, 'a copy is unsaved');
  ed.session.savedText = ed.session.text();
  assert.match((await call('game', { op: 'open', scene: 'rooms/new.vrmxs' })).text, /"new":true/);
  assert.match((await call('game', { op: 'open', scene: 'level-3.vrmxs', from: 'nowhere.vrmxs' })).text, /no scene nowhere\.vrmxs to copy/);
  assert.deepEqual(calls, [['openScene', 'ending.vrmxs'], ['copyScene', 'level.vrmxs', 'level-2.vrmxs'], ['newScene', 'rooms/new.vrmxs']]);
});

test('the editor\'s target: settings and New Project are the app\'s; validate hears the behaviours module the editor loaded', async () => {
  const { call } = standIn();
  const target = editorTarget(/** @type {any} */ (standIn().ed), { settings: async () => 'S' });
  assert.equal(await target.settings(), 'S');
  const playing = standIn(); playing.ed.session.mode = 'playing';
  assert.match((await playing.call('game', { op: 'settings' })).text, /stop playing first/);
  assert.deepEqual(target.behaviours(), { ref: 'behaviours.js', names: ['blink'], problems: [] });
  const none = editorTarget(/** @type {any} */ (standIn().ed));
  assert.equal(none.settings, undefined, 'no app: no settings');
  const r = await caller(createHandlers(m0Registry(), none))('game', { op: 'settings' });
  assert.ok(r.isError); assert.match(r.text, /project settings isn't available here/);
  // New Project: the list, then the template checked against it before the app is asked (which asks the person where)
  assert.deepEqual(JSON.parse((await call('game', { op: 'new' })).text).templates.map((t) => [t.template, t.files]), [['empty', 2], ['level', 1]]);
  assert.deepEqual(JSON.parse((await call('game', { op: 'new', template: 'level', title: ' Cafe Dash ', name: 'cafe' })).text), { made: 'level', title: 'Cafe Dash', id: 'cafe' });
  assert.match((await call('game', { op: 'new', template: 'level', title: 'X', name: 'Not An Id' })).text, /name: the game's id/);
  assert.match((await call('game', { op: 'new', template: 'level' })).text, /title: the new game's title/);
});
