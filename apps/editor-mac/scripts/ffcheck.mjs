// Checks on exported files from outside the app, shared by check-exports.mjs (M1 W8) and check-sequence-exports.mjs
// (M2 W12): ffprobe and ffmpeg on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { maxBuffer: 1 << 30, ...opts });
export const probe = (f, args) => JSON.parse(run('ffprobe', ['-v', 'error', '-of', 'json', ...args, f]).toString());

/** A list of checks that prints as it goes. */
export function checker() {
  const checks = [];
  const check = (title, ok, evidence) => { checks.push({ title, ok, evidence }); console.log(`${ok ? '✔' : '✖'} ${title}\n    ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`); };
  return { checks, check };
}

/** The helpers for one folder of exports. */
export function folder(dir) {
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
  return { file, exists, video, framemd5, audioAlignment };
  }
