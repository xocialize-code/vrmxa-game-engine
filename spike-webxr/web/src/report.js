// What every page shares and nothing else: the error hooks the runners read (window.__errors, __warnings), the result
// slot (__result) and READY, and the page's status line. No engine or emulator imports, so the probe stays bare.
window.__errors = []; window.__warnings = [];
const origError = console.error, origWarn = console.warn;
console.error = (...a) => { window.__errors.push(a.map(String).join(' ')); origError(...a); };
console.warn = (...a) => { window.__warnings.push(a.map(String).join(' ')); origWarn(...a); };
addEventListener('error', (e) => window.__errors.push(`${e.message} @${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => window.__errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));

export const q = new URLSearchParams(location.search);
export const out = /** @type {HTMLElement} */ (document.getElementById('out'));

/** Run the page's job, publish what it returns as window.__result and set READY (also on a throw). */
export async function run(name, job) {
  try {
    const result = await job();
    window.__result = { page: name, ua: navigator.userAgent, origin: location.origin, ...result };
    out.textContent = `${name}: done`;
  } catch (e) {
    window.__errors.push(String(e?.stack ?? e));
    window.__result = { page: name, ua: navigator.userAgent, origin: location.origin, failed: String(e?.message ?? e) };
    out.textContent = `${name}: ${e?.stack ?? e}`;
  }
  // the Mac wrapper listens on a message handler too (spike-physics' shape); harmless elsewhere
  try { window.webkit?.messageHandlers?.spike?.postMessage(JSON.stringify({ type: 'results', payload: window.__result })); } catch { /* not in the wrapper */ }
  await report(name);
  window.READY = true;
}

/** ?report=<name>: send the result to the serving script (scripts/serve.mjs), for browsers nothing automates. */
export async function report(name) {
  const to = q.get('report');
  if (!to) return;
  const body = JSON.stringify({ name: to, page: name, url: location.href, result: window.__result ?? null, errors: window.__errors, warnings: window.__warnings, pngs: window.__pngs ?? {} });
  try { await fetch('report', { method: 'POST', body }); out.textContent += `  (reported as ${to})`; } catch (e) { out.textContent += `  (report failed: ${e})`; }
}

export const stats = (s) => {
  if (!s.length) return null;
  const a = [...s].sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: a.length, mean: +mean.toFixed(4), p50: +a[a.length >> 1].toFixed(4), p95: +a[Math.floor(a.length * 0.95)].toFixed(4), max: +a[a.length - 1].toFixed(4) };
};
