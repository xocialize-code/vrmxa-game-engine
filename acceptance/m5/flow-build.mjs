// Builds acceptance/m5/flow-page into acceptance/build/m5-flow (the page Chromium and WKWebView run).
import path from 'node:path';
import { build } from 'vite';

export const PAGE_OUT = path.join(import.meta.dirname, '../build/m5-flow');
export async function buildPage() {
  await build({ root: path.join(import.meta.dirname, 'flow-page'), base: './', logLevel: 'warn', build: { outDir: PAGE_OUT, emptyOutDir: true, target: 'es2022' } });
  return PAGE_OUT;
}
if (process.argv[1] === import.meta.filename) console.log(await buildPage());
