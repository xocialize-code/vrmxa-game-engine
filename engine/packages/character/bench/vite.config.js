import path from 'node:path';
import { defineConfig } from 'vite';
const root = import.meta.dirname;
export default defineConfig({ root, base: './', build: { outDir: path.join(root, 'dist'), emptyOutDir: true, target: 'safari16', rolldownOptions: { input: path.join(root, 'index.html') } } });
