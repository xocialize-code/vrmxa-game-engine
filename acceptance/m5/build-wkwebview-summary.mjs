// M5 W0 (AB-T-0615): build-wkwebview.sh's rows → results/m5-build-wkwebview.json: per run (origin, load) the build the
// runtime opened, the world's hash after every step and how the lexer reads a set of awkward modules, each compared with Node's (results/m5-build.json: the build's
// digest, and the run as the digest of its hashes). Exit 1 on an error, a time-out or a difference.
//   node acceptance/m5/build-wkwebview-summary.mjs <wkwebview-shots.json> <results dir> <the build's folder>
import fs from 'node:fs';
import path from 'node:path';
import { sha256Text } from '@vrmxg/bundle';
import { checkFolder } from '@vrmxg/bundle/node';

const [file, out, build] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = JSON.parse(fs.readFileSync(path.join(out, 'm5-build.json'), 'utf8'));
const folder = checkFolder(build);
let bad = !folder.ok || folder.manifest !== node.build.manifestSha256;
if (bad) console.log(`the build played here is not the one m5-build.json describes (manifest ${folder.manifest.slice(0, 16)} against ${node.build.manifestSha256.slice(0, 16)}): run acceptance/m5/build.mjs again`);
const runs = rows.map((r) => {
  const x = r.result ?? {};
  const hashesDigest = Array.isArray(x.hashes) ? sha256Text(x.hashes.join('\n')) : null;
  const lexerDigest = Array.isArray(x.lexer) ? sha256Text(JSON.stringify(x.lexer)) : null;
  const differs = [lexerDigest !== node.lexer.digest && 'the lexer\'s reading of the awkward modules', JSON.stringify(x.modules ?? null) !== JSON.stringify(node.lexer.modules) && 'the game\'s module graph', x.digest !== node.build.digest && 'the build', x.final !== node.replay.final && 'the final world', hashesDigest !== node.replay.hashesDigest && 'the per-step hashes', x.steps !== node.replay.steps && 'the steps'].filter(Boolean);
  const same = !differs.length;
  console.log(String(r.origin).padEnd(8), r.case.padEnd(46), 'build', String(x.digest).slice(0, 16), 'final', x.final, same ? 'same as Node' : `DIFFERS FROM NODE (${differs.join(', ')})`, (r.errors ?? []).length ? r.errors.slice(0, 2) : '', r.timedOut ? 'TIMED OUT' : '');
  bad ||= !same || !!(r.errors ?? []).length || !!r.timedOut;
  return { origin: r.origin, case: r.case, ua: r.ua, build: x.digest ?? null, runtime: x.runtime ?? null, steps: x.steps ?? null, final: x.final ?? null, hashesDigest, lexerDigest, filesChecked: x.verified ?? null, sameAsNode: same, errors: r.errors ?? [], timedOut: !!r.timedOut };
});
const result = { check: 'M5 exit check 1: the build plays in WKWebView, scheme and loopback, to Node\'s per-step hashes (AB-T-0615)', pass: !bad && runs.length === 4, node: { build: node.build.digest, manifest: node.build.manifestSha256, steps: node.replay.steps, final: node.replay.final, hashesDigest: node.replay.hashesDigest, lexerDigest: node.lexer.digest }, runs };
fs.writeFileSync(path.join(out, 'm5-build-wkwebview.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(result.pass ? 'PASS' : 'FAIL');
process.exit(result.pass ? 0 : 1);
