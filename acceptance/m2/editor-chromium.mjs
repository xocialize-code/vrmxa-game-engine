// M2 checks 2 and 5 in the editor in headless Chromium (the Mac app's run is the AppProbe scenario
// apps/editor-mac/docs/hand-test/HAND-TEST-M2-ACCEPTANCE.scenario.md): open "Morning at the cafe", export it at 1080p24
// with sound as frame hashes (the browser's sink), then check the export against scrubbing: each shot's first, middle
// and last frame jumped to from snapshots, backwards, drawn at the export's size, hashed like the export's frames.
// Needs the editor's dev server (npm --prefix apps/editor run dev, port 5182). Writes acceptance/results/m2-editor-chromium.json.
//   node acceptance/m2/editor-chromium.mjs [--url http://localhost:5182] [--size 1080p] [--renderer webgl|webgpu]
// --renderer (M4 W3): the editor defaults to WebGPU now; this runs on WebGL unless told otherwise, as its M2 receipt did
// (acceptance/matrix.mjs runs the same check on both backends).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

await acquireGpuLock({ who: 'acceptance/m2/editor-chromium.mjs', onWait: sayWaiting('acceptance/m2/editor-chromium.mjs') }); // M4 W3: one GPU runner at a time on this machine (acceptance/README.md)

const here = import.meta.dirname, argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const url = opt('--url', 'http://localhost:5182'), size = opt('--size', '1080p'), renderer = opt('--renderer', 'webgl');
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleLines = [];
page.on('console', (m) => { if (m.type() === 'error') consoleLines.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
await page.goto(`${url}/?renderer=${renderer}`);
await page.waitForFunction(() => window.__editor?.session, null, { timeout: 300000 });
const out = await page.evaluate(async (size) => {
  const ed = window.__editor;
  await ed.openScene('sequences/cafe-morning.vrmxs');
  const t0 = performance.now();
  const x = await ed.exportVideo({ take: 'sequence', size, fps: '24', codec: 'h264', audio: true, hashOnly: true });
  const exportMs = performance.now() - t0;
  const t1 = performance.now();
  const c = await ed.checkExportAgainstScrub();
  const again = await ed.exportVideo({ take: 'sequence', size, fps: '24', codec: 'h264', audio: true, hashOnly: true });
  // a still between scrubs (check 9's agent took one): the preview world must step the same afterwards, though the
  // still resized its output and gave it back the viewport's aspect (the bug AB-T-0535 found: the composer framed at it)
  ed.preview = null; await ed.scrubTo(1000); const fresh = ed.scrubState;
  await ed.still(960, 540); await ed.scrubTo(0); await ed.scrubTo(1000); const afterStill = ed.scrubState;
  const stillThenScrub = { frame: 1000, fresh: fresh.hash, afterStill: afterStill.hash, from: `${afterStill.restored}+${afterStill.stepped}`, same: fresh.hash === afterStill.hash, viewport: [ed.canvas.clientWidth, ed.canvas.clientHeight] };
  return {
    stillThenScrub,
    takes: ed.takes().map((t) => t.label), frames: x.frames, seconds: x.seconds, steps: x.steps, digest: x.hashesDigest, audioHash: x.audioHash,
    exportMs: Math.round(exportMs), checkMs: Math.round(performance.now() - t1), subtitles: x.subs, scrub: c,
    secondExport: { digest: again.hashesDigest, audioHash: again.audioHash, sameFrames: again.frameHashes.every((h, i) => h === x.frameHashes[i]) },
    distinctFrames: new Set(x.frameHashes).size, frameHashes: x.frameHashes, errors: window.__errors, editorError: ed.error,
  };
}, size);
await browser.close();
const res = { runtime: 'chromium', version: browser.version?.() ?? null, size, ...out, console: consoleLines };
fs.writeFileSync(path.join(here, '../results/m2-editor-chromium.json'), JSON.stringify(res, null, 1) + '\n');
console.log(JSON.stringify({ ...res, frameHashes: undefined, scrub: { frames: out.scrub.frames, same: out.scrub.same, differ: out.scrub.rows.filter((r) => !r.same).map((r) => r.frame) }, subtitles: { ...out.subtitles, text: out.subtitles?.text?.slice(0, 160) } }, null, 1));
