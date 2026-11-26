// M4 W9 (AB-T-0581): the creator's take deck (src/takes.js) and the agent's `take` command, on the sample short "The
// Regular". The deck is driven as the window drives it (Record, Stop, Keep or Discard, Remove), with a stand-in creator
// whose take worlds are the real ones built in Node, stepped by the test in place of the frame loop; the performers are
// a virtual keyboard, a scripted model and the synthetic face session. Needs vrmxa-core beside the repo.
//   - each kind records, waits in review, and is kept as ONE undo step with its log in the project; undo gives the short
//     back byte for byte; Discard writes nothing;
//   - a kept take's tracks are the person's own: a re-script keeps them and moves them with the script;
//   - an agent lists takes, keeps one from a log and removes one, each a step marked (MCP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import { m0Registry } from '@vrmxg/registry/m0';
import { EditorSession } from '@vrmxg/editor-core';
import { composeSequence } from '@vrmxg/sequence';
import { VirtualDevice } from '@vrmxg/input';
import { asAgent } from '@vrmxg/mcp/shorts';
import { takesOf, isTake } from '@vrmxg/takes';
import { loadSample, buildWorld } from '../../playground/src/world.js';
import { vrmxaCore, PATHS } from '../../../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../../../content/sample/behaviours.js';
import { sampleModel, SAMPLE_TAKES } from '../../../content/sample/tools/make-takes.mjs';
import { TakeDeck, takeLine, syntheticCamera } from '../src/takes.js';
import { creatorCommands } from '../src/agent.js';
import { ScriptDesk } from '../src/desk.js';
import { readShorts, SHORTS_FILE } from '../src/shorts.js';

installPortableMath();
const sample = path.join(import.meta.dirname, '../../../content/sample');
const read = (f) => fs.readFileSync(path.join(sample, f), 'utf8');
const files = fs.readdirSync(sample, { recursive: true }).map((f) => String(f).split(path.sep).join('/'));
const short = readShorts(files, read(SHORTS_FILE)).find((s) => s.id === 'the-regular');
const set = parse(read(short.set));
const skip = !fs.existsSync(PATHS.core) && 'needs vrmxa-core';
const flush = () => new Promise((r) => setImmediate(r));

/** A stand-in creator: what CreatorHost gives the deck, with real take worlds and no renderer. */
async function creator(env = {}) {
  const session = new EditorSession({ registry: m0Registry(), text: read(short.sequence), path: short.sequence });
  session.setDoc = set; session.targetIds = () => new Set(set.nodes.map((n) => n.id));
  const written = new Map();
  const R = await loadRapier(), core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(sample, ref)));
  const cr = {
    session, short: { ...short, saved: true }, setScene: { ref: short.set, doc: set }, playhead: 0, live: null, scrubbed: [], changes: 0,
    project: {
      get files() { return [...new Set([...files, ...written.keys()])]; },
      has: (ref) => written.has(ref) || files.includes(ref),
      text: async (ref) => written.get(ref) ?? read(ref),
      write: async (ref, text) => { written.set(ref, text); return { ref }; },
    },
    written,
    changed() { cr.changes++; },
    applyScript() { return cr.desk.apply(); },
    async liveWorld(doc) { const S = await loadSample(bytes, short.set); S.doc = composeSequence(doc, set); return buildWorld(R, S, { vrmxaCore: core, closet, behaviours, stubTextures: true }); },
    beginLive(world, tick) { cr.live = { world, tick }; },
    endLive() { cr.live = null; },
    async scrubTo(frame) { cr.scrubbed.push(frame); },
  };
  cr.desk = new ScriptDesk({ session, short: cr.short, marks: JSON.parse(read(short.marks)).marks, text: read(short.script) });
  session.on((e) => { if (!['select', 'play', 'stop', 'save'].includes(e.kind)) cr.desk.follow(); });
  cr.takeDeck = new TakeDeck(cr, env);
  /** The frame loop's part: step the live world n times, the deck's tick after each. */
  cr.run = async (n, each = () => {}) => { for (let k = 0; k < n && cr.live; k++) { each(k); const live = cr.live; while (!live.world.tree.step()) await live.world.tree.settle(); live.tick(); await flush(); } };
  return cr;
}

test('a puppet take: Record at the playhead, Stop, Keep is one undo step with its log in the project; Discard writes nothing', { skip }, async () => {
  const keys = new VirtualDevice(); let released = 0;
  const cr = await creator({ devices: () => ({ devices: [keys], release: () => { released++; } }) });
  const deck = cr.takeDeck, base = cr.session.text();
  assert.deepEqual(deck.performers(), [{ id: 'mira', name: 'Mira' }, { id: 'hana-1', name: 'Hana' }]);
  assert.equal(takeLine(deck.status()), 'Take: ready (0 kept)');
  // the sample project holds three take logs (take-1 to take-3, not kept in the film): a new take is numbered past them
  cr.playhead = 96;
  await deck.start({ kind: 'puppet', target: 'mira' });
  assert.equal(deck.state, 'recording');
  assert.equal(cr.live.world.tree.clock.step, 239, 'the take world stands on the playhead\'s step');
  await cr.run(200, (k) => { if (k === 10) keys.press('KeyW'); if (k === 100) keys.release('KeyW'); if (k === 120) keys.press('Digit2'); if (k === 124) keys.release('Digit2'); });
  assert.match(takeLine(deck.status()), /^Take 4 recording: puppet, mira, 3\.3 s$/);
  assert.ok(cr.playhead > 170 && cr.playhead < 180, `the playhead follows the take (${cr.playhead})`);
  await assert.rejects(deck.start({ kind: 'puppet', target: 'mira' }), /already recording/);
  const take = await deck.stop();
  assert.equal(released, 1, 'her keys are the page\'s again');
  assert.equal(cr.live, null); assert.equal(deck.state, 'review');
  assert.equal(takeLine(deck.status()), 'Take 4 recorded: puppet, mira, 3.3 s, 2 tracks; keep or discard');
  assert.equal(cr.session.text(), base, 'nothing is in the short until it is kept');
  assert.equal(cr.written.size, 0);
  assert.deepEqual(cr.scrubbed, [96], 'the view goes back to where the take began');
  await assert.rejects(deck.start(), /keep or discard take 4 first/);
  // Discard: nothing written, and its number is free again
  deck.discard();
  assert.equal(cr.session.text(), base); assert.equal(cr.written.size, 0);
  assert.equal(takeLine(deck.status()), 'Take: Discarded take 4');

  await deck.start({ kind: 'puppet', target: 'mira', from: 96 });
  await cr.run(200, (k) => { if (k === 10) keys.press('KeyW'); if (k === 100) keys.release('KeyW'); if (k === 120) keys.press('Digit2'); if (k === 124) keys.release('Digit2'); });
  const again = await deck.stop();
  assert.deepEqual(again, take, 'the same performance from the same place is the same take');
  const kept = await deck.keep();
  assert.equal(kept.label, 'Take 4: Mira, puppet (3.3 s)');
  assert.deepEqual(kept.tracks, ['mira-walk-take-4', 'mira-act-take-4']);
  assert.equal(kept.log, 'performances/the-regular/take-4.json');
  assert.ok(isTake(JSON.parse(cr.written.get(kept.log))), 'the log is in the project');
  assert.equal(cr.session.history().undo, 'Take 4: Mira, puppet (3.3 s)'); assert.equal(cr.session.history().undoDepth, 1);
  assert.equal(cr.session.validate().ok, true);
  assert.deepEqual(deck.takes().map((t) => [t.id, t.kind, t.name, t.log]), [['take-4', 'puppet', 'Mira', 'performances/the-regular/take-4.json']]);
  cr.session.undo();
  assert.equal(cr.session.text(), base, 'undo: the short as it was, byte for byte');
  cr.session.redo();
  // nothing performed: no take
  await deck.start({ kind: 'puppet', target: 'hana-1', from: 0 });
  assert.equal(deck.status().recording.id, 'take-5', 'the next take is numbered past the kept one');
  await cr.run(30);
  assert.equal(await deck.stop(), null);
  assert.equal(takeLine(deck.status()), 'Take: Nothing was performed, so there is no take');
  // remove: one more step
  deck.remove('take-4');
  assert.equal(cr.session.text(), base);
  assert.equal(cr.session.history().undo, 'Remove take 4');
});

test('a director take and a face take: what she is told and answers, a synthetic face, each kept in one step; a re-script keeps them', { skip }, async () => {
  const cr = await creator({ model: () => sampleModel(), camera: () => syntheticCamera() });
  const deck = cr.takeDeck, base = cr.session.text();
  await assert.rejects(deck.start({ kind: 'mime' }), /a take is one of puppet, director, face/);
  await deck.start({ kind: 'director', target: 'hana-1', from: 300 });
  assert.throws(() => deck.say('  '), /say something to her/);
  await cr.run(400, (k) => { if (k === 10) deck.say('Tell Mira the scones are fresh.'); if (k === 200) deck.say('Walk over to her.'); });
  assert.deepEqual(deck.status().said.map((l) => `${l.who}: ${l.text}`), ['You: Tell Mira the scones are fresh.', 'Hana: The scones just came out, Mira!', 'You: Walk over to her.', 'Hana: On my way.']);
  await deck.stop();
  assert.match(takeLine(deck.status()), /^Take 4 recorded: director, hana-1, 6\.7 s, 4 tracks; keep or discard$/);
  const d = await deck.keep();
  assert.deepEqual(d.tracks, ['hana-1-says-take-4', 'hana-1-face-take-4', 'hana-1-act-take-4', 'hana-1-decisions-take-4']);
  assert.deepEqual(cr.session.doc.sequence.tracks.find((t) => t.id === 'hana-1-says-take-4').clips.map((c) => c.text), ['The scones just came out, Mira!', 'On my way.']);

  deck.channels = ['blink', 'smile', 'head'];
  await deck.start({ kind: 'face', target: 'mira', from: 560 });
  await cr.run(40);
  assert.match(takeLine(deck.status()), /^Take 5 recording: face, mira, 0\.7 s, \d+ face samples \(hold still\)$/);
  await cr.run(500);
  await deck.stop();
  const f = await deck.keep();
  assert.deepEqual(f.tracks, ['mira-face-take-5', 'mira-head-take-5']);
  assert.deepEqual(Object.keys(cr.session.doc.sequence.tracks.find((t) => t.id === 'mira-face-take-5').keys).sort(), ['blink', 'blinkLeft', 'blinkRight', 'happy'], 'only the channels that were ticked');
  assert.equal(JSON.parse(cr.written.get(f.log)).setup.source, 'synthetic');
  assert.equal(cr.session.history().undoDepth, 2, 'two takes, two steps');
  assert.equal(cr.session.validate().ok, true, JSON.stringify(cr.session.validate().errors));

  // a re-script (a new action before the takes, so everything after it moves) keeps the takes' tracks and moves them with the script
  const before = takesOf(cr.session.doc.sequence);
  const r = cr.desk.apply(cr.desk.text.replace('\nHANA\n(smiling)', '\nThe door swings shut behind her and the bell above it rings twice.\n\nHANA\n(smiling)'));
  assert.equal(r.ok, true); assert.equal(r.changed, true);
  const after = takesOf(cr.session.doc.sequence);
  assert.deepEqual(after.map((t) => [t.id, t.tracks]), before.map((t) => [t.id, t.tracks]), 'every track of both takes is still there');
  assert.ok(after[0].from > before[0].from, `and they moved with the beats they fall in (${before[0].from} → ${after[0].from})`);
  assert.deepEqual(cr.session.doc.sequence.cast['hana-1'].behaviours, [{ use: 'brain', preset: 'actor' }], 'her brain for the goal is kept too');
  cr.session.undo(); cr.session.undo(); cr.session.undo();
  assert.equal(cr.session.text(), base);
});

test('an agent lists takes, keeps one from its log and removes one: each a step marked (MCP)', { skip }, async () => {
  const cr = await creator(), reg = creatorCommands(), ctx = () => ({ cr, session: asAgent(cr.session) }), base = cr.session.text();
  assert.ok(reg.list().some((c) => c.command === 'take'));
  const listed = await reg.run('take', { op: 'list' }, ctx());
  assert.deepEqual(listed.takes, []); assert.deepEqual(listed.logs, SAMPLE_TAKES);
  const a = await reg.run('take', { op: 'apply', log: SAMPLE_TAKES[0] }, ctx());
  assert.equal(a.label, 'Take 1: Mira, puppet (8.7 s)');
  assert.equal(cr.session.history().undo, 'Take 1: Mira, puppet (8.7 s) (MCP)', 'the step carries the agent\'s mark');
  assert.deepEqual((await reg.run('take', { op: 'list' }, ctx())).takes.map((t) => [t.id, t.kind, t.who, t.log]), [['take-1', 'puppet', 'mira', SAMPLE_TAKES[0]]]);
  await assert.rejects(reg.run('take', { op: 'apply', log: 'scripts/the-regular.fountain' }, ctx()), /isn't JSON/);
  await assert.rejects(reg.run('take', { op: 'apply', log: 'shorts.json' }, ctx()), /isn't a take log/);
  await assert.rejects(reg.run('take', { op: 'apply' }, ctx()), /apply needs log/);
  await assert.rejects(reg.run('take', { op: 'erase' }, ctx()), /op/);
  const r = await reg.run('take', { op: 'remove', id: 'take-1' }, ctx());
  assert.equal(r.label, 'Remove take 1');
  assert.equal(cr.session.history().undo, 'Remove take 1 (MCP)');
  assert.equal(cr.session.text(), base);
  assert.equal(cr.session.history().undoDepth, 2);
});
