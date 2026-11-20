// The sample script's sequence (M4 W4): builds scripts/cafe-order.fountain over the cafe with @vrmxg/script and writes
// sequences/cafe-order.vrmxs. Re-running it re-scripts the file in place, so hand edits made to the sequence since are
// kept (the hand-edit rules in engine/packages/script/README.md).
//   node content/sample/tools/make-script-sequence.mjs [--check]   (--check: exit 1 if the file isn't what it builds)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from '@vrmxg/scene';
import { buildSequence, formatErrors } from '@vrmxg/script';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = 'scripts/cafe-order.fountain', out = 'sequences/cafe-order.vrmxs';
const text = fs.readFileSync(path.join(root, script), 'utf8');
const set = parse(fs.readFileSync(path.join(root, 'cafe.vrmxs'), 'utf8'));
const { marks } = JSON.parse(fs.readFileSync(path.join(root, 'scripts/cafe-marks.json'), 'utf8'));
const file = path.join(root, out);
const previous = fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : null;
const r = buildSequence(text, { previous, set, marks, id: 'cafe-order', source: script });
if (!r.ok) { console.error(formatErrors(r.errors, script)); process.exit(1); }
for (const w of r.warnings) console.warn(`warning: ${w}`);
const bytes = serialize(r.doc);
if (process.argv.includes('--check')) {
  const same = previous && fs.readFileSync(file, 'utf8') === bytes;
  console.log(same ? `${out}: up to date` : `${out}: differs from what ${script} builds`);
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(file, bytes);
console.log(`${out}: ${r.report.shots} shots, ${r.report.lines} lines (${r.report.added.length} beats added, ${r.report.changed.length} changed, ${r.report.removed.length} cut, ${r.report.hand} hand edits kept)`);
