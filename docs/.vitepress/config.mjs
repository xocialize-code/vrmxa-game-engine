// The VRMXG documentation site (AB-T-0611): VitePress over the Markdown in docs/.
// - The sidebar comes from the pages' own front matter (scripts/docs-pages.mjs), the reader llms.txt is built from too.
// - Every page is also published as its Markdown source (guide/determinism → guide/determinism.md), with llms.txt and
//   llms-full.txt at the root, for agents.
// - Plain Markdown only: curly-brace attributes are off, so text such as {"move_y": 1} in a generated page stays text.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitepress';
import { readPages, frontMatter } from '../../scripts/docs-pages.mjs';

const docs = path.resolve(import.meta.dirname, '..');
const sections = readPages(docs);

export default defineConfig({
  title: 'VRMXG',
  description: 'A deterministic three.js game engine built around VRMX characters, wearables and items.',
  lang: 'en-GB',
  cleanUrls: true,
  srcExclude: ['README.md', 'INVENTORY.md', 'worker/**'],
  // llms.txt is copied in at the end of the build (below); scripts/docs-links.mjs checks it and every anchor afterwards
  ignoreDeadLinks: [/^\/llms(-full)?\.txt$/, /^\/llms(-full)?$/],
  markdown: { attrs: { disable: true } },
  vite: { server: { fs: { allow: [path.resolve(docs, '..')] } } },
  themeConfig: {
    nav: [
      ...sections.map((s) => ({ text: s.title, link: s.pages[0]?.link ?? '/', activeMatch: `^/${s.dir}/` })),
      { text: 'llms.txt', link: '/llms.txt', target: '_self', rel: 'noopener' },
    ],
    sidebar: Object.fromEntries(sections.map((s) => [`/${s.dir}/`, [
      { text: s.title, items: s.pages.map((p) => ({ text: p.title, link: p.link })) },
      ...sections.filter((o) => o !== s).map((o) => ({ text: o.title, collapsed: true, items: o.pages.map((p) => ({ text: p.title, link: p.link })) })),
    ]])),
    outline: { level: [2, 3] },
    search: { provider: 'local' },
    footer: { message: 'The reference pages are generated from the engine\'s code.' },
  },

  /** The Markdown sources beside the pages, and the two indexes. */
  buildEnd(site) {
    const out = site.outDir;
    const full = [fs.readFileSync(path.join(docs, 'llms.txt'), 'utf8').split('\n## ')[0].trimEnd(), ''];
    for (const s of sections) {
      for (const p of s.pages) {
        const text = fs.readFileSync(path.join(docs, p.file), 'utf8');
        fs.mkdirSync(path.dirname(path.join(out, p.file)), { recursive: true });
        fs.writeFileSync(path.join(out, p.file), text);
        full.push(`\n---\n\n<!-- ${p.file} -->\n\n${frontMatter(text).body.trim()}\n`);
      }
    }
    fs.copyFileSync(path.join(docs, 'llms.txt'), path.join(out, 'llms.txt'));
    fs.writeFileSync(path.join(out, 'llms-full.txt'), full.join('\n'));
  },
});
