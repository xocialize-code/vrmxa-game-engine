// Closing over unsaved work, with a write that fails (M5 W8, AB-T-0593's review): each app's real closing and saving
// code (apps/editor/src/closing.js and saving.js, apps/creator/src/closing.js and saving.js) over a real session, a
// real script desk and short list, and a project whose write throws. The hosts themselves need a browser; they call
// these functions and nothing else for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@vrmxg/scene';
import { m0Registry } from '@vrmxg/registry/m0';
import { EditorSession } from '@vrmxg/editor-core';
import { questions } from '@vrmxg/editor-ui';
import { saveScene } from '../../editor/src/saving.js';
import { editorClosing } from '../../editor/src/closing.js';
import { ScriptDesk } from '../src/desk.js';
import { ShortList, readShorts, SHORTS_FILE } from '../src/shorts.js';
import { saveShortFiles, shortDirty, discardShort } from '../src/saving.js';
import { guardShort, creatorClosing, unsavedWork } from '../src/closing.js';

const sample = path.join(import.meta.dirname, '../../../content/sample');
const read = (f) => fs.readFileSync(path.join(sample, f), 'utf8');
const files = fs.readdirSync(sample, { recursive: true }).map((f) => String(f).split(path.sep).join('/'));
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A project folder whose disk can be made to fail: `fail(ref)` → true to throw for that write. */
function projectOf() {
  const p = {
    name: 'project', writable: true, files: [...files], disk: {}, fail: () => false, writes: [],
    has(ref) { return this.files.includes(ref); },
    async write(ref, text) {
      this.writes.push(ref);
      if (this.fail(ref)) throw new Error(`${ref}: the volume has gone`);
      this.disk[ref] = text;
      if (!this.files.includes(ref)) this.files.push(ref);
      return { path: ref, bytes: text.length };
    },
  };
  return p;
}
/** The window's sheet, with what it showed. */
function sheetOf() {
  const shown = [];
  const sheet = questions((q) => { if (q) shown.push(q); });
  return { sheet, shown, on: { ask: sheet.ask, asking: () => sheet.asking } };
}

// ---------------------------------------------------------------- the editor

function editor() {
  const project = projectOf();
  const session = new EditorSession({ registry: m0Registry(), text: read('cafe.vrmxs'), path: 'cafe.vrmxs' });
  const ed = { session, project, sceneRef: 'cafe.vrmxs', stopped: 0, stop() { this.stopped++; }, save(ref = this.sceneRef) { return saveScene(session, project, ref); } };
  return { ed, session, project };
}

test('the editor: a Save that fails keeps the window and leaves the scene unsaved, so the next close asks again', async () => {
  const { ed, session, project } = editor();
  assert.equal(await editorClosing(ed, sheetOf().on), true, 'nothing unsaved: closes without a question');
  session.rename(session.doc.nodes[0].id, 'Renamed');
  assert.ok(session.dirty);
  const edited = session.text();
  project.fail = () => true;
  const errors = [], a = sheetOf();
  const first = editorClosing(ed, { ...a.on, onError: (e) => errors.push(e.message) });
  await tick();
  assert.equal(a.shown[0].text, 'cafe.vrmxs has changes that aren\'t saved.');
  a.sheet.reply('save');
  assert.equal(await first, false, 'not saved: the window stays');
  assert.deepEqual(errors, ['cafe.vrmxs: the volume has gone']);
  assert.ok(session.dirty, 'and the scene is still unsaved (it was marked saved before the write, and the next close lost it)');
  const b = sheetOf();
  const second = editorClosing(ed, { ...b.on, reason: 'quit' });
  await tick();
  assert.equal(b.shown.length, 1, 'the second close asks again');
  project.fail = () => false;
  b.sheet.reply('save');
  assert.equal(await second, true, 'saved this time: it closes');
  assert.equal(project.disk['cafe.vrmxs'], edited);
  assert.ok(!session.dirty);
  assert.equal(await editorClosing(ed, sheetOf().on), true);
});

test('the editor: a failed Save from the menu, then a close: the sheet still comes; Cancel and Don\'t Save', async () => {
  const { ed, session, project } = editor();
  session.rename(session.doc.nodes[0].id, 'Renamed');
  project.fail = () => true;
  await assert.rejects(ed.save(), /the volume has gone/);
  assert.ok(session.dirty, 'a failed Save marks nothing saved');
  const a = sheetOf();
  const closing = editorClosing(ed, a.on);
  await tick();
  assert.equal(a.shown.length, 1);
  assert.equal(await editorClosing(ed, a.on), false, 'asked again with the sheet up: that close is refused, the sheet stays');
  a.sheet.reply('cancel');
  assert.equal(await closing, false);
  const b = sheetOf();
  const again = editorClosing(ed, b.on);
  await tick();
  b.sheet.reply('discard');
  assert.equal(await again, true, 'Don\'t Save closes');
  assert.deepEqual(project.disk, {}, 'with nothing written');
  // playing: Save in the sheet stops the play first, then saves
  project.fail = () => false;
  session.mode = 'playing';
  const c = sheetOf();
  const playing = editorClosing(ed, c.on);
  await tick();
  c.sheet.reply('save');
  assert.equal(await playing, true);
  assert.equal(ed.stopped, 1);
});

// ---------------------------------------------------------------- the creator

/** The creator host's parts around the sample short, with the host's own saving (saving.js) and dirty test. */
function creator() {
  const project = projectOf();
  const script = read('scripts/cafe-order.fountain');
  const shorts = new ShortList(readShorts(files, null, { 'scripts/cafe-order.fountain': script }));
  const short = shorts.byId('cafe-order');
  const set = parse(read('cafe.vrmxs'));
  const session = new EditorSession({ registry: m0Registry(), text: read(short.sequence), path: short.sequence });
  session.setDoc = set; session.targetIds = () => new Set(set.nodes.map((n) => n.id));
  const { marks } = JSON.parse(read('scripts/cafe-marks.json'));
  const desk = new ScriptDesk({ session, short, marks, text: script });
  const cr = {
    project, shorts, short, session, desk, discarded: 0,
    isDirty() { return shortDirty(this); },
    discardChanges() { this.discarded++; discardShort(this); },
    applyScript() { return this.desk.apply(); },
    setCoverage(mode) { this.short = this.shorts.update(this.short.id, { coverage: mode }); this.desk.short = this.short; return this.applyScript(); }, // as the host's
    saveShort(asTitle = null) { return saveShortFiles(this, asTitle); },
  };
  return { cr, project, session, desk, shorts };
}

test('the creator: a saved short with a sequence edit, Save fails: the window stays and the short is still unsaved', async () => {
  const { cr, project, session } = creator();
  assert.equal(cr.isDirty(), false);
  assert.equal(await creatorClosing(cr, sheetOf().on), true, 'nothing unsaved: closes without a question');
  session.seq.addMarker(12, 'a hand edit');
  assert.ok(cr.isDirty() && unsavedWork(cr));
  project.fail = () => true;
  const errors = [], a = sheetOf();
  const first = creatorClosing(cr, { ...a.on, onError: (e) => errors.push(e.message) });
  await tick();
  assert.equal(a.shown[0].text, 'The Order has changes that aren\'t saved.');
  a.sheet.reply('save');
  assert.equal(await first, false, 'not saved: the window stays');
  assert.deepEqual(errors, ['sequences/cafe-order.vrmxs: the volume has gone']);
  assert.ok(cr.isDirty(), 'and it is still unsaved, so the next close asks again');
  const b = sheetOf();
  const second = creatorClosing(cr, b.on);
  await tick();
  assert.equal(b.shown.length, 1);
  project.fail = () => false;
  b.sheet.reply('save');
  assert.equal(await second, true);
  assert.equal(project.disk['sequences/cafe-order.vrmxs'], session.text());
  assert.ok(!cr.isDirty() && !unsavedWork(cr));
});

test('the creator: nothing is saved until every file of the save is written: the script fails, then shorts.json for a new short', async () => {
  const { cr, project, session, desk, shorts } = creator();
  // a typed script edit: the sequence writes, the script's write fails
  desk.text = `${desk.text.trimEnd()}\n\nHANA\nSee you tomorrow.\n`; // typed, not applied yet: Save applies it
  assert.ok(desk.dirty && desk.pending && unsavedWork(cr), 'typing alone is unsaved work (the shell is told at once)');
  project.fail = (ref) => ref.endsWith('.fountain');
  await assert.rejects(cr.saveShort(), /cafe-order\.fountain: the volume has gone/);
  assert.equal(project.disk['sequences/cafe-order.vrmxs'], session.text(), 'the sequence reached the disk');
  assert.ok(session.dirty && desk.dirty && cr.isDirty(), 'but the save didn\'t finish: none of it is saved');
  project.fail = () => false;
  await cr.saveShort();
  assert.ok(!cr.isDirty());
  assert.equal(project.disk['scripts/cafe-order.fountain'], desk.text);
  // Save As: a new short whose shorts.json write fails stays a draft, and isn't in the list on disk
  project.fail = (ref) => ref === SHORTS_FILE;
  const before = project.disk[SHORTS_FILE];
  await assert.rejects(cr.saveShort('Second take'), /shorts\.json: the volume has gone/);
  assert.equal(cr.short.id, 'second-take');
  assert.equal(cr.short.saved, false, 'not saved until shorts.json lists it');
  assert.ok(cr.isDirty());
  assert.equal(project.disk[SHORTS_FILE], before);
  project.fail = () => false;
  await cr.saveShort();
  assert.equal(cr.short.saved, true);
  assert.ok(JSON.parse(project.disk[SHORTS_FILE]).shorts.some((s) => s.id === 'second-take'));
  assert.equal(shorts.byId('second-take').saved, true);
  assert.ok(!cr.isDirty());
});

// The review's second round: the sequence was marked saved as soon as it was written, so a shorts.json that then failed
// left a saved short clean, with its new coverage in the sequence on disk and the old one in shorts.json.
test('the creator: a saved short, its coverage changed, shorts.json fails: still unsaved, and the next close asks', async () => {
  const { cr, project, session } = creator();
  await cr.saveShort(); // on disk as it is, coverage 'default'
  assert.equal(JSON.parse(project.disk[SHORTS_FILE]).shorts[0].coverage, 'default');
  cr.setCoverage('rule'); // cameras by rule: the sequence is re-scripted
  assert.ok(session.dirty && cr.isDirty());
  project.fail = (ref) => ref === SHORTS_FILE;
  const errors = [], a = sheetOf();
  const first = creatorClosing(cr, { ...a.on, onError: (e) => errors.push(e.message) });
  await tick();
  a.sheet.reply('save');
  assert.equal(await first, false, 'the save didn\'t finish: the window stays');
  assert.deepEqual(errors, ['shorts.json: the volume has gone']);
  assert.equal(project.disk['sequences/cafe-order.vrmxs'], session.text(), 'the sequence did reach the disk');
  assert.equal(JSON.parse(project.disk[SHORTS_FILE]).shorts[0].coverage, 'default', 'and shorts.json still has the old coverage');
  assert.ok(cr.isDirty() && unsavedWork(cr), 'so the short is still unsaved');
  const b = sheetOf();
  const second = creatorClosing(cr, b.on);
  await tick();
  assert.equal(b.shown.length, 1, 'and the next close asks again (it went on with no question)');
  project.fail = () => false;
  b.sheet.reply('save');
  assert.equal(await second, true);
  assert.equal(JSON.parse(project.disk[SHORTS_FILE]).shorts[0].coverage, 'rule');
  assert.ok(!cr.isDirty() && !cr.short.unwritten);
});

test('the creator: a saved short\'s own setting is unsaved work even with the sequence back as saved; Don\'t Save puts it back', async () => {
  const { cr, project, session, shorts } = creator();
  cr.setCoverage('rule');
  while (session.undo());
  assert.ok(!session.dirty, 'the re-script undone: the sequence is as saved');
  assert.equal(cr.short.coverage, 'rule');
  assert.ok(cr.isDirty(), 'but shorts.json doesn\'t hold the coverage yet');
  const a = sheetOf();
  const closing = creatorClosing(cr, a.on);
  await tick();
  assert.equal(a.shown.length, 1);
  a.sheet.reply('discard');
  assert.equal(await closing, true);
  assert.equal(cr.short.coverage, 'default', 'Don\'t Save: the short is as shorts.json holds it');
  assert.ok(!cr.isDirty() && !shorts.byId('cafe-order').unwritten);
  assert.deepEqual(project.writes, []);
  // Save As from a short with a changed setting: the copy takes it, the original stays as on disk
  cr.setCoverage('rule');
  await cr.saveShort('Second take');
  assert.equal(cr.short.coverage, 'rule');
  assert.equal(shorts.byId('cafe-order').coverage, 'default');
  assert.ok(!shorts.byId('cafe-order').unwritten && !cr.isDirty());
  const listed = Object.fromEntries(JSON.parse(project.disk[SHORTS_FILE]).shorts.map((s) => [s.id, s.coverage]));
  assert.deepEqual([listed['cafe-order'], listed['second-take']], ['default', 'rule']);
});

test('the creator: another question while the close sheet is up is refused, and the close still gets its answer', async () => {
  const { cr, session } = creator();
  session.seq.addMarker(12, 'a hand edit');
  const a = sheetOf();
  let done = null;
  const closing = creatorClosing(cr, a.on).then((go) => { done = go; return go; });
  await tick();
  assert.equal(a.shown.length, 1, 'the close sheet is up');
  // File › New Short, Open Project or a script from the Finder asks about the same unsaved work
  assert.equal(await guardShort(cr, a.on), false, 'refused at once: New Short doesn\'t go on');
  assert.equal(a.shown.length, 1, 'no second sheet');
  assert.equal(done, null, 'and the close is still waiting, with its sheet');
  assert.equal(await creatorClosing(cr, a.on), false, 'a second close while it is up: refused too');
  a.sheet.reply('discard');
  assert.equal(await closing, true, 'the close gets its answer (it was dropped before, and Quit hung)');
  assert.equal(cr.discarded, 1);
  // the other way round: a question up first (New Short), then a close
  const b = sheetOf();
  const leaving = guardShort(cr, b.on);
  await tick();
  assert.equal(await creatorClosing(cr, b.on), false, 'the close is refused while another question is up');
  b.sheet.reply('cancel');
  assert.equal(await leaving, false);
});

test('the creator: the read-only sample can\'t be saved: Cancel or Close Anyway, and files saved only in memory count', async () => {
  const { cr, project, session } = creator();
  project.writable = false; project.name = 'Sample (bundled)'; project.unsaved = () => ['sequences/cafe-order.vrmxs'];
  assert.ok(unsavedWork(cr), 'nothing edited now, but a save this session is only in memory');
  const a = sheetOf();
  const closing = creatorClosing(cr, { ...a.on, reason: 'quit' });
  await tick();
  assert.deepEqual(a.shown[0].options.map((o) => o.label), ['Cancel', 'Quit Anyway']);
  a.sheet.reply('discard');
  assert.equal(await closing, true);
  project.unsaved = () => [];
  assert.ok(!unsavedWork(cr));
  session.seq.addMarker(12, 'a hand edit');
  const b = sheetOf();
  const again = creatorClosing(cr, b.on);
  await tick();
  b.sheet.reply('cancel');
  assert.equal(await again, false);
  assert.deepEqual(project.writes, [], 'nothing is written into a read-only project');
});
