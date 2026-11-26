// M6 W7 (AB-T-0654 item 6): a project's declared behaviours are checked by the draft 2020-12 meta-schema compiled ahead
// of time (src/vendor/ajv-meta-2020.js), so declaring them generates no code at run time and a game build runs under a
// Content Security Policy without 'unsafe-eval'. The check gives Ajv's compile's verdict on every schema here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { schemaFault, schemaProblems, P } from '../src/index.js';
import { m0Registry } from '../src/m0-nodes.js';

const here = import.meta.dirname;

test('src/vendor/ajv-meta-2020.js is what scripts/make-meta.mjs writes from the installed Ajv', () => {
  execFileSync(process.execPath, [path.join(here, '../scripts/make-meta.mjs'), '--check'], { stdio: 'pipe' });
});

// every schema the registry holds (each type's props, each behaviour's params and arguments) and schemas made to fail
function corpus() {
  const r = m0Registry(), out = [];
  for (const t of r.types.values()) {
    for (const [k, p] of Object.entries(t.props ?? {})) out.push([`${t.name}.${k}`, p.schema]);
    for (const kind of ['signals', 'actions']) for (const [m, def] of Object.entries(t[kind] ?? {})) for (const [k, p] of Object.entries(def.args ?? {})) out.push([`${t.name}.${m}(${k})`, p.schema]);
  }
  for (const b of r.behaviours.values()) for (const [k, p] of Object.entries(b.params ?? {})) out.push([`${b.name}.${k}`, p.schema]);
  for (const [k, s] of Object.entries({ vec3: P.vec3(), colour: P.color(), number: P.number({ min: 0 }) })) out.push([`P.${k}`, s.schema]);
  const crafted = [
    true, false, {}, { type: 'string' }, { type: ['string', 'null'] }, { type: 'integer', minimum: 0, default: 10 },
    { type: 'object', properties: { done: { type: 'boolean' } }, required: ['done'], additionalProperties: false },
    { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, { enum: [1, 1] }, { format: 'not-a-format' },
    { anyOf: [{ type: 'string', pattern: '^[a-z]+$' }, { type: 'null' }] }, { patternProperties: { '^x-': { type: 'string' } } },
    { default: { pattern: '(' } }, { examples: ['('] }, { properties: { pattern: { type: 'string' } } },
    // not JSON Schema
    5, 'string', null, [], { type: 'strin' }, { type: 'string', minimum: 'x' }, { properties: { a: { type: 5 } } }, { anyOf: [] },
    { required: ['a', 'a'] }, { items: { prefixItems: [{ type: 'nope' }] } }, { multipleOf: 0 }, { minLength: -1 },
    { pattern: '(' }, { properties: { a: { pattern: '[' } } }, { patternProperties: { '(': {} } }, { anyOf: [{ items: { pattern: '\\' } }] },
    { pattern: '\\p{Letter}+' }, { pattern: '\\p{NotAProperty}' }, { dependentSchemas: { a: { pattern: '(' } } }, { not: { pattern: '*' } },
    // what Ajv's compile refuses beyond the meta-schema (PR #58's review): an empty enum, the draft-04 id, nullable misused,
    // at the top and inside
    { enum: [] }, { id: 'x' }, { nullable: true }, { nullable: false }, { type: 'null', nullable: false }, { type: 'object', nullable: 'yes' }, { type: 'null', nullable: 1 }, { type: ['string', 'null'], nullable: false },
    { properties: { mode: { enum: [] } } }, { items: { id: 'x' } }, { anyOf: [{ nullable: true }] }, { not: { type: 'null', nullable: false } },
    { properties: { a: { type: 'object', properties: { b: { enum: [] } } } } }, { allOf: [{ $async: true }] }, { allOf: [{ id: 'x' }] },
    // and what it takes
    { type: 'string', nullable: true }, { type: 'null', nullable: true }, { type: 'string', nullable: false }, { enum: [null] }, { properties: { id: { type: 'string' } } },
    { default: { id: 'x', enum: [] } }, { const: { nullable: true } }, { examples: [{ id: 1 }] },
  ];
  crafted.forEach((s, i) => out.push([`crafted ${i}: ${JSON.stringify(s)}`, s]));
  return out;
}

test('the meta-schema check gives Ajv\'s compile\'s verdict on every schema the registry holds and on schemas made to fail', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true, logger: false });
  const differ = [];
  for (const [where, schema] of corpus()) {
    let compiles = true;
    try { ajv.compile(schema); } catch { compiles = false; }
    if ((schemaFault(schema) === null) !== compiles) differ.push(`${where}: compile ${compiles ? 'takes' : 'refuses'} it, the check says ${schemaFault(schema) ?? 'it is fine'}`);
  }
  assert.deepEqual(differ, []);
});

test('stricter than Ajv\'s compile on purpose: what it refuses is refused where Ajv never compiles it too', () => {
  // Ajv 2020 compiles neither definitions nothing references, nor additionalItems (a draft 2019 keyword), nor an if
  // without then or else, nor a then without if; a broken pattern there is still the declaration's mistake
  const ajv = new Ajv2020({ strict: false, allErrors: true, logger: false });
  for (const s of [{ $defs: { x: { pattern: '(' } } }, { definitions: { x: { pattern: '(' } } }, { additionalItems: { pattern: '(' } }, { if: { pattern: '(' } }, { then: { pattern: '(' } }]) {
    assert.doesNotThrow(() => ajv.compile(s), JSON.stringify(s));
    assert.match(schemaFault(s) ?? '', /Invalid regular expression/, JSON.stringify(s));
  }
  // the same for the rest of what compile refuses, in a schema it never compiles (an if whose then and else hold no rules
  // is skipped like a lone one)
  for (const [s, why] of [[{ $defs: { x: { enum: [] } } }, /enum must have non-empty array/], [{ additionalItems: { id: 'x' } }, /NOT SUPPORTED: keyword "id"/], [{ if: { nullable: true }, then: {} }, /"nullable" cannot be used without "type"/]]) {
    assert.doesNotThrow(() => ajv.compile(s), JSON.stringify(s));
    assert.match(schemaFault(s) ?? '', why, JSON.stringify(s));
  }
});

test('nothing Ajv\'s compile refuses gets past the check: 5,000 random schemas, seeded', () => {
  let seed = 4242; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const vals = {
    type: ['string', 'null', ['string', 'null'], 'object', 'array', 'strin', []], enum: [[], [1], [1, 1], 'x'], const: [1, null],
    nullable: [true, false, 'yes'], id: ['x', 1], pattern: ['^a$', '(', '\\p{L}'], minimum: [0, 'x'], minLength: [0, -1],
    required: [['a'], ['a', 'a']], format: ['email', 'nope', 1], default: [{ id: 1 }], multipleOf: [2, 0], $comment: ['c', 1],
    description: ['d'], examples: [[1]], $async: [true], foo: [1], minContains: [0, 2], dependentRequired: [{ a: ['b'] }],
  };
  const applicators = ['properties', 'items', 'anyOf', 'allOf', 'not', 'additionalProperties', 'contains', 'propertyNames', 'prefixItems', 'unevaluatedProperties', 'dependentSchemas', 'patternProperties', 'if+then', 'if+else', 'dependencies'];
  const gen = (d) => {
    if (d > 3 || rnd() < 0.12) return rnd() < 0.5 ? true : {};
    const s = {};
    for (let i = 1 + Math.floor(rnd() * 3); i > 0; i--) { const k = pick(Object.keys(vals)); s[k] = pick(vals[k]); }
    if (rnd() < 0.65) {
      const a = pick(applicators), sub = () => gen(d + 1);
      if (['properties', 'dependentSchemas', 'dependencies'].includes(a)) s[a] = { a: sub(), id: sub() };
      else if (a === 'patternProperties') s[a] = { [pick(['^x', '('])]: sub() };
      else if (['anyOf', 'allOf', 'prefixItems'].includes(a)) s[a] = [sub(), sub()];
      else if (a.startsWith('if+')) { s.if = sub(); s[a.slice(3)] = sub(); } else s[a] = sub();
    }
    return s;
  };
  const ajv = new Ajv2020({ strict: false, allErrors: true, logger: false }), missed = [];
  let refused = 0;
  for (let i = 0; i < 5000; i++) {
    const s = gen(0);
    let compiles = true;
    try { ajv.compile(s); } catch { compiles = false; refused++; }
    if (!compiles && schemaFault(s) === null) missed.push(JSON.stringify(s));
  }
  assert.ok(refused > 1000, 'the schemas exercise what compile refuses');
  assert.deepEqual(missed.slice(0, 5), []);
});

test('an empty enum in a declaration is refused when it is declared, naming it, not later by the scene validator (PR #58\'s review)', () => {
  assert.deepEqual(schemaProblems({ name: 'z', params: { mode: { schema: { enum: [] } } } }), ['behaviour z: param mode is not JSON Schema (enum must have non-empty array)']);
  assert.deepEqual(schemaProblems({ name: 'z', state: { type: 'object', properties: { n: { nullable: true } } } }), ['behaviour z: its state is not JSON Schema ("nullable" cannot be used without "type")']);
});

test('a declaration\'s problems name the schema and say why', () => {
  const b = { name: 'z', params: { n: { schema: { type: 'integr' } }, p: { schema: { type: 'string', pattern: '(' } } }, state: { type: 'object' } };
  const problems = schemaProblems(b);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^behaviour z: param n is not JSON Schema \(schema is invalid: data\/type must be equal to one of the allowed values/);
  assert.match(problems[1], /^behaviour z: param p is not JSON Schema \(Invalid regular expression/);
});

test('declaring a project\'s behaviours generates no code: it works with code generation from strings turned off', () => {
  const src = `
    import { createRegistry, declareProjectBehaviours } from ${JSON.stringify(new URL('../src/index.js', import.meta.url).href)};
    let refused = null;
    try { new Function('return 1'); } catch (e) { refused = e.constructor.name; }
    const r = createRegistry();
    const ok = class { static describe = { params: { points: { type: 'integer', minimum: 0, default: 10 } }, state: { type: 'object', properties: { done: { type: 'boolean' } } } }; };
    const names = declareProjectBehaviours(r, { ok });
    let bad = null;
    try { declareProjectBehaviours(r, { bad: class { static describe = { params: { n: { type: 'integr' } } }; } }); } catch (e) { bad = e.message; }
    console.log(JSON.stringify({ refused, names, bad }));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--disallow-code-generation-from-strings', '--input-type=module', '-e', src], { encoding: 'utf8' }));
  assert.equal(out.refused, 'EvalError', 'the child really refuses code from strings');
  assert.deepEqual(out.names, ['ok']);
  assert.match(out.bad ?? '', /param n is not JSON Schema/);
});
