// Paths in a build: relative, forward slashes, no dots to climb with. One spelling per file, so the same project gives
// the same list wherever it is read, and nothing in a manifest can point outside its folder.

/**
 * A build problem with a `code` (no_licence, missing_file, bad_file, bad_path, bad_game, bad_runtime, bad_manifest,
 * not_in_build, changed, not_empty, no_build, too_many_files, too_large) and the `files` it is about.
 */
export class BuildError extends Error {
  /** @param {string} code @param {string} message @param {string[]} [files] */
  constructor(code, message, files = []) { super(message); this.name = 'BuildError'; this.code = code; this.files = files; }
}

/** No path of a build, a runtime or a project may have a segment that starts with this: an export stages its files in `.vrmxg-export-<id>`. */
export const RESERVED_PREFIX = '.vrmxg-export';

/**
 * What is wrong with a path, or null: it must be relative, use `/`, and have no empty, `.` or `..` segment, no
 * backslash, colon or control character, and no segment an export keeps for itself.
 * @param {unknown} p
 * @returns {string | null}
 */
export function pathProblem(p) {
  if (typeof p !== 'string' || !p) return 'is empty';
  if (p.startsWith('/')) return 'starts with /';
  if (/[\\:\u0000-\u001f\u007f]/.test(p)) return 'has a backslash, a colon or a control character';
  for (const s of p.split('/')) {
    if (s === '' || s === '.' || s === '..') return `has the segment "${s}"`;
    if (s.startsWith(RESERVED_PREFIX)) return `has the segment "${s}", a name an export keeps for its own staging folder`;
  }
  return null;
}

/** @param {string} p @param {string} what what the path is, for the message */
export function checkPath(p, what) {
  const problem = pathProblem(p);
  if (problem) throw new BuildError('bad_path', `${what} "${p}" ${problem}`, [String(p)]);
  return p;
}

/** A path with a segment that starts with a dot (.DS_Store, .git/…): never part of a project's listing. */
export const isHidden = (p) => p.split('/').some((s) => s.startsWith('.'));

/** Paths in the order a manifest lists them: by UTF-16 code unit, JavaScript's default sort, the same in every engine. */
export const sortPaths = (paths) => [...paths].sort();

/** Two paths that differ only by case can't both exist on a Mac's default file system: name the first such pair. */
export function caseClash(paths) {
  const seen = new Map();
  for (const p of paths) { const k = p.toLowerCase(); if (seen.has(k) && seen.get(k) !== p) return [seen.get(k), p]; seen.set(k, p); }
  return null;
}

/** `*` matches within one folder level, as in LICENCES.md. @param {string} pattern */
export function globRe(pattern) {
  return new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
}

/** The folder of a path ('' at the top). */
export const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/** A relative specifier (`./x.js`, `../y.js`) from a file, as a project path; null when it climbs out. */
export function resolveFrom(file, spec) {
  const out = dirOf(file) ? dirOf(file).split('/') : [];
  for (const s of spec.split('/')) {
    if (s === '.' || s === '') continue;
    if (s === '..') { if (!out.length) return null; out.pop(); } else out.push(s);
  }
  return out.join('/');
}

/**
 * A reference as a build spells it: Unicode form NFC, and no leading `./`. A scene may write `./props/door.glb`, and a
 * Mac's disk may hand a name back in another Unicode form than the scene typed; both mean the one file.
 * @param {string} ref
 */
export function normRef(ref) {
  let r = ref.normalize('NFC');
  while (r.startsWith('./')) r = r.slice(2);
  return r;
}

function skipTemplate(src, i) { // i: the opening backtick; returns the index after the closing one
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && src[i + 1] === '{') {
      let depth = 1; i += 2;
      while (i < src.length && depth) { const e = src[i]; if (e === '`') { i = skipTemplate(src, i); continue; } if (e === '{') depth++; else if (e === '}') depth--; i++; }
      continue;
    }
    i++;
  }
  return i;
}

// Where a `/` begins a regular expression and where it divides: after these, an expression is expected, so it is a
// regular expression; after a name, a number, `]`, a string or a template it divides. After `)` and `}` it can be
// either (`if (x) /re/.test(y)`, a block followed by an expression), which only a parser could tell.
const BEFORE_REGEX = new Set('(,=:[!&|?{;+-*%<>~^');
const WORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/** The index after a regular expression literal that begins at `i` (flags included), or -1 if its line ends first. */
function endOfRegex(src, i) {
  let inClass = false;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\n') return -1;
    if (c === '\\') { j++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') inClass = true;
    else if (c === '/') { j++; while (j < src.length && /[a-z]/i.test(src[j])) j++; return j; }
  }
  return -1;
}

function scanImports(src, name, ambiguousIsRegex) {
  const out = [], n = src.length;
  let i = 0, code = '', last = '', word = '';
  const value = () => { last = '"'; word = ''; code = ''; }; // a string, template or regular expression just ended: a value
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (/\s/.test(c)) { code += c; i++; continue; }
    if (c === '/' && d === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '`') { i = skipTemplate(src, i); value(); continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { s += src[j + 1] ?? ''; j += 2; } else s += src[j++]; }
      // `import … from 'x'`, `export … from 'x'`, `import 'x'`, `import('x')`; not a call of something named `from`
      if (/(^|[^\w$.])(from\s*|import\s*\(?\s*)$/.test(code)) out.push(s);
      i = j + 1; value(); continue;
    }
    if (c === '/') {
      const sure = last === '' || BEFORE_REGEX.has(last) || (/[\w$]/.test(last) && WORDS_BEFORE_REGEX.has(word));
      const maybe = last === ')' || last === '}';
      if (sure || (maybe && ambiguousIsRegex)) {
        const end = endOfRegex(src, i);
        if (end >= 0) { i = end; value(); continue; }
        if (sure) throw new BuildError('bad_file', `${name} has a regular expression this exporter can't read to its end (line ${src.slice(0, i).split('\n').length}), so what it imports can't be known`, []);
      }
    }
    word = /[\w$]/.test(c) ? (/[\w$]/.test(last) && !/\s$/.test(code) ? word + c : c) : '';
    code = (code + c).slice(-48); last = c; i++;
  }
  return out;
}

/**
 * The specifiers a module imports with a string literal: `import … from 'x'`, `export … from 'x'`, `import 'x'`,
 * `import('x')`, with or without a space before the string. Comments, template literals and regular expression
 * literals are skipped, so an import that is commented out is not one and a `/*` inside a regular expression hides
 * nothing after it. A call of a function named `from` is not an import.
 *
 * Not a parser, so it fails closed: where a `/` could begin a regular expression or divide (after `)` or `}`) the
 * module is read both ways, and if the two readings import different things it is refused, as is a regular expression
 * that can't be read to its end. `import()` of a computed specifier can't be known and isn't reported.
 * @param {string} src @param {string} [name] the module, for the error
 * @returns {string[]}
 */
export function moduleImports(src, name = 'the module') {
  const a = scanImports(src, name, false), b = scanImports(src, name, true);
  if (a.length !== b.length || a.some((x, k) => x !== b[k])) throw new BuildError('bad_file', `${name} can't be read for certain: a "/" after ")" or "}" may begin a regular expression or divide, and what the module imports depends on which`, []);
  return a;
}
