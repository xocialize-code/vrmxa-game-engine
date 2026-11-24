// Checks the M4 short scenario's two exports of "The Regular" from outside the app (M4 W13, AB-T-0585; M4 check 6):
// 1,457 frames at 24 fps with every frame at n/24 s, 1920×1080 H.264 with sound, the rendered frames' hashes identical
// across the two exports (the shell hashes each frame before encoding: <file>.frames.json), and 13 subtitles beside
// each file. Needs ffprobe on PATH. Writes docs/hand-test/results/short-export-check[-<tag>].json.
//   node apps/editor-mac/scripts/check-short-exports.mjs [exports folder] [--tag scheme]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { checker, folder } from './ffcheck.mjs';

const argv = process.argv.slice(2), ti = argv.indexOf('--tag'), tag = ti < 0 ? null : argv[ti + 1];
const rest = argv.filter((a, i) => i !== ti && i !== ti + 1 || ti < 0);
const tmp = path.join(os.homedir(), 'Library/Containers/com.xocialize.vrmxg-editor/Data/tmp');
const dir = rest[0] ?? path.join(tmp, 'exports');
const out = path.join(import.meta.dirname, `../docs/hand-test/results/short-export-check${tag ? `-${tag}` : ''}.json`);
const { checks, check } = checker();
const { file, exists, video } = folder(dir);

const FRAMES = 1457, FPS = [24, 1], names = ['short-a.mp4', 'short-b.mp4'];
const results = {}, hashes = {};
for (const n of names) {
  if (!exists(n)) { check(`${n} exists`, false, 'not in the exports folder'); continue; }
  const x = video(n, FRAMES, FPS);
  const ok = x.ok && x.v.codec_name === 'h264' && +x.v.width === 1920 && +x.v.height === 1080 && !!x.a && +x.a.start_time === 0;
  results[n] = { decoded: x.decoded, nbFrames: +x.v.nb_frames, seconds: +x.v.duration, maxPtsError: x.maxPtsError, codec: x.v.codec_name, size: [+x.v.width, +x.v.height], sound: x.a ? { codec: x.a.codec_name, rate: +x.a.sample_rate, start: +x.a.start_time, seconds: +x.a.duration } : null };
  check(`${n}: ${FRAMES} frames at 24 fps, every frame at n/24 s, 1920×1080 h264 with sound`, ok, results[n]);
  const fj = `${n}.frames.json`;
  if (exists(fj)) { hashes[n] = JSON.parse(fs.readFileSync(file(fj), 'utf8')).frames; results[n].frameDigest = createHash('sha256').update(hashes[n].join('')).digest('hex').slice(0, 16); }
  const srt = n.replace(/\.\w+$/, '.srt'), cues = exists(srt) ? fs.readFileSync(file(srt), 'utf8').split(/\r?\n\r?\n/).filter((c) => c.trim()).length : 0;
  results[n].subtitles = cues;
  check(`${srt}: 13 subtitles`, cues === 13, `${cues} cues`);
}
const [a, b] = names.map((n) => hashes[n]);
const differ = a && b ? a.map((h, i) => (h === b[i] ? -1 : i)).filter((i) => i >= 0) : null;
check('the two exports hold the same frames, frame for frame', !!a && !!b && a.length === FRAMES && b.length === FRAMES && differ.length === 0, a && b ? { frames: a.length, differ } : 'no per-frame hashes beside the files');
const ok = checks.every((c) => c.ok);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ format: 'vrmxg-short-export-check', version: 1, ok, tag, results, framesThatDiffer: differ, checks }, null, 1)}\n`);
console.log(ok ? 'all passed' : 'FAILED');
process.exit(ok ? 0 : 1);
