// Compile single-file components for Node (vue/compiler-sfc, templates inlined), the components they import too, and
// render them on the server (vue/server-renderer), so the tests see the markup an app gets: ids, accessible names,
// what each prop draws. (editor-ui's helper, with nested components.)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, compileScript } from 'vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

const out = path.join(import.meta.dirname, '.build', String(process.pid));
const built = new Map();
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));

function compile(file) {
  if (built.has(file)) return built.get(file);
  const { descriptor, errors } = parse(fs.readFileSync(file, 'utf8'), { filename: file });
  if (errors.length) throw errors[0];
  const { content } = compileScript(descriptor, { id: path.basename(file), inlineTemplate: true });
  const dir = path.dirname(file);
  const target = path.join(out, `${path.basename(file)}.mjs`);
  built.set(file, target);
  const code = content.replace(/from '\.\/([^']+)'/g, (_, p) => {
    const dep = path.join(dir, p);
    return `from ${JSON.stringify(pathToFileURL(p.endsWith('.vue') ? compile(dep) : dep).href)}`;
  });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(target, code);
  return target;
}

/** @param {string} file a .vue file @returns {Promise<any>} the component */
export async function loadSFC(file) { return (await import(pathToFileURL(compile(file)).href)).default; }

/** Render a component with props to HTML. */
export function render(component, props = {}) { return renderToString(createSSRApp({ render: () => h(component, props) })); }
