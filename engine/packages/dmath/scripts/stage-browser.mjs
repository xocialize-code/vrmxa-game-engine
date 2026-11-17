// Copies the browser check page, src/ and test/ into one folder that a static server, the
// WKWebView harness or Playwright can serve as its root. Usage: node scripts/stage-browser.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
const pkg = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || path.join(pkg, 'build/browser'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'test'), { recursive: true });
fs.cpSync(path.join(pkg, 'src'), path.join(out, 'src'), { recursive: true });
for (const f of ['cases.js', 'golden.json']) fs.copyFileSync(path.join(pkg, 'test', f), path.join(out, 'test', f));
fs.copyFileSync(path.join(pkg, 'test/browser/index.html'), path.join(out, 'index.html'));
console.log(out);
