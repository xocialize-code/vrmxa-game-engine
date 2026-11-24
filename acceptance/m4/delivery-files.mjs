// M4 W13 (AB-T-0585), M4 check 7 from outside the app: the files of each delivery in a project's deliveries/ folder
// (the creator's render queue, acceptance/m4/delivery-wkwebview.sh), read with ffprobe and ffmpeg:
//   - the film: the manifest's frame count at 24 fps with every frame at n/24 s, the preset's size and codec (ProRes 4444
//     with an alpha plane), and its sound starting at 0;
//   - the sound at lag 0: the muxed sound against the mix the engine made (the .wav beside the film), lined up over the
//     four seconds of the mix with the most in them;
//   - an .srt with every line: as many cues as the sequence has dialogue clips, each inside the film;
//   - a still (at the film's size) and a thumbnail per shot, a turntable per character, and every listed file on disk.
// Writes <out> (default results/m4-acceptance/delivery-files.json; $HOME cut to ~); exit 1 on a failure.
//   node acceptance/m4/delivery-files.mjs <deliveries folder> [--sequence content/sample/sequences/the-regular.vrmxs] [--out file.json] [--append]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, probe } from '../../apps/editor-mac/scripts/ffcheck.mjs';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const dir = path.resolve(argv[0] ?? '.'), root = path.join(import.meta.dirname, '../..');
const out = path.resolve(opt('--out', path.join(import.meta.dirname, '../results/m4-acceptance/delivery-files.json')));
const seqDoc = JSON.parse(fs.readFileSync(path.resolve(root, opt('--sequence', 'content/sample/sequences/the-regular.vrmxs')), 'utf8'));
const seq = seqDoc.sequence, lines = seq.tracks.filter((t) => t.type === 'dialogue').reduce((n, t) => n + t.clips.length, 0);
const CODEC = { h264: 'h264', hevc: 'hevc', prores4444: 'prores' };

/** The muxed sound against the engine's mix: the lag (in samples) where they line up best over the mix's loudest 4 s. */
function alignment(film, wavPath) {
  const wav = fs.readFileSync(wavPath), ch = wav.readUInt16LE(22), rate = wav.readUInt32LE(24), n = (wav.length - 44) / 2 / ch;
  const ref = new Float32Array(n * 2); // interleaved stereo, as the decode below
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) ref[i * 2 + c] = wav.readInt16LE(44 + (i * ch + Math.min(c, ch - 1)) * 2) / 32768;
  const pcm = run('ffmpeg', ['-v', 'error', '-i', film, '-map', '0:a', '-f', 'f32le', '-ac', '2', '-ar', String(rate), '-']);
  const got = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
  const len = rate * 4 * 2, hop = rate; // 4 s windows, a second apart: the one with the most energy
  let from = 0, most = -1;
  for (let s = rate * 2; s + len < ref.length - rate * 2; s += hop) { let e = 0; for (let i = s; i < s + len; i += 16) e += ref[i] * ref[i]; if (e > most) { most = e; from = s; } }
  let best = { lag: 0, r: -Infinity };
  for (let lag = -2400; lag <= 2400; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = from; i < from + len; i += 2) { const x = ref[i], y = got[i + lag * 2] ?? 0; xy += x * y; xx += x * x; yy += y * y; }
    const r = xy / Math.sqrt(xx * yy || 1);
    if (r > best.r) best = { lag, r };
  }
  return { rate, mixSamples: n, decodedSamples: got.length / 2, windowFromS: +(from / 2 / rate).toFixed(2), lag: best.lag, correlation: +best.r.toFixed(4) };
}
const png = (f) => { const b = fs.readFileSync(f); return b.toString('latin1', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
const srtTime = (t) => { const m = t.match(/(\d+):(\d+):(\d+),(\d+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : NaN; };

const deliveries = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'delivery.json'))).sort();
const rows = [];
for (const d of deliveries) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, d, 'delivery.json'), 'utf8'));
  const at = (ref) => path.join(dir, '..', ref), checks = [], check = (title, ok, evidence) => { checks.push({ title, ok: !!ok, evidence }); console.log(`${ok ? '✔' : '✖'} ${d}: ${title}\n    ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`); };
  const film = at(m.film.path), frames = m.film.frames, [num, den] = m.fps;
  // the film
  const s = probe(film, ['-show_entries', 'stream=codec_type,codec_name,profile,width,height,nb_frames,duration,start_time,pix_fmt,sample_rate,channels', '-show_entries', 'format=duration,size']);
  const v = s.streams.find((x) => x.codec_type === 'video'), a = s.streams.find((x) => x.codec_type === 'audio');
  const pts = run('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', film]).toString().trim().split('\n').map((l) => parseFloat(l));
  const late = pts.map((t, n) => Math.abs(t - (n * den) / num)).reduce((x, y) => Math.max(x, y), 0);
  const filmEv = { codec: v.codec_name, profile: v.profile ?? null, pixFmt: v.pix_fmt, size: [+v.width, +v.height], decoded: pts.length, nbFrames: +v.nb_frames, seconds: +v.duration, maxPtsError: +late.toExponential(1), bytes: +s.format.size };
  check(`the film: ${frames} frames at ${num}/${den} fps, every frame at n/24 s, ${m.size.join('×')} ${m.codec}`, pts.length === frames && +v.nb_frames === frames && late < 1e-4 && v.codec_name === CODEC[m.codec] && +v.width === m.size[0] && +v.height === m.size[1], filmEv);
  if (m.codec === 'prores4444') check('ProRes 4444 with an alpha plane', /^yuva444p/.test(v.pix_fmt), { pixFmt: v.pix_fmt, profile: v.profile ?? null });
  // the sound
  const wav = film.replace(/\.\w+$/, '.wav');
  const soundEv = a ? { codec: a.codec_name, rate: +a.sample_rate, channels: +a.channels, start: +a.start_time, seconds: +a.duration } : null;
  check('the film has its sound, starting at 0', !!a && +a.start_time === 0 && Math.abs(+a.duration - (frames * den) / num) < 0.05, soundEv ?? 'no audio stream');
  let al = null;
  if (a && fs.existsSync(wav)) { al = alignment(film, wav); check("the muxed sound lines up with the engine's mix (lag 0 samples)", al.lag === 0 && al.correlation > 0.95, al); } else check("the engine's mix is beside the film", false, 'no .wav sidecar');
  // the subtitles
  const srtPath = m.subtitles?.path ? at(m.subtitles.path) : null;
  const cues = srtPath && fs.existsSync(srtPath) ? fs.readFileSync(srtPath, 'utf8').split(/\r?\n\r?\n/).filter((c) => c.trim()).map((c) => { const l = c.trim().split(/\r?\n/), [from, to] = l[1].split(' --> ').map(srtTime); return { from, to, text: l.slice(2).join(' ') }; }) : [];
  const inside = cues.every((c) => c.from >= 0 && c.to > c.from && c.to <= (frames * den) / num + 0.05);
  check(`an .srt with every line: ${lines} cues, each inside the film`, cues.length === lines && m.subtitles?.lines === lines && inside, { cues: cues.length, manifest: m.subtitles?.lines ?? null, first: cues[0] ?? null, last: cues.at(-1) ?? null });
  // stills, thumbnails, turntables
  const shots = seq.shots.length;
  const stillSizes = m.stills.map((x) => (fs.existsSync(at(x.path)) ? png(at(x.path)) : null)), thumbSizes = m.thumbnails.map((x) => (fs.existsSync(at(x.path)) ? png(at(x.path)) : null));
  check(`a still per shot at the film's size: ${shots}`, m.stills.length === shots && new Set(m.stills.map((x) => x.shot)).size === shots && stillSizes.every((z) => z && z[0] === m.size[0] && z[1] === m.size[1]), { stills: m.stills.length, sizes: [...new Set(stillSizes.map(String))] });
  check(`a thumbnail per shot: ${shots}`, m.thumbnails.length === shots && new Set(m.thumbnails.map((x) => x.shot)).size === shots && thumbSizes.every(Boolean), { thumbnails: m.thumbnails.length, sizes: [...new Set(thumbSizes.map(String))] });
  const cast = Object.keys(seq.roles ?? {}).length || null;
  const tt = m.turntables.map((t) => { const f = at(t.path); if (!fs.existsSync(f)) return { character: t.character, missing: true }; const p = probe(f, ['-select_streams', 'v', '-show_entries', 'stream=codec_name,width,height,nb_frames,duration']).streams[0]; return { character: t.character, codec: p.codec_name, size: [+p.width, +p.height], frames: +p.nb_frames, manifestFrames: t.frames, seconds: +p.duration }; });
  check(`a turntable per character${cast ? `: ${cast}` : ''}`, tt.length > 0 && (!cast || tt.length === cast) && tt.every((t) => !t.missing && t.frames === t.manifestFrames && t.frames > 0), tt);
  const listed = [m.film.path, m.subtitles?.path, ...m.stills.map((x) => x.path), ...m.thumbnails.map((x) => x.path), ...m.turntables.map((x) => x.path)].filter(Boolean);
  const missing = listed.filter((ref) => !fs.existsSync(at(ref)) || fs.statSync(at(ref)).size === 0);
  check(`every listed file is on disk: ${listed.length}`, missing.length === 0, missing.length ? { missing } : `${listed.length} files`);
  rows.push({ delivery: d, short: m.short, preset: m.preset, backend: m.backend, check: m.check ?? null, frameDigest: m.film.frameDigest, ok: checks.every((c) => c.ok), film: filmEv, sound: soundEv, alignment: al, subtitles: cues.length, stills: m.stills.length, thumbnails: m.thumbnails.length, turntables: tt, checks });
}
if (!rows.length) { console.error(`no delivery.json under ${dir}`); process.exit(1); }
const home = os.homedir(), prior = argv.includes('--append') && fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')).deliveries : [];
const all = [...prior.filter((p) => !rows.some((r) => r.delivery === p.delivery)), ...rows];
const res = { format: 'vrmxg-delivery-files', version: 1, ok: all.every((r) => r.ok), sequence: { id: seqDoc.id ?? null, shots: seq.shots.length, dialogueClips: lines }, deliveries: all };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(res, null, 1).split(home).join('~')}\n`);
console.log(rows.every((r) => r.ok) ? `all passed (${rows.length} deliveries)` : 'FAILED');
process.exit(rows.every((r) => r.ok) ? 0 : 1);
