// Writes content/starter/LICENCES.md from the clips' and items' provenance (animations/provenance.json,
// items/provenance.json, written by make-animations.mjs and make-items.mjs) and the fixed rows below. Run it after
// either tool; tools/check-licences.mjs (CI, npm test) fails on a file without a row or a content file that isn't CC0.
//   node content/starter/tools/make-licences.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const clips = read('animations/provenance.json'), items = read('items/provenance.json');
const short = (sha) => sha.slice(0, 12);
const CC0 = 'CC0-1.0';
const CODE = 'Xocialize original (code)';

const rows = (list) => list.map(([file, licence, source]) => `| \`${file}\` | ${licence} | ${source.replace(/\|/g, '\\|')} |`).join('\n');
const by = (author) => (author.startsWith('unrecorded') ? '**author unrecorded** (CC0 per mesh2motion\'s blanket statement; its history shows only its maintainer committing it, no source named)' : `by ${author}`);
const clipRows = clips.clips.map((c) => [c.file, CC0, `mesh2motion's "${c.from.clip}" (\`${c.from.file}\`, SHA-256 ${short(c.from.sha256)}…; made from \`${c.from.blend}\`), ${by(c.from.author)}; CC0 1.0. Retargeted onto the VRM humanoid by \`tools/make-animations.mjs\``]);
const itemRows = items.items.map((i) => [i.file, CC0, i.from.prop
  ? `"${i.name}" (VRMXI \`${i.type}\`): ${i.from.author} (\`${i.from.pack}\`), CC0 1.0, as mesh2motion's prop \`${i.from.prop}\` (\`${i.from.file}\`, SHA-256 ${short(i.from.sha256)}…, with its texture); made into an item (collider, reach, verb) by \`tools/make-items.mjs\``
  : `"${i.name}" (VRMXI \`${i.type}\`): generated from boxes and cylinders by \`tools/make-items.mjs\`; Xocialize LLC dedicates it to the public domain (CC0 1.0)`]);

const md = `# Starter content: licences

Every file in \`content/starter/\` and where it comes from. **Everything a game ships from here is CC0 1.0** (decision
AB-D-0297 item 7): a game builder can use, change and sell it with no credit and no licence question.
\`node content/starter/tools/check-licences.mjs\` (CI and \`npm test\`) fails on a file this table doesn't list, a row
that matches nothing, or a content row whose licence isn't CC0. The rows for clips and items are written by
\`tools/make-licences.mjs\` from \`animations/provenance.json\` and \`items/provenance.json\`, which hold each file's
source in full (file, SHA-256, the source's own licence statement).

**mesh2motion** (\`${clips.source.pin.repo}\` at \`${clips.source.pin.commit}\`, ${clips.source.pin.date}: every file read is
byte-identical to that commit; archive \`${clips.source.pin.archive}\`). Its art (3D models, rigs, animations) is CC0 1.0
by its \`LICENSE-CC0.MD\` ("All 3d models, blend files, rigs, animations") and its README ("Licenses"); its code is MIT,
and none of it is copied here. Its manifests have no per-file licence. Who made each source, as far as mesh2motion's
own records say (\`tools/upstream.mjs\`, read from its public history):
- 26 clips are tagged \`quaternius\`: Quaternius' Universal Animation Library, CC0 (its licence is vendored in
  \`Mesh2Motion/mesh2motion-assets\` at \`CC0-packs/Quaternius/License.txt\`).
- The three weapon props are KayKit's Fantasy Weapons Bits 1.0 by Kay Lousberg, CC0 (vendored at
  \`CC0-packs/Kaykit/\`; mesh2motion's props are the pack's meshes re-exported).
- **11 clips have no recorded author** (listen, think, greet, nod, clap, cheer, happy, angry, pickUp, death, kick): every
  commit to their sources is by mesh2motion's maintainer, none names a source, and none is one of its motion captures.
  Their CC0 rests on mesh2motion's blanket statement.

**Not CC0 in mesh2motion, and not used here:** several rig variations (Sophia CC-SA 4.0; Jay, Sintel, Bunny and Carrot
CC-BY: its \`src/lib/RigConfig.ts\` and \`mesh2motion-assets/3d-models/CC-SA/\`). Only its human animation GLBs and three
weapon props are read; no model or variation is.

"Xocialize original (code)" is code made for this repository by Xocialize LLC: the tools and tests that make and check
the content. They aren't content and no game ships them.

## Documents and data

| File | Licence | Source |
|---|---|---|
${rows([
  ['README.md', CC0, 'What the starter content is and how to use and remake it'],
  ['LICENCES.md', CC0, 'This table, written by `tools/make-licences.mjs`'],
  ['animations.json', CC0, 'The default animation set (VRMXA §8.4): every clip with its slots, written by `tools/make-animations.mjs`'],
  ['animations/provenance.json', CC0, 'Each clip\'s source in full (mesh2motion file and SHA-256, its .blend, the floor lift, the retarget\'s check and vrmxa-core\'s clip checker\'s notes)'],
  ['items/provenance.json', CC0, 'Each item\'s source in full (generated, or the mesh2motion prop with its SHA-256)'],
])}

## Animation clips (\`.vrma\`)

| File | Licence | Source |
|---|---|---|
${rows(clipRows)}

## Items (\`.vrmxi\`)

| File | Licence | Source |
|---|---|---|
${rows(itemRows)}

## Tools and tests (not content)

| File | Licence | Source |
|---|---|---|
${rows([
  ['tools/make-animations.mjs', CODE, 'Retargets mesh2motion\'s clips and writes the set'],
  ['tools/starter-clips.mjs', CODE, 'Which clips, and the slots and sets they fill'],
  ['tools/make-items.mjs', CODE, 'Writes the items and checks them with the VRMXI checker'],
  ['tools/starter-items.mjs', CODE, 'The items: models, states, verbs, seats, and what doing each verb shows'],
  ['tools/glb.mjs', CODE, 'The items\' GLB writer (boxes, cylinders, brought-in meshes, KHR physics, animations)'],
  ['tools/upstream.mjs', CODE, 'What mesh2motion\'s records say about each source: the pinned commit, authors, history'],
  ['tools/make-stills.mjs', CODE, 'Draws the contact sheets of the set and the pack (acceptance/results/m6-starter-*.png)'],
  ['tools/make-licences.mjs', CODE, 'Writes this table'],
  ['tools/check-licences.mjs', CODE, 'Checks this table'],
  ['test/*.test.mjs', CODE, 'The starter\'s tests: licences, the set cast and played, every item used, the tools remake the same bytes'],
])}
`;

const file = path.join(root, 'LICENCES.md');
if (process.argv.includes('--check')) {
  const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === md;
  console.log(same ? 'LICENCES.md is up to date' : 'LICENCES.md differs from what tools/make-licences.mjs writes');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(file, md);
console.log(`LICENCES.md: ${clipRows.length} clips, ${itemRows.length} items`);
