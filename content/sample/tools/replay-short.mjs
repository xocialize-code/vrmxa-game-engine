// Replay a short in Node, twice, each in a process of its own (M4 W12): the voiced sequence plays in its set with no
// renderer through M4 W7's voicingCheck (apps/playground/src/voicing-check.js): every step's world hashes, each
// speaker's mouth every step, a snapshot taken mid-line restored into a fresh world. The two runs must give the same
// final hash, the same mouths and the same per-step run, with every line baked in its role's voice and nobody talking
// over anybody. Writes acceptance/results/m4-short-replay.json; exit 1 on a difference. Draws nothing, so it takes no
// GPU lock. Needs vrmxa-core beside the repo (it reads the characters).
//   node content/sample/tools/replay-short.mjs [sequences/the-regular.vrmxs]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), content = path.resolve(here, '..'), repo = path.resolve(content, '../..');
const argv = process.argv.slice(2), ref = argv.find((a) => !a.startsWith('--')) ?? 'sequences/the-regular.vrmxs';

if (argv.includes('--once')) {
  const { installPortableMath } = await import('@vrmxg/dmath');
  installPortableMath();
  const { loadRapier } = await import('@vrmxg/physics');
  const { voicingCheck } = await import('../../../apps/playground/src/voicing-check.js');
  const { vrmxaCore, PATHS } = await import('../../../engine/packages/character/test/fixtures.mjs');
  const projectBehaviours = await import('../behaviours.js');
  const bytes = async (r) => new Uint8Array(fs.readFileSync(path.join(content, r)));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const t0 = performance.now();
  const r = await voicingCheck({ R: await loadRapier(), bytes, opts: { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true }, sequence: ref });
  const { run, ...rest } = r;
  process.stdout.write('\nRESULT ' + JSON.stringify({ ...rest, runDigest: createHash('sha256').update(JSON.stringify(run)).digest('hex'), ms: Math.round(performance.now() - t0) }));
  process.exit(0);
}

const once = (n) => {
  const p = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ref, '--once'], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (p.status !== 0) { console.error(`run ${n} failed (${p.status}):\n${p.stderr.slice(-4000)}`); process.exit(1); }
  return JSON.parse(p.stdout.split('\n').find((l) => l.startsWith('RESULT ')).slice(7)); // three.quarks prints a banner
};
const a = once(1), b = once(2);
const brief = (r) => ({ final: r.final, mouthHash: r.mouthHash, runDigest: r.runDigest, steps: r.steps, lines: r.lines.length, everyLineBaked: r.everyLineBaked, inTheirVoices: r.inTheirVoices, leftToVoice: r.leftToVoice, playsFromTrack: r.playsFromTrack, everyLineSpoken: r.everyLineSpoken, overlaps: r.overlaps.length, mouthOpens: r.mouthOpens, restoredSame: r.restored.same && r.restored.mouthsSame, ms: r.ms });
const ok = (r) => r.everyLineBaked && r.inTheirVoices && r.leftToVoice === 0 && r.playsFromTrack && r.everyLineSpoken && r.overlaps.length === 0 && r.mouthOpens > 0.3 && r.restored.same && r.restored.mouthsSame;
const same = a.final === b.final && a.mouthHash === b.mouthHash && a.runDigest === b.runDigest && a.restored.final === b.restored.final;
const pass = ok(a) && ok(b) && same;
console.log(JSON.stringify({ run1: brief(a), run2: brief(b) }, null, 1));
const out = { check: `M4 W12: ${ref} replays exactly in two Node runs, every line voiced in its role's voice with no overlaps`, sequence: ref, pass, same, node: process.version, run1: { ...a, lines: undefined }, run2: { ...b, lines: undefined }, lines: a.lines };
fs.writeFileSync(path.join(repo, 'acceptance/results/m4-short-replay.json'), JSON.stringify(out, null, 1) + '\n');
console.log(pass ? 'PASS' : 'FAIL', same ? `same final hash ${a.final}` : 'HASHES DIFFER');
process.exit(pass ? 0 : 1);
