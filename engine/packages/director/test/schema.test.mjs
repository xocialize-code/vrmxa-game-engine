// M3 W0 (AB-T-0539) without a world: tool schemas narrowed to the moment, the bad-reply fixtures each rejected with a
// reason, good replies normalised into ai.inject's form, and prompts in VRMXA §11's order with a stable hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolsFor, validate, toInject, buildMessages, promptHash } from '@vrmxg/director';

/** Hana's moment: she has seen Mira (and the person speaks as Mira), a stool and the door are near. */
const M = {
  agent: 'hana-1', user: 'mira',
  characters: [{ id: 'cust-1', name: 'Sora' }],
  items: [{ id: 'stool-1', name: 'Stool', verbs: ['sit'] }, { id: 'door', name: 'Door', verbs: ['close', 'open'] }],
  expressions: ['happy', 'relaxed'], gestures: ['cheer', 'nod'], goals: [{ name: 'serve', description: 'take and bring an order' }],
};
const call = (name, args) => ({ name, arguments: args });

test('tools are the action vocabulary narrowed to the moment', () => {
  const t = Object.fromEntries(toolsFor(M).map((x) => [x.name, x.parameters]));
  assert.deepEqual(Object.keys(t).sort(), ['emote', 'endConversation', 'follow', 'gesture', 'goTo', 'interact', 'lookAt', 'say', 'setGoal', 'wait']);
  assert.deepEqual(t.say.properties.emotion.enum, ['happy', 'relaxed'], 'faces from the persona');
  assert.deepEqual(t.say.properties.gesture.enum, ['cheer', 'nod'], 'gestures from the filled slots');
  assert.deepEqual(t.say.properties.to.enum, ['user', 'cust-1'], 'people perceived, and the person');
  assert.deepEqual(t.goTo.properties.target.enum, ['user', 'cust-1', 'stool-1', 'door']);
  assert.deepEqual(t.interact.properties.verb.enum, ['close', 'open', 'sit']);
  assert.deepEqual(t.setGoal.properties.goal.enum, ['serve']);
  assert.equal(t.say.additionalProperties, false);
  const bare = Object.fromEntries(toolsFor({ ...M, user: null, characters: [], items: [], expressions: [], gestures: [], goals: [] }).map((x) => [x.name, x.parameters]));
  assert.deepEqual(Object.keys(bare).sort(), ['endConversation', 'say', 'wait'], 'a tool with nothing to choose from is left out');
  assert.equal(bare.say.properties.emotion, undefined);
});

test('the bad-reply fixtures are each rejected, with the reason', () => {
  const bad = {
    'malformed JSON': { toolCalls: [call('say', '{"text": "Hi"')] },
    'an unknown action': { toolCalls: [call('dance', {})] },
    'a face she is not allowed': { toolCalls: [call('say', { text: 'Grr.', emotion: 'angry' })] },
    'a gesture she has no clip for': { toolCalls: [call('gesture', { slot: 'backflip' })] },
    'a target she has not seen': { toolCalls: [call('goTo', { target: 'ghost-7' })] },
    'a hallucinated argument': { toolCalls: [call('say', { text: 'Hi', volume: 11 })] },
    'a missing argument': { toolCalls: [call('interact', { item: 'door' })] },
    'an empty line': { toolCalls: [call('say', { text: '   ' })] },
    'a line too long': { toolCalls: [call('say', { text: 'a'.repeat(401) })] },
    'two lines': { toolCalls: [call('say', { text: 'One.' }), call('say', { text: 'Two.' })] },
    'two movements': { toolCalls: [call('goTo', { target: 'door' }), call('follow', { target: 'cust-1' })] },
    'too many calls': { toolCalls: [call('wait', { seconds: 1 }), call('wait', { seconds: 1 }), call('wait', { seconds: 1 }), call('wait', { seconds: 1 }), call('wait', { seconds: 1 })] },
    'a wait out of range': { toolCalls: [call('wait', { seconds: 600 })] },
    'nothing at all': { toolCalls: [] },
    'a goal not in her role': { toolCalls: [call('setGoal', { goal: 'rob the till' })] },
  };
  for (const [what, reply] of Object.entries(bad)) {
    const v = validate(reply, M);
    assert.equal(v.ok, false, `${what} is rejected`);
    assert.ok(!v.ok && v.errors.length && v.errors.every((e) => typeof e === 'string'), `${what}: a reason (${!v.ok && v.errors.join('; ')})`);
  }
  const gone = validate({ toolCalls: [call('lookAt', { target: 'cust-1' })] }, M, { exists: (id) => id !== 'cust-1' });
  assert.ok(!gone.ok && /no longer here/.test(gone.errors[0]), 'a target that left between asking and answering');
});

test('good replies: calls parsed and normalised; text alone is a line; say carries its face, gesture and look', () => {
  const v = validate({ toolCalls: [call('say', '{"text":"Of course! One latte.","to":"user","emotion":"happy","gesture":"nod"}'), call('setGoal', { goal: 'serve', params: { customer: 'mira' } })] }, M);
  assert.ok(v.ok, !v.ok ? v.errors.join('; ') : '');
  const e = toInject(v.ok ? v.calls : [], 'mira');
  assert.deepEqual(e.actions, [
    { do: 'emote', args: { name: 'happy' } },
    { do: 'say', args: { text: 'Of course! One latte.', topic: 'chat', to: 'mira' } },
    { do: 'gesture', args: { slot: 'nod' } },
    { do: 'lookAt', args: { target: 'mira' } },
  ]);
  assert.deepEqual(e.goal, { name: 'serve', params: { customer: 'mira' } });
  const t = validate({ text: 'Hello there!', toolCalls: [] }, M);
  assert.ok(t.ok && t.calls[0].name === 'say' && t.calls[0].args.text === 'Hello there!', 'a reply with text and no calls is a line');
  assert.deepEqual(toInject([{ name: 'endConversation', args: {} }], null).bb, { conversation: null });
  const dollars = toInject([{ name: 'say', args: { text: '$4.50, please.' } }], null);
  assert.equal(dollars.actions[0].args.text, '$4.50, please.', 'text stays text (injected arguments are literal)');
});

test('prompts follow VRMXA §11: persona, then memory, then the conversation, then the moment; the hash is stable', () => {
  const persona = { name: 'Hana', summary: 'Runs the cafe.', traits: ['warm', 'quick'], speech_style: 'Short, friendly.', examples: [{ user: 'Busy day?', character: 'Always! What can I get you?' }] };
  const msgs = buildMessages({ persona, memory: 'Mira likes oat milk.', history: [{ role: 'user', content: 'Hi!' }, { role: 'assistant', content: 'Welcome in!' }], moment: 'Mira says: "A latte?"' });
  assert.equal(msgs[0].role, 'system');
  const s = msgs[0].content;
  assert.ok(s.indexOf('You are Hana.') < s.indexOf('Traits: warm, quick.') && s.indexOf('Traits') < s.indexOf('Mira likes oat milk.'), 'persona before memory');
  assert.deepEqual(msgs.slice(1).map((m) => m.content), ['Hi!', 'Welcome in!', 'Mira says: "A latte?"'], 'then the conversation, then the moment');
  const req = { messages: msgs, tools: toolsFor(M) };
  assert.equal(promptHash(req), promptHash(JSON.parse(JSON.stringify(req))));
  assert.equal(promptHash({ a: 1, b: 2 }), promptHash({ b: 2, a: 1 }), 'key order does not matter');
  assert.notEqual(promptHash(req), promptHash({ ...req, messages: msgs.slice(1) }));
  assert.match(promptHash(req), /^[0-9a-f]{16}$/);
});
