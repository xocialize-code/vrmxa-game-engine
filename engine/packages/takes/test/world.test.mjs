// M4 W9 (AB-T-0581): takes in the film's world (needs vrmxa-core beside the repo for the characters).
//   - Recording is repeatable: the sample's three takes, recorded again here by the real recorder from their scripted
//     performers, are the committed logs byte for byte.
//   - What was performed is what the film plays: Mira's walk in the kept film is the walk of the live take, step for
//     step and bit for bit (the move track holds the same intent on the same steps); her face in the film stays within
//     the thinning's tolerance of the live take's; Hana, directed, says her lines and walks over in both.
//   - The film with the takes kept replays exactly: takes-check.js, the check the acceptance runs in Node, Chromium and
//     WKWebView (twice the same, a snapshot inside a take restored, the takes doing what was performed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import { composeSequence } from '@vrmxg/sequence';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { takesCheck, takesPerformed } from '../../../../apps/playground/src/takes-check.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';
import { recordSampleTakes, takeText, SAMPLE_TAKES, SHORT } from '../../../../content/sample/tools/make-takes.mjs';
import { withTake, faceSetup } from '../src/index.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const skip = !fs.existsSync(PATHS.core) && 'needs vrmxa-core';
const golden = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'golden.json'), 'utf8'));
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));

async function setup() {
  const R = await loadRapier(), core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const opts = { vrmxaCore: core, closet, behaviours, stubTextures: true };
  const short = parse(fs.readFileSync(path.join(content, SHORT), 'utf8')), set = parse(fs.readFileSync(path.join(content, short.set), 'utf8'));
  const build = async (doc) => { const sample = await loadSample(bytes, short.set); sample.doc = doc; return buildWorld(R, sample, opts); };
  return { R, opts, short, set, build };
}
const pos = (tree, id) => tree.find(id).object3d.position.toArray();
const face = (tree, id) => { const em = tree.find(id).vrm.expressionManager; return Object.fromEntries(['blink', 'happy', 'aa', 'surprised', 'angry'].map((n) => [n, em.getValue(n) ?? 0])); };

test('recording is repeatable, and the kept film plays what was performed', { skip }, async () => {
  const { short, set, build } = await setup();
  // the live takes, watched: where Mira is each step of her puppet take, her face each step of her face take, what Hana said
  const live = { 'take-1': new Map(), 'take-2': { said: [], end: null }, 'take-3': new Map() };
  const heard = new WeakSet();
  const takes = await recordSampleTakes({ build, short, set, observe: ({ id, step, tree }) => {
    if (id === 'take-1') live[id].set(step, pos(tree, 'mira'));
    else if (id === 'take-3') live[id].set(step, { ...face(tree, 'mira'), head: [...(tree.find('mira').props.head ?? [0, 0, 0])] });
    else { if (!heard.has(tree)) { heard.add(tree); tree.listen(tree.find('hana-1'), 'spoke', (p) => live[id].said.push(p.text)); } live[id].end = pos(tree, 'hana-1'); }
  } });
  takes.forEach((take, n) => assert.equal(takeText(take), fs.readFileSync(path.join(content, SAMPLE_TAKES[n]), 'utf8'), `${SAMPLE_TAKES[n]} is what recording it again gives (node content/sample/tools/make-takes.mjs)`));

  // the film with each take kept, played to the end of that take
  let film = short;
  const [puppet, director, mask] = takes;
  film = withTake(film, puppet);
  { // the puppet take: the same place on every step
    const W = await build(composeSequence(film, set)), tree = W.tree;
    let worst = 0, moved = 0;
    const from = pos(tree, 'mira');
    while (tree.clock.step < puppet.end) {
      while (!tree.step()) await tree.settle();
      const l = live['take-1'].get(tree.clock.step);
      if (!l) continue;
      const p = pos(tree, 'mira');
      worst = Math.max(worst, ...p.map((v, i) => Math.abs(v - l[i])));
      moved = Math.max(moved, Math.hypot(p[0] - from[0], p[2] - from[2]));
    }
    assert.equal(worst, 0, 'Mira is exactly where the live take had her, on every step of it');
    assert.ok(moved > 1, `and she did walk (${moved.toFixed(2)} m from her mark)`);
  }
  film = withTake(film, director);
  { // the director take: her lines, and the walk over
    const W = await build(composeSequence(film, set)), tree = W.tree, said = [];
    tree.listen(tree.find('hana-1'), 'spoke', (p) => said.push(p.text));
    const before = pos(tree, 'hana-1');
    while (tree.clock.step < director.end) while (!tree.step()) await tree.settle();
    const lines = ['The scones just came out, Mira!', 'On my way.'];
    assert.deepEqual(live['take-2'].said.filter((t) => lines.includes(t)), lines, 'live, she said what the model answered');
    assert.deepEqual(said.filter((t) => lines.includes(t)), lines, 'and the film says the same lines, from its dialogue track');
    const after = pos(tree, 'hana-1'), l = live['take-2'].end;
    assert.ok(Math.hypot(after[0] - before[0], after[2] - before[2]) > 1, 'in the film she walks over (the goal, from the decisions track)');
    assert.ok(Math.hypot(after[0] - l[0], after[2] - l[2]) < 0.5, `and ends where the live take left her (${Math.hypot(after[0] - l[0], after[2] - l[2]).toFixed(3)} m apart)`);
  }
  film = withTake(film, mask);
  { // the face take: within the thinning's tolerance of the live face
    const W = await build(composeSequence(film, set)), tree = W.tree, tol = faceSetup(mask.setup).tolerance;
    let worst = 0, head = 0, n = 0;
    while (tree.clock.step < mask.end) {
      while (!tree.step()) await tree.settle();
      const l = live['take-3'].get(tree.clock.step);
      if (!l) continue;
      const f = face(tree, 'mira'), h = tree.find('mira').props.head ?? [0, 0, 0];
      // the film eases between the camera's samples where the live monitor held the last one: compare on a sample's step
      if (!mask.log.face.some((s) => s.step === tree.clock.step - 1)) continue;
      n++;
      for (const k of Object.keys(f)) worst = Math.max(worst, Math.abs(f[k] - l[k]));
      head = Math.max(head, ...h.map((v, i) => Math.abs(v - l.head[i])));
    }
    assert.ok(n > 100, `compared on ${n} samples`);
    assert.ok(worst <= tol.expression + 1e-9, `her face is within ${tol.expression} of the live take's on every sample (${worst.toFixed(4)})`);
    assert.ok(head <= tol.head + 1e-9, `and her head within ${tol.head} rad (${head.toFixed(4)})`);
  }
});

test('the film with the three takes kept replays exactly: twice the same, a snapshot inside a take restored, every take performed', { skip }, async () => {
  const { R, opts } = await setup();
  const r = await takesCheck({ R, bytes, opts });
  assert.deepEqual(Object.fromEntries(r.takes.map((t) => [t.id, t.tracksHash])), golden.takes);
  assert.equal(r.filmHash, golden.film);
  assert.equal(r.twice, true, 'two plays: the same world on every step');
  assert.equal(r.restored.same, true, 'a snapshot mid-walk restores and plays on to the same end');
  assert.equal(r.takesChangeTheFilm, true);
  assert.ok(takesPerformed(r), JSON.stringify(r.performed));
});
