// sql.js in the browser, as the avatar studio does it (app/src/character/sqljs.js): vrmxa-core's own pinned copy,
// its classic script added as a <script> only when a bundle has a database (Mira's does), its WebAssembly by URL.
import { setSqlJsLoader } from '@vrmxa-core/index.js';
const sqlJsUrl = new URL('../../../../vrmxa-avatar-studio/packages/vrmxa-core/node_modules/sql.js/dist/sql-wasm.js', import.meta.url).href;
const sqlWasmUrl = new URL('../../../../vrmxa-avatar-studio/packages/vrmxa-core/node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).href;

setSqlJsLoader(async () => {
  if (!window.initSqlJs) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = sqlJsUrl; s.onload = resolve; s.onerror = () => reject(new Error('sql.js could not be loaded'));
      document.head.appendChild(s);
    });
  }
  return window.initSqlJs({ locateFile: () => sqlWasmUrl });
});
