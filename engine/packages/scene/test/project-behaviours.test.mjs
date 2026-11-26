// M6 W0 (AB-T-0644): a project's declared behaviours sit in the registry the scene validator is compiled from. What the
// registry accepts never breaks the validator: a schema that wouldn't compile inside a scene's is refused when declared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { createValidator } from '../src/index.js';

const zone = (describe) => Object.assign(class {}, { describe });
const scene = (b) => ({ format: 'vrmxs', version: 1, id: 's', nodes: [{ id: 'a', type: 'Area', behaviours: [b] }] });

test('after any declaration the registry accepts, a scene still validates; what would break it is refused', () => {
  const tries = [
    { params: { a: { type: 'nonsense' } } },
    { params: { a: { $ref: '#/$defs/n', $defs: { n: { type: 'number' } } } } },
    { params: { a: { $id: 'urn:a', type: 'number' } }, signals: { s: { args: { x: { $id: 'urn:a' } } } } },
    { params: { a: { type: 'string', pattern: '(' } } },
    { state: { type: 'object', properties: { n: { $ref: '#' } } } },
    // accepted ones, unusual but self-contained
    { params: { a: { anyOf: [{ type: 'string' }, { type: 'null' }], $defs: { unused: { type: 'number' } } }, b: { type: 'object', default: { $ref: 'x' } } } },
    { params: { c: { type: 'array', items: { type: 'integer', minimum: 0 }, maxItems: 3 } }, state: true },
  ];
  let accepted = 0;
  for (const describe of tries) {
    const reg = m0Registry();
    try { declareProjectBehaviours(reg, { z: zone(describe) }); } catch { continue; }
    accepted++;
    const r = createValidator(reg).check(scene({ use: 'z' }), { prefabs: new Map() });
    assert.ok(r.ok, `${JSON.stringify(describe)}: ${r.errors.join('; ')}`);
  }
  assert.equal(accepted, 2, 'the five that would break a scene\'s schema are refused');
  // and an accepted param is checked in the scene
  const reg = m0Registry();
  declareProjectBehaviours(reg, { z: zone(tries[6]) });
  assert.ok(createValidator(reg).check(scene({ use: 'z', c: [1, -1] }), { prefabs: new Map() }).errors.some((e) => /minimum|>= 0/.test(e)));
});
