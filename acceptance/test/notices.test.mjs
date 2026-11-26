// M6 W7 (AB-T-0624): each app's built web folder (the game runtime, the playground, the editor, the creator) carries
// THIRD-PARTY-LICENCES.txt with fdlibm's notice and the licence text of every package scripts/check-notices.mjs names
// for it. The apps build only beside vrmxa-avatar-studio, so on CI (no dist) each is skipped; the plugin's own tests
// (engine/packages/bundle/test/notices.test.mjs) run everywhere, and each Mac app's build script runs the same check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_NOTICES, appNotices } from '../../scripts/check-notices.mjs';

for (const app of Object.keys(APP_NOTICES)) {
  const missing = appNotices(app);
  test(`${app}: THIRD-PARTY-LICENCES.txt holds fdlibm's notice and every named package's licence text`, { skip: missing === null && `${APP_NOTICES[app].dist} is not built` }, () => {
    assert.deepEqual(missing, []);
  });
}
