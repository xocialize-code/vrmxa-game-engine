#!/usr/bin/env node
// HAND-TEST-M6-AFTER-HOURS's files helper (M6 W10, AB-T-0651): the builder copying the game's own files into the project
// New Project just made, from outside the app, as a person does in the Finder (the editor has no import yet; taking in
// starter content is AB-T-0653). An AppProbe scenario can't run a command, so this waits beside it: when the scenario
// writes its trigger screenshot (`screenshot path=/tmp/vrmxg-w10-after-hours/bring-files.png`, row 2), it copies in
//   - after-hours/behaviours.js           the shelf behaviour, the one file of the game written by hand
//   - after-hours/items/{scarf,phone,book}.vrmxi, after-hours/props/back-room.glb
//                                         the lost things and the back room (tools/make-after-hours.mjs)
//   - after-hours/items/shelf.vrmxi       the starter content's shelf (content/starter, CC0)
//   - items/cafe-door.vrmxi, items/switch.vrmxi
//                                         the sample's door and light switch
// from content/sample, and adds each file's row from content/sample/LICENCES.md to the project's LICENCES.md (a game
// build refuses a file with no row), and the rows of the four scenes the builder then makes in the editor. It never
// touches a committed file. It exits once the files are in, or after 30 min.
//
//   node apps/editor-mac/scripts/after-hours-files.mjs [--project <folder>] [--triggers <folder>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2), opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const project = opt('--project', path.join(os.homedir(), 'Library/Containers/com.xocialize.vrmxg-editor/Data/tmp/w10-projects/After Hours'));
const triggers = opt('--triggers', '/tmp/vrmxg-w10-after-hours');
export const FILES = [
  'after-hours/behaviours.js', 'after-hours/items/scarf.vrmxi', 'after-hours/items/phone.vrmxi', 'after-hours/items/book.vrmxi',
  'after-hours/items/shelf.vrmxi', 'after-hours/props/back-room.glb', 'items/cafe-door.vrmxi', 'items/switch.vrmxi',
];

const trigger = path.join(triggers, 'bring-files.png'), until = Date.now() + 30 * 60 * 1000;
console.log(`waiting for ${trigger}`);
while (!fs.existsSync(trigger)) {
  if (Date.now() > until) { console.error('no trigger in 30 minutes'); process.exit(1); }
  await new Promise((r) => setTimeout(r, 250));
}
if (!fs.existsSync(path.join(project, 'game.json'))) { console.error(`${project} isn't the new project (no game.json)`); process.exit(1); }
const sample = path.join(root, 'content/sample');
const rows = fs.readFileSync(path.join(sample, 'LICENCES.md'), 'utf8').split('\n');
const add = [];
for (const f of FILES) {
  fs.mkdirSync(path.dirname(path.join(project, f)), { recursive: true });
  fs.copyFileSync(path.join(sample, f), path.join(project, f));
  const r = rows.find((l) => l.startsWith(`| \`${f}\` |`));
  if (!r) { console.error(`no licence row for ${f} in content/sample/LICENCES.md`); process.exit(1); }
  add.push(r);
}
// the rows for the four scenes the builder is about to make in the editor (a build refuses a file with no row)
for (const f of ['after-hours/title.vrmxs', 'after-hours/level.vrmxs', 'after-hours/won.vrmxs', 'after-hours/lost.vrmxs']) add.push(rows.find((l) => l.startsWith(`| \`${f}\` |`)));
const licences = path.join(project, 'LICENCES.md');
fs.writeFileSync(licences, `${fs.readFileSync(licences, 'utf8').replace(/\n*$/, '\n')}${add.join('\n')}\n`);
console.log(`copied ${FILES.length} files into ${project}, with their licence rows`);
