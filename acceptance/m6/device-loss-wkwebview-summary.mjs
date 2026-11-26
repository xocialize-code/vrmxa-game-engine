// M6 W6 (AB-T-0639): device-loss-wkwebview.sh's rows → results/m6-device-loss-wkwebview.json. Each row is the game app
// replaying the unbroken session (results/m6-device-loss/lose.json) in WKWebView on one backend and origin while its
// device is lost under it (?lose=): its per-step hashes are compared with the log's, and each loss must have been made
// good on the backend the case asks for (WebGPU again; ?recover= names another), with the status line shown and gone.
// Exit 1 on an error, a time-out, a difference or a loss not recovered.
//   node acceptance/m6/device-loss-wkwebview-summary.mjs <wkwebview-shots.json> <results dir> <the build's folder> <runs expected>
import fs from 'node:fs';
import path from 'node:path';
import { checkFolder } from '@vrmxg/bundle/node';
import { firstDifference } from '../../apps/game/src/session.js';

const [file, out, build, expected] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const log = JSON.parse(fs.readFileSync(path.join(out, 'm6-device-loss', 'lose.json'), 'utf8'));
const folder = checkFolder(build);
let bad = !folder.ok;
// a lost device logs on purpose (three's own "Device Lost", WebGPU's errors for work sent to a dead device, the host's warning)
const expectedNoise = /Device Lost|destroyed|lost|Unable to make command encoder|Invalid|CONTEXT_LOST/i;
const runs = rows.map((r) => {
  const q = new URLSearchParams(r.case), x = r.result ?? {}, run = x.runs?.[0];
  const lose = (q.get('lose') ?? '').split(',').filter(Boolean), backend = q.get('renderer');
  const want = lose.map(() => q.get('recover')?.split(',')[0] ?? backend);
  const got = (x.recoveries ?? []).map((v) => v.backend ?? `failed: ${v.failed}`);
  const diff = run?.hashes ? firstDifference(run.hashes, log.hashes) : 0;
  const same = !x.error && diff < 0 && run.steps === log.hashes.length;
  const recovered = JSON.stringify(got) === JSON.stringify(want) && (x.losses ?? []).length === want.length;
  const shown = (x.displays ?? []).filter((d) => d.text), status = shown.length >= 1 && !(x.displays ?? []).at(-1)?.text;
  const errors = [...(r.errors ?? []).filter((e) => !expectedNoise.test(String(e))), ...(x.error ? [x.error] : [])];
  const ok = same && recovered && status && !errors.length && !r.timedOut;
  console.log(String(r.origin).padEnd(8), r.case.replace('replay=logs/lose.json&', '').padEnd(64), 'steps', run?.steps, 'final', run?.final?.hash,
    same ? 'same as the log' : `DIFFERS (${x.error ?? (diff >= 0 ? `first at ${diff}: ${JSON.stringify(run?.hashes?.[diff])} against ${JSON.stringify(log.hashes[diff])}` : 'length')})`,
    `lost at ${(x.losses ?? []).map((l) => `${l.step} ${l.how}`).join(', ')}, made again on ${got.join(', ')}${recovered ? '' : ` (WANTED ${want.join(', ')})`}`, status ? '' : 'STATUS LINE', errors.length ? errors.slice(0, 2) : '', r.timedOut ? 'TIMED OUT' : '');
  bad ||= !ok;
  return { origin: r.origin, case: r.case, ua: r.ua, backend: x.backend ?? null, steps: run?.steps ?? null, final: run?.final ?? null, sameAsLog: same, losses: x.losses ?? [], recoveries: x.recoveries ?? [], displays: x.displays ?? [], frames: x.frames ?? null, errors, timedOut: !!r.timedOut, png: r.png ?? null };
});
const result = {
  check: 'M6 W6 (AB-T-0639) in WKWebView: the game app replays a session to its per-step hashes while its GPU device is lost under it (device.destroy(), a failing createCommandEncoder, a lost WebGL context), made again on WebGPU, on three\'s WebGL2 backend and on WebGL, over the scheme and loopback',
  pass: !bad && runs.length === Number(expected) && runs.length > 0,
  log: { build: log.game.digest, steps: log.hashes.length, final: log.hashes.at(-1) },
  runs,
};
fs.writeFileSync(path.join(out, 'm6-device-loss-wkwebview.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(result.pass ? 'PASS' : 'FAIL');
process.exit(result.pass ? 0 : 1);
