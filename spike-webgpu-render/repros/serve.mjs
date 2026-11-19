// Static server for the repros: the repo root at /, so the pages load plain three r187 from /node_modules/three.
// THREE_DEV=<a three.js checkout> also serves that checkout at /__three-dev/ (pages take ?three=dev).
//   node serve.mjs [port]      default 5242; then http://127.0.0.1:5242/spike-webgpu-render/repros/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dev = process.env.THREE_DEV ? path.resolve(process.env.THREE_DEV) : null;
const port = +(process.argv[2] ?? 5242);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let base = root, rel = url;
  if (url.startsWith('/__three-dev/')) { if (!dev) { res.writeHead(404).end('THREE_DEV not set'); return; } base = dev; rel = url.slice('/__three-dev'.length); }
  let file = path.join(base, rel);
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  });
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/spike-webgpu-render/repros/${dev ? `  (dev: ${dev})` : ''}`));
