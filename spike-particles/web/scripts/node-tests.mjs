#!/usr/bin/env node
// The suite in Node (V8). JSON to stdout, or to ../results/<name>.json with --save <name>.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// three's ObjectLoader does `instanceof HTMLImageElement` while parsing the quarks JSON; our atlas
// is a DataTexture (raw pixels), so empty stand-ins are enough in Node.
for (const k of ['HTMLImageElement', 'HTMLCanvasElement', 'ImageBitmap', 'OffscreenCanvas']) globalThis[k] ??= class {};
const { runSuite } = await import('../src/tests.js');

const origErr = console.error; // @newkrok logs a stack when its default texture can't use document
const res = await runSuite();
const i = process.argv.indexOf('--save');
const text = JSON.stringify(res, null, 2);
if (i > 0) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../results', `${process.argv[i + 1]}.json`);
  fs.writeFileSync(out, text); console.log('wrote', out);
} else console.log(text);
