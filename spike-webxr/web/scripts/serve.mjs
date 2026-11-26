// Serves dist/ on 127.0.0.1 only (a simulator shares the Mac's loopback; nothing else can reach it) and collects what
// pages send back: a page opened with ?report=<name> POSTs its window.__result (and window.__pngs) to /report, written
// to results/<label>/<name>.json (home folder scrubbed) and <name>__<key>.png. For Safari in the visionOS simulator,
// where there is no automation to read a page's globals.
//   node web/scripts/serve.mjs <label> [port]      (default port 5240)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const here = import.meta.dirname, dist = path.join(here, '../dist');
const [label = 'visionos', port = '5240'] = process.argv.slice(2);
const outDir = path.join(here, '../../results', label);
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.vrm': 'model/gltf-binary', '.vrma': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const got = JSON.parse(body), name = String(got.name ?? 'page').replace(/[^\w.-]/g, '_');
        for (const [k, u] of Object.entries(got.pngs ?? {})) fs.writeFileSync(path.join(outDir, `${name}__${k}.png`), Buffer.from(String(u).split(',')[1], 'base64'));
        delete got.pngs;
        fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(got, null, 1).split(process.env.HOME).join('~') + '\n');
        console.log(`report ${name}: errors ${(got.errors ?? []).length}`);
        res.writeHead(204).end();
      } catch (e) { console.log('bad report', e.message); res.writeHead(400).end(); }
    });
    return;
  }
  const file = path.join(dist, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(fs.readFileSync(file));
});
server.listen(Number(port), '127.0.0.1', () => console.log(`serving dist on http://127.0.0.1:${port}/ → results/${label}/`));
