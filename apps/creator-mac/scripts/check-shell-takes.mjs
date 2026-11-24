// AB-T-0614: which takes in the hand test's project were spoken by the Mac app's own tts.speak. A take's timings file
// names its speaker in `source`: "kokoro-82m af_nicole (shell)" for the shell's voice, "(http)" for a loopback server
// (@vrmxg/voicing). Run after HAND-TEST-M4-MCP's scenario and mcp-session.mjs; exits 1 when the shell spoke none.
//   node apps/creator-mac/scripts/check-shell-takes.mjs [--out file.json] [--expect 5]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const dir = path.join(os.homedir(), 'Library/Containers/com.xocialize.vrmxg-creator/Data/tmp/project/voice');
const takes = [];
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.timings.json')).sort()) {
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (!/\(shell\)$/.test(t.source ?? '')) continue;
  const wav = fs.statSync(path.join(dir, t.audio)).size;
  takes.push({ take: f.replace(/\.timings\.json$/, ''), source: t.source, text: t.text, seconds: t.duration, sampleRate: t.sampleRate, words: t.words.length, timed: !t.estimated, offset: t.offset, wavBytes: wav });
}
for (const t of takes) console.log(`${t.take}: ${t.source}, "${t.text}", ${t.seconds.toFixed(2)} s, ${t.words} words${t.timed ? '' : ' (estimated)'}`);
const expect = Number(opt('--expect', 1));
const ok = takes.length >= expect && takes.every((t) => t.timed && t.wavBytes > 44);
const out = opt('--out', null);
if (out) fs.writeFileSync(out, `${JSON.stringify({ ok, expect, takes }, null, 1)}\n`);
console.log(`${takes.length} take${takes.length === 1 ? '' : 's'} spoken by the shell (at least ${expect} expected): ${ok ? 'ok' : 'NOT OK'}`);
process.exit(ok ? 0 : 1);
