// M6 W0 (AB-T-0644): the Morning Rush's own behaviours declare themselves (content/sample/game/behaviours.js, a static
// `describe` on each class). Loaded as a project loads them, they sit in the registry beside the engine's: tableZone's
// params in the level validate against its schema, a scene connection from one of their signals validates (and fails
// without the declarations), and MCP's describe lists them. With vrmxa-core beside the repository (so not on CI), the
// game's recorded sessions (acceptance/results/m5-rush/) replay on the current sources to the hashes they were recorded
// with, every signal a project behaviour declares is emitted in them, and every state it keeps fits its declared schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours, describedBehaviours, stateShape } from '@vrmxg/registry';
import { createValidator, describeBehaviour, parse, schemaChecker } from '@vrmxg/scene';
import { createHandlers } from '../../engine/packages/mcp/src/tools.js';
import { available } from '../../engine/packages/character/test/fixtures.mjs';
import * as rushModule from '../../content/sample/game/behaviours.js';

const root = path.resolve(import.meta.dirname, '../..'), sample = path.join(root, 'content/sample');
const read = (ref) => fs.readFileSync(path.join(sample, ref), 'utf8');
const game = JSON.parse(read('game/game.json'));
const DECLARED = ['pressToStart', 'tableZone'];

/** The registry as a project that loads the Morning Rush has it. */
function rushRegistry() {
  const reg = m0Registry();
  assert.deepEqual(declareProjectBehaviours(reg, rushModule).sort(), DECLARED);
  return reg;
}

test('the game\'s behaviours module is the one game.json names, and only its own two behaviours declare themselves', () => {
  assert.equal(game.behaviours, 'game/behaviours.js');
  assert.deepEqual([...describedBehaviours(rushModule).keys()].sort(), DECLARED, 'wander, greet and switchedBy are the engine\'s: no describe');
});

test('tableZone\'s params in the level validate against its schema, and wrong ones don\'t', () => {
  const reg = rushRegistry(), b = reg.behaviours.get('tableZone');
  assert.equal(b.source, 'project');
  assert.deepEqual(b.on, ['Area']);
  assert.ok(b.params.customer.nodeRef && b.params.dialogue.nodeRef, 'customer and dialogue are node references');
  const problems = schemaChecker(describeBehaviour(reg, 'tableZone').schema);
  const level = parse(read('game/level.vrmxs'));
  const zones = level.nodes.flatMap((n) => (n.behaviours ?? []).filter((e) => e.use === 'tableZone'));
  assert.equal(zones.length, 3, 'one per table');
  for (const z of zones) assert.deepEqual(problems(z), [], JSON.stringify(z));
  for (const wrong of [{ points: -1 }, { points: 'ten' }, { customer: 7 }, { item: '' }]) assert.notDeepEqual(problems({ ...zones[0], ...wrong }), [], `${JSON.stringify(wrong)} is refused`);
  // the whole level, with the declarations: no warning that tableZone is unknown
  const r = createValidator(reg).check(level, { prefabs: new Map() });
  assert.ok(r.ok, r.errors.join('; '));
  assert.ok(!r.warnings.some((w) => /tableZone/.test(w)), r.warnings.join('; '));
  // and a node whose tableZone has a wrong param fails the scene's own check
  const bad = structuredClone(level);
  bad.nodes.find((n) => n.id === 'table-1').behaviours[0].points = 'ten';
  assert.ok(createValidator(reg).check(bad, { prefabs: new Map() }).errors.some((e) => /points/.test(e)));
});

test('a connection from a declared project signal validates; without the declarations it doesn\'t', () => {
  const level = parse(read('game/level.vrmxs'));
  level.connections.push({ from: 'table-1', signal: 'served', to: 'ambience', call: 'play' });
  const r = createValidator(rushRegistry()).check(level, { prefabs: new Map() });
  assert.ok(r.ok, r.errors.join('; '));
  const without = createValidator(m0Registry()).check(level, { prefabs: new Map() });
  assert.ok(without.errors.some((e) => /table-1" has no signal "served"/.test(e)), without.errors.join('; '));
  // one validator, the project declared after it was made (the editor's session): it compiles again
  const late = m0Registry(), v = createValidator(late);
  assert.equal(v.check(level, { prefabs: new Map() }).ok, false);
  declareProjectBehaviours(late, rushModule);
  assert.ok(v.check(level, { prefabs: new Map() }).ok);
});

test('MCP\'s describe lists the project\'s behaviours, and describes one with its signals and state', () => {
  const h = createHandlers(rushRegistry(), { doc: () => null, prefabs: () => new Map() });
  const list = h.describe({});
  for (const name of DECLARED) assert.ok(list.behaviours.some((b) => b.behaviour === name && b.project === true), `${name} listed as the project's`);
  assert.ok(list.behaviours.some((b) => b.behaviour === 'wander' && !b.project), 'the engine\'s stay the engine\'s');
  const d = h.describe({ behaviour: 'tableZone' });
  assert.equal(d.project, true);
  assert.deepEqual(Object.keys(d.signals), ['served']);
  assert.deepEqual(Object.keys(d.signals.served.args.properties).sort(), ['customer', 'right']);
  assert.deepEqual(d.state.required, ['inside', 'next', 'done']);
  assert.equal(d.propMeta.customer.nodeRef, true);
  assert.deepEqual(h.describe({ behaviour: 'pressToStart' }).state, rushModule.pressToStart.describe.state);
});

test('the shapes of the states they declare: what a save\'s fingerprint (M6 W5) hashes', () => {
  const reg = rushRegistry();
  assert.equal(stateShape(reg.behaviours.get('pressToStart')), '{"type":"null"}');
  assert.equal(stateShape(reg.behaviours.get('tableZone')), '{"additionalProperties":false,"properties":{"done":{"type":"boolean"},"inside":{"type":"boolean"},"next":{"minimum":0,"type":"integer"}},"required":["done","inside","next"],"type":"object"}');
  assert.equal(stateShape(reg.behaviours.get('wander')), null, 'the engine\'s wander hasn\'t declared its state');
});

const skipPlay = !available('core') ? 'needs vrmxa-core beside the repository' : false;
test('the recorded sessions replay to their hashes, emit every declared signal, and keep the declared state', { skip: skipPlay, timeout: 600000 }, async () => {
  const { installPortableMath } = await import('@vrmxg/dmath');
  const { loadRapier } = await import('@vrmxg/physics');
  const { folderReader } = await import('@vrmxg/bundle/node');
  const { gameScenes, worldLoader, freeWorld } = await import('../../apps/game/src/world.js');
  const { replaySession, firstDifference } = await import('../../apps/game/src/session.js');
  const { vrmxaCore, PATHS } = await import('../../engine/packages/character/test/fixtures.mjs');
  installPortableMath();
  const core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const reg = rushRegistry();
  const stateOf = new Map(DECLARED.map((n) => [n, schemaChecker(reg.behaviours.get(n).state)]));
  // each declared behaviour's class, its getState checked against its declared state on every call (the snapshot
  // hashes every step); a subclass, so what it keeps and how it runs are the class's own, given the class's describe
  // (a subclass doesn't inherit one), so the world declares it as the game does
  const bad = [], behaviours = new Map(Object.entries(rushModule).filter(([, v]) => typeof v === 'function').map(([name, C]) => {
    const check = stateOf.get(name);
    if (!check) return [name, C];
    return [name, class extends C { static describe = C.describe; getState() { const s = super.getState(), p = check(s); if (p.length && bad.length < 5) bad.push(`${name}: ${JSON.stringify(s)} (${p.join('; ')})`); return s; } }];
  }));
  // which declared signals the project's behaviours emit: every tree the game builds, its emit watched
  const emitted = new Map(DECLARED.map((n) => [n, new Set()]));
  const scenes = gameScenes(folderReader(sample).read, game), docs = await scenes.documents();
  const inner = worldLoader({ R: await loadRapier(), scenes, behaviours, actions: game.input.actions, vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
  const load = async (req) => {
    const tree = await inner(req), emit = tree.emit.bind(tree);
    tree.emit = (node, signal, payload) => {
      for (const b of node.behaviours ?? []) if (reg.behaviours.get(b.name)?.signals[signal] && emitted.has(b.name)) emitted.get(b.name).add(signal);
      return emit(node, signal, payload);
    };
    return tree;
  };
  for (const name of ['win', 'lose']) {
    const log = JSON.parse(fs.readFileSync(path.join(root, 'acceptance/results/m5-rush', `${name}.json`), 'utf8'));
    // the log names the build it was recorded on; it is replayed here on the sources that build was made from, now
    // with the declarations in them: the same hash after every step is what says they changed nothing that runs
    const replay = await replaySession(log, { digest: log.game.digest, load, unload: freeWorld, scenes: docs.scenes, prefabs: docs.prefabs });
    const at = firstDifference(replay, log.hashes);
    assert.ok(at < 0 && replay.length === log.hashes.length, `${name}: first difference at step index ${at}: log ${JSON.stringify(log.hashes[at])}, replay ${JSON.stringify(replay[at])}`);
  }
  assert.deepEqual(bad, [], 'every state a declared behaviour kept fits its declared schema');
  const never = DECLARED.flatMap((n) => Object.keys(reg.behaviours.get(n).signals).filter((s) => !emitted.get(n).has(s)).map((s) => `${n}.${s}`));
  assert.deepEqual(never, [], 'a declared signal that the recorded sessions never emit');
});
