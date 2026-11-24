// The documentation's pages, read from the Markdown in docs/: each page's front matter gives its title, a one-line
// description and its place in its section. One reader, two users: the site's sidebar (docs/.vitepress/config.mjs) and
// the llms.txt index (scripts/docs-reference.mjs), so a page can't be in one and missing from the other.
// No dependencies: the docs site installs apart from the workspace.
import fs from 'node:fs';
import path from 'node:path';

/** The sections of the site, in order: a folder under docs/ each. */
export const SECTIONS = [
  { dir: 'guide', title: 'Guide', blurb: 'What VRMXG is and the rules it keeps. Written by hand, checked against the code.' },
  { dir: 'reference', title: 'Reference', blurb: 'Generated from the code by scripts/docs-reference.mjs. Never edited by hand.' },
];

/**
 * A page's front matter: `key: value` lines between the first two `---` lines. A value in double quotes is read as a
 * JSON string; `order` is a number. Enough for our pages, and the same subset VitePress reads the same way.
 * @param {string} text @returns {{ data: Record<string, any>, body: string }}
 */
export function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const raw = kv[2].trim();
    data[kv[1]] = raw.startsWith('"') ? JSON.parse(raw) : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw === 'true' ? true : raw === 'false' ? false : raw;
  }
  return { data, body: text.slice(m[0].length) };
}

/**
 * The pages of every section, in sidebar order (`order`, then title). Throws on a page with no title or description:
 * the index needs both.
 * @param {string} docsDir the docs/ folder
 * @param {{ skip?: string[] }} [o] skip: sections whose pages the caller has itself (the generator, for what it writes)
 * @returns {Array<{ dir: string, title: string, blurb: string, pages: Array<{ file: string, link: string, title: string, description: string, order: number }> }>}
 */
export function readPages(docsDir, { skip = [] } = {}) {
  return SECTIONS.map((section) => {
    const dir = path.join(docsDir, section.dir);
    const files = fs.existsSync(dir) && !skip.includes(section.dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
    const pages = files.map((f) => {
      const { data } = frontMatter(fs.readFileSync(path.join(dir, f), 'utf8'));
      const file = `${section.dir}/${f}`;
      if (!data.title || !data.description) throw new Error(`docs/${file}: front matter needs a title and a description`);
      const name = f.replace(/\.md$/, '');
      return { file, link: name === 'index' ? `/${section.dir}/` : `/${section.dir}/${name}`, title: String(data.title), description: String(data.description), order: Number(data.order ?? 100) };
    });
    pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    return { ...section, pages };
  });
}
