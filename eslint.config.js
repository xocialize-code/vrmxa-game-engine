// ESLint for the engine. Every package gets basic correctness checks; packages that declare
// "vrmxg": { "determinism": "simulation" } in their package.json also get vrmxg/deterministic on their
// src/ (AB-D-0248). Tests, scripts and spikes are outside the boundary.
import fs from 'node:fs';
import path from 'node:path';
import globals from 'globals';
import vrmxg from 'eslint-plugin-vrmxg';

const root = import.meta.dirname;
const simulation = fs.readdirSync(path.join(root, 'engine/packages'))
  .filter((d) => {
    const f = path.join(root, 'engine/packages', d, 'package.json');
    return fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).vrmxg?.determinism === 'simulation';
  })
  .map((d) => `engine/packages/${d}/src/**/*.js`);

export default [
  { ignores: ['**/node_modules/**', '**/build/**', '**/.build/**', '**/dist/**', '**/results/**', 'engine/vendor/**', 'engine/packages/*/src/vendor/**'] }, // vendored code is upstream's
  {
    files: ['engine/**/*.{js,mjs}', 'tools/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
  { files: simulation, plugins: { vrmxg }, rules: { 'vrmxg/deterministic': 'error' } },
  // what r187's WebGPURenderer doesn't draw (AB-A-0335): no LineLoop (a closed Line instead), no per-material clipping
  // planes (a ClippingGroup, or a maskNode)
  {
    files: ['engine/packages/*/src/**/*.js', 'apps/*/src/**/*.js'],
    rules: {
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='LineLoop'], NewExpression[callee.property.name='LineLoop']", message: 'WebGPURenderer (r187) does not draw LineLoop: use a Line whose last point repeats the first (AB-A-0335)' },
        { selector: "MemberExpression[property.name='clippingPlanes'], Property[key.name='clippingPlanes']", message: 'WebGPURenderer (r187) ignores material.clippingPlanes: use a ClippingGroup or a maskNode (AB-A-0335)' },
      ],
    },
  },
];
