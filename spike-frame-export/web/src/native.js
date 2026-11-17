// The wrapper's bridge. Control goes through a WKScriptMessageHandlerWithReply named "native"
// (postMessage returns a Promise of Swift's reply). Frames go through whichever transfer method a job names.
const handler = window.webkit?.messageHandlers?.native;
export const inWrapper = !!handler;

export function call(cmd, args = {}) {
  if (!handler) return Promise.reject(new Error(`not in the wrapper (${cmd})`));
  return handler.postMessage({ cmd, ...args });
}

export const log = (...m) => { const s = m.join(' '); console.log(s); handler?.postMessage({ cmd: 'log', text: s }).catch(() => {}); };

/** bytes → base64 with TC39's Uint8Array.prototype.toBase64 (Safari 18.2+), or FileReader as the avatar studio does. */
export function toBase64Native(u8) { return u8.toBase64(); }
export function toBase64FileReader(u8) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(new Blob([u8]));
  });
}

/** POST bytes to the page's own origin (custom scheme or loopback); resolves when Swift has consumed them. */
export async function post(path, body, type = 'application/octet-stream') {
  const res = await fetch(path, { method: 'POST', body, headers: { 'Content-Type': type } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
