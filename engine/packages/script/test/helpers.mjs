// Shared by the tests: the sample cafe set, the sample script and its marks.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { serialize } from '@vrmxg/scene';

export const SAMPLE = path.resolve(import.meta.dirname, '../../../../content/sample');
export const set = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'cafe.vrmxs'), 'utf8'));
export const sample = fs.readFileSync(path.join(SAMPLE, 'scripts/cafe-order.fountain'), 'utf8');
export const marks = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'scripts/cafe-marks.json'), 'utf8')).marks;
export const sha = (s) => createHash('sha256').update(s).digest('hex');
export const text = (doc) => serialize(doc);
export const track = (doc, id) => doc.sequence.tracks.find((t) => t.id === id);
export const beatOf = (r, pred) => r.parsed.beats.find(pred);
/** A small script for edit tests: two speakers, tags and parentheticals. */
export const SMALL = `Title: Small
Set: cafe.vrmxs
Marks:
    HANA = behind-counter
    MIRA = counter-front

INT. CAFE - MORNING

Hana wipes the counter.

HANA
(smiling)
Good morning! [[greet]] What can I get you?

MIRA
A latte, please.

HANA
(nods)
Coming right up!
`;
