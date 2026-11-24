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

/**
 * What is wrong with a path, or null: it must be relative, use `/`, and have no empty, `.` or `..` segment, no
 * backslash, colon or control character.
 * @param {unknown} p
 * @returns {string | null}
 */
export function pathProblem(p) {
  if (typeof p !== 'string' || !p) return 'is empty';
  if (p.startsWith('/')) return 'starts with /';
  if (/[\\:\u0000-\u001f\u007f]/.test(p)) return 'has a backslash, a colon or a control character';
  for (const s of p.split('/')) if (s === '' || s === '.' || s === '..') return `has the segment "${s}"`;
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

/**
 * The specifiers a module imports with a string literal: `import … from 'x'`, `export … from 'x'`, `import 'x'`,
 * `import('x')`, with or without a space before the string. Comments and template literals are skipped, so an import
 * that is commented out is not one. Not a parser: a regular expression literal that holds a quote can hide what
 * follows it on its line, and `import()` of a computed specifier can't be known.
 * @param {string} src
 * @returns {string[]}
 */
export function moduleImports(src) {
  const out = [], n = src.length;
  let i = 0, code = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '`') { i = skipTemplate(src, i); code = ''; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { s += src[j + 1] ?? ''; j += 2; } else s += src[j++]; }
      if (/(^|[^\w$.])(from|import)\s*\(?\s*$/.test(code)) out.push(s);
      code = ''; i = j + 1; continue;
    }
    code = (code + c).slice(-48); i++;
  }
  return out;
}
