// Saving a scene (saving.js) with what M5 W6 added: the prefabs an Apply changed are written first, and Save As over a
// prefab the scene places is refused before anything is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse } from '@vrmxg/scene';
import { EditorSession } from '@vrmxg/editor-core';
import { saveScene } from '../src/saving.js';

const SAMPLE = path.join(import.meta.dirname, '../../../content/sample');
const prefabs = () => new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((r) => [r, parse(fs.readFileSync(path.join(SAMPLE, r), 'utf8'))]));
const project = () => { const written = []; return { written, write: async (ref, text) => { written.push(ref); return { path: ref, bytes: text.length }; } }; };

test('Save As over a prefab the scene places is refused, nothing written', async () => {
  const s = EditorSession.empty(m0Registry(), 'doors');
  s.prefabs = prefabs();
  s.addFromAsset('prefabs/double-door.vrmxs');
  const p = project();
  await assert.rejects(saveScene(s, p, 'prefabs/door.vrmxs'), /places prefabs\/double-door\.vrmxs, which leads to prefabs\/door\.vrmxs/);
  await assert.rejects(saveScene(s, p, 'prefabs/double-door.vrmxs'), /cycle/);
  assert.deepEqual(p.written, []);
  assert.ok(s.dirty, 'still unsaved');
  await saveScene(s, p, 'doors.vrmxs');
  assert.deepEqual(p.written, ['doors.vrmxs']);
});

test('a prefab an Apply changed is written before the scene, and marked saved', async () => {
  const s = EditorSession.empty(m0Registry(), 'doors');
  s.prefabs = prefabs();
  const d = s.addFromAsset('prefabs/door.vrmxs');
  s.setOverride(`${d}/hinge`, 'props.mass', 20);
  s.applyOverride(d);
  const p = project();
  await saveScene(s, p, 'doors.vrmxs');
  assert.deepEqual(p.written, ['prefabs/door.vrmxs', 'doors.vrmxs']);
  assert.ok(!s.dirty);
});
