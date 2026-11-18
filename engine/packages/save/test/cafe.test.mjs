// M2 W9 on the sample cafe (needs vrmxa-avatar-studio beside the repo): the recorded take with items. Saved at step 720,
// after Mira took the sword into her closet, written to a file, loaded into a fresh world with the take replaying: every
// step to the end hashes as the run that was saved, and the sword is in her closet, the cupboard and switch end as they
// did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { FsStore } from '@vrmxg/save/node';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);

test('a save after the sword is taken loads and plays on with the same per-step hashes to the end of the take', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  const take = JSON.parse(fs.readFileSync(path.join(content, 'input/play-items.json'), 'utf8'));
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  const opts = { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true };
  const R = await loadRapier();
  const step = async (tree) => { while (!tree.step()) await tree.settle(); };
  const h = (tree) => hashValue(worldHashes(tree, { physicsBytes: tree.clock.step % 60 === 0 }));

  const A = await buildWorld(R, sample, opts);
  A.input.replay(structuredClone(take));
  while (A.tree.clock.step < 720) await step(A.tree);
  A.save.setFlag('swordTaken');
  assert.equal(A.save.cannotSave(), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-saves-'));
  const store = new FsStore(dir);
  const written = await store.write('slot-1', A.save.save({ name: 'After the sword', savedAt: '2026-11-18T12:00:00Z' }));
  const ref = [];
  while (A.tree.clock.step < take.frames.length) { await step(A.tree); ref.push(h(A.tree)); }

  const B = await buildWorld(R, sample, opts);
  assert.equal(await B.save.load(await store.read('slot-1')), 720);
  B.input.replay(structuredClone(take)); // input replays from the clock's step
  assert.equal(B.save.getFlag('swordTaken'), true);
  assert.ok(B.closet.wornBy('mira').some((w) => w.state === 'held'), 'the taken sword is in Mira\'s hand (worn, held)');
  assert.equal(B.tree.find('sword'), null, 'and gone from the table');
  for (let i = 0; i < ref.length; i++) { await step(B.tree); assert.equal(h(B.tree), ref[i], `step ${721 + i}`); }
  assert.equal(B.tree.find('cupboard').current, A.tree.find('cupboard').current);
  assert.equal(B.tree.find('light-switch').current, 'off');
  console.log(`save file ${(written.bytes / 1024).toFixed(0)} KB; ${ref.length} steps replayed identically after the load`);
  fs.rmSync(dir, { recursive: true, force: true });
});
