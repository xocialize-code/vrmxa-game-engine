// Builds acceptance/m5/dialogue-page into acceptance/build/m5-dialogue (the page Chromium and WKWebView run).
import path from 'node:path';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';

export const PAGE_OUT = path.join(import.meta.dirname, '../build/m5-dialogue');
export async function buildPage() {
  await build({ root: path.join(import.meta.dirname, 'dialogue-page'), base: './', logLevel: 'warn', plugins: [vue()], build: { outDir: PAGE_OUT, emptyOutDir: true, target: 'es2022' } });
  return PAGE_OUT;
}
if (process.argv[1] === import.meta.filename) console.log(await buildPage());
