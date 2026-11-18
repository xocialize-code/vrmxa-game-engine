// Bake a sequence's text-only dialogue to voice clips (M2 W10): lists the lines (@vrmxg/voice bakePlan), adds them to
// voice/lines.json, runs make-voice.py (Kokoro through mlx-audio) for the ones without a clip, and points the sequence's
// dialogue at the clips (applyBake). Re-running it changes nothing once every line has its clip.
//
//   node content/sample/tools/bake-lines.mjs sequences/morning.vrmxs [--voices hana-1=af_heart,customer-1=am_adam]
//        [--python <venv>/bin/python] [--plan]   (--plan: list the lines, change nothing)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from '@vrmxg/scene';
import { bakePlan, applyBake } from '@vrmxg/voice';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? undefined : argv[i + 1]; };
const ref = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (!ref) { console.error('usage: bake-lines.mjs <scene.vrmxs> [--voices id=voice,…] [--python path] [--plan]'); process.exit(2); }
const voices = Object.fromEntries((opt('--voices') ?? '').split(',').filter(Boolean).map((kv) => kv.split('=')));
const file = path.join(root, ref);
const doc = parse(fs.readFileSync(file, 'utf8'));
const plan = bakePlan(doc, { voices });
if (!plan.length) { console.log(`${ref}: every line has a clip`); process.exit(0); }
for (const p of plan) console.log(`${p.clip}  ${p.voice}  ${p.speaker}: ${p.text}`);
if (argv.includes('--plan')) process.exit(0);

const linesFile = path.join(root, 'voice/lines.json');
const lines = JSON.parse(fs.readFileSync(linesFile, 'utf8'));
for (const p of plan) {
  const l = lines.find((x) => x.id === p.id);
  if (l) Object.assign(l, { voice: p.voice, text: p.text }); else lines.push({ id: p.id, voice: p.voice, text: p.text });
}
fs.writeFileSync(linesFile, `[\n${lines.map((l) => ` ${JSON.stringify(l)}`).join(',\n')}\n]\n`);

const python = opt('--python') ?? process.env.VRMXG_TTS_PYTHON ?? 'python3';
const r = spawnSync(python, ['-I', path.join(root, 'tools/make-voice.py')], { cwd: root, stdio: 'inherit', env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? '1' } });
if (r.status !== 0) { console.error('make-voice.py failed: the sequence is left as it was'); process.exit(1); }
const missing = plan.filter((p) => !fs.existsSync(path.join(root, p.clip)));
if (missing.length) { console.error(`no clip for ${missing.map((p) => p.id).join(', ')}`); process.exit(1); }
fs.writeFileSync(file, serialize(applyBake(doc, plan)));
console.log(`${ref}: ${plan.length} lines baked`);
