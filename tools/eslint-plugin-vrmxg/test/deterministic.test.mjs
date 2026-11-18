// RuleTester cases for vrmxg/deterministic: every forbidden construct fails, dmath-style code passes.
import { test } from 'node:test';
import { RuleTester } from 'eslint';
import plugin from '../index.js';

RuleTester.describe = (name, fn) => fn();
RuleTester.it = (name, fn) => test(name, fn);
RuleTester.itOnly = RuleTester.it;
const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } });

tester.run('vrmxg/deterministic', plugin.rules.deterministic, {
  valid: [
    // What @vrmxg/dmath and simulation code built on it look like
    `import { installPortableMath, sin, pow } from '@vrmxg/dmath';
     installPortableMath();
     const f64 = new Float64Array(1); const u32 = new Uint32Array(f64.buffer);
     export const step = (s, dt) => { const a = Math.sin(s.t) * Math.sqrt(dt); s.v = Math.pow(a, 2) + Math.abs(s.v) + Math.floor(s.t) + Math.imul(3, 5) + Math.trunc(dt); s.t += dt; return sin(a) + pow(2, 0.5); };`,
    'node.quaternion.setFromAxisAngle(axis, angle);',
    'const r = body.rotation(); const t = body.translation();', // Rapier's methods, not three's Euler
    'const r = Math.max(Math.min(x, 1), 0) + Math.round(y) + Math.hypot(a, b) + Math.atan2(y, x) + Math.exp(z) + Math.log(w) + Math.cbrt(v);',
    'const rng = createRng(seed); const v = rng.next();',
    'const settings = { rotationSpeed: 1 }; settings.rotationSpeed = 2;',
    'obj["rot" + "ation"] = q;', // computed and not a literal: not checkable, not reported
    'const s = Math; const t = s.sin(1);',
  ],
  invalid: [
    { code: 'const x = Math.random();', errors: [{ messageId: 'random' }] },
    { code: 'const x = globalThis.Math.random();', errors: [{ messageId: 'random' }] },
    { code: 'const { random } = Math;', errors: [{ messageId: 'random' }] },
    { code: 'crypto.getRandomValues(buf);', errors: [{ messageId: 'random' }] },
    { code: 'const id = crypto.randomUUID();', errors: [{ messageId: 'random' }] },
    { code: 'const t = Date.now();', errors: [{ messageId: 'clock' }] },
    { code: 'const t = performance.now();', errors: [{ messageId: 'clock' }] },
    { code: 'const t = new Date();', errors: [{ messageId: 'clock' }] },
    { code: 'const t = Date();', errors: [{ messageId: 'clock' }] },
    { code: 'const t = process.hrtime();', errors: [{ messageId: 'clock' }] },
    { code: 'setTimeout(tick, 16);', errors: [{ messageId: 'timer' }] },
    { code: 'setInterval(tick, 16);', errors: [{ messageId: 'timer' }] },
    { code: 'requestAnimationFrame(tick);', errors: [{ messageId: 'timer' }] },
    { code: 'window.requestAnimationFrame(tick);', errors: [{ messageId: 'timer' }] },
    { code: 'const y = x ** 2;', errors: [{ messageId: 'pow' }] },
    { code: 'y **= 2;', errors: [{ messageId: 'pow' }] },
    ...['sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'expm1', 'log1p', 'log2', 'log10'].map((f) => ({ code: `const y = Math.${f}(x);`, errors: [{ messageId: 'math' }] })),
    { code: 'const { log2, sin } = Math;', errors: [{ messageId: 'math' }] },
    { code: 'const y = Math["log10"](x);', errors: [{ messageId: 'math' }] },
    { code: 'vrm.scene.rotation.y = Math.PI;', errors: [{ messageId: 'rotation' }] },
    { code: 'const e = bone.rotation;', errors: [{ messageId: 'rotation' }] },
  ],
});
