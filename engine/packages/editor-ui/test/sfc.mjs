// Compile a single-file component for Node (vue/compiler-sfc, the template inlined) and render it on the server
// (vue/server-renderer), so the tests see the markup the apps get: ids, accessible names, what each prop draws.
import fs from 'node:fs';
import path from 'node:path';
import { parse, compileScript } from 'vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

const here = import.meta.dirname, out = path.join(here, '.build');

/** @param {string} file a .vue file @returns {Promise<any>} the component */
export async function loadSFC(file) {
  const { descriptor, errors } = parse(fs.readFileSync(file, 'utf8'), { filename: file });
  if (errors.length) throw errors[0];
  const { content } = compileScript(descriptor, { id: path.basename(file), inlineTemplate: true });
  const dir = path.dirname(file);
  const code = content.replace(/from '\.\/([^']+)'/g, (_, p) => `from ${JSON.stringify(new URL(`file://${path.join(dir, p)}`).href)}`);
  fs.mkdirSync(out, { recursive: true });
  const target = path.join(out, `${path.basename(file)}.${process.pid}.mjs`);
  fs.writeFileSync(target, code);
  try { return (await import(target)).default; } finally { fs.rmSync(target, { force: true }); }
}

/** Render a component with props to HTML. */
export function render(component, props = {}) { return renderToString(createSSRApp({ render: () => h(component, props) })); }
