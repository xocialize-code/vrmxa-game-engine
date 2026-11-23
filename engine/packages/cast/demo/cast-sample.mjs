// Cast the sample script's roles from .vrmxa files, recast one, and undo it (M4 W6's demo; the creator's picker is W5).
//
//   node engine/packages/cast/demo/cast-sample.mjs [--studio] [--out file.vrmxs]
//
// Builds content/sample/scripts/cafe-order.fountain into its sequence (@vrmxg/script), reads the characters with
// vrmxa-core (beside the repository), casts HANA and MIRA, recasts HANA with Mira's file, prints what each step did and
// the lines to re-bake, then undoes the recast in an editor session and checks the bytes. --studio casts the studio's
// Hana and Mira (vrmxa-avatar-studio/content/characters/out/approved/) instead of the sample's fixtures. Nothing in
// content/ is written; --out writes the cast sequence where you say.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { m0Registry } from '@vrmxg/registry/m0';
import { serialize } from '@vrmxg/scene';
import { EditorSession } from '@vrmxg/editor-core';
import { composeSequence } from '@vrmxg/sequence';
import { CharacterLibrary } from '@vrmxg/character';
import { buildSequence } from '@vrmxg/script';
import { readCharacter, rolesOf, applyCast, voicesFor } from '../src/index.js';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SAMPLE = path.join(ROOT, 'content/sample');
const DEV = path.resolve(ROOT, '..');
const CORE = [path.join(DEV, 'vrmxa-avatar-studio/packages/vrmxa-core/src'), path.join(ROOT, '../../../vrmxa-avatar-studio/packages/vrmxa-core/src')].find((p) => fs.existsSync(path.join(p, 'index.js')));
const STUDIO = CORE ? path.resolve(CORE, '../../../content/characters/out/approved') : null;
const args = process.argv.slice(2);
const studio = args.includes('--studio');
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!CORE) { console.error('vrmxa-core is not beside the repository (../vrmxa-avatar-studio): it reads the .vrmxa files'); process.exit(2); }
if (studio && !fs.existsSync(path.join(STUDIO, 'hana.vrmxa'))) { console.error(`--studio: no ${path.join(STUDIO, 'hana.vrmxa')} (build it with the studio's content/characters/build.sh)`); process.exit(2); }

const vrmxa = Object.assign({}, ...(await Promise.all(['index.js', 'voice/index.js', 'persona/index.js', 'closet/index.js', 'anim/index.js'].map((f) => import(path.join(CORE, f))))));
const files = studio
  ? { 'characters/studio/hana.vrmxa': path.join(STUDIO, 'hana.vrmxa'), 'characters/studio/mira.vrmxa': path.join(STUDIO, 'mira.vrmxa') }
  : { 'characters/hana.vrmxa': path.join(SAMPLE, 'characters/hana.vrmxa'), 'characters/mira.vrmxa': path.join(SAMPLE, 'characters/mira.vrmxa') };
const bytes = (ref) => new Uint8Array(fs.readFileSync(files[ref] ?? path.join(SAMPLE, ref)));
const [hanaRef, miraRef] = Object.keys(files);
const PRESETS = { 'hana-1': 'af_heart', mira: 'af_bella' }; // the sample's map, for characters whose persona names no Kokoro preset
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// 1. the script → its sequence
const set = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'cafe.vrmxs'), 'utf8'));
const { marks } = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'scripts/cafe-marks.json'), 'utf8'));
const built = buildSequence(fs.readFileSync(path.join(SAMPLE, 'scripts/cafe-order.fountain'), 'utf8'), { set, marks, id: 'cafe-order', source: 'scripts/cafe-order.fountain' });
if (!built.ok) throw new Error(JSON.stringify(built.errors));
console.log('roles in the script:');
for (const r of rolesOf(built.doc)) console.log(`  ${r.cue} = ${r.id}: ${r.lines.length} lines, performance ${r.performance.join(', ')}`);

// 2. read the characters (the creator's File › Open gives these bytes)
const hana = await readCharacter(bytes(hanaRef), { ref: hanaRef, vrmxa });
const mira = await readCharacter(bytes(miraRef), { ref: miraRef, vrmxa });
for (const c of [hana, mira]) console.log(`read ${c.ref}: ${c.name}, persona ${c.persona ? `voice ${c.persona.voice_id ?? '-'}, allows ${c.persona.allowed_expressions.join(' ')}` : 'none'}, wears ${c.wardrobe.worn.length} items`);

// 3. cast, recast and undo, in an editor session (each one undo step)
const s = new EditorSession({ registry: m0Registry(), text: serialize(built.doc) });
s.setDoc = set;
const report = (r) => {
  console.log(`\n${r.label}  (asset ${r.role.asset}, voice ${r.role.voice.preset} from ${r.role.voice.from}, expressions ${r.role.expressions?.join(' ') ?? 'all'})`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  for (const l of heard.splice(0)) console.log(`  baked ${l.reason.padEnd(7)} ${l.clip}  "${l.text}"`);
  for (const l of r.rebake) console.log(`  to bake ${l.reason.padEnd(7)} ${l.clip}  "${l.text}"`);
  if (r.baked) console.log(`  (${r.baked} lines baked in the cast's own undo step)`);
};
// W7's hook stands in here: it would speak each line and write its clip; this one only names the files (no audio)
const heard = [];
const bakeHook = (lines) => { heard.push(...lines); return lines.map((l) => ({ clip: l.clip })); };
report(await applyCast(s, 'HANA', hana, { presets: PRESETS, rebake: bakeHook }));
report(await applyCast(s, 'MIRA', mira, { presets: PRESETS, rebake: bakeHook }));
const cast = s.text();
report(await applyCast(s, 'HANA', mira, { presets: PRESETS, rebake: bakeHook }));
const recast = s.text();
console.log(`\nvoices now: ${JSON.stringify(voicesFor(s.doc, { presets: PRESETS }))}`);
console.log(`undo history: ${s.history().undo}  (depth ${s.history().undoDepth})`);
s.undo();
console.log(`undo → the cast before the recast (and its re-bake), byte for byte: ${s.text() === cast}`);
s.redo();
console.log(`redo → the recast again: ${s.text() === recast}; sequence sha256 ${sha(recast)}`);

// 4. the composed world loads in the engine's character library
const lib = new CharacterLibrary({ resolve: async (ref) => bytes(ref), vrmxaCore: vrmxa, stubTextures: true });
await lib.prepare(composeSequence(s.doc, set));
for (const id of ['hana-1', 'mira']) console.log(`library: ${id} plays ${lib.characters.get(id).ref} (${lib.characters.get(id).persona?.persona?.name ?? 'no persona'})`);
if (out) { fs.writeFileSync(out, recast); console.log(`wrote ${out}`); }
