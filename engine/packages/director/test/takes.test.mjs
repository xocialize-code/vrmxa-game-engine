// M3 W12 (AB-T-0551): every fixture conversation in content/sample/takes/ replays identically in Node (needs
// vrmxa-core beside the repo for the characters). A take is a world built from step 0 plus its inputs (the cast,
// the player's recording, the director's ai log and, when the camera was on, the sense log); two replays hash the same
// at every 30th step. The follower take also shows what it was made for: Hana waits by the door when asked, then follows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, compareRuns } from '@vrmxg/snapshot';
import { isTake } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);
const TAKES = fs.readdirSync(path.join(content, 'takes')).filter((f) => f.endsWith('.json')).sort();

async function replay(take, watch) {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes, take.scene);
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (take.cast?.[n.id] ? { ...n, ...take.cast[n.id] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  const W = await buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true, sense: !!take.sense });
  if (take.input) W.input.replay(structuredClone(take.input));
  W.ai.replay(take.ai);
  if (take.sense) W.sense.replay(take.sense);
  const run = [];
  for (let k = 1; k <= take.steps; k++) {
    while (!W.tree.step()) await W.tree.settle();
    watch?.(W, k);
    if (k % 30 === 0) run.push({ step: k, h: worldHashes(W.tree) });
  }
  return run;
}

test('the fixture takes are takes', () => {
  assert.ok(TAKES.includes('conversation.json') && TAKES.includes('follow.json'), `content/sample/takes: ${TAKES.join(', ')}`);
  for (const f of TAKES) assert.ok(isTake(JSON.parse(fs.readFileSync(path.join(content, 'takes', f), 'utf8'))), `${f} is a vrmxg-take`);
});

for (const file of TAKES) {
  test(`takes/${file} replays identically, twice`, { skip: !OK && 'needs vrmxa-core' }, async () => {
    const take = JSON.parse(fs.readFileSync(path.join(content, 'takes', file), 'utf8'));
    const seen = { nearDoor: 0, followedIn: false };
    const watch = file === 'follow.json' ? (W, k) => {
      const h = W.tree.find('hana-1').object3d.position, d = W.tree.find('entrance-left').object3d.position;
      if (k > 1200 && k < 2400 && Math.hypot(h.x - d.x, h.z - d.z) < 1.6) seen.nearDoor++;
      if (k === take.steps) seen.followedIn = h.z < 5.5; // inside the cafe, behind Mira
    } : null;
    const a = await replay(take, watch), b = await replay(take);
    assert.equal(a.length, Math.floor(take.steps / 30));
    assert.equal(compareRuns(a, b), null, 'the same hashes at every 30th step');
    if (file === 'follow.json') {
      assert.ok(seen.nearDoor > 900, `Hana waited by the door when asked (${seen.nearDoor} of 1199 steps within 1.6 m)`);
      assert.ok(seen.followedIn, 'then followed Mira into the cafe');
    }
  });
}
