// Cast a short's roles (M4 W12, on M4 W6's @vrmxg/cast): each role from a .vrmxa in the project, read through
// vrmxa-core (beside the repo: ../vrmxa-core), with the voice its persona names for
// Kokoro, else the sample's role → preset map (Hana af_heart, Mira af_bella), into the sequence's `roles`. castRole is
// the creator's own cast, as plain data: the same inputs give the same bytes. Lines already baked in the voice they are
// cast in keep their bake; any other is listed for tools/bake-lines.mjs. Re-running it changes nothing.
//   node content/sample/tools/cast-short.mjs sequences/the-regular.vrmxs [HANA=characters/hana.vrmxa …]
//        no ROLE=ref: each role from the character file its set node already uses
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from '@vrmxg/scene';
import { readCharacter, rolesOf, castRole } from '@vrmxg/cast';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = path.resolve(root, '../../../vrmxa-core/src');
const SAMPLE_VOICES = { 'hana-1': 'af_heart', mira: 'af_bella' };
const argv = process.argv.slice(2), ref = argv.find((a) => !a.includes('='));
if (!ref) { console.error('usage: cast-short.mjs <sequence.vrmxs> [ROLE=characters/x.vrmxa …]'); process.exit(2); }
const picks = Object.fromEntries(argv.filter((a) => a.includes('=')).map((a) => a.split('=')));
if (!fs.existsSync(path.join(CORE, 'index.js'))) { console.error(`vrmxa-core isn't at ${path.relative(process.cwd(), CORE)}: casting reads characters through it`); process.exit(2); }
const vrmxa = Object.assign({}, ...(await Promise.all(['index.js', 'voice/index.js', 'persona/index.js', 'closet/index.js'].map((f) => import(path.join(CORE, f))))));

const file = path.join(root, ref);
let doc = parse(fs.readFileSync(file, 'utf8'));
const set = parse(fs.readFileSync(path.join(root, doc.set), 'utf8'));
const assetRef = (id) => [...(set.assets ?? []), ...(doc.assets ?? [])].find((a) => a.id === id)?.ref ?? null;
for (const role of rolesOf(doc, { set })) {
  const node = set.nodes.find((n) => n.id === role.id);
  const charRef = picks[role.cue] ?? picks[role.id] ?? assetRef(node?.asset);
  if (!charRef) { console.error(`${role.cue}: no character file (give ${role.cue}=characters/<file>.vrmxa)`); process.exit(2); }
  const card = await readCharacter(new Uint8Array(fs.readFileSync(path.join(root, charRef))), { ref: charRef, vrmxa });
  const r = castRole(doc, role.id, card, { set, presets: SAMPLE_VOICES });
  for (const w of r.warnings) console.warn(`warning: ${w}`);
  console.log(`${r.changed ? r.label : `${role.cue}: unchanged`} (${charRef}, voice ${r.role.voice.preset} from ${r.role.voice.from}${r.rebake.length ? `, ${r.rebake.length} lines to bake` : ''})`);
  doc = r.doc;
}
const bytes = serialize(doc);
if (bytes !== fs.readFileSync(file, 'utf8')) fs.writeFileSync(file, bytes);
