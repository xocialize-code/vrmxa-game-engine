// M6 W4 (AB-T-0647): the committed starter files are what the tools make, byte for byte, and every item is valid by
// the VRMXI checker (make-items.mjs refuses any error or warning). Skips without mesh2motion (reference/ is
// git-ignored), vrmxa-avatar-studio and VRMXA_Specification with the VRMXI draft beside the repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { available } from '../../../engine/packages/character/test/fixtures.mjs';
import { SPEC } from '../../../engine/packages/item/test/fixtures.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const source = [path.join(repo, 'reference/mesh2motion-app-main'), path.join(repo, '../../../reference/mesh2motion-app-main')].some((d) => fs.existsSync(path.join(d, 'static/assets/manifest.json')));
const SKIP = source && SPEC && available('core', 'coreAnim', 'spec') ? false : 'needs reference/mesh2motion-app-main, vrmxa-avatar-studio and VRMXA_Specification (VRMXI draft) beside this repository';
const run = (tool) => execFileSync(process.execPath, [path.join(repo, 'content/starter/tools', tool), '--check'], { stdio: 'pipe', encoding: 'utf8' });

test('make-animations.mjs remakes the clips, animations.json and their provenance byte for byte', { skip: SKIP, timeout: 300000 }, () => {
  assert.match(run('make-animations.mjs'), /up to date/);
});

test('make-items.mjs remakes every item byte for byte, each valid by the VRMXI checker', { skip: SKIP, timeout: 300000 }, () => {
  assert.match(run('make-items.mjs'), /each valid by the VRMXI checker; up to date/);
});
