// Voice a scene's lines (M2 W10's bake, on M4 W7's voicing layer, @vrmxg/voicing): a sequence's dialogue in each role's
// voice (voicingPlan, bakeLines, applyVoicing: the clip, the timings file, the voice, the words, the visemes and the
// audio's length go into the dialogue track, and a replay plays from them), and, as before, a scene's text-only `say`
// connections (bakePlan, applyBake: they point at the clip). Clips are named by line, engine, voice and words
// (voice/cafe-order-hana-1-says-1-af-heart-<hash>.wav). A take already under its name is reused, never spoken again:
// Kokoro's audio differs a little run to run. Files are created, never written over, and a failed run removes what it
// created. Re-running it changes nothing once every line is baked in its role's voice. Lines an older bake left without
// a recorded voice (morning, conversation, cafe-morning) are kept as they are. (voice/lines.json and make-voice.py are
// M1–M3's and no longer touched.)
//
//   node content/sample/tools/bake-lines.mjs sequences/cafe-order.vrmxs
//        [--line <line id> | --role <cue or node id> | --all] [--voice <preset>]   one line, one character, every line
//                                                                                    (sequences only); a voice by hand
//        [--new-take]                               speak the lines again, each under a name of its own (-take2 …)
//        [--voices hana-1=af_heart,mira=af_bella]   voices for roles not cast (default: the sample's map)
//        [--fallback af_heart]                      the voice for a speaker with none, with a warning (default af_heart)
//        [--fit --marks scripts/cafe-marks.json]    lengthen lines whose speech outlasts them, and re-script
//                                                   (sequence.script.source) so what follows moves; a short in
//                                                   shorts.json re-scripts with its marks and cameras (--marks optional)
//        [--tts http://127.0.0.1:5190/speak]        a running loopback TTS server; without it the tool starts
//        [--python <venv>/bin/python]               tools/tts-server.py with this Python (or $VRMXG_TTS_PYTHON) and stops it
//        [--plan]                                   list the lines, change nothing
// Speaking takes the machine's GPU lock (acceptance/gpu-lock.mjs): Kokoro runs on the GPU, and exact-frame runs need it
// quiet. The Kokoro weights come from the Hugging Face cache (HF_HUB_CACHE; offline unless HF_HUB_OFFLINE=0).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from '@vrmxg/scene';
import { bakePlan, applyBake, httpTTS } from '@vrmxg/voice';
import { voicingPlan, bakeLines, applyVoicing, speechOverlaps, fitToSpeech } from '@vrmxg/voicing';
import { clipFor } from '@vrmxg/cast';
import { buildSequence, formatErrors } from '@vrmxg/script';
import { acquireGpuLock, sayWaiting } from '../../../acceptance/gpu-lock.mjs';
import { shortOfSequence, coverageOf } from './make-script-sequence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const FLAGS = ['--all', '--plan', '--fit', '--new-take'];
const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? undefined : argv[i + 1]; };
const ref = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1]?.startsWith('--') && !FLAGS.includes(argv[i - 1])));
if (!ref) { console.error('usage: bake-lines.mjs <scene.vrmxs> [--line id | --role cue | --all] [--voice preset] [--new-take] [--voices id=voice,…] [--fallback preset] [--fit --marks file] [--tts url | --python path] [--plan]'); process.exit(2); }
const SAMPLE_VOICES = { 'hana-1': 'af_heart', mira: 'af_bella' };
const voices = opt('--voices') ? Object.fromEntries(opt('--voices').split(',').filter(Boolean).map((kv) => kv.split('='))) : SAMPLE_VOICES;
const fallback = opt('--fallback') ?? 'af_heart';
const select = opt('--line') ? { line: opt('--line') } : opt('--role') ? { role: opt('--role') } : argv.includes('--all') ? { all: true } : {};
const file = path.join(root, ref);
const doc = parse(fs.readFileSync(file, 'utf8'));
if (!doc.sequence && (select.line || select.role)) { console.error(`${ref} is a scene, not a sequence: --line and --role pick a sequence's dialogue`); process.exit(2); }

const read = (r) => { const f = path.join(root, r); return fs.existsSync(f) ? new Uint8Array(fs.readFileSync(f)) : null; };
const write = (r, bytes) => { const f = path.join(root, r); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes, { flag: 'wx' }); }; // exclusive: never over a file
const remove = (r) => fs.rmSync(path.join(root, r), { force: true });
const takeName = (clip) => { for (let n = 2; ; n++) { const t = clip.replace(/\.wav$/, `-take${n}.wav`); if (!read(t)) return t; } };

// a sequence's dialogue, and (every line, or the default) a scene's text-only say connections
const lines = doc.sequence ? voicingPlan(doc, select, { presets: voices, voice: opt('--voice') ?? null, fallback }) : [];
const says = select.line || select.role ? [] : bakePlan(doc, { voices, voice: fallback }).filter((p) => p.where.startsWith('connections')).map((p) => {
  const voice = opt('--voice') ?? p.voice;
  return { ...p, voice, engine: 'kokoro-82m', cue: p.speaker, clip: clipFor('voice', p.id, voice, p.text), ...(voices[p.speaker] || opt('--voice') ? {} : { fallback: true }) };
});
const all = [...lines, ...says];
if (argv.includes('--new-take')) for (const l of all) l.clip = takeName(l.clip);
for (const l of all) if (l.fallback) console.warn(`warning: ${l.cue} has no voice (--voices): "${l.text}" in ${l.voice}`);
for (const l of all) console.log(`${l.clip}  ${l.voice}  ${l.cue}: ${l.text}  (${l.reason ?? 'say'})`);
if (argv.includes('--plan')) { if (!all.length) console.log(`${ref}: every line is voiced in its role's voice`); process.exit(0); }

let out = doc;
if (all.length) {
  const takeOf = (l) => read(l.clip) && read(l.clip.replace(/\.wav$/, '.timings.json'));
  const speaking = all.some((l) => !takeOf(l));
  let server = null, url = opt('--tts'), release = null;
  if (speaking) release = await acquireGpuLock({ who: 'content/sample/tools/bake-lines.mjs (Kokoro)', onWait: sayWaiting('bake-lines.mjs') });
  try {
    if (!url && speaking) {
      const python = opt('--python') ?? process.env.VRMXG_TTS_PYTHON;
      if (!python) throw new Error('give --tts <url> (a running tools/tts-server.py) or --python <a Python with mlx-audio and misaki> (or VRMXG_TTS_PYTHON)');
      server = spawn(python, ['-I', path.join(root, 'tools/tts-server.py'), '--port', '0'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? '1' } });
      url = await new Promise((resolve, reject) => {
        let err = '';
        server.stderr.on('data', (d) => { err += d; const m = /tts-server: (http:\/\/\S+)/.exec(err); if (m) resolve(m[1]); });
        server.on('exit', (code) => reject(new Error(`tts-server.py exited (${code}) before it was ready:\n${err.slice(-2000)}`)));
      });
      console.log(`tts: ${url} (tools/tts-server.py)`);
    }
    const tts = url ? httpTTS(url) : { name: 'none', speak: () => { throw new Error('no TTS: every line was to have its take'); } };
    const onLine = (l, b) => console.log(`${b.reused ? 'kept' : 'wrote'} ${b.clip}  ${b.audio.duration.toFixed(2)} s, ${b.words.length} words, ${b.visemes.length} visemes`);
    const bakes = await bakeLines(all, { tts, write, read, remove, onLine });
    if (lines.length) out = applyVoicing(out, lines, bakes.slice(0, lines.length)).doc;
    if (says.length) out = applyBake(out, says);
  } catch (e) {
    console.error(`${e.message}: the scene is left as it was`);
    process.exitCode = 1;
  } finally {
    server?.kill();
    release?.();
  }
  if (process.exitCode) process.exit(process.exitCode);
}

if (argv.includes('--fit') && out.sequence) {
  // a short in shorts.json re-scripts with its own marks and cameras (coverage by rule or the script's default)
  const short = shortOfSequence(ref), source = out.sequence.script?.source, marksFile = opt('--marks') ?? short?.marks, coverage = coverageOf(short);
  if (!source || !marksFile) { console.error('--fit re-scripts the sequence: it needs the script it was built from (sequence.script.source) and --marks <file> (or a short in shorts.json with marks)'); process.exit(2); }
  const set = parse(fs.readFileSync(path.join(root, out.set), 'utf8'));
  const { marks } = JSON.parse(fs.readFileSync(path.join(root, marksFile), 'utf8'));
  const script = fs.readFileSync(path.join(root, source), 'utf8');
  let failed = null;
  const f = fitToSpeech(out, { rescript: (d) => { const r = buildSequence(script, { previous: d, set, marks, id: d.id, source, coverage }); if (!r.ok) failed = formatErrors(r.errors, source); return r.ok ? r.doc : d; } });
  if (failed) { console.error(failed); process.exit(1); }
  for (const l of f.lines) console.log(`fit ${l.track}[${l.index}]: end ${l.from} → ${l.to}`);
  out = f.doc;
}
const overlaps = out.sequence ? speechOverlaps(out) : [];
for (const x of overlaps) console.warn(`warning: ${x.message}`);
if (out !== doc) fs.writeFileSync(file, serialize(out));
console.log(`${ref}: ${all.length ? `${all.length} line${all.length === 1 ? '' : 's'} voiced` : 'every line is voiced in its role\'s voice'}${overlaps.length ? `, ${overlaps.length} overlapping (--fit)` : ''}`);
