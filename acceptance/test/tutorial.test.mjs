// M6 W9 (AB-T-0650): the game builder's tutorial (docs/guide/tutorial.md) held to its scenario and to the engine.
// - every numbered step of the page is a row of the Mac editor's scenario, by its heading, in order, and of its checklist;
// - the WebGL twin is the WebGPU scenario but for its env and renderer lines;
// - the behaviour the page has you write declares itself into the registry (params, the signal, its state shape) and
//   its licence row is one row the scenario's text editor can add to a LICENCES.md table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours, stateShape } from '@vrmxg/registry';
import { tutorialSteps, tutorialFiles, withLicenceRow, webglTwin, SCENARIO, PAGE } from '../m6/tutorial.mjs';

const rows = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => m[1].replace(/ \*.*$/, '').trim());

test('every step of the tutorial is a row of the scenario and of its checklist, by its heading, in order', () => {
  const steps = tutorialSteps().map((s) => `${s.n}. ${s.title}`);
  assert.ok(steps.length >= 10, `${steps.length} steps`);
  assert.deepEqual(steps.map((s) => Number(s.split('.')[0])), steps.map((_, i) => i + 1), 'numbered 1, 2, 3…');
  assert.deepEqual(rows(SCENARIO), steps, 'the scenario\'s rows are the page\'s headings');
  assert.deepEqual(rows(SCENARIO.replace(/\.scenario\.md$/, '-webgl.scenario.md')), steps);
  assert.deepEqual(rows(path.join(path.dirname(SCENARIO), '../HAND-TEST-M6-TUTORIAL.md')), steps, 'and the checklist\'s');
});

test('the WebGL twin is the scenario but for its env and renderer lines', () => {
  const a = fs.readFileSync(SCENARIO, 'utf8').split('\n'), b = fs.readFileSync(SCENARIO.replace(/\.scenario\.md$/, '-webgl.scenario.md'), 'utf8').split('\n');
  assert.equal(a.length, b.length);
  const differ = a.map((l, i) => (l === b[i] ? null : [l, b[i]])).filter(Boolean);
  for (const [x, y] of differ) assert.ok(/^(# |env: |  expect find\("id=renderer"\)|  screenshot path=\/tmp\/vrmxg-w9-tutorial)/.test(x), `only the title, env, renderer and trigger lines differ: ${x} / ${y}`);
  assert.ok(differ.some(([, y]) => /VRMXG_QUERY.*renderer=webgl/.test(y)), 'the twin forces WebGL');
  assert.equal(b.join('\n'), webglTwin(a.join('\n')), 'written by tutorial.mjs twin: run it after editing the scenario');
});

test('the page\'s behaviour declares itself: params with defaults, the collected signal, its state shape', async () => {
  const { behaviours } = tutorialFiles();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-tutorial-')), file = path.join(dir, 'behaviours.mjs');
  // @vrmxg/core resolves from the repository, as the editor's import map gives it to a project's module
  fs.writeFileSync(file, behaviours.replace("from '@vrmxg/core'", `from ${JSON.stringify(import.meta.resolve('@vrmxg/core'))}`));
  try {
    const mod = await import(pathToFileURL(file).href);
    const reg = m0Registry();
    assert.deepEqual(declareProjectBehaviours(reg, mod), ['coin']);
    const b = reg.behaviours.get('coin');
    assert.equal(b.source, 'project');
    assert.deepEqual(b.on, ['Area']);
    assert.deepEqual(Object.keys(b.params), ['player', 'counter', 'value']);
    assert.deepEqual(Object.keys(b.signals), ['collected']);
    assert.equal(stateShape(b), '{"additionalProperties":false,"properties":{"taken":{"type":"boolean"},"touched":{"type":"boolean"}},"required":["taken","touched"],"type":"object"}');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the licence row goes at the end of the LICENCES.md table, once', () => {
  const { licenceRow } = tutorialFiles();
  const licences = fs.readFileSync(path.join(import.meta.dirname, '../../content/templates/level/LICENCES.md'), 'utf8');
  const after = withLicenceRow(licences, licenceRow);
  assert.equal(after.trimEnd().split('\n').at(-1), licenceRow);
  assert.equal(withLicenceRow(after, licenceRow), after, 'added once');
  assert.ok(fs.readFileSync(PAGE, 'utf8').includes(licenceRow));
});
