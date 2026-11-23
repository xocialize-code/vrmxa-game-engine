// Voice a sequence's lines (M2 W10's bake, on M4 W7's voicing layer, @vrmxg/voice voicing.js): lists the lines to voice
// (voicingPlan), speaks each in its character's voice through a TTS provider and writes its WAV and timings file
// (bakeLines), and puts the bake into the dialogue track (applyVoicing): the clip, the timings file, the voice, the
// words, the visemes and the audio's length, which a replay plays from. Clips are named by line, voice and words
// (voice/cafe-order-hana-1-says-1-af-heart-<hash>.wav), so a file an older bake points at is never written over.
// Re-running it changes nothing once every line is baked in its role's voice, and a take already there (the same
// line, voice and words) is baked from its files rather than spoken again: Kokoro's audio differs a little run to run. Lines an older bake left without a
// recorded voice (morning, conversation, cafe-morning) are kept as they are.
//
//   node content/sample/tools/bake-lines.mjs sequences/cafe-order.vrmxs
//        [--line <line id> | --role <cue or node id> | --all] [--voice <preset>]   one line, one character, every line;
//                                                                                    a voice picked by hand for them
//        [--voices hana-1=af_heart,mira=af_bella]   voices for roles not cast (default: the sample's map)
//        [--tts http://127.0.0.1:5190/speak]        a running loopback TTS server; without it the tool starts
//        [--python <venv>/bin/python]               tools/tts-server.py with this Python (or $VRMXG_TTS_PYTHON) and stops it
//        [--plan]                                   list the lines, change nothing
// The Kokoro weights come from the Hugging Face cache (HF_HUB_CACHE; offline unless HF_HUB_OFFLINE=0).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from '@vrmxg/scene';
import { voicingPlan, bakeLines, applyVoicing, httpTTS } from '@vrmxg/voice';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? undefined : argv[i + 1]; };
const ref = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1]?.startsWith('--') && !['--all', '--plan'].includes(argv[i - 1])));
if (!ref) { console.error('usage: bake-lines.mjs <sequence.vrmxs> [--line id | --role cue | --all] [--voice preset] [--voices id=voice,…] [--tts url | --python path] [--plan]'); process.exit(2); }
const SAMPLE_VOICES = { 'hana-1': 'af_heart', mira: 'af_bella' };
const voices = opt('--voices') ? Object.fromEntries(opt('--voices').split(',').filter(Boolean).map((kv) => kv.split('='))) : SAMPLE_VOICES;
const select = opt('--line') ? { line: opt('--line') } : opt('--role') ? { role: opt('--role') } : argv.includes('--all') ? { all: true } : {};
const file = path.join(root, ref);
const doc = parse(fs.readFileSync(file, 'utf8'));
const lines = voicingPlan(doc, select, { presets: voices, voice: opt('--voice') ?? null });
if (!lines.length) { console.log(`${ref}: every line is voiced in its role's voice`); process.exit(0); }
for (const l of lines) console.log(`${l.clip}  ${l.voice}  ${l.cue}: ${l.text}  (${l.reason})`);
if (argv.includes('--plan')) process.exit(0);

const write = (r, bytes) => { const f = path.join(root, r); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); };
// a take already there (the same line, voice and words) is baked from its files, never spoken again over them
const read = (r) => { const f = path.join(root, r); return fs.existsSync(f) ? new Uint8Array(fs.readFileSync(f)) : null; };
const takeOf = (l) => read(l.clip) && read(l.clip.replace(/\.wav$/, '.timings.json'));
const speaking = lines.some((l) => !takeOf(l));
let server = null, url = opt('--tts');
if (!url && speaking) {
  const python = opt('--python') ?? process.env.VRMXG_TTS_PYTHON;
  if (!python) { console.error('give --tts <url> (a running tools/tts-server.py) or --python <a Python with mlx-audio and misaki> (or VRMXG_TTS_PYTHON)'); process.exit(2); }
  server = spawn(python, ['-I', path.join(root, 'tools/tts-server.py'), '--port', '0'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? '1' } });
  url = await new Promise((resolve, reject) => {
    let err = '';
    server.stderr.on('data', (d) => { err += d; const m = /tts-server: (http:\/\/\S+)/.exec(err); if (m) resolve(m[1]); });
    server.on('exit', (code) => reject(new Error(`tts-server.py exited (${code}) before it was ready:\n${err.slice(-2000)}`)));
  });
  console.log(`tts: ${url} (tools/tts-server.py)`);
}
try {
  const tts = url ? httpTTS(url) : { name: 'none', speak: () => { throw new Error('no TTS: every line was to have its take'); } };
  const bakes = await bakeLines(lines, { tts, write, read, onLine: (l, b) => console.log(`${b.reused ? 'kept' : 'wrote'} ${b.clip}  ${b.audio.duration.toFixed(2)} s, ${b.words.length} words, ${b.visemes.length} visemes`) });
  fs.writeFileSync(file, serialize(applyVoicing(doc, lines, bakes).doc));
  console.log(`${ref}: ${lines.length} line${lines.length === 1 ? '' : 's'} voiced`);
} catch (e) {
  console.error(`${e.message}: the sequence is left as it was`);
  process.exitCode = 1;
} finally {
  server?.kill();
}
