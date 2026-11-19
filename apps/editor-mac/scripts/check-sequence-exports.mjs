// Checks the M2 acceptance scenario's exports of "Morning at the cafe" from outside the app (M2 W12, AB-T-0535): 1,080
// frames at 24 fps with every frame at n/24 s, 1920×1080 H.264 and ProRes 4444 with the sound at lag 0 against the mix
// the engine made, the rendered frames' hashes identical across the three exports (and, reported, against the
// Chromium editor's hash-only export), and the subtitles beside each file. Needs ffprobe and ffmpeg on PATH.
// Writes docs/hand-test/results/sequence-export-check.json.
//   node apps/editor-mac/scripts/check-sequence-exports.mjs [exports folder]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checker, folder } from './ffcheck.mjs';

const tmp = path.join(os.homedir(), 'Library/Containers/com.xocialize.vrmxg-editor/Data/tmp');
const dir = process.argv[2] ?? path.join(tmp, 'exports');
const out = path.join(import.meta.dirname, '../docs/hand-test/results/sequence-export-check.json');
const { checks, check } = checker();
const { file, exists, video, framemd5, audioAlignment } = folder(dir);

const FRAMES = 1080, FPS = [24, 1];
const rows = [
  { name: 'film-a.mp4', codec: 'h264' },
  { name: 'film-b.mp4', codec: 'h264' },
  { name: 'film-prores.mov', codec: 'prores' },
];
const results = {};
for (const r of rows) {
  if (!exists(r.name)) { check(`${r.name} exists`, false, `not in ${dir}`); continue; }
  const x = video(r.name, FRAMES, FPS);
  const ok = x.ok && x.v.codec_name === r.codec && +x.v.width === 1920 && +x.v.height === 1080 && x.a && +x.a.start_time === 0 && Math.abs(+x.a.duration - 45) < 0.025;
  results[r.name] = x;
  check(`${r.name}: ${FRAMES} frames at 24 fps, every frame at n/24 s, 1920×1080 ${r.codec} with sound`, ok,
    `${x.decoded} frames decoded (nb_frames ${x.v.nb_frames}), video ${x.v.duration} s, largest timestamp error ${x.maxPtsError.toExponential(1)} s, ${x.v.pix_fmt}; sound ${x.a ? `${x.a.codec_name} ${x.a.sample_rate} Hz ×${x.a.channels}, starts ${x.a.start_time} s, ${x.a.duration} s` : 'none'}; ${(+x.format.size / 1e6).toFixed(1)} MB`);
}

// dialogue, music and effects from the timeline: the muxed sound is the engine's mix, at lag 0
for (const n of ['film-a.mp4', 'film-prores.mov']) {
  if (!exists(n) || !fs.existsSync(file(n.replace(/\.\w+$/, '.wav')))) { check(`${n}: the engine's mix is beside it`, false, 'no .wav sidecar'); continue; }
  const al = audioAlignment(n);
  results[n].alignment = al;
  check(`${n}: the muxed sound lines up with the engine's mix (lag 0 samples)`, al.lag === 0 && al.correlation > 0.95, al);
}

// the rendered frames, hashed as they reached the shell (the same hashFrame the page uses)
const hashes = (n) => (fs.existsSync(file(`${n}.frames.json`)) ? JSON.parse(fs.readFileSync(file(`${n}.frames.json`), 'utf8')).frames : null);
const ha = hashes('film-a.mp4'), hb = hashes('film-b.mp4'), hp = hashes('film-prores.mov');
if (ha && hb && hp) {
  const same = ha.filter((h, i) => h === hb[i] && h === hp[i]).length;
  check('film-a, film-b and film-prores rendered the same frames, frame for frame', same === FRAMES && ha.length === FRAMES, `${same} of ${ha.length} frame hashes match in all three; ${new Set(ha).size} distinct frames`);
  results.frameHashes = ha;
  const chromium = path.join(import.meta.dirname, '../../../acceptance/results/m2-editor-chromium.json');
  if (fs.existsSync(chromium)) {
    const c = JSON.parse(fs.readFileSync(chromium, 'utf8')).frameHashes ?? [];
    results.vsChromium = { same: ha.filter((h, i) => h === c[i]).length, of: c.length };
    console.log(`  (against the Chromium editor's export: ${results.vsChromium.same} of ${c.length} frames identical; not a gate: the GPUs and WebGL stacks differ)`);
  }
} else check('every export has its frame hashes beside it', false, { ha: !!ha, hb: !!hb, hp: !!hp });
if (exists('film-prores.mov')) {
  const d = framemd5('film-prores.mov');
  check('film-prores decodes to 1,080 distinct frames', d.length === FRAMES && new Set(d).size === FRAMES, `${d.length} decoded, ${new Set(d).size} distinct (ffmpeg framemd5)`);
}

// subtitles: the sequence's four lines beside each export, timed to the dialogue clips
const doc = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../content/sample/sequences/cafe-morning.vrmxs'), 'utf8'));
const lines = doc.sequence.tracks.filter((t) => t.type === 'dialogue').flatMap((t) => t.clips).sort((a, b) => a.start - b.start);
const tc = (f) => { const ms = Math.round((f / 24) * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
for (const n of ['film-a', 'film-b', 'film-prores']) {
  const f = file(`${n}.srt`);
  if (!fs.existsSync(f)) { check(`${n}.srt is beside the movie`, false, `not in ${dir}`); continue; }
  const cues = fs.readFileSync(f, 'utf8').trim().split(/\n\n+/).map((c) => c.split('\n'));
  const ok = cues.length === lines.length && cues.every((c, i) => c[1] === `${tc(lines[i].start)} --> ${tc(lines[i].end)}` && c[2].endsWith(lines[i].text));
  check(`${n}.srt has the sequence's ${lines.length} lines at their frames`, ok, cues.map((c) => `${c[1]} ${c[2]}`).join(' | '));
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), dir: dir.replace(os.homedir(), '~'), checks, results }, null, 1) + '\n');
console.log(`${checks.filter((c) => c.ok).length} of ${checks.length} checks passed → ${path.relative(process.cwd(), out)}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
