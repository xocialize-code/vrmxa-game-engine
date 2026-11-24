// What a module imports, read by a real lexer: es-module-lexer (MIT), the one es-module-shims and Vite's ecosystem use,
// in its pure-JavaScript build, which needs no WebAssembly and no start-up step, so it runs the same in Node, Chromium
// and WKWebView (acceptance/m5 compares the three on a set of awkward modules, runtime/lexer-cases.js). It knows where a
// "/" divides and where it begins a regular expression, reads templates and comments, and lexes minified code.
//
// An earlier hand-written scanner here lost to JavaScript's grammar three times in review (`x-- / 2`, a brace inside a
// template's string, minified modules): the exporter and the loader both rely on this list to know which files a
// module loads, so it has to be right, and to refuse what it can't read.
import { parse } from 'es-module-lexer/minimal/js';
import { BuildError } from './paths.js';

/**
 * The specifiers a module imports: `import … from 'x'`, `export … from 'x'`, `import 'x'`, and `import('x')` of a
 * string. It fails closed: a module that doesn't lex is refused, and so is one that imports a path it works out as it
 * runs (`import(name)`, a template with a `${}`), because neither the export nor the loader could know, hold or check
 * what that loads.
 * @param {string} src @param {string} [name] the module, for the error
 * @returns {string[]}
 */
export function moduleImports(src, name = 'the module') {
  let imports;
  try { [imports] = parse(src, name); } catch (e) {
    const at = /:(\d+):(\d+)$/.exec(String(e?.message ?? ''));
    throw new BuildError('bad_file', `${name} can't be read as a module (a parse error${at ? ` at line ${at[1]}, column ${at[2]}` : ''}), so what it imports can't be known`, []);
  }
  const out = [];
  for (const i of imports) {
    if (i.d === -2) continue; // import.meta
    if (i.n == null) throw new BuildError('bad_file', `${name} imports a path it works out as it runs (${src.slice(i.ss, i.se).replace(/\s+/g, ' ').slice(0, 60)}): a build holds and checks only what a module names outright`, []);
    out.push(i.n);
  }
  return out;
}
