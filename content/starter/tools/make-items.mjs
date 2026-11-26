// The starter item pack (M6 W4, AB-T-0647): game items as VRMXI (the draft, VRMXA_Specification's VRMXI-base-draft.md;
// the engine's reader is @vrmxg/item), every one CC0 1.0.
//
//   node content/starter/tools/make-items.mjs [--check] [--source <mesh2motion-app-main>]
//
// Writes content/starter/items/*.vrmxi and items/provenance.json (tools/make-licences.mjs turns it into LICENCES.md
// rows). Each item is checked by the specification's own checker (VRMXI §13) when VRMXA_Specification with the VRMXI
// draft is beside the repository, and refused on any error or warning. --check builds in memory and fails when a
// committed file differs.
//
// Most items are generated here from boxes and cylinders (Xocialize LLC dedicates them to the public domain, CC0 1.0).
// Three pickups use mesh2motion's CC0 weapon props (static/assets/props: sword_A, axe_A, hammer_A, with their shared
// texture), which mesh2motion's LICENSE-CC0.MD and README put under CC0 ("All 3d models"; its props manifest has no
// per-file licence). Needs reference/mesh2motion-app-main (git-ignored; in a worktree, the main checkout's) and
// vrmxa-core (it packs the ZIP).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { installPortableMath } from '@vrmxg/dmath';
import { packItem } from '@vrmxg/item';
import { vrmxaCore, PATHS } from '../../../engine/packages/character/test/fixtures.mjs';
import { SPEC, specChecker } from '../../../engine/packages/item/test/fixtures.mjs';
import { writeItemGLB, readPrimitive, box3, cyl3, sphere3 } from './glb.mjs';
import { ITEMS } from './starter-items.mjs';
import { PIN, PROPS } from './upstream.mjs';

const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '../..');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const sourceArg = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : null;
const SOURCE = sourceArg ?? [path.join(repo, 'reference/mesh2motion-app-main'), path.join(repo, '../../../reference/mesh2motion-app-main')].find((d) => fs.existsSync(path.join(d, 'static/assets/props_manifest.json')));
if (!SOURCE) { console.error('mesh2motion not found: pass --source <mesh2motion-app-main> (reference/ is git-ignored)'); process.exit(2); }
if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository (it packs the items)'); process.exit(2); }
const licenceText = fs.readFileSync(path.join(SOURCE, 'LICENSE-CC0.MD'), 'utf8');
if (!/All 3d models/.test(licenceText) || !/CC0 1\.0 Universal/.test(licenceText)) throw new Error('mesh2motion\'s LICENSE-CC0.MD no longer puts its 3d models under CC0: check the licence before using its props');
const propsManifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'static/assets/props_manifest.json'), 'utf8'));
const props = new Map(propsManifest.props.map((p) => [p.name, p]));
installPortableMath(); // glb.mjs's colours go through Math.pow: the same bytes on every machine

const core = await vrmxaCore();
const checker = SPEC ? await specChecker() : null;
const GEN = 'VRMXG starter content (content/starter/tools/make-items.mjs)';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
// CC0: no rights reserved, so every VRM permission at its widest
const META = (authors) => ({ version: '1.0', authors, licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', commercialUsage: 'corporation', creditNotation: 'unnecessary', allowRedistribution: true, modification: 'allowModificationRedistribution' });

/** A mesh2motion prop's mesh and texture, for writeItemGLB. */
function prop(name) {
  const info = props.get(name);
  if (!info) throw new Error(`mesh2motion has no prop ${name}`);
  const rel = `static/assets/${info.file}`;
  const bytes = new Uint8Array(fs.readFileSync(path.join(SOURCE, rel)));
  const p = readPrimitive(bytes);
  const made = PROPS[name];
  if (!made) throw new Error(`${name}: not in tools/upstream.mjs's PROPS: trace its author first`);
  return { mesh: { ...p, key: name, imageKey: 'mesh2motion-weapons' }, from: { project: 'mesh2motion (github.com/Mesh2Motion/mesh2motion-app)', file: rel, sha256: sha256(bytes), prop: name, category: info.category, licence: 'CC0-1.0 (LICENSE-CC0.MD: "All 3d models, blend files, rigs, animations"; README, "Licenses")', author: made.author, pack: made.pack, evidence: made.evidence } };
}

const out = new Map(), provenance = [];
for (const item of ITEMS) {
  const { nodes, roots, from, animations } = item.model({ prop, box3, cyl3, sphere3 });
  const model = writeItemGLB({ name: item.name, generator: GEN, roots, nodes, animations });
  const manifest = {
    format: 'vrmxi', version: 1, id: item.id, revision: 1, name: item.name, generator: GEN, type: item.type, tags: item.tags, model: { file: 'model.glb' },
    ...(item.joints ? { joints: item.joints } : {}), ...(item.states ? { states: item.states } : {}), ...(item.verbs ? { verbs: item.verbs } : {}),
    ...(item.seat ? { seat: item.seat } : {}), ...(item.spawn ? { spawn: item.spawn } : {}),
    takeable: false, extensions: {},
    meta: META(from ? ['Kay Lousberg (KayKit)', 'mesh2motion', 'Xocialize LLC'] : ['Xocialize LLC']),
    listing: null,
    origin: from ? { made: 'imported', source: `${from.author} (CC0 1.0), as mesh2motion ${from.file} at ${PIN.repo}@${PIN.commit.slice(0, 7)}; made into an item by content/starter/tools/make-items.mjs`, sha256: from.sha256 } : { made: 'generated', source: 'content/starter/tools/make-items.mjs' },
    madeWith: null, thumbnail: null, files: [],
  };
  const bytes = await packItem({ manifest, model, vrmxaCore: core });
  if (checker) {
    const found = checker(bytes).filter((p) => p.severity === 'error' || p.severity === 'warning');
    if (found.length) throw new Error(`items/${item.file}: ${JSON.stringify(found)}`);
  }
  out.set(`items/${item.file}`, bytes);
  provenance.push({ file: `items/${item.file}`, name: item.name, type: item.type, licence: 'CC0-1.0', from: from ?? { generated: 'content/starter/tools/make-items.mjs (boxes and cylinders)', dedication: 'Xocialize LLC, CC0 1.0' } });
}
out.set('items/provenance.json', `${JSON.stringify({ about: 'Where each starter item comes from (content/starter/tools/make-items.mjs). Every item is CC0 1.0.', source: { project: 'mesh2motion', url: 'https://github.com/Mesh2Motion/mesh2motion-app', licence: 'Art (models, rigs, animations) CC0 1.0; code MIT (not used)', snapshot: `static/assets/props_manifest.json generated ${propsManifest.generated}`, pin: PIN }, items: provenance }, null, 1)}\n`);

const differ = [];
for (const [rel, data] of out) {
  const file = path.join(root, rel), buf = Buffer.from(data);
  if (fs.existsSync(file) && Buffer.compare(fs.readFileSync(file), buf) === 0) continue;
  differ.push(rel);
  if (check) continue;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}
const dir = path.join(root, 'items');
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.vrmxi') && !out.has(`items/${x}`)) : []) { if (!check) fs.rmSync(path.join(dir, f)); differ.push(`items/${f} (stale)`); }
console.log(`${ITEMS.length} items${checker ? ', each valid by the VRMXI checker' : ' (VRMXA_Specification with the VRMXI draft not found: not checked)'}; ${differ.length ? `${check ? 'differ' : 'wrote'}: ${differ.join(', ')}` : 'up to date'}`);
process.exit(check && differ.length ? 1 : 0);
