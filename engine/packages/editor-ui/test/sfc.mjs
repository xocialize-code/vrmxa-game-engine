// Compile a single-file component for Node (vue/compiler-sfc, the template inlined) and render it on the server
// (vue/server-renderer), so the tests see the markup the apps get: ids, accessible names, what each prop draws.
import fs from 'node:fs';
import path from 'node:path';
import { parse, compileScript } from 'vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

const here = import.meta.dirname, out = path.join(here, '.build');

/** Compile a .vue file (and the .vue files it imports) into test/.build; → the compiled module's path. */
function compile(file, written, seen = new Map()) {
  if (seen.has(file)) return seen.get(file);
  const target = path.join(out, `${path.basename(file)}.${process.pid}.mjs`);
  seen.set(file, target);
  const { descriptor, errors } = parse(fs.readFileSync(file, 'utf8'), { filename: file });
  if (errors.length) throw errors[0];
  const { content } = compileScript(descriptor, { id: path.basename(file), inlineTemplate: true });
  const dir = path.dirname(file);
  const code = content.replace(/from '\.\/([^']+)'/g, (_, p) => {
    const dep = path.join(dir, p);
    return `from ${JSON.stringify(new URL(`file://${p.endsWith('.vue') ? compile(dep, written, seen) : dep}`).href)}`;
  });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(target, code);
  written.push(target);
  return target;
}

/** @param {string} file a .vue file @returns {Promise<any>} the component */
export async function loadSFC(file) {
  const written = [];
  try { return (await import(compile(file, written))).default; } finally { for (const f of written) fs.rmSync(f, { force: true }); }
}

/** Render a component with props to HTML. */
export function render(component, props = {}) { return renderToString(createSSRApp({ render: () => h(component, props) })); }
