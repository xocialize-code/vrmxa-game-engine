// The page's side of the shell's close question (apps/shell/js/shell.js `onClosing`, shell 0.9.0, AB-T-0593), with a
// stand-in for the shell: what the page tells it, and in which order. The shell's own side is tested in Swift
// (apps/shell, CloseQuestionTests); the running app in the creator's AppProbe scenario.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const sent = [];
let onClosing;
const tick = () => new Promise((r) => setTimeout(r, 0));
const ask = (id, reason = 'close') => dispatchEvent(new CustomEvent('vrmxg-shell', { detail: { name: 'window.closing', payload: { id, reason } } }));

before(async () => {
  const events = new EventTarget(); // Node has no window: shell.js listens on the global object
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
  globalThis.dispatchEvent = events.dispatchEvent.bind(events);
  globalThis.webkit = { messageHandlers: { vrmxg: { postMessage: async (m) => { sent.push(`${m.method} ${m.params.id} ${m.params.answer}`); return { pending: true }; } } } };
  ({ onClosing } = await import('../../shell/js/shell.js'));
});

test('the page says it is asking at once, then what the person decided', async () => {
  let decide; const reasons = [];
  const off = onClosing((reason) => { reasons.push(reason); return new Promise((r) => { decide = r; }); });
  sent.length = 0;
  ask('close-1', 'quit');
  await tick();
  assert.deepEqual(sent, ['window.closeReply close-1 wait'], 'heard: the shell stops its timeout');
  ask('close-1', 'quit'); // ⌘Q again with the sheet up: the same question
  await tick();
  assert.deepEqual(sent, ['window.closeReply close-1 wait', 'window.closeReply close-1 wait'], 'still asking: no second sheet');
  assert.deepEqual(reasons, ['quit']);
  decide(true);
  await tick();
  assert.equal(sent.at(-1), 'window.closeReply close-1 close');
  sent.length = 0;
  ask('close-2');
  await tick(); decide(false); await tick();
  assert.deepEqual(sent, ['window.closeReply close-2 wait', 'window.closeReply close-2 cancel'], 'Cancel keeps the window');
  off();
  sent.length = 0;
  ask('close-3');
  await tick();
  assert.deepEqual(sent, [], 'unsubscribed');
});

test('a decision that fails, or isn\'t a plain yes, keeps the window', async () => {
  const error = console.error; console.error = () => {};
  try {
    sent.length = 0;
    let off = onClosing(async () => { throw new Error('save failed'); });
    ask('close-4'); await tick(); await tick();
    assert.deepEqual(sent, ['window.closeReply close-4 wait', 'window.closeReply close-4 cancel']);
    off();
    sent.length = 0;
    off = onClosing(async () => 'discard');
    ask('close-5'); await tick(); await tick();
    assert.equal(sent.at(-1), 'window.closeReply close-5 cancel', 'only true closes');
    off();
  } finally { console.error = error; }
});
