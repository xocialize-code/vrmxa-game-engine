// A small project and a small runtime in memory, for the tests: enough of each kind of reference the trace follows.
import { runtimeTable, serializeRuntime, RUNTIME_FILE } from '@vrmxg/bundle';

export const enc = (s) => new TextEncoder().encode(s);
export const dec = (b) => new TextDecoder().decode(b);

/** A reader over a map of path → text or bytes. */
export function memory(entries) {
  const map = new Map(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? enc(v) : v]));
  return { map, files: [...map.keys()], read: async (p) => { if (!map.has(p)) throw new Error(`${p}: no such file`); return map.get(p); } };
}

/** A writer into a map, and the map. */
export function sink() {
  const map = new Map(), order = [];
  return { map, order, write: async (p, bytes) => { order.push(p); map.set(p, Uint8Array.from(bytes)); } };
}

export const LICENCES = `# Licences

| File | Licence | Source |
|---|---|---|
| \`game.json\` | Ours | The game |
| \`level.vrmxs\` | Ours | The level |
| \`prefabs/door.vrmxs\` | Ours | A door |
| \`props/door.glb\` | CC0-1.0 | Made by \`tools/make.mjs\` |
| \`brains/guard.json\` | Ours | A brain |
| \`voice/*.wav\` | Kokoro output (Apache-2.0 \\| no one's voice) | Lines |
| \`voice/*.timings.json\` | CC0-1.0 | Their timings |
| \`behaviours.js\` | Ours | The behaviours |
| \`lib/maths.js\` | Ours | A helper |
| \`animations.json\` | CC0-1.0 | The animation set |
| \`animations/clips/*.vrma\` | CC0-1.0 | Clips |
| \`extras/readme.txt\` | Ours | A note |
| \`LICENCES.md\` | Ours | This file |
`;

export const GAME = { format: 'vrmxg-game', version: 1, id: 'test-game', title: 'Test game', entry: 'level.vrmxs', behaviours: 'behaviours.js', animations: 'animations.json' };

/** A project: a level with a prefab, a brain named by path, a voice line with timings, behaviours with an import. */
export function project(over = {}) {
  return memory({
    'game.json': JSON.stringify(GAME),
    'LICENCES.md': LICENCES,
    'level.vrmxs': JSON.stringify({ format: 'vrmxs', version: 1, id: 'level', assets: [{ id: 'door', type: 'vrmxs', ref: 'prefabs/door.vrmxs' }], nodes: [{ id: 'guard', type: 'Character', behaviours: [{ use: 'brain', preset: 'brains/guard.json' }] }], connections: [{ from: 'guard', signal: 'ready', to: 'guard', action: 'say', args: { clip: 'voice/hello.wav' } }] }),
    'prefabs/door.vrmxs': JSON.stringify({ format: 'vrmxs', version: 1, id: 'door', assets: [{ id: 'panel', type: 'glb', ref: 'props/door.glb' }], nodes: [] }),
    'props/door.glb': new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]),
    'brains/guard.json': JSON.stringify({ format: 'vrmxg-brain', tree: { type: 'action', do: 'wait' } }),
    'voice/hello.wav': new Uint8Array([82, 73, 70, 70, 0, 1, 2, 3]),
    'voice/hello.timings.json': JSON.stringify({ text: 'Hello', words: [] }),
    'voice/unused.wav': new Uint8Array([82, 73, 70, 70]),
    'behaviours.js': "import { Behaviour } from '@vrmxg/core';\nimport { twice } from './lib/maths.js';\nexport class patrol extends Behaviour { ready() { this.n = twice(2); } }\n",
    'lib/maths.js': 'export const twice = (n) => n * 2;\n',
    'animations.json': JSON.stringify({ clips: [{ name: 'idle', file: 'animations/clips/idle.vrma', sha256: 'x' }] }),
    'animations/clips/idle.vrma': new Uint8Array([1, 2, 3, 4, 5]),
    'tools/make.mjs': '// not part of the game\n',
    'extras/readme.txt': 'read me\n',
    'notes/unlicensed.txt': 'nobody listed this\n',
    '.DS_Store': new Uint8Array([0]),
    ...over,
  });
}

/** A runtime of three files, with its table. */
export function runtime(over = {}, { name = 'test-runtime', version = '1.0.0' } = {}) {
  const files = { 'index.html': '<!doctype html><script type="module" src="./assets/app.js"></script>\n', 'assets/app.js': 'console.log("runtime");\n', 'vrmxg-core.js': 'export default globalThis.VRMXG_CORE;\n', ...over };
  const table = runtimeTable({ name, runtimeVersion: version, files: Object.entries(files).map(([path, v]) => ({ path, bytes: typeof v === 'string' ? enc(v) : v, licence: path.startsWith('assets/') ? 'Ours; includes three (MIT)' : 'Ours' })) });
  return memory({ ...files, [RUNTIME_FILE]: serializeRuntime(table) });
}
