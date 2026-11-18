// Checks the export scenario's files from outside the app (M1 W8, AB-T-0520): frame counts and every frame's timestamp,
// the sound's track and its alignment with the mix the engine made, the rendered frames' hashes across two exports of
// the take, decoded frames across encodes. Needs ffprobe and ffmpeg on PATH. Writes docs/hand-test/results/export-check.json.
//   node apps/editor-mac/scripts/check-exports.mjs [exports folder]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const tmp = path.join(os.homedir(), 'Library/Containers/com.xocialize.vrmxg-editor/Data/tmp');
const dir = process.argv[2] ?? path.join(tmp, 'exports');
const out = path.join(import.meta.dirname, '../docs/hand-test/results/export-check.json');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { maxBuffer: 1 << 30, ...opts });
const probe = (f, args) => JSON.parse(run('ffprobe', ['-v', 'error', '-of', 'json', ...args, f]).toString());
const checks = [];
const check = (title, ok, evidence) => { checks.push({ title, ok, evidence }); console.log(`${ok ? '✔' : '✖'} ${title}\n    ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`); };
const file = (n) => path.join(dir, n);
const exists = (n) => fs.existsSync(file(n));

/** Streams, and every video frame's presentation time, against frame n at n · den / num. */
function video(name, frames, [num, den]) {
  const s = probe(file(name), ['-show_entries', 'stream=codec_type,codec_name,width,height,nb_frames,duration,start_time,has_b_frames,pix_fmt,color_primaries,color_transfer,sample_rate,channels,bit_rate', '-show_entries', 'format=duration,size']);
  const v = s.streams.find((x) => x.codec_type === 'video'), a = s.streams.find((x) => x.codec_type === 'audio');
  const pts = run('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file(name)]).toString().trim().split('\n').map((l) => parseFloat(l)); // B-frame streams print a trailing empty field
  const late = pts.map((t, n) => Math.abs(t - (n * den) / num)).reduce((m, x) => Math.max(m, x), 0);
  return { v, a, format: s.format, decoded: pts.length, maxPtsError: late, ok: pts.length === frames && +v.nb_frames === frames && late < 1e-4 && Math.abs(+v.duration - (frames * den) / num) < 1e-4 };
}

/** ffmpeg's per-frame MD5 of the decoded picture. */
function framemd5(name) {
  return run('ffmpeg', ['-v', 'error', '-i', file(name), '-map', '0:v', '-f', 'framemd5', '-']).toString().split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').at(-1).trim());
}

/** The muxed AAC decoded vs the WAV the engine mixed: the lag (in samples) where they line up best, and how well. */
function audioAlignment(name) {
  const wavPath = file(name.replace(/\.\w+$/, '.wav'));
  const wav = fs.readFileSync(wavPath), ch = wav.readUInt16LE(22), n = (wav.length - 44) / 2 / ch;
  const ref = new Float32Array(n); for (let i = 0; i < n; i++) ref[i] = wav.readInt16LE(44 + i * ch * 2) / 32768;
  const pcm = run('ffmpeg', ['-v', 'error', '-i', file(name), '-map', '0:a', '-f', 'f32le', '-ac', '2', '-ar', '48000', '-']);
  const got = new Float32Array(pcm.length / 8); for (let i = 0; i < got.length; i++) got[i] = pcm.readFloatLE(i * 8);
  const from = 48000 * 2, len = 48000 * 4; // 4 s from 2 s in: past the encoder's start, plenty of material
  let best = { lag: 0, r: -Infinity };
  for (let lag = -2400; lag <= 2400; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = from; i < from + len; i += 2) { const x = ref[i], y = got[i + lag] ?? 0; xy += x * y; xx += x * x; yy += y * y; }
    const r = xy / Math.sqrt(xx * yy || 1);
    if (r > best.r) best = { lag, r };
  }
  return { wavSamples: n, decodedSamples: got.length, lag: best.lag, correlation: +best.r.toFixed(4) };
}

const rows = [
  { name: 'take-a.mp4', frames: 300, fps: [30, 1], codec: 'h264', size: [1920, 1080], audio: true },
  { name: 'take-b.mp4', frames: 300, fps: [30, 1], codec: 'h264', size: [1920, 1080], audio: true },
  { name: 'take-4k60.mp4', frames: 600, fps: [60, 1], codec: 'h264', size: [3840, 2160], audio: true },
  { name: 'prores-a.mov', frames: 300, fps: [30, 1], codec: 'prores', size: [1920, 1080], audio: true },
  { name: 'prores-b.mov', frames: 300, fps: [30, 1], codec: 'prores', size: [1920, 1080], audio: true },
  { name: 'ntsc.mp4', frames: 300, fps: [30000, 1001], codec: 'hevc', size: [1280, 720], audio: true },
];
const results = {};
for (const r of rows) {
  if (!exists(r.name)) { check(`${r.name} exists`, false, `not in ${dir}`); continue; }
  const x = video(r.name, r.frames, r.fps);
  const ok = x.ok && x.v.codec_name === r.codec && +x.v.width === r.size[0] && +x.v.height === r.size[1] && (!r.audio || (x.a && +x.a.start_time === 0 && Math.abs(+x.a.duration - (r.frames * r.fps[1]) / r.fps[0]) < 0.025));
  results[r.name] = x;
  check(`${r.name}: ${r.frames} frames at ${r.fps.join('/')} fps, every frame at n · ${r.fps[1]}/${r.fps[0]} s, ${r.size.join('×')} ${r.codec}${r.audio ? ' with sound' : ''}`, ok,
    `${x.decoded} frames decoded (nb_frames ${x.v.nb_frames}), video ${x.v.duration} s, largest timestamp error ${x.maxPtsError.toExponential(1)} s, ${x.v.pix_fmt} ${x.v.color_primaries ?? ''}/${x.v.color_transfer ?? ''}, B-frames ${x.v.has_b_frames}; sound ${x.a ? `${x.a.codec_name} ${x.a.sample_rate} Hz ×${x.a.channels}, starts ${x.a.start_time} s, ${x.a.duration} s` : 'none'}; ${(+x.format.size / 1e6).toFixed(1)} MB`);
}

// the sound under the frames: the AAC lines up with the engine's mix at lag 0
for (const n of ['take-a.mp4', 'prores-a.mov', 'ntsc.mp4']) {
  if (!exists(n) || !fs.existsSync(file(n.replace(/\.\w+$/, '.wav')))) continue;
  const al = audioAlignment(n);
  results[n].alignment = al;
  check(`${n}: the muxed sound lines up with the engine's mix (lag 0 samples)`, al.lag === 0 && al.correlation > 0.95, al);
}

// the rendered frames (hashed as they reached the shell) are the same in every export of the take at 1080p30, whatever the codec
const hashes = (n) => (fs.existsSync(file(`${n}.frames.json`)) ? JSON.parse(fs.readFileSync(file(`${n}.frames.json`), 'utf8')).frames : null);
const ha = hashes('take-a.mp4'), hb = hashes('take-b.mp4'), hp = hashes('prores-a.mov'), hq = hashes('prores-b.mov');
if (ha && hb) {
  const same = ha.filter((h, i) => h === hb[i]).length;
  check('take-a and take-b: the rendered frames are identical, frame for frame', same === 300 && ha.length === 300, `${same} of ${ha.length} frame hashes match; ${new Set(ha).size} distinct frames`);
}
if (ha && hp && hq) {
  const same = ha.filter((h, i) => h === hp[i] && h === hq[i]).length;
  check('the ProRes exports rendered the same frames as the H.264 ones', same === 300, `${same} of 300`);
}
// decoded frames: ProRes (intra only) always; H.264 reported, not required (VideoToolbox answers append timing, AB-L-0013)
if (exists('prores-a.mov') && exists('prores-b.mov')) {
  const a = framemd5('prores-a.mov'), b = framemd5('prores-b.mov');
  const same = a.filter((h, i) => h === b[i]).length;
  check('prores-a and prores-b decode to identical frames', same === 300 && a.length === 300, `${same} of ${a.length} decoded frames identical (ffmpeg framemd5)`);
}
if (exists('take-a.mp4') && exists('take-b.mp4')) {
  const a = framemd5('take-a.mp4'), b = framemd5('take-b.mp4');
  const same = a.filter((h, i) => h === b[i]).length;
  results.h264Decoded = { same, of: a.length };
  console.log(`  (H.264 decoded: ${same} of ${a.length} frames identical between take-a and take-b; not a gate: VideoToolbox's rate control answers append timing, AB-L-0013)`);
}

// stills
const still = file('cafe-still.png'), thumb = path.join(tmp, 'project/thumbnails/cafe.png');
for (const [label, f, w, h] of [['still', still, 1920, 1080], ['thumbnail', thumb, 480, 270]]) {
  if (!fs.existsSync(f)) { check(`the ${label} exists`, false, f); continue; }
  const p = probe(f, ['-show_entries', 'stream=width,height,codec_name']).streams[0];
  check(`the ${label} is a ${w}×${h} PNG`, p.codec_name === 'png' && +p.width === w && +p.height === h, `${p.codec_name} ${p.width}×${p.height}, ${fs.statSync(f).size} bytes`);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), dir: dir.replace(os.homedir(), '~'), checks, results }, null, 1) + '\n');
console.log(`${checks.filter((c) => c.ok).length} of ${checks.length} checks passed → ${path.relative(process.cwd(), out)}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
