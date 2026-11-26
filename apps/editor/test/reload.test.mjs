// Hot reload of a project's behaviours in play in place (M6 W2, AB-T-0645): keep or restart by the declared state shape
// (stateShape, M6 W0), the old instances' listeners dropped, all or nothing, and the watch loop that reloads through
// Export Game's fresh path (freshImporter) and marks the recording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { installInput } from '@vrmxg/input';
import { behavioursImporter } from '@vrmxg/bundle/node';
import { reloadPlan, swapBehaviours, applyReload, HotReload, freshBehaviours, markRecording } from '../src/reload.js';

installPortableMath();

const COUNT = { type: 'object', additionalProperties: false, required: ['n'], properties: { n: { type: 'integer' } } };

// version 1 of a project's module, as classes
const v1 = () => {
  class counter extends Behaviour { // declared: { n }
    static describe = { description: 'counts by one', state: COUNT };
    ready() { this.n = 0; }
    physicsProcess() { this.n += 1; }
    getState() { return { n: this.n }; }
    setState(s) { this.n = s.n; }
  }
  class shaper extends Behaviour { // declared: { n }, changes shape in v2
    static describe = { state: COUNT };
    ready() { this.n = 100; }
    physicsProcess() { this.n += 1; }
    getState() { return { n: this.n }; }
    setState(s) { this.n = s.n; }
  }
  class plain extends Behaviour { // declares nothing, code unchanged in v2
    ready() { this.t = 0; }
    physicsProcess() { this.t += 1; }
    getState() { return { t: this.t }; }
    setState(s) { this.t = s.t; }
  }
  class edited extends Behaviour { // declares nothing, code changed in v2
    ready() { this.t = 0; }
    physicsProcess() { this.t += 1; }
    getState() { return { t: this.t }; }
    setState(s) { this.t = s.t; }
  }
  class ear extends Behaviour { // listens to its node in ready()
    ready() { this.heard = 0; this.tree.listen(this.node, 'ping', () => { this.heard += 1; this.node.props.lastEar = 'v1'; }); }
    getState() { return { heard: this.heard }; }
    setState(s) { this.heard = s.heard; }
  }
  return new Map(Object.entries({ counter, shaper, plain, edited, ear }));
};

const v2 = (old) => {
  class counter extends Behaviour { // the same shape (only its description differs): kept, now counts by ten
    static describe = { description: 'counts by ten now', state: { ...COUNT, description: 'how far it has counted' } };
    ready() { this.n = 0; }
    physicsProcess() { this.n += 10; }
    getState() { return { n: this.n }; }
    setState(s) { this.n = s.n; }
  }
  class shaper extends Behaviour { // its state gained a key: restarted
    static describe = { state: { ...COUNT, required: ['n', 'm'], properties: { n: { type: 'integer' }, m: { type: 'integer' } } } };
    ready() { this.n = 100; this.m = 0; }
    physicsProcess() { this.n += 1; this.m += 1; }
    getState() { return { n: this.n, m: this.m }; }
    setState(s) { this.n = s.n; this.m = s.m; }
  }
  class edited extends Behaviour {
    ready() { this.t = 0; }
    physicsProcess() { this.t += 2; }
    getState() { return { t: this.t }; }
    setState(s) { this.t = s.t; }
  }
  class ear extends Behaviour {
    ready() { this.heard = 0; this.tree.listen(this.node, 'ping', () => { this.heard += 1; this.node.props.lastEar = 'v2'; }); }
    getState() { return { heard: this.heard }; }
    setState(s) { this.heard = s.heard; }
  }
  // `plain` is the same source text as v1's (a fresh import makes a new class from the same text)
  const plain = eval(`(${String(old.get('plain'))})`);
  return new Map(Object.entries({ counter, shaper, plain, edited, ear }));
};

const DOC = { format: 'vrmxs', version: 1, id: 't', nodes: [
  { id: 'a', type: 'Node3D', behaviours: [{ use: 'counter' }, { use: 'shaper' }, { use: 'ear' }] },
  { id: 'b', type: 'Node3D', behaviours: [{ use: 'plain' }, { use: 'edited' }, { use: 'counter' }] },
] };

function world(classes) {
  const registry = m0Registry();
  declareProjectBehaviours(registry, classes);
  const tree = new SceneTree({ registry, behaviours: new Map(classes) }).instantiate(structuredClone(DOC));
  return { tree, registry };
}
const state = (tree, id, use) => tree.find(id).behaviours.find((b) => b.name === use).getState();

test('reloadPlan: keep when the declared state shape is unchanged (stateShape), restart when it changed; undeclared by code', () => {
  const a = v1(), b = v2(a);
  const plan = reloadPlan({ before: a, after: b, registry: m0Registry() });
  assert.deepEqual(Object.fromEntries([...plan].map(([k, v]) => [k, v.action])), { counter: 'keep', shaper: 'restart', plain: 'keep', edited: 'restart', ear: 'restart' });
  const gone = new Map(b); gone.delete('ear'); gone.set('fresh', class fresh extends Behaviour {});
  const p2 = reloadPlan({ before: a, after: gone, registry: m0Registry() });
  assert.equal(p2.get('ear').action, 'remove');
  assert.equal(p2.get('fresh').action, 'add');
  // declared on one side only: restart
  class counter extends Behaviour { getState() { return { n: 0 }; } }
  assert.equal(reloadPlan({ before: a, after: new Map([['counter', counter]]), registry: m0Registry() }).get('counter').action, 'restart');
  // a state that allows anything ({} or true) declares nothing, as W5's fingerprint reads it: changed code restarts
  class loose1 extends Behaviour { static describe = { state: {} }; physicsProcess() { this.x = 1; } }
  class loose2 extends Behaviour { static describe = { state: { description: 'anything' } }; physicsProcess() { this.x = 2; } }
  assert.equal(reloadPlan({ before: new Map([['loose', loose1]]), after: new Map([['loose', loose2]]), registry: m0Registry() }).get('loose').action, 'restart');
});

test('a swap keeps state across a reload when the shape is unchanged and restarts it otherwise, without restarting the scene', () => {
  const a = v1(), { tree, registry } = world(a);
  tree.run(30);
  const step = tree.clock.step;
  tree.emit(tree.find('a'), 'ping', {});
  assert.deepEqual(state(tree, 'a', 'ear'), { heard: 1 });
  const b = v2(a);
  const r = applyReload({ tree, before: a, after: b, registries: [registry] });
  assert.deepEqual({ kept: r.kept, restarted: r.restarted }, { kept: ['counter', 'plain'], restarted: ['ear', 'edited', 'shaper'] });
  assert.equal(r.instances, 6);
  assert.equal(tree.clock.step, step, 'the world goes on from the step it was on');
  // kept: the old state on the new code
  assert.deepEqual(state(tree, 'a', 'counter'), { n: 30 });
  assert.deepEqual(state(tree, 'b', 'plain'), { t: 30 });
  // restarted: the new code's own fresh state
  assert.deepEqual(state(tree, 'a', 'shaper'), { n: 100, m: 0 });
  assert.deepEqual(state(tree, 'b', 'edited'), { t: 0 });
  assert.deepEqual(state(tree, 'a', 'ear'), { heard: 0 });
  tree.run(2);
  assert.deepEqual(state(tree, 'a', 'counter'), { n: 50 }, 'the new code runs: ten a step');
  assert.deepEqual(state(tree, 'b', 'edited'), { t: 4 });
  // the old ear's listener went with it; the new one's is there, once
  tree.emit(tree.find('a'), 'ping', {});
  assert.deepEqual(state(tree, 'a', 'ear'), { heard: 1 });
  assert.equal(tree.find('a').props.lastEar, 'v2');
  // the order of a node's behaviours is its entries' order still
  assert.deepEqual(tree.find('b').behaviours.map((x) => x.name), ['plain', 'edited', 'counter']);
  assert.equal(registry.behaviours.get('counter').description, 'counts by ten now', 'the registry has the new declarations');
  assert.ok(tree.find('a').behaviours.every((x) => x.constructor === b.get(x.name)));
});

test('a reload that throws keeps the old code running, untouched: a ready() that throws, refused declarations', () => {
  const a = v1(), { tree, registry } = world(a);
  tree.run(5);
  const before = JSON.stringify(tree.getState());
  const olds = tree.all().map((n) => [...n.behaviours]);
  const broken = new Map(v2(a));
  broken.set('edited', class edited extends Behaviour { ready() { throw new Error('half written'); } });
  assert.throws(() => applyReload({ tree, before: a, after: broken, registries: [registry] }), /half written/);
  assert.deepEqual(tree.all().map((n) => n.behaviours), olds, 'every node has its old instances back');
  assert.equal(JSON.stringify(tree.getState()), before);
  assert.equal(registry.behaviours.get('counter').description, 'counts by one', 'the declarations from before');
  tree.emit(tree.find('a'), 'ping', {});
  assert.deepEqual(state(tree, 'a', 'ear'), { heard: 1 }, 'the old listener still hears, and only it (the new one\'s went)');
  assert.equal(tree.find('a').props.lastEar, 'v1');
  tree.run(1);
  assert.deepEqual(state(tree, 'a', 'counter'), { n: 6 }, 'the old code runs on');
  // declarations the registry refuses: nothing swapped
  const refused = new Map(v2(a));
  refused.set('counter', class counter extends Behaviour { static describe = { params: { x: { type: 'nope' } } }; });
  assert.throws(() => applyReload({ tree, before: a, after: refused, registries: [registry] }), /can't be declared/);
  assert.deepEqual(tree.all().map((n) => n.behaviours), olds);
});

test('an engine class installed under a name stays: only the module\'s own classes are swapped', () => {
  const a = v1(), { tree, registry } = world(a);
  class engineCounter extends Behaviour { getState() { return null; } }
  tree.behaviourClasses.set('counter', engineCounter); // as an install* does on the world's map
  tree.find('a').behaviours[0] = new engineCounter(tree.find('a'), tree.find('a').behaviourEntries[0]);
  const oldCounterB = tree.find('b').behaviours[2];
  const r = swapBehaviours(tree, a, v2(a), reloadPlan({ before: a, after: v2(a), registry }));
  assert.ok(!r.kept.includes('counter') && !r.restarted.includes('counter'), 'counter isn\'t the module\'s in this world');
  assert.equal(tree.behaviourClasses.get('counter'), engineCounter);
  assert.ok(tree.find('a').behaviours[0] instanceof engineCounter);
  assert.equal(tree.find('b').behaviours[2], oldCounterB, 'no instance of that name is touched');
  assert.ok(r.restarted.includes('shaper'), 'the others are');
});

test('markRecording marks a play\'s input recording, which the input service then refuses to replay', () => {
  const a = v1(), { tree } = world(a);
  const input = installInput(tree);
  input.record(); tree.run(3);
  markRecording({ input }, { step: 3, kept: ['counter'], restarted: [] });
  const rec = JSON.parse(JSON.stringify(input.stop()));
  assert.deepEqual(rec.reloaded, [{ step: 3, kept: ['counter'], restarted: [] }]);
  const again = world(a), input2 = installInput(again.tree);
  assert.throws(() => input2.replay(rec), (e) => e.code === 'reloaded');
});

// ---------------------------------------------------------------- the watch loop, through the fresh import

const linkedFiles = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-reload-'));
  behavioursImporter(dir); // @vrmxg/core for the modules linked in it
  let n = 0;
  const url = (_ref, src) => { const f = path.join(fs.realpathSync(dir), `m${n++}.mjs`); fs.writeFileSync(f, src); return pathToFileURL(f).href; };
  return { url, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
};
const memoryProject = (files) => ({ files, bytes: async (ref) => { if (!(ref in files)) throw new Error(`${ref}: 404`); return new TextEncoder().encode(files[ref]); } });
const MOD = (by, shape = "{ type: 'object', properties: { n: { type: 'integer' } } }") => `import { Behaviour } from '@vrmxg/core';
export * from './lib/extra.js';
export class counter extends Behaviour {
  static describe = { state: ${shape} };
  ready() { this.n = 0; }
  physicsProcess() { this.n += ${by}; }
  getState() { return { n: this.n }; }
  setState(s) { this.n = s.n; }
}
`;
const EXTRA = (v) => `import { Behaviour } from '@vrmxg/core';\nexport class extra extends Behaviour { ready() { this.v = ${v}; } getState() { return { v: this.v }; } setState(s) { this.v = s.v; } }\n`;

test('the watcher reloads what changed through the fresh import, keeps or restarts, reports a throw and keeps the old code, and marks the recording', async () => {
  const linked = linkedFiles();
  try {
    const files = { 'game/behaviours.js': MOD(1), 'game/lib/extra.js': EXTRA(1) };
    const project = memoryProject(files);
    const load = freshBehaviours(project, { url: linked.url });
    const first = await load('game/behaviours.js');
    assert.deepEqual([...first.sources.keys()].sort(), ['game/behaviours.js', 'game/lib/extra.js']);
    const registry = m0Registry(), editorRegistry = m0Registry();
    declareProjectBehaviours(registry, first.classes);
    const tree = new SceneTree({ registry, behaviours: new Map(first.classes) }).instantiate({ format: 'vrmxs', version: 1, id: 't', nodes: [{ id: 'a', type: 'Node3D', behaviours: [{ use: 'counter' }, { use: 'extra' }] }] });
    const input = installInput(tree); input.record();
    const worldNow = { tree, input };
    let watched = null, hear = null;
    const reports = [];
    const hot = new HotReload({
      ref: 'game/behaviours.js', classes: first.classes, sources: first.sources, load, settle: 0,
      watch: async (paths) => { watched = [...paths].sort(); }, unwatch: async () => { watched = null; },
      onChanged: (fn) => { hear = fn; return () => { hear = null; }; },
      target: () => ({ tree, world: worldNow, registries: [registry, editorRegistry] }), report: (r) => reports.push(r),
    });
    assert.deepEqual(await hot.start(), ['game/behaviours.js', 'game/lib/extra.js']);
    assert.deepEqual(watched, ['game/behaviours.js', 'game/lib/extra.js'], 'the module and what it imports');
    tree.run(10);

    // an edit: counts by five now, same declared shape → kept
    files['game/behaviours.js'] = MOD(5);
    hear(['game/behaviours.js']); await hot.reload();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].ok, true);
    assert.deepEqual({ kept: reports[0].kept, restarted: reports[0].restarted, step: reports[0].step }, { kept: ['counter', 'extra'], restarted: [], step: 10 }, 'extra\'s text is unchanged, so it keeps its state too');
    tree.run(2);
    assert.deepEqual(tree.find('a').behaviours[0].getState(), { n: 20 });
    assert.equal(editorRegistry.behaviours.get('counter').source, 'project', 'the editor\'s registry has the declarations too');

    // a submodule edit reloads too: extra's code changed and it declares nothing → restarted
    files['game/lib/extra.js'] = EXTRA(7);
    hear(['game/lib/extra.js']); await hot.reload();
    assert.deepEqual({ kept: reports[1].kept, restarted: reports[1].restarted }, { kept: ['counter'], restarted: ['extra'] });
    assert.deepEqual(tree.find('a').behaviours[1].getState(), { v: 7 });

    // written again unchanged: nothing reloads, nothing is reported
    hear(['game/behaviours.js']); await hot.reload();
    assert.equal(reports.length, 2);

    // a throwing edit: reported, and the code from before runs on
    files['game/behaviours.js'] = "import { Behaviour } from '@vrmxg/core';\nthrow new Error('broken on purpose');\n";
    hear(['game/behaviours.js']); await hot.reload();
    assert.equal(reports[2].ok, false);
    assert.match(reports[2].error, /broken on purpose/);
    tree.run(1);
    assert.deepEqual(tree.find('a').behaviours[0].getState(), { n: 25 }, 'still five a step');
    // a syntax error: the same
    files['game/behaviours.js'] = 'export class counter extends {';
    hear(['game/behaviours.js']); await hot.reload();
    assert.equal(reports[3].ok, false);

    // fixed, with a new state shape → restarted
    files['game/behaviours.js'] = MOD(3, "{ type: 'object', properties: { n: { type: 'integer' }, m: { type: 'integer' } } }");
    hear(['game/behaviours.js']); await hot.reload();
    assert.equal(reports[4].ok, true);
    assert.deepEqual(reports[4].restarted, ['counter']);
    assert.equal(reports[4].n, 3, 'the third reload that took');
    assert.deepEqual(tree.find('a').behaviours[0].getState(), { n: 0 });

    // a change to a file it doesn't watch: nothing
    hear(['level.vrmxs']);
    assert.deepEqual(input.recording.reloaded.map((e) => e.step), [10, 12, 13], 'the recording says where each reload happened');
    await hot.stop();
    assert.equal(watched, null);
    assert.equal(hear, null);
  } finally { linked.done(); }
});
