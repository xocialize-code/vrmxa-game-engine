import { defineConfig } from 'vite';
export default defineConfig({
  resolve: { dedupe: ['three'] },
  server: { port: 5245, strictPort: true, host: '127.0.0.1' },
});
