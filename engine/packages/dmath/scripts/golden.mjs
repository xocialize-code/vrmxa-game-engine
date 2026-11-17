// Writes test/golden.json: the per-function output digests computed in this runtime. Regenerate
// only on purpose (a change to src/index.js); every runtime must then reproduce the new digests.
import fs from 'node:fs';
import { evaluate } from '../test/cases.js';

const report = evaluate();
const digests = Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.digest]));
const out = { note: 'FNV-1a over output bits for test/cases.js inputs + edges; must match in every engine', runtime: `node ${process.version}`, digests };
fs.writeFileSync(new URL('../test/golden.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(digests);
