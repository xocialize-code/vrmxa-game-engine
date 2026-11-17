#!/usr/bin/env node
// A/V sync: the shot lights a white square (lower right) on frames n % fps == 0; the WAV beeps at every
// whole second. Finds both in the encoded file (ffmpeg honours the edit lists) and prints audio − video.
//   node tools/av-sync.mjs <file> [<file> …]
import { execFileSync, spawnSync } from 'node:child_process';

const probe = (file, sel, entries) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', sel, '-show_entries', `stream=${entries}`, '-of', 'json', file])).streams[0];

function flashTimes(file) {
  const v = probe(file, 'v:0', 'width,height,r_frame_rate');
  // shot.js configure(): half-size s = 0.12·hh, centre (hw − 0.75 s, −hh + 0.75 s) → NDC (1 − 0.09/aspect, −0.91).
  const aspect = v.width / v.height, box = Math.max(4, Math.round(v.height * 0.02));
  const px = Math.round(((2 - 0.09 / aspect) / 2) * v.width - box / 2), py = Math.round((1.91 / 2) * v.height - box / 2);
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-map', '0:v:0', '-vf', `format=yuv420p,crop=${box}:${box}:${px}:${py},showinfo`, '-f', 'null', '-'], { maxBuffer: 1 << 27 });
  const frames = [];
  for (const line of r.stderr.toString().split('\n')) {
    const m = line.match(/pts_time:\s*([\d.\-e]+).*?mean:\[(\d+)/);
    if (m) frames.push({ t: Number(m[1]), y: Number(m[2]) });
  }
  const [num, den] = v.r_frame_rate.split('/').map(Number);
  return { fps: num / den, frames: frames.length, flashes: frames.filter((f) => f.y > 200).map((f) => f.t) };
}

function audioOnsets(file) {
  const a = probe(file, 'a:0', 'start_time,codec_name');
  if (!a) return { onsets: [] };
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  const n = pcm.length / 2, onsets = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(pcm.readInt16LE(i * 2)) > 0.3 * 32767) { onsets.push(i / 48000 + Math.max(0, Number(a.start_time) || 0)); i += 24000; }
  }
  return { onsets, codec: a.codec_name, start: Number(a.start_time) };
}

const rows = [];
for (const file of process.argv.slice(2)) {
  const v = flashTimes(file);
  const a = audioOnsets(file);
  const offsets = v.flashes.map((t) => { const o = a.onsets.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), Infinity); return Math.round((o - t) * 1e5) / 100; });
  const row = { file: file.split('/').pop(), fps: v.fps, videoFrames: v.frames, flashTimes: v.flashes.map((t) => Math.round(t * 1e4) / 1e4),
    audioCodec: a.codec, audioStart: a.start, onsetTimes: a.onsets.map((t) => Math.round(t * 1e4) / 1e4), offsetsMs: offsets,
    maxAbsOffsetMs: Math.max(...offsets.map(Math.abs)), frameMs: Math.round(1e5 / v.fps) / 100 };
  console.log(JSON.stringify(row));
  rows.push(row);
}
if (process.env.SAVE) (await import('node:fs')).writeFileSync(process.env.SAVE, JSON.stringify(rows, null, 2));
