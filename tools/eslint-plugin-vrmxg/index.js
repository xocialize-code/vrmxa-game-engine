// eslint-plugin-vrmxg. One rule so far:
//
// vrmxg/deterministic — inside the determinism boundary (AB-D-0248) code may use + - * /, sqrt,
// floor/round/abs/min/max, Math.imul and the twelve @vrmxg/dmath functions (installed over Math at
// boot). It reports what would make a replay differ between runs or engines:
//   - Math.random, crypto.getRandomValues / randomUUID      → the engine's seeded RNG streams
//   - Date, Date.now, performance.now, process.hrtime        → the step clock
//   - setTimeout, setInterval, requestAnimationFrame, queueMicrotask → step-driven timers
//   - the ** operator and **=                                → Math.pow (portable once dmath is installed)
//   - Math.sinh, cosh, tanh, asinh, acosh, atanh, expm1, log1p, log2, log10 (not in dmath)
//   - .rotation read or written as a property (three's Euler mirror, computed with asin/atan2 on every
//     quaternion write) → .quaternion; calling a method named rotation() is fine
// Packages opt in with "vrmxg": { "determinism": "simulation" } in their package.json (eslint.config.js).
// A deliberate exception takes a reason: // eslint-disable-next-line vrmxg/deterministic -- <why>

const UNCOVERED_MATH = new Set(['sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'expm1', 'log1p', 'log2', 'log10', 'random']);
const CLOCK_MEMBERS = { Date: new Set(['now']), performance: new Set(['now']), process: new Set(['hrtime', 'uptime']), crypto: new Set(['getRandomValues', 'randomUUID']) };
const TIMERS = new Set(['setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'requestIdleCallback', 'queueMicrotask']);

const propName = (m) => (!m.computed && m.property.type === 'Identifier' ? m.property.name : m.computed && m.property.type === 'Literal' ? String(m.property.value) : null);
// `Math`, `globalThis.Math`, `window.Math`, `self.Math`
function baseName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && ['globalThis', 'window', 'self', 'global'].includes(node.object.name)) return propName(node);
  return null;
}

const deterministic = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid non-deterministic constructs inside the VRMXG determinism boundary (AB-D-0248)' },
    schema: [],
    messages: {
      random: '{{what}} is not deterministic: use the engine\'s seeded RNG streams.',
      clock: '{{what}} reads the wall clock: use the step clock (step index, fixed 1/60 s).',
      timer: '{{what}} schedules on wall time: use step-driven timers.',
      pow: 'The ** operator bypasses the portable Math.pow: write Math.pow(a, b).',
      math: 'Math.{{name}} is not in @vrmxg/dmath, so it rounds differently between engines.',
      rotation: '.rotation is three\'s Euler mirror (asin/atan2 on every write): use .quaternion.',
    },
  },
  create(context) {
    const checkMember = (node, base, name) => {
      if (base === 'Math' && UNCOVERED_MATH.has(name)) {
        if (name === 'random') context.report({ node, messageId: 'random', data: { what: 'Math.random' } });
        else context.report({ node, messageId: 'math', data: { name } });
      } else if (CLOCK_MEMBERS[base]?.has(name)) {
        context.report({ node, messageId: base === 'crypto' ? 'random' : 'clock', data: { what: `${base}.${name}` } });
      }
    };
    return {
      MemberExpression(node) {
        const name = propName(node);
        if (name === null) return;
        const base = baseName(node.object);
        if (base) checkMember(node, base, name);
        // three's Euler mirror is a property; a method named rotation() (Rapier's body.rotation()) is not it.
        const called = node.parent?.type === 'CallExpression' && node.parent.callee === node;
        if (name === 'rotation' && !node.computed && !called) context.report({ node: node.property, messageId: 'rotation' });
      },
      // const { random, log2 } = Math
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || !node.init) return;
        const base = baseName(node.init);
        if (!base) return;
        for (const p of node.id.properties) if (p.type === 'Property' && p.key.type === 'Identifier') checkMember(p, base, p.key.name);
      },
      NewExpression(node) { if (node.callee.type === 'Identifier' && node.callee.name === 'Date') context.report({ node, messageId: 'clock', data: { what: 'new Date()' } }); },
      CallExpression(node) {
        const c = node.callee;
        const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && baseName(c.object) && ['globalThis', 'window', 'self', 'global'].includes(c.object.name) ? propName(c) : null;
        if (name === 'Date') context.report({ node, messageId: 'clock', data: { what: 'Date()' } });
        if (name && TIMERS.has(name)) context.report({ node, messageId: 'timer', data: { what: name } });
      },
      BinaryExpression(node) { if (node.operator === '**') context.report({ node, messageId: 'pow' }); },
      AssignmentExpression(node) { if (node.operator === '**=') context.report({ node, messageId: 'pow' }); },
    };
  },
};

export default { meta: { name: 'eslint-plugin-vrmxg', version: '0.1.0' }, rules: { deterministic } };
