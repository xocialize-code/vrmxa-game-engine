// M5 W3 (AB-T-0618): conversations with choices. A choice reaches the step only as a recorded input, so a replay takes
// the same branch with the same per-step hashes. No models: the speakers are plain nodes (a line is then its caption,
// timed from its text), so this runs on CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { installInput } from '@vrmxg/input';
import { installGame } from '@vrmxg/game';
import { worldHashes, hashValue, captureWorld, restoreWorld, compareRuns } from '@vrmxg/snapshot';
import { installVoice, installDialogue, readDialogue, checkDialogue, CHOOSE, ADVANCE } from '../src/index.js';

installPortableMath();

const ORDER = [
  { speaker: 'hana', text: 'Good morning! What can I get you?', choices: [
    { id: 'latte', text: 'A latte, please.', to: 'latte', set: { order: 'latte' } },
    { id: 'tea', text: 'Just tea.', to: 'tea', set: { order: 'tea' } },
    { id: 'usual', text: 'The usual.', to: 'usual', when: { test: 'state', key: 'flags.regular' } },
  ] },
  { id: 'latte', speaker: 'hana', text: 'One latte, coming up.', next: 'bye' },
  { id: 'tea', speaker: 'hana', text: 'Tea it is.', set: { cheap: true } },
  { id: 'bye', speaker: 'mira', text: 'Thanks!', next: 'end' },
  { id: 'usual', speaker: 'hana', text: 'Of course.', when: { test: 'state', key: 'flags.regular' } },
];

/** A cafe without characters: two speakers, the rules (flags the conversation reads and sets), the conversation. */
function world({ regular = false, lines = ORDER, autostart = true } = {}) {
  const tree = new SceneTree({ registry: m0Registry(), seed: 5 });
  const input = installInput(tree);
  installVoice(tree, { resolve: () => { throw new Error('no clips here'); }, faces: false });
  const game = installGame(tree, { scene: 'cafe.vrmxs' });
  const dialogue = installDialogue(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'cafe', nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'hana', type: 'Node3D', name: 'Hana', parent: 'root' },
    { id: 'mira', type: 'Node3D', name: 'Mira', parent: 'root' },
    { id: 'rules', type: 'GameRules', parent: 'root', props: { flags: { regular, order: '', cheap: false } } },
    { id: 'order', type: 'Dialogue', name: 'The order', parent: 'root', props: { lines } },
  ] });
  const events = [];
  for (const s of ['started', 'line', 'asked', 'chose', 'ended']) tree.find('order').on(s, (p) => events.push([tree.clock.step, s, p.line ?? p.choice ?? null, p.choice ?? null]));
  if (autostart) tree.find('order').call('start'); // as autostart would, once the listeners are on
  return { tree, input, game, dialogue, events };
}

/** Step until the conversation asks (or `max` steps). → the step it asked on */
function untilAsked(w, max = 600) { for (let i = 0; i < max; i++) { if (w.dialogue.active?.phase === 'choice') return w.tree.clock.step; w.tree.step(); } throw new Error('never asked'); }

test('a conversation\'s lines are read and checked: ids resolved, every problem named with its path', () => {
  const { lines, problems } = readDialogue({ lines: ORDER });
  assert.deepEqual(problems, []);
  assert.deepEqual(lines.map((l) => l.next), [1, 3, 3, -1, -1], 'next by id, the end, the line after by default');
  assert.deepEqual(lines[0].choices.map((c) => [c.id, c.to]), [['latte', 1], ['tea', 2], ['usual', 4]]);
  assert.deepEqual(readDialogue({ lines: [{ text: 'Hi', choices: [{ text: 'a' }, { text: 'b' }] }] }).lines[0].choices.map((c) => c.id), ['0', '1'], 'a choice without an id takes its place');
  const bad = checkDialogue({ lines: [
    { id: 'a', text: '', next: 'nowhere' }, { id: 'a', text: 'x', choices: [] }, { text: 'y', choices: [{ text: 'p', id: 'p' }, { text: 'q', id: 'p' }, { text: '', to: 'zzz' }] },
    { id: 'end', text: 'z' }, { text: 'w', set: { f: {} }, when: { test: 'state' } }, 'nonsense',
  ] });
  for (const m of [/lines\[0\]\.text: a line says something/, /lines\[0\]\.next: no line "nowhere"/, /lines\[1\]\.id: "a" is line 0's id too/, /lines\[1\]\.choices: a list of at least one/, /lines\[2\]\.choices\[1\]\.id: "p" is another/, /lines\[2\]\.choices\[2\]\.text/, /lines\[2\]\.choices\[2\]\.to: no line "zzz"/, /lines\[3\]\.id: "end" is the name/, /lines\[4\]\.set\.f: a flag/, /lines\[4\]\.when/, /lines\[5\]: a line is/]) assert.ok(bad.some((p) => m.test(p)), `${m} in ${bad.join(' | ')}`);
  assert.match(checkDialogue({})[0], /at least one line/);
});

test('a conversation that can\'t be right is refused when its node enters, and leaves nothing behind', () => {
  assert.throws(() => world({ lines: [{ text: 'Hi', next: 'gone' }] }), /Dialogue "order": lines\[0\]\.next: no line "gone"/);
  const w = world();
  assert.throws(() => w.tree.add({ id: 'bad', type: 'Dialogue', parent: 'root', props: { lines: [] } }), /Dialogue "bad"/);
  assert.equal(w.tree.find('bad'), null);
});

test('the lines play in order, the conversation waits for a choice, and the choice takes its branch and sets its flags', () => {
  const w = world();
  w.tree.step();
  let v = w.dialogue.view();
  assert.deepEqual([v.line, v.speaker, v.name, v.phase, v.text], [null, 'hana', 'Hana', 'line', 'Good morning! What can I get you?']);
  assert.deepEqual(v.choices, [], 'no choices while the line is said');
  const asked = untilAsked(w);
  v = w.dialogue.view();
  assert.equal(v.phase, 'choice');
  assert.deepEqual(v.choices, [{ id: 'latte', text: 'A latte, please.' }, { id: 'tea', text: 'Just tea.' }], '"the usual" isn\'t offered to someone who isn\'t a regular');
  // waiting: nothing moves on its own, and an answer that isn't on offer leaves the question standing
  w.tree.run(120);
  assert.equal(w.dialogue.view().phase, 'choice');
  w.input.choose(CHOOSE, 'usual'); w.tree.step();
  assert.equal(w.dialogue.view().phase, 'choice', 'a choice not on offer is not taken');
  w.input.choose(CHOOSE, 'tea'); w.tree.step();
  v = w.dialogue.view();
  assert.deepEqual([v.line, v.text, v.phase], ['tea', 'Tea it is.', 'line']);
  assert.equal(w.game.view().flags.order, 'tea', 'the choice set its flag');
  assert.equal(w.game.view().flags.cheap, true, 'and the line it led to set its own');
  for (let i = 0; i < 600 && w.dialogue.active; i++) w.tree.step();
  assert.equal(w.dialogue.view(), null, 'tea → bye → end');
  assert.deepEqual(w.events.map((e) => e[1]), ['started', 'line', 'asked', 'chose', 'line', 'line', 'ended']);
  assert.equal(w.events.find((e) => e[1] === 'asked')[0], asked - 1, 'asked on the step whose rules saw the line end');
  assert.deepEqual(w.events.filter((e) => e[1] === 'line').map((e) => e[2]), [null, 'tea', 'bye']);
});

test('a choice behind a condition is offered when it holds, and a line behind one is passed over when it doesn\'t', () => {
  const w = world({ regular: true });
  untilAsked(w);
  assert.deepEqual(w.dialogue.view().choices.map((c) => c.id), ['latte', 'tea', 'usual']);
  w.input.choose(CHOOSE, 'usual'); w.tree.step();
  assert.equal(w.dialogue.view().line, 'usual');
  // a line that doesn't hold is passed over, to the one after it
  const skip = world({ lines: [{ text: 'One.' }, { text: 'Two.', when: { test: 'state', key: 'flags.regular' } }, { id: 'three', text: 'Three.' }] });
  for (let i = 0; i < 600 && skip.dialogue.active; i++) skip.tree.step();
  assert.deepEqual(skip.events.filter((e) => e[1] === 'line').map((e) => e[2]), [null, 'three']);
});

test('a line ends early on the advance input, and only when the conversation is skippable', () => {
  const w = world();
  w.tree.run(2);
  w.input.choose(ADVANCE); w.tree.step();
  assert.equal(w.dialogue.view().phase, 'choice', 'skipped straight to the question');
  const lines = [{ text: 'You will hear all of this, however impatient you are.' }, { text: 'And this.' }];
  const fixed = world({ lines });
  fixed.tree.find('order').props.skippable = false;
  fixed.tree.run(2); fixed.input.choose(ADVANCE); fixed.tree.step();
  assert.equal(fixed.dialogue.view().index, 0);
});

test('autostart starts the conversation on the world\'s first step (after a scene change has carried the game in)', () => {
  const tree = new SceneTree({ registry: m0Registry() });
  installInput(tree); const dialogue = installDialogue(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 's', nodes: [{ id: 'root', type: 'Node3D' }, { id: 'd', type: 'Dialogue', parent: 'root', props: { autostart: true, lines: [{ text: 'Hello.' }] } }] });
  assert.equal(dialogue.view(), null, 'not at ready');
  assert.deepEqual(dialogue.getState().queued, ['d']);
  tree.step();
  assert.equal(dialogue.view().text, 'Hello.');
  assert.equal(dialogue.view().since, 0);
  assert.equal(dialogue.view().name, null, 'a line nobody says');
});

test('one conversation at a time; stop ends it where it is; a node that leaves takes its conversation with it', () => {
  const w = world({ autostart: false });
  assert.equal(w.dialogue.view(), null);
  w.tree.find('order').call('start', { at: 'latte' });
  assert.equal(w.dialogue.view().line, 'latte');
  assert.equal(w.dialogue.start(w.tree.find('order')), false, 'not while one is going on');
  w.tree.find('order').call('stop');
  assert.equal(w.dialogue.view(), null);
  assert.equal(w.dialogue.start(w.tree.find('order'), { at: 'nope' }), false, 'a line it doesn\'t have');
  w.tree.find('order').call('start');
  w.tree.remove('order');
  w.tree.step();
  assert.equal(w.dialogue.active, null);
});

/** A played conversation: the latte, recorded. → { rec, run (per-step hashes), branch } */
function play() {
  const w = world();
  w.input.record();
  const run = [];
  for (let i = 0; i < 420; i++) {
    if (i === 3) w.input.choose(ADVANCE);                          // skip Hana's greeting
    if (w.dialogue.active?.phase === 'choice' && !w.answered) { w.input.choose(CHOOSE, 'latte'); w.answered = true; }
    w.tree.step();
    run.push({ step: w.tree.clock.step, h: worldHashes(w.tree) });
  }
  return { rec: JSON.parse(JSON.stringify(w.input.stop())), run, events: w.events, flags: w.game.view().flags };
}

test('a conversation replays as played: the recording carries the choice and takes the same branch, with the same per-step hashes', () => {
  const live = play();
  const chosen = live.rec.frames.map((f, i) => [i, f[2]]).filter(([, c]) => c);
  assert.deepEqual(chosen.map(([, c]) => c), [{ [ADVANCE]: true }, { [CHOOSE]: 'latte' }], 'the skip and the answer, and nothing else, are in the recording');
  // replayed in a fresh world with no UI at all
  const w = world();
  w.input.replay(live.rec);
  const run = [];
  for (let i = 0; i < 420; i++) { w.tree.step(); run.push({ step: w.tree.clock.step, h: worldHashes(w.tree) }); }
  assert.equal(compareRuns(live.run, run), null);
  assert.deepEqual(w.events, live.events);
  assert.equal(live.flags.order, 'latte');
  // and the other answer is another run: the choice is what decides it
  const other = world(); const rec = structuredClone(live.rec);
  rec.frames[chosen[1][0]][2] = { [CHOOSE]: 'tea' };
  other.input.replay(rec);
  for (let i = 0; i < 420; i++) other.tree.step();
  assert.equal(other.game.view().flags.order, 'tea');
  assert.notEqual(hashValue(worldHashes(other.tree)), hashValue(live.run.at(-1).h));
});

test('a snapshot taken while the conversation waits for an answer restores and goes on as the unbroken run', () => {
  const live = play();
  const w = world();
  w.input.replay(live.rec);
  untilAsked(w);
  const snap = captureWorld(w.tree), at = w.tree.clock.step;
  const b = world();
  restoreWorld(b.tree, snap);
  assert.equal(b.dialogue.view().phase, 'choice');
  b.input.replay(live.rec);
  const run = [];
  for (let i = at; i < 420; i++) { b.tree.step(); run.push({ step: b.tree.clock.step, h: worldHashes(b.tree) }); }
  assert.equal(compareRuns(live.run.filter((r) => r.step > at), run), null);
});

test('lines edited under a question (the editor\'s play, an MCP edit) never throw in the step (review)', () => {
  const w = world();
  untilAsked(w);
  const node = w.tree.find('order');
  node.props = { ...node.props, lines: [{ speaker: 'hana', text: 'Good morning!', choices: [{ id: 'latte', text: 'A latte.' }] }, { text: 'Bye.' }] };
  assert.deepEqual(w.dialogue.view().choices.map((c) => c.id), ['latte'], 'only the choices still there');
  assert.doesNotThrow(() => w.tree.step());
  w.input.choose(CHOOSE, 'latte'); w.tree.step();
  assert.equal(w.dialogue.view().text, 'Bye.');
  // and a question whose choices all went: it moves on
  const v = world(); untilAsked(v);
  v.tree.find('order').props = { lines: [{ speaker: 'hana', text: 'Good morning!' }, { text: 'Next.' }] };
  assert.doesNotThrow(() => v.tree.step());
  assert.equal(v.dialogue.view().text, 'Next.');
});

test('advance false is no skip (review)', () => {
  const w = world();
  w.tree.run(2);
  w.input.choose(ADVANCE, false); w.tree.step();
  assert.equal(w.dialogue.view().phase, 'line');
});
