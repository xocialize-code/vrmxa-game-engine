// The save-compatibility fingerprint (M6 W5, AB-T-0631): what changes it and what doesn't, the reasons a save is
// refused, and that an exporter with an importer and one without agree until a behaviour declares its state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportBuild, parseManifest, compatProblems, compatFingerprint, engineCompat, checkCompat, declaredState, behavioursUsed, stableJson, runtimeTable, serializeRuntime, RUNTIME_FILE, COMPAT_VERSION } from '@vrmxg/bundle';
import { moduleExports } from '../src/modules.js';
import { project, memory, enc, GAME } from './helpers.mjs';

// a level that attaches the project's patrol and the engine's brain
const LEVEL = { format: 'vrmxs', version: 1, id: 'level', assets: [{ id: 'door', type: 'vrmxs', ref: 'prefabs/door.vrmxs' }], nodes: [
  { id: 'guard', type: 'Character', behaviours: [{ use: 'brain', preset: 'brains/guard.json' }] },
  { id: 'walker', type: 'Character', behaviours: [{ use: 'patrol', radius: 3 }] },
], connections: [{ from: 'guard', signal: 'ready', to: 'guard', action: 'say', args: { clip: 'voice/hello.wav' } }] };
const BEHAVIOURS = "import { Behaviour } from '@vrmxg/core';\nimport { twice } from './lib/maths.js';\nexport class patrol extends Behaviour { ready() { this.n = twice(2); } getState() { return { n: this.n }; } }\n";
const ENGINE = engineCompat({ snapshot: 1, dmath: '0.1.0', maths: 'abcdef0123456789', actions: { move_x: { type: 'axis', bindings: [] }, jump: { type: 'button', bindings: [] } }, registry: { behaviours: new Map([['brain', { name: 'brain' }], ['greet', { name: 'greet', state: { type: 'object' } }]]) } });

const game = (over = {}) => ({ ...GAME, input: { actions: { move_x: { type: 'axis', bindings: [{ key: 'KeyD', value: 1 }] }, jump: { type: 'button', bindings: [{ key: 'Space' }] } } }, ...over });
const proj = (over = {}, g = game()) => project({ 'game.json': JSON.stringify(g), 'level.vrmxs': JSON.stringify(LEVEL), 'behaviours.js': BEHAVIOURS, ...over });
const rt = ({ engine = ENGINE, version = '1.0.0' } = {}) => {
  const files = { 'index.html': '<!doctype html>\n', 'assets/app.js': 'console.log(1);\n' };
  const table = runtimeTable({ name: 'test-runtime', runtimeVersion: version, engine, files: Object.entries(files).map(([path, v]) => ({ path, bytes: enc(v), licence: 'Ours' })) });
  return memory({ ...files, [RUNTIME_FILE]: serializeRuntime(table) });
};
/** a stand-in for importing behaviours.js: classes with or without `static describe` */
const importer = (classes) => async () => classes;
const fp = async (p = proj(), r = rt(), o = {}) => (await exportBuild({ project: p, runtime: r, ...o })).compat;

test('the manifest carries the fingerprint, and its digest is still the whole build\'s', async () => {
  const r = await exportBuild({ project: proj(), runtime: rt() });
  const m = parseManifest(r.text);
  assert.deepEqual(m.compat, r.compat);
  assert.equal(checkCompat(m.compat), m.compat);
  assert.equal(m.compat.version, COMPAT_VERSION);
  assert.deepEqual(Object.keys(m.compat.scenes), ['level.vrmxs', 'prefabs/door.vrmxs'], 'every scene and prefab, by ref');
  assert.deepEqual(Object.keys(m.compat.behaviours), ['brain', 'patrol'], 'every behaviour the scenes attach');
  assert.match(m.compat.behaviours.patrol, /^code:[0-9a-f]{64}$/, 'the project\'s, undeclared: its code');
  assert.equal(m.compat.behaviours.brain, 'runtime:1.0.0', 'the engine\'s, undeclared: the runtime\'s version');
  assert.notEqual(m.compat.digest, m.digest);
  assert.throws(() => parseManifest(r.text.replace(`"digest": "${m.compat.digest}"`, '"digest": "nope"')), /"compat" is not a save-compatibility fingerprint/);
});

test('a texture, a sound or the game\'s release changes the build\'s digest and not its fingerprint', async () => {
  const base = { 'props/door.glb': glb() };
  const a = await exportBuild({ project: proj(base), runtime: rt() });
  for (const over of [{ 'props/door.glb': glb({ image: [7, 7, 7, 7, 7, 7, 7] }) }, { 'voice/hello.wav': new Uint8Array([82, 73, 70, 70, 9, 9]) }, { 'game.json': JSON.stringify(game({ release: '1.0.1' })) }]) {
    const b = await exportBuild({ project: proj({ ...base, ...over }), runtime: rt() });
    assert.notEqual(b.manifest.digest, a.manifest.digest, Object.keys(over)[0]);
    assert.deepEqual(b.compat, a.compat, Object.keys(over)[0]);
    assert.deepEqual(compatProblems(a.compat, b.compat), []);
  }
  // the same scene written with other spacing and key order is the same scene
  const spaced = await fp(proj({ ...base, 'level.vrmxs': JSON.stringify({ nodes: LEVEL.nodes, ...LEVEL }, null, 2) }));
  assert.equal(spaced.digest, a.compat.digest);
});

test('a changed scene or prefab refuses the save and names it', async () => {
  const a = await fp();
  const level = structuredClone(LEVEL); level.nodes[1].behaviours[0].radius = 4;
  const b = await fp(proj({ 'level.vrmxs': JSON.stringify(level) }));
  assert.deepEqual(compatProblems(a, b).map((p) => [p.part, p.items, p.text]), [['scenes', ['level.vrmxs'], 'the scene level.vrmxs changed']]);
  const c = await fp(proj({ 'prefabs/door.vrmxs': JSON.stringify({ format: 'vrmxs', version: 1, id: 'door', assets: [{ id: 'panel', type: 'glb', ref: 'props/door.glb' }], nodes: [{ id: 'hinge', type: 'Node3D' }] }) }));
  assert.deepEqual(compatProblems(a, c).map((p) => p.text), ['the scene prefabs/door.vrmxs changed'], 'a prefab counts as a scene');
});

test('undeclared, a behaviour counts by its code: any change to the module or what it imports refuses', async () => {
  const a = await fp();
  const b = await fp(proj({ 'lib/maths.js': 'export const twice = (n) => n + n;\n' }));
  const [p] = compatProblems(a, b);
  assert.equal(p.part, 'behaviours');
  assert.deepEqual(p.items, ['patrol']);
  assert.match(p.text, /the code of the behaviour patrol changed \(it declares no state, so any change to its code counts\)/);
  // with the module imported and no describe, the fingerprint is the one an exporter without an importer makes
  const patrol = class patrol {};
  assert.deepEqual(await fp(proj(), rt(), { importBehaviours: importer({ patrol }) }), a, 'importing changes nothing until something is declared');
});

test('declared, a behaviour counts by its state: its code can change, its state shape can\'t', async () => {
  const declared = (state) => importer({ patrol: class patrol { static describe = { params: {}, state }; } });
  const STATE = { type: 'object', properties: { n: { type: 'number' } } };
  const a = await fp(proj(), rt(), { importBehaviours: declared(STATE) });
  assert.match(a.behaviours.patrol, /^state:/);
  const code = await fp(proj({ 'lib/maths.js': 'export const twice = (n) => n + n;\n' }), rt(), { importBehaviours: declared(STATE) });
  assert.deepEqual(compatProblems(a, code), [], 'the code changed, the declared state didn\'t');
  // the same schema written in another key order is the same state
  assert.equal((await fp(proj(), rt(), { importBehaviours: declared({ properties: { n: { type: 'number' } }, type: 'object' }) })).digest, a.digest);
  const shape = await fp(proj(), rt(), { importBehaviours: declared({ type: 'object', properties: { n: { type: 'number' }, wait: { type: 'integer' } } }) });
  assert.deepEqual(compatProblems(a, shape).map((p) => [p.part, p.items, p.text]), [['behaviours', ['patrol'], 'the state the behaviour patrol keeps changed']]);
  // a schema that allows anything declares nothing: the behaviour counts by its code
  for (const anything of [true, {}, { description: 'whatever it keeps', title: 'state' }]) {
    const c = await fp(proj(), rt(), { importBehaviours: declared(anything) });
    assert.match(c.behaviours.patrol, /^code:/, JSON.stringify(anything));
  }
  assert.match((await fp(proj(), rt(), { importBehaviours: declared(false) })).behaviours.patrol, /^state:/, 'false (keeps nothing) is a declaration');
  // `describe` may be a function too (static describe() { … })
  const fn = await fp(proj(), rt(), { importBehaviours: importer({ patrol: class patrol { static describe() { return { state: STATE }; } } }) });
  assert.equal(fn.digest, a.digest);
});

test('an engine behaviour counts by the state its registry entry declares, and undeclared by the runtime\'s version', async () => {
  const level = structuredClone(LEVEL); level.nodes[0].behaviours.push({ use: 'greet' });
  const p = proj({ 'level.vrmxs': JSON.stringify(level) });
  const a = await fp(p);
  assert.match(a.behaviours.greet, /^engine:[0-9a-f]{64}$/);
  assert.equal(a.behaviours.brain, 'runtime:1.0.0');
  const next = await fp(p, rt({ version: '1.0.1' }));
  assert.deepEqual(compatProblems(a, next).map((x) => [x.part, x.items]), [['behaviours', ['brain']], ['engine', []]], 'a new runtime: the undeclared engine behaviour refuses, the declared one doesn\'t, and the engine part counts the runtime\'s version');
  const greet = await fp(p, rt({ engine: { ...ENGINE, behaviours: { ...ENGINE.behaviours, greet: 'f'.repeat(64) } } }));
  assert.deepEqual(compatProblems(a, greet).map((x) => x.text), ['the state the behaviour greet keeps changed']);
});

test('the action map counts by its actions\' names and types, not its bindings', async () => {
  const a = await fp();
  const rebound = await fp(proj({}, game({ input: { actions: { move_x: { type: 'axis', bindings: [{ key: 'KeyL', value: 1 }] }, jump: { type: 'button', bindings: [{ key: 'KeyJ' }] } } } })));
  assert.equal(rebound.digest, a.digest, 'other keys for the same actions');
  // the same actions in another order: the snapshot's axes and buttons follow the map's order, so a held button would
  // be restored into another one
  const swapped = await fp(proj({}, game({ input: { actions: { jump: { type: 'button', bindings: [] }, move_x: { type: 'axis', bindings: [] } } } })));
  assert.deepEqual(compatProblems(a, swapped).map((p) => p.part), ['input'], 'reordered actions refuse');
  const two = (order) => fp(proj({}, game({ input: { actions: Object.fromEntries(order.map((n) => [n, { type: 'button', bindings: [] }])) } })));
  assert.deepEqual(compatProblems(await two(['jump', 'run']), await two(['run', 'jump'])).map((p) => p.part), ['input'], 'jump and run swapped refuse');
  const more = await fp(proj({}, game({ input: { actions: { move_x: { type: 'axis', bindings: [] }, jump: { type: 'button', bindings: [] }, crouch: { type: 'button', bindings: [] } } } })));
  assert.deepEqual(compatProblems(a, more).map((p) => [p.part, p.text]), [['input', 'the game\'s controls changed (its action map\'s actions or their order)']]);
  // a game on the engine's default map: the runtime's map counts
  const def = await fp(proj({}, game({ input: undefined })));
  const def2 = await fp(proj({}, game({ input: undefined })), rt({ engine: { ...ENGINE, actions: '0'.repeat(64) } }));
  assert.deepEqual(compatProblems(def, def2).map((p) => p.part), ['input']);
  assert.equal(def.parts.input, a.parts.input, 'the default map spelt out in game.json is the default map');
  // an action map in a file of its own counts the same as one written in game.json
  const licences = `${new TextDecoder().decode(await project().read('LICENCES.md'))}| \`input.json\` | Ours | Controls |\n`;
  const file = await fp(proj({ 'input.json': JSON.stringify({ actions: { move_x: { type: 'axis', bindings: [] }, jump: { type: 'button', bindings: [] } } }), 'LICENCES.md': licences }, game({ input: 'input.json' })));
  assert.equal(file.parts.input, a.parts.input);
});

test('the engine part: the snapshot format, the dmath version and the maths; a runtime that doesn\'t say counts by its version', async () => {
  const a = await fp();
  for (const over of [{ snapshot: 2 }, { dmath: '0.2.0' }, { maths: '0123456789abcdef' }]) {
    const b = await fp(proj(), rt({ engine: { ...ENGINE, ...over } }));
    assert.deepEqual(compatProblems(a, b).map((p) => p.part), ['engine'], Object.keys(over)[0]);
    assert.equal(compatProblems(a, b)[0].text, 'the engine changed (a new version of it)');
  }
  // the runtime's version is in the engine part even when the table says what the engine is (review of PR 51): engine
  // node types don't declare their state yet, and the snapshot format doesn't move when one changes what it keeps
  const newer = await fp(proj(), rt({ version: '1.0.1' }));
  assert.ok(compatProblems(a, newer).some((p) => p.part === 'engine'), 'a new runtime of the same snapshot format and maths still refuses');
  const bare = await fp(proj(), rt({ engine: null }));
  const bare2 = await fp(proj(), rt({ engine: null, version: '1.0.1' }));
  assert.deepEqual(compatProblems(bare, bare2).map((p) => p.part).sort(), ['behaviours', 'engine'].sort(), 'no engine table: every new runtime refuses (strict)');
});

test('compatProblems: a fingerprint of another version is refused as such; reasons come in their parts\' order', () => {
  const base = compatFingerprint({ scenes: [['a.vrmxs', { n: 1 }]], behaviours: { code: null, names: null, exports: null }, actions: null, runtime: { version: '1', engine: ENGINE } });
  assert.deepEqual(compatProblems(base, base), []);
  assert.deepEqual(compatProblems({ ...base, version: 2 }, base).map((p) => p.part), ['version']);
  const other = compatFingerprint({ scenes: [['a.vrmxs', { n: 2 }], ['b.vrmxs', {}]], behaviours: { code: null, names: null, exports: null }, actions: { x: { type: 'button' } }, runtime: { version: '1', engine: { ...ENGINE, snapshot: 9 } } });
  const ps = compatProblems(base, other);
  assert.deepEqual(ps.map((p) => p.part), ['scenes', 'input', 'engine']);
  assert.equal(ps[0].text, 'the scene a.vrmxs changed; b.vrmxs is new');
});

test('the pieces: stable JSON, declared state, the behaviours a document attaches, a module\'s exports', () => {
  assert.equal(stableJson({ b: 1, a: [{ d: 2, c: null }] }), '{"a":[{"c":null,"d":2}],"b":1}');
  assert.equal(declaredState(class {}), undefined);
  assert.deepEqual(declaredState(class { static describe = { state: { type: 'object' } }; }), { type: 'object' });
  assert.deepEqual(declaredState({ name: 'greet', state: { type: 'null' } }), { type: 'null' }, 'a registry entry');
  assert.equal(declaredState({ name: 'brain' }), undefined);
  assert.equal(declaredState({ name: 'x', state: true }), undefined, 'true allows anything');
  assert.equal(declaredState(class { static describe = { state: { $comment: 'later' } }; }), undefined, 'annotations only');
  assert.deepEqual([...behavioursUsed({ nodes: [{ behaviours: [{ use: 'a' }] }, { overrides: { 'door/hinge': { behaviours: [{ use: 'b' }] } } }] })].sort(), ['a', 'b']);
  assert.deepEqual(moduleExports("export * from '../b.js';\nexport class p {}\nexport { q as r } from './c.js';\nexport * as ns from './d.js';"), { names: ['p', 'r', 'ns'], stars: ['../b.js'] });
});

test('`export * from` a project module counts its names as the project\'s behaviours', async () => {
  const g = game({ behaviours: 'game/behaviours.js' });
  const p = proj({ 'game/behaviours.js': "export * from '../behaviours.js';\nexport class extra {}\n", 'LICENCES.md': `${new TextDecoder().decode(await project().read('LICENCES.md'))}| \`game/behaviours.js\` | Ours | Game behaviours |\n` }, g);
  const a = await fp(p);
  assert.match(a.behaviours.patrol, /^code:/, 'patrol comes through export * and is the project\'s');
  assert.equal(a.behaviours.brain, 'runtime:1.0.0');
});

/** A GLB of `nodes` (names) with one embedded image, as an exporter writes one. */
function glb({ nodes = ['root'], image = [1, 2, 3, 4, 5], colour = [1, 1, 1, 1] } = {}) {
  const img = Uint8Array.from(image), pos = new Uint8Array(36);
  const bin = new Uint8Array(Math.ceil((pos.length + img.length) / 4) * 4); bin.set(pos, 0); bin.set(img, pos.length);
  const json = { asset: { version: '2.0', generator: 'test' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes: nodes.map((name) => ({ name, mesh: 0 })),
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: colour, baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }], images: [{ bufferView: 1, mimeType: 'image/png' }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: img.length }], buffers: [{ byteLength: bin.length }] };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const jpad = new Uint8Array(Math.ceil(js.length / 4) * 4).fill(0x20); jpad.set(js); js = jpad;
  const out = new Uint8Array(12 + 8 + js.length + 8 + bin.length), dv = new DataView(out.buffer);
  out.set([0x67, 0x6c, 0x54, 0x46]); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); out.set(bin, 28 + js.length);
  return out;
}

test('assets: a model counts by its structure, an item or a character whole', async () => {
  const a = await fp(proj({ 'props/door.glb': glb() }));
  assert.match(a.assets['props/door.glb'], /^gltf:[0-9a-f]{64}$/);
  // its texture re-encoded (another length: every buffer view after it moves) and another colour: the same structure
  const b = await fp(proj({ 'props/door.glb': glb({ image: [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9], colour: [1, 0, 0, 1] }) }));
  assert.equal(b.parts.assets, a.parts.assets, 'a texture and a colour are how it looks');
  assert.equal(b.digest, a.digest);
  const c = await fp(proj({ 'props/door.glb': glb({ nodes: ['root', 'hinge'] }) }));
  assert.deepEqual(compatProblems(a, c).map((p) => [p.part, p.text]), [['assets', 'the model props/door.glb changed']]);
  // a file that isn't a glTF it can read counts whole
  assert.match((await fp()).assets['props/door.glb'], /^file:/);
  // an item and a character: whole files
  const licences = `${new TextDecoder().decode(await project().read('LICENCES.md'))}| \`items/box.vrmxi\` | Ours | |\n| \`characters/hero.vrmxa\` | Ours | |\n`;
  const level = structuredClone(LEVEL); level.assets.push({ id: 'box', type: 'vrmxi', ref: 'items/box.vrmxi' }, { id: 'hero', type: 'vrmxa', ref: 'characters/hero.vrmxa' });
  const withItem = (box, hero) => proj({ 'LICENCES.md': licences, 'level.vrmxs': JSON.stringify(level), 'items/box.vrmxi': enc(box), 'characters/hero.vrmxa': enc(hero) });
  const i1 = await fp(withItem('PK box 1', 'PK hero 1'));
  assert.match(i1.assets['items/box.vrmxi'], /^file:/);
  assert.deepEqual(compatProblems(i1, await fp(withItem('PK box 2', 'PK hero 1'))).map((p) => p.text), ['the item items/box.vrmxi changed']);
  assert.deepEqual(compatProblems(i1, await fp(withItem('PK box 1', 'PK hero 2'))).map((p) => p.text), ['the character characters/hero.vrmxa changed']);
});

test('assets: a brain counts whole, the animation set by its clips\' names and timing, not their bytes', async () => {
  const a = await fp();
  assert.match(a.assets['brains/guard.json'], /^json:/);
  assert.match(a.assets['animations.json'], /^json:/);
  assert.equal(a.assets['voice/hello.timings.json'], undefined, 'a document no restore reads');
  const brain = await fp(proj({ 'brains/guard.json': JSON.stringify({ format: 'vrmxg-brain', tree: { type: 'sequence', children: [{ type: 'action', do: 'wait' }] } }) }));
  assert.deepEqual(compatProblems(a, brain).map((p) => p.text), ['the document brains/guard.json changed']);
  const clipBytes = await fp(proj({ 'animations.json': JSON.stringify({ clips: [{ name: 'idle', file: 'animations/clips/idle.vrma', sha256: 'y' }] }), 'animations/clips/idle.vrma': new Uint8Array([9, 9]) }));
  assert.equal(clipBytes.parts.assets, a.parts.assets, 'a clip re-exported (its bytes and hash) is the same clip');
  const renamed = await fp(proj({ 'animations.json': JSON.stringify({ clips: [{ name: 'rest', file: 'animations/clips/idle.vrma', sha256: 'x' }] }) }));
  assert.deepEqual(compatProblems(a, renamed).map((p) => p.text), ['the document animations.json changed']);
});

test('Node\'s exporter imports the project\'s behaviours for what they declare, and an edit is never read from the cache', async () => {
  const { exportToFolder } = await import('@vrmxg/bundle/node');
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-compat-')), dir = path.join(tmp, 'project'), rdir = path.join(tmp, 'runtime');
  try {
    const write = (root, reader) => { for (const f of reader.files) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), reader.map.get(f)); } };
    const declared = (n) => `import { Behaviour } from '@vrmxg/core';\nexport class patrol extends Behaviour { static describe = { state: { type: 'object', properties: { n: { type: '${n}' } } } }; }\n`;
    write(dir, proj({ 'behaviours.js': declared('number') }));
    write(rdir, rt());
    const a = await exportToFolder({ project: dir, runtime: rdir, out: path.join(tmp, 'a') });
    assert.match(a.compat.behaviours.patrol, /^state:/, 'the class\'s static describe was read');
    fs.writeFileSync(path.join(dir, 'behaviours.js'), declared('integer'));
    const b = await exportToFolder({ project: dir, runtime: rdir, out: path.join(tmp, 'b') });
    assert.deepEqual(compatProblems(a.compat, b.compat).map((p) => p.text), ['the state the behaviour patrol keeps changed'], 'the edited module, not the cached one');
    // the review's case: a behaviour re-exported from a module the top one imports, its state changed between two
    // exports in one process (an MCP server's, or the editor's): the second must see the new state
    const door = (type) => `import { Behaviour } from '@vrmxg/core';\nexport class patrol extends Behaviour { static describe = { state: { type: '${type}' } }; }\n`;
    fs.writeFileSync(path.join(dir, 'behaviours.js'), "export * from './lib/door.js';\n");
    fs.writeFileSync(path.join(dir, 'lib/door.js'), door('boolean'));
    const licences = `${fs.readFileSync(path.join(dir, 'LICENCES.md'), 'utf8')}| \`lib/door.js\` | Ours | |\n`;
    fs.writeFileSync(path.join(dir, 'LICENCES.md'), licences);
    const c = await exportToFolder({ project: dir, runtime: rdir, out: path.join(tmp, 'c') });
    fs.writeFileSync(path.join(dir, 'lib/door.js'), door('object'));
    const d = await exportToFolder({ project: dir, runtime: rdir, out: path.join(tmp, 'd') });
    assert.match(c.compat.behaviours.patrol, /^state:/);
    assert.deepEqual(compatProblems(c.compat, d.compat).map((p) => p.text), ['the state the behaviour patrol keeps changed'], 'a module imported relatively is read from the bytes exported, not the cache');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
