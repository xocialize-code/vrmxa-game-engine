// M2 W1 on the sample cafe (needs vrmxa-core beside the repo for the characters): sequences/morning.vrmxs
// plays in its set. Mira walks in on an event key, the camera track cuts and blends between four VirtualCameras, Hana's
// eyes follow Mira and she says her line on frame 126, the second shot cheats the counter light. Two plays are the same
// world, and scrubbing (backwards, forwards, from snapshots) lands on the world a straight play reaches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { SequencePlayer, checkSequence, subtitles } from '@vrmxg/sequence';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);

export async function morning() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes, 'sequences/morning.vrmxs');
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return { sample, opts: { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true } };
}
const hash = (tree) => hashValue(worldHashes(tree, { physicsBytes: true }));
async function steps(tree, n) { for (let i = 0; i < n; i++) while (!tree.step()) await tree.settle(); }

test('the morning sequence plays in the cafe: cameras, a walk, eyes, a line, a cheated light; the same every play', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await morning();
  const ids = new Set(sample.doc.nodes.map((n) => n.id));
  assert.deepEqual(checkSequence(sample.doc.sequence, { nodeIds: ids }), []);
  assert.match(subtitles(sample.doc.sequence, { 'hana-1': 'Hana' }), /^1\n00:00:05,250 --> 00:00:10,250\nHana: Oh, hi!/);
  const play = async () => {
    const W = await buildWorld(R, sample, opts);
    const tree = W.tree, seen = { cams: [], spokeAt: null, light: [], hanaLook: null, miraLook: null, start: tree.find('mira').object3d.position.clone() };
    tree.listen(tree.find('brain'), 'cameraChanged', (a) => seen.cams.push(a.to));
    tree.listen(tree.find('hana-1'), 'spoke', () => { seen.spokeAt ??= tree.clock.step; });
    for (const [f, k] of [[100, 'before'], [150, 'during'], [200, 'after']]) {
      await steps(tree, W.sequence.stepOf(f).step - tree.clock.step);
      seen.light.push([k, tree.find('counter-light').props.intensity]);
    }
    seen.hanaLook = tree.find('hana-1').ctrl.look; seen.miraLook = tree.find('mira').ctrl.look;
    await steps(tree, W.sequence.stepOf(288).step + 2 - tree.clock.step);
    return { W, seen, hash: hash(tree), mira: tree.find('mira').object3d.position.clone() };
  };
  const a = await play(), b = await play();
  assert.equal(a.hash, b.hash, 'two plays, the same world');
  assert.deepEqual(a.seen.cams, ['vc-wide', 'vc-hana', 'vc-ots', 'vc-two']);
  assert.equal(a.seen.spokeAt, 314, 'Hana\'s line started in the step that reached frame 126 (the 315th)');
  assert.deepEqual(a.seen.light, [['before', 18], ['during', 30], ['after', 18]], 'shot s2 cheats the counter light, then puts it back');
  assert.equal(a.seen.hanaLook, 'mira'); assert.equal(a.seen.miraLook, 'hana-1');
  assert.ok(a.mira.distanceTo(a.seen.start) > 4, `Mira walked in (${a.seen.start.toArray().map((v) => v.toFixed(2))} → ${a.mira.toArray().map((v) => v.toFixed(2))})`);
  assert.equal(a.W.tree.find('env').props.post, 'anime', 'the property track put the anime look on');
  assert.equal(a.W.sequence.pb.playing, false);
});

test('scrubbing the morning sequence lands on the world of a straight play', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await morning();
  const ref = await buildWorld(R, sample, opts);
  const frames = [40, 130, 200, 287], want = new Map();
  for (const f of frames) { await steps(ref.tree, ref.sequence.stepOf(f).step - ref.tree.clock.step); want.set(f, hash(ref.tree)); }
  const W = await buildWorld(R, sample, opts);
  const player = new SequencePlayer(W.tree, { every: 120 });
  for (const f of [287, 130, 40, 200, 130]) {
    const r = await player.seek(f);
    assert.equal(hash(W.tree), want.get(f), `frame ${f} (${JSON.stringify(r)})`);
  }
});
