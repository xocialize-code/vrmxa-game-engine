#!/usr/bin/env node
// The hot-reload hand test's text editor (M6 W2, AB-T-0645; HAND-TEST-M6-HOT-RELOAD). An AppProbe scenario can't run a
// command, so this waits beside it: when the scenario writes a screenshot named `edit-<name>.png` into the trigger
// folder (its `screenshot path=…` step, which also keeps the picture as evidence), this saves edit <name> into the
// scenario's copy of the sample's game/behaviours.js the way an editor saves (a new file moved over the old), and the
// editor's watch takes it from there. It never touches a committed file: only the copy the fixtures made.
//
//   node apps/editor-mac/scripts/hot-reload-edits.mjs <project copy> <trigger folder>
//
// The edits, each from the original text (so they can come in any order):
//   say      tableZone's regular says "Hot reloaded, version two" every four seconds (a caption shows
//            for about 2.3 s, so one seen 3 s after an edit was said after it): its state shape is unchanged, so it
//            keeps its state
//   throw    the module throws when it is imported: the reload fails, version two runs on
//   shape    "version three", and its declared state gains a key: it restarts
//   restore  the original text
// It exits after `restore`, or after 20 minutes.
import fs from 'node:fs';
import path from 'node:path';

const [project, triggers] = process.argv.slice(2);
if (!project || !triggers) { console.error('usage: hot-reload-edits.mjs <project copy> <trigger folder>'); process.exit(2); }
const file = path.join(project, 'game/behaviours.js');
const original = fs.readFileSync(file, 'utf8');

const SAY = (words) => `    if (tree.clock.step % 240 === 0) /** @type {any} */ (tree.find(p.customer))?.say?.({ text: '${words}' }); // hot reload hand test\n`;
const ANCHOR = '    const tree = this.tree, p = this.params, step = tree.clock.step;\n';
const RETURN = '    if (this.done || !this.inside) return;\n';
const must = (cond, what) => { if (!cond) throw new Error(`game/behaviours.js isn't the text this helper knows: ${what}`); };
must(original.includes(RETURN + ANCHOR), 'tableZone.physicsProcess changed');

// tableZone's step, with the line said before anything returns
const saying = (words) => original.replace(RETURN + ANCHOR, ANCHOR + SAY(words) + RETURN);
const edits = {
  say: () => saying('Hot reloaded, version two'),
  throw: () => `${saying('Hot reloaded, version two')}\nthrow new Error('hot reload hand test: broken on purpose');\n`,
  shape: () => {
    const t = saying('Hot reloaded, version three');
    const was = "        done: { type: 'boolean', description: 'The tray was handed over.' },\n";
    must(t.includes(was), 'tableZone\'s declared state changed');
    return t.replace(was, `${was}        version: { type: 'integer', description: 'Which version of the hand test (a key the old shape lacks).' },\n`);
  },
  restore: () => original,
};
for (const name of Object.keys(edits)) edits[name](); // each applies to this text, or we stop before the scenario starts

fs.mkdirSync(triggers, { recursive: true });
for (const f of fs.readdirSync(triggers)) if (/^edit-.*\.png$/.test(f)) fs.rmSync(path.join(triggers, f));
const done = new Set();
const save = (text) => { const tmp = `${file}.hot-reload-tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };
const until = Date.now() + 20 * 60 * 1000;
console.log(`watching ${triggers} for edit-{${Object.keys(edits).join(',')}}.png; editing ${file}`);
const timer = setInterval(() => {
  for (const name of Object.keys(edits)) {
    if (done.has(name) || !fs.existsSync(path.join(triggers, `edit-${name}.png`))) continue;
    done.add(name);
    save(edits[name]());
    console.log(`${new Date().toISOString()} saved edit ${name}`);
    if (name === 'restore') { clearInterval(timer); return; }
  }
  if (Date.now() > until) { save(original); console.log('20 minutes: put the original back'); clearInterval(timer); }
}, 100);
process.on('SIGTERM', () => { save(original); process.exit(0); });
process.on('SIGINT', () => { save(original); process.exit(0); });
