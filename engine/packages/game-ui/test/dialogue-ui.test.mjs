import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialogueModel, captionsModel, choose, advance, choiceForKey } from '../src/index.js';

const line = { node: 'order', title: 'The order', index: 0, line: null, speaker: 'hana', name: 'Hana', text: 'Good morning! What can I get you?', clip: null, phase: 'line', since: 10, duration: 2.5, skippable: true, choices: [] };
const asking = { ...line, phase: 'choice', choices: [{ id: 'latte', text: 'A latte, please.' }, { id: 'tea', text: 'Just tea.' }] };

test('the box: who speaks, the words as they are said, Continue while a skippable line plays', () => {
  const m = dialogueModel(line, [{ actor: 'hana', words: ['Good', 'morning', 'What', 'can', 'I', 'get', 'you'], spoken: 3 }]);
  assert.deepEqual([m.name, m.spoken, m.words.length, m.asking, m.canAdvance], ['Hana', 3, 7, false, true]);
  assert.equal(m.label, 'Hana: Good morning! What can I get you?');
  assert.equal(dialogueModel(line).spoken, 7, 'no caption (another speaker, a line said already): the whole line');
  assert.equal(dialogueModel({ ...line, skippable: false }).canAdvance, false);
  assert.equal(dialogueModel({ ...line, name: null, speaker: null }).label, 'Good morning! What can I get you?');
  assert.equal(dialogueModel(null), null);
});

test('the choices: numbered, with accessible names that say which of how many', () => {
  const m = dialogueModel(asking);
  assert.equal(m.asking, true); assert.equal(m.canAdvance, false); assert.equal(m.spoken, m.words.length);
  assert.deepEqual(m.choices, [
    { id: 'latte', text: 'A latte, please.', n: 1, key: '1', label: 'Choice 1 of 2: A latte, please.' },
    { id: 'tea', text: 'Just tea.', n: 2, key: '2', label: 'Choice 2 of 2: Just tea.' },
  ]);
  assert.equal(choiceForKey(m, 'Digit2').id, 'tea');
  assert.equal(choiceForKey(m, 'Numpad1').id, 'latte');
  assert.equal(choiceForKey(m, 'Digit3'), null);
  assert.equal(choiceForKey(dialogueModel(line), 'Digit1'), null, 'not while the line plays');
  const ten = dialogueModel({ ...asking, choices: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, text: `C${i}` })) });
  assert.equal(ten.choices[9].key, null, 'a tenth choice has no digit');
});

test('captions leave out the line the box already shows', () => {
  const caps = [{ actor: 'hana', name: 'Hana', text: 'Good morning!', words: ['Good', 'morning'], spoken: 1 }, { actor: 'guest', name: 'Guest', text: 'Hello?', words: ['Hello'], spoken: 1 }];
  assert.deepEqual(captionsModel(caps, line).map((c) => c.actor), ['guest']);
  assert.deepEqual(captionsModel(caps, null).map((c) => c.label), ['Hana: Good morning!', 'Guest: Hello?']);
});

test('a choice and a skip go to the input service as recorded choices', () => {
  const got = [];
  const input = { choose: (name, value) => { got.push([name, value]); return true; } };
  assert.equal(choose(input, 'tea'), true); advance(input);
  assert.deepEqual(got, [['dialogue.choose', 'tea'], ['dialogue.advance', true]]);
});
