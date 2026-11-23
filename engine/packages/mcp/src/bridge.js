// The editor bridge (Node): MCP tool calls handed to the VRMXG editor's page and answered there. The page polls
// POST http://127.0.0.1:<port>/vrmxg-mcp/exchange with its last reply and gets the next call back (held up to 20 s
// when there is none): plain HTTP the editor reaches from a browser or the Mac shell, no WebSocket server needed.
// CORS-readable, and text/plain bodies so no preflight is needed. One editor has the link at a time: the first to poll
// keeps it until it stops polling; another editor is told so ({ taken }) and backs off, so calls never split between two.
import http from 'node:http';

export class EditorBridge {
  /** @param {{ port?: number, connectTimeoutMs?: number, callTimeoutMs?: number, holdMs?: number, app?: string }} [o] app: what polls it, for messages ('editor', 'creator') */
  constructor({ port = 5183, connectTimeoutMs = 15000, callTimeoutMs = 180000, holdMs = 20000, app = 'editor' } = {}) {
    this.app = app; this.port = port; this.connectTimeoutMs = connectTimeoutMs; this.callTimeoutMs = callTimeoutMs; this.holdMs = holdMs;
    this.queue = []; this.waiting = null; this.calls = new Map(); this.nextId = 1;
    this.seen = 0; this.editor = null; this.owner = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => { this.port = /** @type {import('node:net').AddressInfo} */ (this.server.address()).port; resolve(this.port); });
    });
  }

  stop() { this.waiting?.end(); this.server?.close(); for (const c of this.calls.values()) c.reject(new Error('the bridge stopped')); }

  get connected() { return Date.now() - this.seen < this.holdMs + 10000; }

  handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.method !== 'POST' || !req.url.startsWith('/vrmxg-mcp/exchange')) { res.writeHead(404).end('VRMXG MCP bridge: POST /vrmxg-mcp/exchange'); return; }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let msg = {};
      try { msg = body ? JSON.parse(body) : {}; } catch { /* an empty poll */ }
      const id = msg.editor ?? 'anonymous';
      if (this.owner && this.owner !== id && this.connected) { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ taken: this.editor ?? true })); return; }
      if (this.owner !== id) { this.owner = id; this.editor = null; }
      this.seen = Date.now();
      if (msg.hello) this.editor = msg.hello;
      if (msg.reply) { const c = this.calls.get(msg.reply.id); if (c) { this.calls.delete(msg.reply.id); c.resolve(msg.reply); } }
      if (this.waiting) this.send(this.waiting, { idle: true }); // one poller at a time: the newest
      this.waiting = res;
      const timer = setTimeout(() => { if (this.waiting === res) this.send(res, { idle: true }); }, this.holdMs);
      res.on('close', () => { clearTimeout(timer); if (this.waiting === res) this.waiting = null; });
      this.flush();
    });
  }

  send(res, obj) { if (this.waiting === res) this.waiting = null; if (!res.writableEnded) res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj)); }

  flush() { if (this.waiting && this.queue.length) this.send(this.waiting, { call: this.queue.shift() }); }

  /** Hand a tool call to the editor and wait for its reply: { text, isError, image? }. */
  async call(name, args) {
    const until = Date.now() + this.connectTimeoutMs;
    while (!this.connected && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
    if (!this.connected) return { isError: true, text: `no VRMXG ${this.app} is connected: open the ${this.app} (it polls http://127.0.0.1:${this.port}/vrmxg-mcp/exchange; in a browser add ?mcp=${this.port} if it isn't the default)` };
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.calls.delete(id); resolve({ isError: true, text: `the ${this.app} didn't answer ${name} within ${this.callTimeoutMs / 1000} s` }); }, this.callTimeoutMs);
      this.calls.set(id, { resolve: (r) => { clearTimeout(timer); resolve(r); }, reject: (e) => { clearTimeout(timer); resolve({ isError: true, text: e.message }); } });
      this.queue.push({ id, name, args });
      this.flush();
    });
  }
}
