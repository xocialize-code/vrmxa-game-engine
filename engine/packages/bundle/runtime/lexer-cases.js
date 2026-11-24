// Awkward modules and what each imports: the cases a hand-written scanner got wrong in review, and the ones a build
// must refuse. The package's tests check them in Node; the runtime's check mode reads them in the page, so the
// acceptance scripts can compare Node, Chromium and WKWebView on the same list (the lexer has to agree everywhere:
// the exporter runs in one engine and the loader in another).
export const LEXER_CASES = [
  { name: 'plain forms', src: "import{a}from\"./a.js\"; import\"./b.js\";\nexport * from './c.js';\nexport { z } from './z.js';\nconst d = await import('./d.js');\nimport { Behaviour } from '@vrmxg/core';\n", imports: ['./a.js', './b.js', './c.js', './z.js', './d.js', '@vrmxg/core'] },
  { name: 'comments, strings and templates hold no imports', src: "// import './gone.js';\n/* import x from './also-gone.js'; */\nconst text = \"import './in-a-string.js'\", t = `import './in-a-template.js' ${ 1 + `x` }`;\nimport './real.js';\n", imports: ['./real.js'] },
  { name: 'a call of a function named from, and a key named from', src: "const from = (x) => x; const y = from('./nowhere.js'), list = Array.from('./not.js'), o = { from: './a-key.js' };\nimport './real.js';\n", imports: ['./real.js'] },
  { name: 'a /* inside a regular expression', src: "const re = /[/*]/;\nimport './a.js';\nconst b = x.replace(/\\/\\*/g, '').split(/'/);\nimport './b.js';\n", imports: ['./a.js', './b.js'] },
  { name: 'division after a decrement, then a dynamic import', src: "this.t-- / 60; const m = await import('./b.js');\n", imports: ['./b.js'] },
  { name: 'division after an increment', src: "const half = i++ / 2;\nimport './a.js';\n", imports: ['./a.js'] },
  { name: 'division after a bracket and a parenthesis, with a path in a string', src: "const mid = (a + b) / 2 + f('x/y'), r = list[0] / n;\nimport './e.js';\n", imports: ['./e.js'] },
  { name: 'a regular expression after a parenthesis', src: "if (x) /'/.test(y); import './f.js';\n", imports: ['./f.js'] },
  { name: 'a brace in a string inside a template', src: "const s = `${open ? '{' : '['}`;\nimport './c.js';\n", imports: ['./c.js'] },
  { name: 'minified', src: "import{a as b}from\"./a.js\";const c=d=>d/2,e=/[/*]'/g,f=`${c(1)?'{':'}'}`;export{c as default};import(\"./lazy.js\").then(g=>g/2);", imports: ['./a.js', './lazy.js'] },
  { name: 'import.meta is not an import', src: "const here = import.meta.url;\nimport './a.js';\n", imports: ['./a.js'] },
  { name: 'an import of a path worked out as it runs', src: "const name = './x.js';\nconst m = await import(name);\n", imports: 'refused' },
  { name: 'an import of a template with a hole', src: "const m = await import(`./${n}.js`);\n", imports: 'refused' },
  { name: 'a module that does not lex', src: "const re = /[abc;\nimport './g.js';\n", imports: 'refused' },
];

/** What each case imports as this engine reads it: the list, or 'refused'. @param {(src: string, name?: string) => string[]} moduleImports */
export function readLexerCases(moduleImports) {
  return LEXER_CASES.map((c) => { try { return moduleImports(c.src, c.name); } catch (e) { return e?.code === 'bad_file' ? 'refused' : `threw ${e?.message ?? e}`; } });
}
