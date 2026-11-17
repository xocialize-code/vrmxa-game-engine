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
  { ignores: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/results/**'] },
  {
    files: ['engine/**/*.{js,mjs}', 'tools/**/*.{js,mjs}', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
  { files: simulation, plugins: { vrmxg }, rules: { 'vrmxg/deterministic': 'error' } },
];
