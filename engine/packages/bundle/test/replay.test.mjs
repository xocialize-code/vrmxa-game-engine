// The sample project exported, opened by the loader and played: its world hashes the same after every step as the
// project played straight from its folder (needs vrmxa-core beside the repo; acceptance/m5/build.mjs is the
// full 600-step check, with the built runtime in Chromium).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { exportToFolder, openFolder, folderReader, behavioursImporter } from '@vrmxg/bundle/node';
import { playScene } from '../runtime/play.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import { runtime } from './helpers.mjs';

installPortableMath();
const sample = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);

test('the sample\'s build plays to the same per-step hashes as the project', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-bundle-replay-'));
  try {
    const rt = path.join(tmp, 'runtime'), out = path.join(tmp, 'build');
    for (const [p, bytes] of runtime().map) { fs.mkdirSync(path.dirname(path.join(rt, p)), { recursive: true }); fs.writeFileSync(path.join(rt, p), bytes); }
    await exportToFolder({ project: sample, runtime: rt, out });
    const R = await loadRapier(), core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
    const o = { R, vrmxaCore: core, closet, take: 'input/walk-in.json', steps: 240 };
    const mod = await import(path.join(sample, 'behaviours.js'));
    const direct = await playScene({ ...o, bytes: folderReader(sample).read, scene: 'cafe.vrmxs', behaviours: new Map(Object.entries(mod).filter(([, v]) => typeof v === 'function')) });
    const build = await openFolder(out);
    const played = await playScene({ ...o, bytes: build.bytes, scene: build.game.entry, behaviours: await build.behaviours(behavioursImporter(out)), actions: await build.actions() });
    assert.equal(played.hashes.length, 241);
    assert.deepEqual(played.hashes, direct.hashes);
    assert.notEqual(direct.hashes[0], direct.hashes[240], 'the world moved');
    assert.ok(build.checked.size > 40, `${build.checked.size} files read through the loader, each checked against the manifest`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
