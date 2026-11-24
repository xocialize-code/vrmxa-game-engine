// What a game needs, traced from its documents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, checkGame, defaultGame } from '@vrmxg/bundle';
import fs from 'node:fs';
import { moduleImports, sceneRefs } from '@vrmxg/bundle';
import { LEXER_CASES, readLexerCases } from '../runtime/lexer-cases.js';
import { createRegistry, P } from '@vrmxg/registry';
import { project, GAME } from './helpers.mjs';

const trace = (p, game = GAME) => collect({ game: checkGame(game), files: p.files, read: p.read });

test('a scene brings its prefabs, their models, brains by path, voice lines and their timings; a module its imports', async () => {
  const { refs, why } = await trace(project());
  assert.deepEqual(refs, [
    'LICENCES.md', 'animations.json', 'animations/clips/idle.vrma', 'behaviours.js', 'brains/guard.json', 'game.json', 'level.vrmxs',
    'lib/maths.js', 'prefabs/door.vrmxs', 'props/door.glb', 'voice/hello.timings.json', 'voice/hello.wav',
  ]);
  assert.equal(why.get('props/door.glb'), 'prefabs/door.vrmxs');
  assert.equal(why.get('voice/hello.timings.json'), 'voice/hello.wav');
  assert.equal(why.get('lib/maths.js'), 'behaviours.js');
  assert.equal(why.get('level.vrmxs'), 'game.json');
});

test('what nothing names stays out: tools, an unused clip, notes', async () => {
  const { refs } = await trace(project());
  for (const f of ['tools/make.mjs', 'voice/unused.wav', 'notes/unlicensed.txt', 'extras/readme.txt', '.DS_Store']) assert.ok(!refs.includes(f), f);
});

test('include adds files no document names, by ref or by pattern', async () => {
  const { refs } = await trace(project(), { ...GAME, include: ['extras/readme.txt', 'voice/*.wav'] });
  assert.ok(refs.includes('extras/readme.txt') && refs.includes('voice/unused.wav'));
  await assert.rejects(trace(project(), { ...GAME, include: ['extras/*.png'] }), (e) => e.code === 'missing_file' && /extras\/\*\.png/.test(e.message));
});

test('the order of the listing does not change the result', async () => {
  const a = project(), b = project();
  b.files.reverse();
  assert.deepEqual((await trace(a)).refs, (await trace(b)).refs);
});

test('a named file the project lacks stops the trace and is named', async () => {
  await assert.rejects(trace(project(), { ...GAME, entry: 'missing.vrmxs' }), (e) => e.code === 'missing_file' && e.files[0] === 'missing.vrmxs' && /game\.json names missing\.vrmxs/.test(e.message));
  await assert.rejects(trace(project({ 'behaviours.js': "import './lib/gone.js';\n" })), (e) => e.code === 'missing_file' && e.files[0] === 'lib/gone.js' && /behaviours\.js imports \.\/lib\/gone\.js, which the project doesn't have/.test(e.message));
  await assert.rejects(trace(project({ 'behaviours.js': "import x from '../outside.js';\n" })), (e) => e.code === 'missing_file');
  await assert.rejects(trace(project({ 'brains/guard.json': '{ not json' })), (e) => e.code === 'bad_file' && e.files[0] === 'brains/guard.json');
});

const level = (assets, extra = {}) => JSON.stringify({ format: 'vrmxs', version: 1, id: 'level', assets, nodes: [], ...extra });

test('a reference in another case than the file stops the export, naming the scene and both spellings', async () => {
  const p = project({ 'level.vrmxs': level([{ id: 'door', type: 'glb', ref: 'Props/Door.glb' }]) });
  await assert.rejects(trace(p), (e) => e.code === 'missing_file' && /^level\.vrmxs names Props\/Door\.glb, and the project's file is props\/door\.glb: the case differs/.test(e.message) && e.files.join() === 'Props/Door.glb,props/door.glb');
  // the game document's own refs, and an import, are held to it too
  await assert.rejects(trace(project(), { ...GAME, entry: 'Level.vrmxs' }), (e) => e.code === 'missing_file' && /game\.json names Level\.vrmxs, and the project's file is level\.vrmxs/.test(e.message));
  await assert.rejects(trace(project({ 'behaviours.js': "import { twice } from './lib/Maths.js';\n" })), (e) => e.code === 'missing_file' && /behaviours\.js imports lib\/Maths\.js, and the project's file is lib\/maths\.js/.test(e.message));
});

test('a reference to a file the project lacks stops the export, naming the scene and the reference', async () => {
  const p = project({ 'level.vrmxs': level([{ id: 'door', type: 'glb', ref: 'props/dor.glb' }]) });
  await assert.rejects(trace(p), (e) => e.code === 'missing_file' && e.files.join() === 'props/dor.glb' && /^level\.vrmxs names props\/dor\.glb \(asset "door"\), which the project doesn't have$/.test(e.message));
  // deeper in the trace: the document that holds the reference is the one named, and the message says how to let a
  // string through that isn't a file
  const q = project({ 'brains/guard.json': JSON.stringify({ format: 'vrmxg-brain', tree: { say: 'voice/gone.wav' } }) });
  await assert.rejects(trace(q), (e) => /^brains\/guard\.json names voice\/gone\.wav, which the project doesn't have \(if it isn't a file, add it to "ignore" in game\.json: "ignore": \["voice\/gone\.wav"\]\)$/.test(e.message));
  assert.ok((await trace(q, { ...GAME, ignore: ['voice/gone.wav'] })).refs.includes('brains/guard.json'));
  // a typed reference is a file for certain: `ignore` is for strings that only look like one
  await assert.rejects(trace(p, { ...GAME, ignore: ['props/dor.glb'] }), (e) => e.code === 'missing_file');
});

test('what a scene\'s schema types as a file is taken exactly, spaces and all', async () => {
  const withPanel = { 'props/Door Panel.glb': new Uint8Array([1]) };
  // exact: collected
  assert.ok((await trace(project({ ...withPanel, 'level.vrmxs': level([{ id: 'panel', type: 'glb', ref: 'props/Door Panel.glb' }]) }))).refs.includes('props/Door Panel.glb'));
  // another case: refused, both spellings
  await assert.rejects(trace(project({ ...withPanel, 'level.vrmxs': level([{ id: 'panel', type: 'glb', ref: 'Props/Door Panel.glb' }]) })),
    (e) => e.code === 'missing_file' && /level\.vrmxs names Props\/Door Panel\.glb, and the project's file is props\/Door Panel\.glb: the case differs/.test(e.message));
  // misspelt: refused
  await assert.rejects(trace(project({ ...withPanel, 'level.vrmxs': level([{ id: 'panel', type: 'glb', ref: 'props/Dor Panel.glb' }]) })),
    (e) => e.code === 'missing_file' && /names props\/Dor Panel\.glb \(asset "panel"\), which the project doesn't have/.test(e.message));
  // a sequence's set, and a typed reference with no extension at all
  await assert.rejects(trace(project({ 'level.vrmxs': level([], { set: 'sets/the cafe' }) })), (e) => /names sets\/the cafe \(its set\)/.test(e.message));
});

test('the registry says which props are files and which never are', async () => {
  const reg = createRegistry();
  reg.define('Node3D', { props: {} });
  reg.define('Sign', { extends: 'Node3D', props: { picture: P.assetRef(['texture']), mood: P.enum(['intro.wav', 'calm']), tint: P.color(), follows: P.nodeRef(), label: P.string() },
    actions: { show: { args: { picture: P.assetRef(['texture']), caption: P.string() } } } });
  reg.behaviour('speaks', { params: { line: P.assetRef(['audio']), target: P.nodeRef(), note: P.string() } });
  const doc = { format: 'vrmxs', version: 1, id: 'level', assets: [{ id: 'door', type: 'glb', ref: 'props/door.glb' }], set: 'sets/room.vrmxs', nodes: [
    { id: 'sign', type: 'Sign', name: 'Node.js', props: { picture: 'pictures/My Sign.png', mood: 'intro.wav', tint: '#ffffff', follows: 'door.glb', label: 'see notes.txt' }, behaviours: [{ use: 'speaks', line: 'voice/hello there.wav', target: 'sign', note: 'voice/x.wav' }] },
  ], connections: [{ from: 'sign', signal: 'ready', to: 'sign', call: 'show', args: { picture: 'pictures/other.png', caption: 'config.json' } }], settings: { look: 'looks/day.cube' } };
  const { typed, loose } = sceneRefs(doc, reg);
  assert.deepEqual(typed.map((t) => t.ref), ['props/door.glb', 'sets/room.vrmxs', 'pictures/My Sign.png', 'voice/hello there.wav', 'pictures/other.png']);
  assert.equal(typed[3].where, "sign's speaks (line)");
  assert.deepEqual([...loose].sort(), ['config.json', 'looks/day.cube', 'see notes.txt', 'voice/x.wav'], 'plain strings stay candidates; a name, a choice, a colour and a node reference never are');
  // without a registry only the asset table and the set are typed, and everything else is a candidate
  assert.deepEqual(sceneRefs(doc, null).typed.map((t) => t.ref), ['props/door.glb', 'sets/room.vrmxs']);
  // and in a trace: a typed prop that names no file stops the export, saying where it stands
  const p = project({ 'level.vrmxs': JSON.stringify({ ...doc, assets: [], set: undefined, settings: {}, connections: [], nodes: [{ id: 'sign', type: 'Sign', props: { picture: 'pictures/My Sign.png' } }] }) });
  await assert.rejects(collect({ game: checkGame(GAME), files: p.files, read: p.read, registry: reg }), (e) => e.code === 'missing_file' && /level\.vrmxs names pictures\/My Sign\.png \(sign's picture\)/.test(e.message));
});

test('an untyped string is a reference when it reads as a path: one word, or into a folder the project has', async () => {
  const brain = (v) => ({ 'brains/guard.json': JSON.stringify({ format: 'vrmxg-brain', tree: v }) });
  // with a space, into a folder the project has: a path, so a misspelling stops the export
  await assert.rejects(trace(project(brain({ say: 'voice/hello there.wav' }))), (e) => e.code === 'missing_file' && /voice\/hello there\.wav/.test(e.message));
  await assert.rejects(trace(project({ 'voice/hello there.wav': new Uint8Array([1]), ...brain({ say: 'Voice/hello there.wav' }) })), (e) => /the case differs/.test(e.message));
  // at the project's root too: a string that is a file's whole name but for its case is that file misspelt
  await assert.rejects(trace(project({ 'Title Card.vrmxs': '{}', ...brain({ next: 'title card.vrmxs' }) })), (e) => e.code === 'missing_file' && /names title card\.vrmxs, and the project's file is Title Card\.vrmxs/.test(e.message));
  // sentences and names are not paths
  for (const text of ['I love Node.js', 'generated by tools/make.mjs', 'see the notes in docs/readme first.txt', 'Mr. Smith', 'https://example.com/a.wav']) {
    assert.ok((await trace(project(brain({ text })))).refs.includes('brains/guard.json'), text);
  }
  // one word that looks like a file and isn't stops the export, and the message says how to list it
  await assert.rejects(trace(project(brain({ text: 'intro.wav' }))), (e) => /add it to "ignore" in game\.json: "ignore": \["intro\.wav"\]/.test(e.message));
  // a node's name is never a reference, whatever it looks like
  assert.ok((await trace(project({ 'level.vrmxs': JSON.stringify({ format: 'vrmxs', version: 1, id: 'level', nodes: [{ id: 'config.json', type: 'Node3D', name: 'Node.js', parent: 'intro.wav' }] }) }))).refs.includes('level.vrmxs'));
});

test('./ and the Unicode form of a name are normalised, and a build spells a name one way', async () => {
  const nfc = 'props/café.glb', nfd = 'props/café.glb';
  const p = project({ [nfd]: new Uint8Array([7]), 'level.vrmxs': level([{ id: 'a', type: 'glb', ref: './props/door.glb' }, { id: 'b', type: 'glb', ref: nfc }]) });
  const { refs, source } = await trace(p);
  assert.ok(refs.includes('props/door.glb'), './props/door.glb is props/door.glb');
  assert.ok(refs.includes(nfc) && !refs.includes(nfd), 'the build names the file in NFC');
  assert.equal(source.get(nfc), nfd, 'and reads it by the name the disk gave');
  // the same name twice, in two forms, can't both go in
  await assert.rejects(trace(project({ [nfd]: new Uint8Array([7]), [nfc]: new Uint8Array([8]) })), (e) => e.code === 'bad_path' && /two Unicode forms/.test(e.message));
});

test('a reference beside its document is followed: a line\'s timings name their clip by file name', async () => {
  const p = project({ 'voice/hello.timings.json': JSON.stringify({ audio: 'hello.wav', words: [] }) });
  assert.ok((await trace(p)).refs.includes('voice/hello.wav'));
  await assert.rejects(trace(project({ 'voice/hello.timings.json': JSON.stringify({ audio: 'Hello.wav' }) })), (e) => /voice\/hello\.timings\.json names voice\/Hello\.wav, and the project's file is voice\/hello\.wav/.test(e.message));
});

test('a module\'s imports are read by a lexer: every awkward case, and what must be refused', () => {
  const got = readLexerCases(moduleImports);
  for (const [k, c] of LEXER_CASES.entries()) assert.deepEqual(got[k], c.imports, c.name);
  assert.throws(() => moduleImports("const m = await import(name);\n", 'lib/odd.js'), (e) => e.code === 'bad_file' && /^lib\/odd\.js imports a path it works out as it runs \(import\(name\)\)/.test(e.message));
  assert.throws(() => moduleImports("const re = /[abc;\nimport './g.js';\n", 'lib/odd.js'), (e) => e.code === 'bad_file' && /^lib\/odd\.js can't be read as a module \(a parse error at line \d+, column \d+\)/.test(e.message));
});

// the runtime games ship with (the game app, M5 W1) when it is built, else this package's minimal one
const builtAssets = [new URL('../../../../apps/game/dist/assets/', import.meta.url), new URL('../runtime/dist/assets/', import.meta.url)].find((u) => fs.existsSync(u));
test('the repository\'s own built bundles lex: a minified module is read, not refused', { skip: !builtAssets && 'needs a built runtime (npm run build -w @vrmxg/game-app)' }, () => {
  const dir = builtAssets;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 4);
  // some of them import a path worked out as it runs (a dynamic chunk): that is refused for what it is, by name, and
  // never as "can't be read"
  for (const f of files) { try { moduleImports(fs.readFileSync(new URL(f, dir), 'utf8'), f); } catch (e) { assert.match(e.message, /works out as it runs/, f); } }
});

test('in a trace: only a module\'s own files and the core, and nothing that can\'t be known', async () => {
  const ok = project({ 'behaviours.js': "// import './lib/gone.js';\nimport{twice}from\"./lib/maths.js\";\nexport const x = twice(1);\n" });
  assert.ok((await trace(ok)).refs.includes('lib/maths.js'));
  await assert.rejects(trace(project({ 'behaviours.js': "import _ from 'lodash';\n" })), (e) => e.code === 'bad_file' && /behaviours\.js imports lodash: a build gives a project's modules @vrmxg\/core/.test(e.message));
  // a function named `from` is not an import, so it refuses nothing
  assert.ok((await trace(project({ 'behaviours.js': "const from = (x) => x; export const y = from('./nowhere.js');\n" }))).refs.includes('behaviours.js'));
  // a module reached after a decrement and a division is in the build (a hand scanner once read `-- /` as a regular expression)
  const late = project({ 'behaviours.js': "let t = 9; t-- / 3; export const m = await import('./lib/maths.js');\n" });
  assert.ok((await trace(late)).refs.includes('lib/maths.js'));
  // a vendored, minified helper exports
  const min = project({ 'lib/maths.js': "export const twice=n=>n*2,half=n=>n/2,re=/[/*]'/g,s=`${1?'{':'}'}`;" });
  assert.ok((await trace(min)).refs.includes('lib/maths.js'));
  // what can't be known stops the export, naming the module
  await assert.rejects(trace(project({ 'lib/maths.js': "export const twice = (n) => n * 2; export const more = (name) => import(name);\n" })), (e) => e.code === 'bad_file' && /^lib\/maths\.js imports a path it works out as it runs/.test(e.message));
  await assert.rejects(trace(project({ 'lib/maths.js': "export const twice = (n) => n * 2; const re = /[abc;\n" })), (e) => e.code === 'bad_file' && /^lib\/maths\.js can't be read as a module/.test(e.message));
});

test('the game document is checked, and its defaults filled in', () => {
  const g = checkGame(GAME);
  assert.deepEqual(g.scenes, ['level.vrmxs']);
  assert.deepEqual([g.personas, g.input, g.include], [null, null, []]);
  assert.deepEqual(Object.keys(g), ['format', 'version', 'id', 'title', 'entry', 'scenes', 'behaviours', 'animations', 'personas', 'input', 'include']);
  assert.deepEqual(checkGame({ ...GAME, ignore: ['b.wav', 'a.wav', 'b.wav'] }).ignore, ['a.wav', 'b.wav']);
  assert.throws(() => checkGame({ ...GAME, ignore: 'a.wav' }), (e) => e.code === 'bad_game');
  for (const [doc, re] of [
    [{ ...GAME, format: 'other' }, /"format"/], [{ ...GAME, version: 2 }, /version 1/], [{ ...GAME, id: 'Has Spaces' }, /"id"/],
    [{ ...GAME, entry: '../up.vrmxs' }, /"entry"/], [{ ...GAME, entry: 'level.json' }, /not a \.vrmxs scene/], [{ ...GAME, behaviours: '/abs.js' }, /"behaviours"/],
    [{ ...GAME, input: 5 }, /"input"/], [{ ...GAME, colour: 'red' }, /unknown key "colour"/], [{ ...GAME, entry: 'a*.vrmxs' }, /has a \*/],
  ]) assert.throws(() => checkGame(doc), (e) => e.code === 'bad_game' && re.test(e.message), JSON.stringify(doc));
  assert.deepEqual(checkGame({ ...GAME, scenes: ['b.vrmxs', 'a.vrmxs'] }).scenes, ['a.vrmxs', 'b.vrmxs', 'level.vrmxs'], 'the entry is always a scene; scenes are in order');
});

test('a project with no game.json is one scene and what it has', () => {
  const g = defaultGame({ files: ['cafe.vrmxs', 'behaviours.js', 'personas.json'], entry: 'cafe.vrmxs' });
  assert.deepEqual([g.id, g.title, g.entry, g.behaviours, g.animations, g.personas], ['cafe', 'cafe', 'cafe.vrmxs', 'behaviours.js', null, 'personas.json']);
  assert.equal(defaultGame({ files: [], entry: 'levels/Level One.vrmxs' }).id, 'levels-level-one');
});
