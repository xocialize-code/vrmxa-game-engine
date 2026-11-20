// M3 exit check 3 (W13): two characters with directors share one resident model through a queue. The character being
// spoken to goes first, and at most two requests are at the model at once. On the sample cafe (needs
// vrmxa-avatar-studio beside the repo): Hana and Mira each have a conversation-partner brain and one director over a slow
// scripted model; two goal choices fill both slots, a third waits, then the person talks to Hana: her line goes to the
// model before the goal choice that queued first, and the model never holds more than two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { installDirector, scriptedModel } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const skip = !fs.existsSync(PATHS.core) && 'needs vrmxa-avatar-studio';
const flush = () => new Promise((r) => setImmediate(r));

test('two directors, one model: the character spoken to goes first, at most two requests at the model', { skip }, async () => {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  const brain = [{ use: 'brain', preset: 'conversationPartner' }];
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' || n.id === 'mira' ? { ...n, behaviours: brain } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const W = await buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours: new Map(), stubTextures: true });
  let atModel = 0, most = 0;
  const order = []; // the priority of each request as it reaches the model: 0 a talk, 1 a goal choice
  const slow = scriptedModel(() => ({ text: '{}' }), { latency: 30 });
  const model = { name: 'slow', async respond(req, ctx) { order.push(req.priority); atModel++; most = Math.max(most, atModel); try { return await slow.respond(req, ctx); } finally { atModel--; } } };
  const director = installDirector(W.tree, { model, persona: (id) => W.personas.forDirector(id), maxInFlight: 2 });
  for (let i = 0; i < 5; i++) { W.tree.step(); director.pump(); await flush(); }
  const first = director.consider('mira', 'Decide what to do next.');
  const second = director.consider('hana-1', 'Decide what to do next.');
  W.tree.step(); director.pump(); await flush();
  const third = director.consider('mira', 'Something changed.');
  W.tree.step(); director.pump(); await flush();
  const talk = director.talk('hana-1', 'Hana, how are you today?');
  const byId = (id) => director.requests.find((r) => r.id === id);
  assert.equal(byId(third).state, 'queued', 'the third goal choice waits: both slots are taken');
  assert.equal(byId(talk).state, 'queued', 'and so does the talk, for now');
  for (let i = 0; i < 200 && director.requests.some((r) => r.state === 'queued' || r.state === 'asking'); i++) { W.tree.step(); director.pump(); await flush(); }
  assert.deepEqual(order.slice(0, 4), [1, 1, 0, 1], `the two goal choices, then the talk before the goal choice queued ahead of it (${order.join(', ')})`);
  assert.ok(byId(talk).sent <= byId(third).sent, 'sent no later');
  void first; void second;
  assert.ok(most <= 2, `at most two at the model at once (${most})`);
  assert.equal(most, 2, 'and the queue did fill both slots');
});
