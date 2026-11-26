// M3 W5 on the sample cafe (needs vrmxa-core beside the repo for the characters): Hana sees the person at the
// camera. A scripted session (synth.mjs: appears, waves, nods, shakes, points, leaves) goes live through the detector
// into the sense service; Hana looks at the viewer when they appear, greets back when they wave, nods back, and looks away
// when they leave. With her cafe behaviours the reactions are her own actions; with the host brain they run as its
// override. The logged session then replays with the camera off, hash for hash, and from a snapshot taken mid-session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Vector3 } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, captureWorld, restoreWorld, compareRuns } from '@vrmxg/snapshot';
import { GestureDetector, withCamera } from '@vrmxg/sense';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';
import { scriptFrames } from './synth.mjs';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);
const STEPS = 840;

async function world({ brain = false } = {}) {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  let doc = withCamera(sample.doc, { notice: ['hana-1'], params: { say: { wave: 'Hi there!' } } });
  if (brain) doc = { ...doc, nodes: doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [{ use: 'brain', preset: 'host' }, { use: 'noticeViewer', say: { wave: 'Hi there!' } }] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), { ...sample, doc }, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true, sense: true });
}

/** Live: the frames due by each step's time (60 Hz) go through the detector before the step. */
async function live(opts, { snapAt = null } = {}) {
  const W = await world(opts), tree = W.tree, hana = /** @type {any} */ (tree.find('hana-1'));
  const frames = scriptFrames(), det = new GestureDetector();
  const acted = [], looks = [], run = [], said = [];
  tree.listen(hana, 'spoke', (a) => said.push([tree.clock.step, a.text]));
  const start = hana.startAction.bind(hana);
  hana.startAction = (slot) => { acted.push([tree.clock.step, slot]); return start(slot); };
  let i = 0, snap = null;
  for (let k = 0; k < STEPS; k++) {
    while (i < frames.length && frames[i].t <= (k * 1000) / 60) for (const e of det.push(frames[i++])) W.sense.push(e);
    tree.step();
    if (looks.at(-1)?.[1] !== hana.ctrl.look) looks.push([tree.clock.step, hana.ctrl.look]);
    run.push({ step: tree.clock.step, h: worldHashes(tree, { physicsBytes: tree.clock.step % 60 === 0 }) });
    if (tree.clock.step === snapAt) snap = captureWorld(tree);
  }
  return { W, hana, acted, looks, run, said, snap, log: W.sense.record() };
}

for (const brain of [false, true]) {
  test(`Hana sees the person at the camera (${brain ? 'the host brain: reactions as its override' : 'her cafe behaviours: her own actions'})`, { skip: !OK && 'needs vrmxa-core' }, async () => {
    const { W, acted, looks, said, log } = await live({ brain });
    const types = log.filter((e) => e.type !== 'face').map((e) => (e.type === 'presence' ? (e.present ? 'appeared' : 'left') : e.type));
    assert.deepEqual(types, ['appeared', 'wave', 'nod', 'shake', 'point', 'left'], 'the session, logged by step');
    const at = (t) => log.find((e) => (t === 'appeared' ? e.type === 'presence' && e.present : t === 'left' ? e.type === 'presence' && !e.present : e.type === t)).step;
    const lookedAt = looks.find(([, l]) => l === 'viewer');
    assert.ok(lookedAt && lookedAt[0] - at('appeared') <= 8, `she looks at the viewer as they appear (step ${lookedAt?.[0]}, appeared ${at('appeared')}): ${JSON.stringify(looks)}`);
    const greet = acted.find(([s, slot]) => slot === 'greet' && s >= at('wave'));
    const nod = acted.find(([s, slot]) => slot === 'nod' && s >= at('nod'));
    assert.ok(greet && greet[0] - at('wave') <= 40, `she greets back after the wave (${JSON.stringify(acted)})`);
    assert.ok(nod && nod[0] - at('nod') <= 120, `she nods back after the nod (${JSON.stringify(acted)})`);
    assert.ok(said.some(([s, t]) => t === 'Hi there!' && s >= at('wave') && s - at('wave') <= 60), `she says her line for the wave (${JSON.stringify(said)})`);
    const away = looks.find(([s, l]) => s >= at('left') && l !== 'viewer');
    assert.ok(away, 'she looks away when they leave');
    // the viewer stood at the camera while they were there
    const cam = W.tree.services.get('cameras').current.object3d.getWorldPosition(new Vector3());
    const v = W.tree.find('viewer').object3d.getWorldPosition(new Vector3());
    assert.ok(v.distanceTo(cam) < 0.5, `the viewer by the camera (${v.distanceTo(cam).toFixed(3)} m)`);
  });
}

test('the session replays with the camera off, hash for hash, and from a snapshot taken mid-session', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const SNAP = 360;
  const A = await live({ brain: true }, { snapAt: SNAP });
  const B = await world({ brain: true });
  B.sense.replay(A.log);
  const again = [];
  for (let k = 0; k < STEPS; k++) { B.tree.step(); again.push({ step: B.tree.clock.step, h: worldHashes(B.tree, { physicsBytes: B.tree.clock.step % 60 === 0 }) }); }
  assert.equal(compareRuns(A.run, again), null, 'replayed from the log: the same hash after every step');
  const C = await world({ brain: true });
  restoreWorld(C.tree, A.snap);
  C.sense.replay(A.log.filter((e) => e.step > SNAP));
  const rest = [];
  for (let k = SNAP; k < STEPS; k++) { C.tree.step(); rest.push({ step: C.tree.clock.step, h: worldHashes(C.tree, { physicsBytes: C.tree.clock.step % 60 === 0 }) }); }
  assert.equal(compareRuns(A.run.slice(SNAP), rest), null, 'restored mid-session with the log\'s later events: the same to the end');
});
