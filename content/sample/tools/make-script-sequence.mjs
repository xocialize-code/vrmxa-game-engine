// The sample's shorts as sequences (M4 W4, every short since M4 W12): builds each short's Fountain script over its set
// with @vrmxg/script, with the cameras shorts.json names for it (`rule`: @vrmxg/coverage's coverByRule, as the creator
// covers it; `default`: the script's own wide and close-ups), and writes its sequence. Re-running it re-scripts each
// file in place, so hand edits made to a sequence since (a bake, a fit, a take) are kept (the hand-edit rules in
// engine/packages/script/README.md).
//   node content/sample/tools/make-script-sequence.mjs [<short id> …] [--check]
//        no id: every short in shorts.json; --check: exit 1 if a file isn't what its script builds
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, serialize } from '@vrmxg/scene';
import { buildSequence, formatErrors } from '@vrmxg/script';
import { coverByRule, setBlockers } from '@vrmxg/coverage';
import { readGLBJson } from '@vrmxg/model';
import { readPhysics } from '@vrmxg/physics';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** shorts.json's shorts (the creator's project of shorts, apps/creator/src/shorts.js). */
export function sampleShorts() {
  return JSON.parse(fs.readFileSync(path.join(root, 'shorts.json'), 'utf8')).shorts;
}

/**
 * A set's solid boxes (its Collider nodes and its Models' colliders, read from their .glb), which cameras by rule keep
 * clear of (AB-T-0597; the creator reads the same: apps/creator/src/desk.js).
 */
export function blockersOf(setRef) {
  const set = parse(fs.readFileSync(path.join(root, setRef), 'utf8'));
  const colliders = {};
  for (const a of set.assets ?? []) if (/\.glb$/i.test(a.ref ?? '') && fs.existsSync(path.join(root, a.ref))) colliders[a.ref] = readPhysics(readGLBJson(new Uint8Array(fs.readFileSync(path.join(root, a.ref))))).colliders;
  return setBlockers(set, colliders);
}

/** The coverage hook a short's setting asks for (as the creator's coverageFor): by rule, clear of the short's set. */
export const coverageOf = (short) => (short?.coverage === 'rule' ? coverByRule({ blockers: blockersOf(short.set ?? 'cafe.vrmxs') }) : undefined);

/** The short whose sequence is this ref, if shorts.json lists one. */
export const shortOfSequence = (ref) => sampleShorts().find((s) => (s.sequence ?? `sequences/${s.id}.vrmxs`) === ref) ?? null;

function build(short, { check = false } = {}) {
  const script = short.script, out = short.sequence ?? `sequences/${short.id}.vrmxs`;
  const text = fs.readFileSync(path.join(root, script), 'utf8');
  const set = parse(fs.readFileSync(path.join(root, short.set ?? 'cafe.vrmxs'), 'utf8'));
  const { marks } = short.marks ? JSON.parse(fs.readFileSync(path.join(root, short.marks), 'utf8')) : { marks: {} };
  const file = path.join(root, out);
  const previous = fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : null;
  const r = buildSequence(text, { previous, set, marks, id: short.id, source: script, coverage: coverageOf(short) });
  if (!r.ok) { console.error(formatErrors(r.errors, script)); return false; }
  for (const w of r.warnings) console.warn(`warning: ${out}: ${w}`);
  const bytes = serialize(r.doc);
  if (check) {
    const same = previous && fs.readFileSync(file, 'utf8') === bytes;
    console.log(same ? `${out}: up to date` : `${out}: differs from what ${script} builds`);
    return !!same;
  }
  fs.writeFileSync(file, bytes);
  console.log(`${out}: ${r.report.shots} shots, ${r.report.lines} lines, ${(r.doc.sequence.duration / (r.doc.sequence.fps ?? 24)).toFixed(2)} s, ${short.coverage ?? 'default'} cameras (${r.report.added.length} beats added, ${r.report.changed.length} changed, ${r.report.removed.length} cut, ${r.report.hand} hand edits kept)`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2), check = argv.includes('--check'), ids = argv.filter((a) => !a.startsWith('--'));
  const shorts = sampleShorts().filter((s) => !ids.length || ids.includes(s.id));
  const unknown = ids.filter((id) => !shorts.some((s) => s.id === id));
  if (unknown.length) { console.error(`no short ${unknown.join(', ')} in shorts.json`); process.exit(2); }
  let ok = true;
  for (const s of shorts) ok = build(s, { check }) && ok;
  process.exit(ok ? 0 : 1);
}
