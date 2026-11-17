#!/usr/bin/env node
// VMAF / PSNR / SSIM of every encode against the raw BGRA reference (both go to 4:2:0 BT.709 limited first,
// which is what each encoder does to its input). Writes results/quality-metrics.json.
//   node tools/quality.mjs <videos-dir> [ref=q-ref.bgra] [pattern=^q-]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [dir, refName = 'q-ref.bgra', pattern = '^q-(native|wc)'] = process.argv.slice(2);
const ref = path.join(dir, refName);
const re = new RegExp(pattern);
const files = fs.readdirSync(dir).filter((f) => re.test(f) && /\.(mp4|mov)$/.test(f)).sort();
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
  'stream=codec_name,profile,nb_read_frames,has_b_frames,bit_rate,color_space,color_range,color_transfer,color_primaries,pix_fmt', '-of', 'json', f])).streams[0];
const pictTypes = (f) => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pict_type', '-of', 'csv=p=0', f]).toString();
  const c = {}; for (const t of out.split('\n').filter(Boolean)) c[t.trim()] = (c[t.trim()] ?? 0) + 1; return c;
};
const rows = [];
for (const f of files) {
  const full = path.join(dir, f);
  const log = path.join(os.tmpdir(), `vmaf-${process.pid}.json`);
  const lavfi = '[0:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setpts=PTS-STARTPTS[ref];' +
    '[1:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setpts=PTS-STARTPTS[dist];' +
    `[dist][ref]libvmaf=log_fmt=json:log_path=${log}:n_threads=8:feature=name=psnr|name=float_ssim`;
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', '1920x1080', '-r', '30', '-i', ref, '-i', full, '-lavfi', lavfi, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const m = JSON.parse(fs.readFileSync(log, 'utf8')).pooled_metrics;
  const p = probe(full);
  const r = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  const row = { file: f, bytes: fs.statSync(full).size, mbps: r((fs.statSync(full).size * 8) / 10 / 1e6), codec: p.codec_name, profile: p.profile,
    frames: Number(p.nb_read_frames), hasBFrames: p.has_b_frames, pictTypes: pictTypes(full),
    colour: `${p.color_space}/${p.color_transfer}/${p.color_primaries}/${p.color_range}`,
    vmaf: r(m.vmaf.mean), vmafMin: r(m.vmaf.min), vmafHarmonic: r(m.vmaf.harmonic_mean), psnrY: r(m.psnr_y.mean), ssim: r(m.float_ssim.mean, 4) };
  console.log(JSON.stringify(row));
  rows.push(row);
}
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../results/quality-metrics.json');
fs.writeFileSync(out, JSON.stringify(rows, null, 2));
console.log(`wrote ${out}`);
