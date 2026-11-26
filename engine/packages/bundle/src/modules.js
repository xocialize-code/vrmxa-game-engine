// What a module imports, read by a real lexer: es-module-lexer (MIT), the one es-module-shims and Vite's ecosystem use,
// in its pure-JavaScript build, which needs no WebAssembly and no start-up step, so it runs the same in Node, Chromium
// and WKWebView (acceptance/m5 compares the three on a set of awkward modules, runtime/lexer-cases.js). It knows where a
// "/" divides and where it begins a regular expression, reads templates and comments, and lexes minified code.
//
// An earlier hand-written scanner here lost to JavaScript's grammar three times in review (`x-- / 2`, a brace inside a
// template's string, minified modules): the exporter and the loader both rely on this list to know which files a
// module loads, so it has to be right, and to refuse what it can't read.
import { parse } from 'es-module-lexer/minimal/js';
import { BuildError, resolveFrom, normRef } from './paths.js';

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

/**
 * What a module exports by name, read without running it (M6 W5: which behaviours a project's module provides): its
 * own exported names, and the specifiers it re-exports whole (`export * from 'x'`, which brings every name of x but
 * its default). `export * as ns from 'x'` is the one name `ns`.
 * @param {string} src @param {string} [name] the module, for the error
 * @returns {{ names: string[], stars: string[] }}
 */
export function moduleExports(src, name = 'the module') {
  let imports, exports;
  try { [imports, exports] = parse(src, name); } catch {
    throw new BuildError('bad_file', `${name} can't be read as a module, so what it exports can't be known`, []);
  }
  const stars = imports.filter((i) => i.n != null && /^export\s*\*\s*from\b/.test(src.slice(i.ss, i.se))).map((i) => i.n);
  return { names: exports.map((e) => e.n), stars };
}


/**
 * A module graph linked from the sources the caller holds, for importing it fresh (M6 W5: what a project's behaviours
 * declare, read from exactly the bytes an export hashed). Every relative specifier of every module is rewritten to the
 * URL `url` gives the module it names (a blob: URL in a page, a data: URL in Node), dependencies first, so nothing of
 * the graph is fetched by path and no module cache can hand back an older copy. Bare specifiers ('@vrmxg/core') are left
 * to the importer's import map or hook. A graph with an import cycle can't be linked this way and is refused.
 * @param {{ top: string, sources: Map<string, string>, url: (ref: string, source: string) => string }} o
 * @returns {string} the URL of the top module
 */
export function linkModules({ top, sources, url }) {
  const done = new Map(), visiting = new Set();
  const link = (ref) => {
    if (done.has(ref)) return done.get(ref);
    if (visiting.has(ref)) throw new BuildError('bad_file', `${ref} is part of an import cycle, so its modules can't be linked from their bytes`, [ref]);
    const src = sources.get(ref);
    if (src === undefined) throw new BuildError('bad_file', `${ref} is imported but wasn't read`, [ref]);
    visiting.add(ref);
    let imports;
    try { [imports] = parse(src, ref); } catch { throw new BuildError('bad_file', `${ref} can't be read as a module`, [ref]); }
    let out = '', at = 0;
    for (const i of imports) {
      if (i.n == null || i.d === -2 || !/^\.{1,2}\//.test(i.n)) continue;
      const target = resolveFrom(ref, i.n);
      if (target === null) throw new BuildError('bad_file', `${ref} imports ${i.n}, outside the project`, [ref]);
      const u = link(normRef(target));
      out += src.slice(at, i.s) + (i.d === -1 ? u : JSON.stringify(u)); // a static specifier without its quotes, a dynamic one with them
      at = i.e;
    }
    out += src.slice(at);
    visiting.delete(ref);
    const u = url(ref, out);
    done.set(ref, u);
    return u;
  };
  return link(normRef(top));
}

/**
 * A module and every module it imports by a relative specifier, as text, read through `read` (M6 W5: the editor's
 * Export Game imports the game's behaviours module fresh from these, through linkModules). A relative import outside
 * the project is refused; a bare one ('@vrmxg/core') is left to the importer.
 * @param {{ top: string, read: (ref: string) => Promise<Uint8Array> }} o
 * @returns {Promise<Map<string, string>>}
 */
export async function moduleGraph({ top, read }) {
  const sources = new Map(), queue = [normRef(top)];
  while (queue.length) {
    const ref = queue.shift();
    if (sources.has(ref)) continue;
    const src = new TextDecoder().decode(await read(ref));
    sources.set(ref, src);
    for (const spec of moduleImports(src, ref)) {
      if (!/^\.{1,2}\//.test(spec)) continue;
      const target = resolveFrom(ref, spec);
      if (target === null) throw new BuildError('bad_file', `${ref} imports ${spec}, outside the project`, [ref]);
      queue.push(normRef(target));
    }
  }
  return sources;
}
