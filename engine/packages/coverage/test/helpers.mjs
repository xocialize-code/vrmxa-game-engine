// Shared by the tests: the sample cafe set, the sample script and its marks, and builds with coverage by rule.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { serialize } from '@vrmxg/scene';
import { buildSequence } from '@vrmxg/script';
import { coverByRule } from '../src/index.js';

export const SAMPLE = path.resolve(import.meta.dirname, '../../../../content/sample');
export const set = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'cafe.vrmxs'), 'utf8'));
export const sample = fs.readFileSync(path.join(SAMPLE, 'scripts/cafe-order.fountain'), 'utf8');
export const marks = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'scripts/cafe-marks.json'), 'utf8')).marks;
export const sha = (s) => createHash('sha256').update(s).digest('hex');
export const text = (doc) => serialize(doc);
export const cams = (doc) => doc.sequence.tracks.find((t) => t.type === 'camera').clips;
export const node = (doc, id) => doc.nodes.find((n) => n.id === id);
/** The script built over the cafe with coverage by rule (and the rules it applied, from a second call of the hook). */
export function build(src = sample, o = {}) {
  let rules = null;
  const cover = coverByRule(o.coverage ?? {});
  const r = buildSequence(src, { set, marks, id: 'cafe-order', source: 'scripts/cafe-order.fountain', ...o, coverage: (ctx) => { const c = cover(ctx); rules = c.rules; return c; } });
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.line}: ${e.message}`).join('\n'));
  return { ...r, rules };
}
/** The rule each shot got, by shot number. */
export const ruleByShot = (r) => Object.fromEntries(r.doc.sequence.shots.map((s) => [s.name, r.rules.get(s.src.split('#')[0])?.rule]));
