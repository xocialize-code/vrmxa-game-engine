// M5 W10 (AB-T-0620): rush-wkwebview.sh's rows → results/m5-rush-wkwebview.json. Each row is the game app replaying one
// recorded session (results/m5-rush/<name>.json) in WKWebView on one backend and origin; its per-step hashes are compared
// with the log's own, the build it played with the build the log names. Exit 1 on an error, a time-out or a difference.
//   node acceptance/m5/rush-wkwebview-summary.mjs <wkwebview-shots.json> <results dir> <the build's folder>
import fs from 'node:fs';
import path from 'node:path';
import { checkFolder } from '@vrmxg/bundle/node';
import { firstDifference } from '../../apps/game/src/session.js';

const [file, out, build] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const folder = checkFolder(build);
let bad = !folder.ok;
const logs = new Map();
const runs = rows.map((r) => {
  const q = new URLSearchParams(r.case), ref = q.get('replay'), name = path.basename(ref, '.json');
  if (!logs.has(name)) logs.set(name, JSON.parse(fs.readFileSync(path.join(out, 'm5-rush', `${name}.json`), 'utf8')));
  const log = logs.get(name), x = r.result ?? {}, run = x.runs?.[0];
  const diff = run?.hashes ? firstDifference(run.hashes, log.hashes) : 0;
  const same = !x.error && diff < 0 && run.steps === log.hashes.length && x.backend === q.get('renderer');
  const errors = [...(r.errors ?? []), ...(x.error ? [x.error] : [])];
  console.log(String(r.origin).padEnd(8), r.case.padEnd(40), 'backend', String(x.backend).padEnd(6), 'steps', run?.steps, 'final', run?.final?.hash, same ? 'same as the log' : `DIFFERS (${x.error ?? (diff >= 0 ? `first at ${diff}: ${JSON.stringify(run?.hashes?.[diff])} against ${JSON.stringify(log.hashes[diff])}` : 'backend or length')})`, errors.length ? errors.slice(0, 2) : '', r.timedOut ? 'TIMED OUT' : '');
  bad ||= !same || !!errors.length || !!r.timedOut;
  return { origin: r.origin, case: r.case, ua: r.ua, backend: x.backend ?? null, steps: run?.steps ?? null, final: run?.final ?? null, frames: x.frames ?? null, sameAsLog: same, errors, timedOut: !!r.timedOut, png: r.png ?? null };
});
const want = 4 * logs.size;
const result = {
  check: 'M5 exit check 7 (the sample game): a session recorded in the game app replays in WKWebView, drawn, on WebGPU and WebGL, over the scheme and loopback, to the per-step hashes it was played with (AB-T-0620)',
  pass: !bad && runs.length === want && runs.length > 0,
  logs: Object.fromEntries([...logs].map(([k, l]) => [k, { build: l.game.digest, steps: l.hashes.length, final: l.hashes.at(-1) }])),
  runs,
};
fs.writeFileSync(path.join(out, 'm5-rush-wkwebview.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(result.pass ? 'PASS' : 'FAIL');
process.exit(result.pass ? 0 : 1);
