// The 90 Hz page's headless leg in Node (V8, no renderer): the same 600 recorded steps of the same world, hashed after
// every step, so the final hash can be compared with the browsers' (present.html's hashes.headlessFinal). Writes
// results/pages/node.json.   node web/scripts/node-present.mjs
import fs from 'node:fs';
import path from 'node:path';
import { useFiles, buildWorld, envNodes, worldHashes, hashValue } from '../src/world.js';

const here = import.meta.dirname, models = path.join(here, '../public/models');
useFiles({ bytes: async (p) => new Uint8Array(fs.readFileSync(path.join(models, p))), json: async (p) => JSON.parse(fs.readFileSync(path.join(models, p), 'utf8')) });
const { tree } = await buildWorld({ extraNodes: envNodes(), stubTextures: true });
const hashes = [];
for (let k = 0; k < 600; k++) { while (!tree.step()) await tree.settle(); hashes.push(hashValue(worldHashes(tree))); }
const out = { runtime: `Node ${process.version}`, steps: hashes.length, headlessFinal: hashes.at(-1), every60: hashes.filter((_, i) => (i + 1) % 60 === 0) };
fs.mkdirSync(path.join(here, '../../results/pages'), { recursive: true });
fs.writeFileSync(path.join(here, '../../results/pages/node.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out));
