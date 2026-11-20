import { defineConfig } from 'vite';
// Relative base: the built page loads its models and WASM from beside it, under the shell's scheme or loopback.
export default defineConfig({ base: './', server: { port: 5240 }, build: { target: 'es2022' } });
