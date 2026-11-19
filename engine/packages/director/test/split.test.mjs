// The split turn's helpers (M3, the model evaluation): the line cleaned, goodbyes by rule, verdicts parsed and their
// usual wrong shapes mapped, and salvage keeping the line while dropping the parts that don't fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLine, isGoodbye, parseVerdict, normalizeVerdict, salvage, validate, verdictRequest, lineRequest } from '@vrmxg/director';

const M = {
  agent: 'hana-1', user: 'mira', characters: [{ id: 'cust-1', name: 'Sora' }],
  items: [{ id: 'stool-1', name: 'Stool', verbs: ['sit'] }, { id: 'door-1', name: 'Staff door', verbs: ['close', 'open'] }, { id: 'light-switch', name: 'Counter lights', verbs: ['toggle'] }],
  expressions: ['happy', 'relaxed'], gestures: ['nod', 'cheer'],
  goals: [{ name: 'takeOrder', description: 'take an order' }, { name: 'waitAt', description: 'wait somewhere' }, { name: 'follow', description: 'follow someone' }],
};

test('lines are cleaned; goodbyes are decided by rule', () => {
  assert.equal(cleanLine('Hana: "Coming right up!"', 'Hana'), 'Coming right up!');
  assert.equal(cleanLine('One latte.\n\nAnything else?'), 'One latte.');
  for (const t of ['Bye, Hana!', 'I should go. See you tomorrow!', 'Good night!', 'Thanks, have a good one!', 'see you!', 'Take care.']) assert.ok(isGoodbye(t), t);
  for (const t of ['By the way, nice apron.', 'I see you have a new machine!', 'Can you see you-know-who?', 'Goodness, that smells good.']) assert.ok(!isGoodbye(t), t);
});

test('verdicts: parsed through fences and chatter; the usual wrong shapes mapped', () => {
  assert.deepEqual(parseVerdict('Sure!\n```json\n{"emotion": "happy", "action": null}\n```'), { emotion: 'happy', action: null });
  assert.equal(parseVerdict('no json here'), null);
  assert.equal(parseVerdict('{"broken": '), null);
  const n = (v) => normalizeVerdict(v, M, { userName: 'Mira', heard: 'Two croissants, please.' });
  assert.deepEqual(n({ action: { do: 'sit', target: 'stool-1' } }).action, { do: 'interact', item: 'stool-1', verb: 'sit' }, 'a verb as the action');
  assert.deepEqual(n({ action: { do: 'toggle', target: 'Counter lights' } }).action, { do: 'interact', item: 'light-switch', verb: 'toggle' }, 'and a name as the item');
  assert.deepEqual(n({ action: { do: 'waitAt', target: 'door-1' } }).goal, { name: 'waitAt', params: { target: 'door-1' } }, 'a goal as the action');
  assert.deepEqual(n({ action: { do: 'goTo', target: 'door-1' }, goal: 'waitAt' }).goal, { name: 'waitAt', params: { target: 'door-1' } }, 'a goal as a string, its target from the action');
  assert.deepEqual(n({ goal: { name: 'takeOrder' } }).goal.params, { customer: 'user', order: 'Two croissants, please.' }, "the customer is the person; the order, their words");
  assert.deepEqual(n({ goal: { name: 'takeOrder', params: { customer: 'Mira', order: 'croissants' } } }).goal.params, { customer: 'user', order: 'croissants' }, 'a name as an id');
  assert.deepEqual(n({ action: { do: 'follow', target: 'Sora' } }).goal, { name: 'follow', params: { target: 'cust-1' } }, 'follow is one of her goals here: the goal, with the name as its id');
});

test('salvage: the line stands alone; parts that do not fit are dropped with a reason; a goodbye ends', () => {
  const s = salvage('Of course, coming right up!', { emotion: 'angry', gesture: 'nod', action: { do: 'dance', target: 'user' }, goal: { name: 'takeOrder', params: { order: 'latte' } } }, M, { heard: 'A latte, please.', userName: 'Mira', validate });
  assert.ok(s.ok);
  assert.deepEqual(s.calls.map((c) => c.name), ['say', 'setGoal']);
  assert.deepEqual(s.calls[0].args, { text: 'Of course, coming right up!', to: 'user', gesture: 'nod' }, 'the gesture kept, the face she has not dropped');
  assert.deepEqual(s.calls[1].args, { goal: 'takeOrder', params: { order: 'latte', customer: 'user' } });
  assert.ok(s.dropped.some((d) => d.startsWith('emotion angry')) && s.dropped.some((d) => d.startsWith('dance')), s.dropped.join(' | '));
  const bye = salvage('See you, Mira!', {}, M, { heard: 'Bye, Hana!', validate });
  assert.deepEqual(bye.calls.map((c) => c.name), ['say', 'endConversation']);
  const bad = salvage('<|tool_call_start|>[say()]', {}, M, { validate });
  assert.equal(bad.ok, false, 'a line that is not speech rejects the turn');
});

test('the two requests: the line call has no tools; the verdict lists only the moment\'s choices', () => {
  const l = lineRequest({ persona: { name: 'Hana' }, moment: 'A latte, please.' });
  assert.deepEqual(l.tools, []); assert.match(l.messages[0].content, /only what you say out loud/);
  const v = verdictRequest({ moment: M, name: 'Hana', userName: 'Mira', heard: 'A latte, please.', line: 'Coming up!' }).messages[0].content;
  for (const s of ['"happy", "relaxed"', '"nod", "cheer"', '"stool-1"', '"takeOrder"', 'Mira said to Hana: "A latte, please."']) assert.ok(v.includes(s), s);
});
