// A project's LICENCES.md, read as the table it is: every row whose first cell is a backticked path names a file (or,
// with `*`, the files of one folder level) and its licence. The same rows content/sample/tools/check-licences.mjs
// checks in CI; here they decide whether a file may go into a build, and what the manifest says about it.
import { globRe } from './paths.js';

export const LICENCES_FILE = 'LICENCES.md';

/** A table row's cells, split on the bars that aren't escaped or inside backticks. @param {string} line */
function cells(line) {
  const out = [];
  let cell = '', code = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && line[i + 1] === '|') { cell += '|'; i++; continue; }
    if (c === '`') code = !code;
    if (c === '|' && !code) { out.push(cell.trim()); cell = ''; continue; }
    cell += c;
  }
  out.push(cell.trim());
  return out.slice(1, -1); // a row starts and ends with a bar
}

/**
 * The licence rows of a LICENCES.md, in the file's order.
 * @param {string} md
 * @returns {{ pattern: string, licence: string, source: string, re: RegExp }[]}
 */
export function parseLicences(md) {
  const rows = [];
  for (const line of md.split(/\r?\n/)) {
    if (!/^\|\s*`[^`]+`\s*\|/.test(line)) continue;
    const [file, licence = '', source = ''] = cells(line);
    const pattern = file.slice(1, -1);
    rows.push({ pattern, licence, source, re: globRe(pattern) });
  }
  return rows;
}

/**
 * The row that licenses a file: the one that names it exactly, else the first whose pattern matches. Null when no row
 * does, or when the row's licence cell is empty.
 * @param {ReturnType<typeof parseLicences>} rows @param {string} path
 */
export function licenceOf(rows, path) {
  const row = rows.find((r) => r.pattern === path) ?? rows.find((r) => r.re.test(path)) ?? null;
  return row?.licence ? row : null;
}
