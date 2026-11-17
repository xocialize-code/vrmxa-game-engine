#!/usr/bin/env node
// Scale check: generated scenes of 1k and 10k nodes (mixed types, prefab instances, connections).
// Times compile, validate + lint, serialize, parse, flatten, and a single edit. Writes results/bench.json.
import fs from 'node:fs';
import { m0Registry } from '../src/nodes.js';
import { createValidator, parse, serialize } from '../src/doc.js';
import { flatten } from '../src/instance.js';
import { createEditor } from '../src/edit.js';

const read = (p) => parse(fs.readFileSync(new URL(`../examples/${p}`, import.meta.url), 'utf8'));
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((p) => [p, read(p)]));
function scene(n) {
  const d = read('cafe.vrmxs');
  for (let i = 0; i < n; i++) {
    const k = i % 5, id = `n${i}`, parent = i < 10 ? 'root' : `n${Math.floor(i / 10)}`;
    const p = [i % 50, 0, Math.floor(i / 50)];
    d.nodes.push(
      k === 0 ? { id, type: 'Instance', parent, asset: 'door', transform: { p }, overrides: { hinge: { props: { mass: 10 + (i % 7) } } } }
      : k === 1 ? { id, type: 'PointLight', parent, transform: { p }, props: { intensity: 5, range: 6 } }
      : k === 2 ? { id, type: 'RigidBody', parent, transform: { p }, props: { bodyType: 'dynamic', mass: 3 } }
      : k === 3 ? { id, type: 'Collider', parent, transform: { p }, props: { shape: 'box', size: [1, 1, 1] } }
      : { id, type: 'Marker', parent, transform: { p }, props: { purpose: 'waypoint' } });
    if (k === 0) d.connections.push({ from: id, signal: 'ready', to: 'hana-1', call: 'lookAt', args: { target: id } });
  }
  return d;
}
const time = (f, reps = 5) => { f(); const t0 = performance.now(); for (let i = 0; i < reps; i++) f(); return +((performance.now() - t0) / reps).toFixed(2); };

const out = { node: process.version };
const t0 = performance.now();
const reg = m0Registry();
const v = createValidator(reg);
out.compileMs = +(performance.now() - t0).toFixed(1);
for (const n of [1000, 10000]) {
  const d = scene(n);
  const text = serialize(d);
  const r = v.check(d, { prefabs });
  if (!r.ok) throw new Error(r.errors.slice(0, 5).join('\n'));
  const ed = createEditor(reg, d);
  out[n] = {
    nodes: d.nodes.length, flatNodes: flatten(d, prefabs).nodes.length, bytes: Buffer.byteLength(text), lines: text.split('\n').length,
    checkMs: time(() => v.check(d, { prefabs })), serializeMs: time(() => serialize(d)), parseMs: time(() => parse(text)),
    flattenMs: time(() => flatten(d, prefabs)),
    setMs: time(() => { ed.apply({ op: 'set', id: `n${n - 2}`, path: 'props.intensity', value: 7 }); ed.undo(); }, 50),
  };
  console.log(n, JSON.stringify(out[n]));
}
fs.writeFileSync(new URL('../results/bench.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('compile', out.compileMs, 'ms');
