// M3 W4 (AB-T-0543) in the editor in headless Chromium: the conversation take baked into a sequence
// (sequences/conversation.vrmxs, tools/make-conversation.mjs + bake-lines.mjs) exports at 1080p24 with sound twice to
// the same frames, and jumping to frames of its shot, lines and cues from snapshots draws exactly the frames the export
// rendered (the M2 check-against-scrub path). Needs the editor's dev server (port 5182).
// Writes acceptance/results/m3-conversation-export.json.
//   node acceptance/m3/conversation-export.mjs [--url http://localhost:5182] [--renderer webgl|webgpu] [--size 1080p]
// --renderer (M4 W3): the apps default to WebGPU now; this check runs on WebGL unless told otherwise, as its M3 receipt did.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

await acquireGpuLock({ who: 'acceptance/m3/conversation-export.mjs', onWait: sayWaiting('acceptance/m3/conversation-export.mjs') }); // M4 W3: one GPU runner at a time on this machine (acceptance/README.md)

const here = import.meta.dirname, argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const url = opt('--url', 'http://localhost:5182'), renderer = opt('--renderer', 'webgl'), size = opt('--size', '1080p'), scene = opt('--scene', 'sequences/conversation.vrmxs');
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleLines = [];
page.on('console', (m) => { if (m.type() === 'error') consoleLines.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
await page.goto(`${url}/?renderer=${renderer}`);
await page.waitForFunction(() => window.__editor?.session, null, { timeout: 300000 });
const out = await page.evaluate(async ({ size, scene }) => {
  const ed = window.__editor;
  await ed.openScene(scene);
  const seq = ed.session.doc.sequence;
  const t0 = performance.now();
  const x = await ed.exportVideo({ take: 'sequence', size, fps: '24', codec: 'h264', audio: true, hashOnly: true });
  const exportMs = performance.now() - t0;
  const again = await ed.exportVideo({ take: 'sequence', size, fps: '24', codec: 'h264', audio: true, hashOnly: true });
  const t1 = performance.now();
  const c = await ed.checkExportAgainstScrub();
  return {
    scene, tracks: seq.tracks.map((t) => `${t.id}:${t.type}`), lines: seq.tracks.filter((t) => t.type === 'dialogue').flatMap((t) => t.clips.map((cl) => ({ who: t.target, start: cl.start, clip: !!cl.clip }))),
    frames: x.frames, seconds: x.seconds, steps: x.steps, digest: x.hashesDigest, audioHash: x.audioHash, exportMs: Math.round(exportMs), checkMs: Math.round(performance.now() - t1),
    secondExport: { digest: again.hashesDigest, audioHash: again.audioHash, sameFrames: again.frameHashes.every((h, i) => h === x.frameHashes[i]) },
    distinctFrames: new Set(x.frameHashes).size, subtitles: x.subs, scrub: c, errors: window.__errors, editorError: ed.error,
  };
}, { size, scene });
await browser.close();
const res = { runtime: 'chromium', size, ...out, console: consoleLines };
fs.writeFileSync(path.join(here, '../results/m3-conversation-export.json'), JSON.stringify(res, null, 1) + '\n');
console.log(JSON.stringify({ ...res, scrub: { frames: out.scrub.frames, same: out.scrub.same, differ: out.scrub.rows.filter((r) => !r.same).map((r) => r.frame) }, subtitles: { ...out.subtitles, text: out.subtitles?.text?.slice(0, 200) } }, null, 1));
