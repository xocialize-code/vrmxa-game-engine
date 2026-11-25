// The assets panel's thumbnails (M5 W6, AB-T-0606), as a plain class so it is tested in Node (test/thumbs.test.mjs).
//
// Thumbnails are drawn one at a time (the host draws a file alone on an offline render host: thumbs-draw.js), kept by
// path, and cached by path, size and modification time: in the Mac app in the shell's cache folder (`cache.read` /
// `cache.write`, shell 0.13.0, inside the sandbox container), so a relaunch doesn't draw them again; in a browser in
// memory only. A newer list (another project, files changed) stops the older drawing at its next file. `release()`
// waits for the file being drawn, stops the rest and lets the host go (before an export: a render shouldn't share the
// GPU with an idle renderer, as the creator's releaseOffline does); the next `load` starts again with a fresh host.

/** A PNG's bytes as a data URL for an <img>. */
export function pngURL(base64) { return `data:image/png;base64,${base64}`; }

export class ThumbnailQueue {
  /**
   * @param {{ draw: (entry: any, size: number) => Promise<Uint8Array | null>, toBase64: (bytes: Uint8Array) => string,
   *   store?: { get: (key: string) => Promise<string | null>, put: (key: string, base64: string) => Promise<any> } | null,
   *   size?: number, onChange?: () => void, onRelease?: () => Promise<void> | void }} o
   *   draw: a file's thumbnail as PNG bytes (null: it has none); store: a cache of base64 PNGs by key
   */
  constructor({ draw, toBase64, store = null, size = 96, onChange = () => {}, onRelease = () => {} }) {
    Object.assign(this, { draw, toBase64, store, size, onChange, onRelease });
    /** ref → data URL */ this.urls = new Map();
    /** ref → the key its URL was made for */ this.keys = new Map();
    /** ref → why it has none (its draw threw) */ this.errors = new Map();
    this.gen = 0; this.chain = Promise.resolve(); this.total = 0; this.done = 0; this.drawn = 0; this.cached = 0;
  }

  /**
   * A file's cache key: the project (`scope`: two projects can have a file at the same path), its path, the thumbnail's
   * size, and the file's modification time and size where known. The cache isn't pruned: the system empties Caches.
   */
  key(entry, stat, scope = this.scope) { return [scope ?? '', entry.ref, this.size, stat?.mtime ?? '', stat?.size ?? ''].join('\n'); }

  /**
   * The files to show thumbnails for (assets-ui's entries; `drawable` ones only), with each file's { size, mtime }
   * where the project knows them. Files whose key hasn't changed keep their thumbnail; the rest are drawn (or read from
   * the cache) in the background. → a promise of the end of this drawing (or of its being overtaken)
   * @param {any[]} entries @param {Record<string, { size: number, mtime: number }>} [stats] @param {string} [scope] the project
   */
  load(entries, stats = {}, scope = '') {
    const gen = ++this.gen;
    this.scope = scope;
    const want = entries.map((e) => ({ entry: e, key: this.key(e, stats[e.ref]) }));
    const refs = new Set(entries.map((e) => e.ref));
    for (const r of new Set([...this.urls.keys(), ...this.keys.keys(), ...this.errors.keys()])) if (!refs.has(r)) { this.urls.delete(r); this.keys.delete(r); this.errors.delete(r); }
    const todo = want.filter((w) => this.keys.get(w.entry.ref) !== w.key);
    this.total = want.length; this.done = want.length - todo.length;
    this.onChange();
    this.chain = this.chain.then(() => this.run(gen, todo)).catch(() => {});
    return this.chain;
  }

  async run(gen, todo) {
    for (const { entry, key } of todo) {
      if (gen !== this.gen) return;
      let b64 = null;
      try {
        b64 = (await this.store?.get(key).catch(() => null)) ?? null;
        if (b64) this.cached++;
        else {
          const png = await this.draw(entry, this.size);
          if (gen !== this.gen) return; // overtaken while drawing: its picture may be of files since changed
          if (png) { b64 = this.toBase64(png); this.drawn++; this.store?.put(key, b64).catch(() => {}); }
        }
        this.errors.delete(entry.ref);
      } catch (e) { this.errors.set(entry.ref, String(e?.message ?? e)); }
      if (gen !== this.gen) return;
      if (b64) this.urls.set(entry.ref, pngURL(b64)); else this.urls.delete(entry.ref);
      this.keys.set(entry.ref, key);
      this.done++;
      this.onChange();
    }
  }

  /** A line for the panel: "drawing 3 of 20" or "20 thumbnails". */
  status() {
    if (this.done < this.total) return `drawing ${this.done + 1} of ${this.total}`;
    return this.total ? `${this.urls.size} thumbnails${this.errors.size ? `, ${this.errors.size} failed` : ''}` : '';
  }

  /** Stop drawing once the file being drawn is done, and let the host go. Thumbnails already made are kept. */
  async release() {
    this.gen++;
    const pending = this.chain;
    await pending;
    this.total = this.done = this.urls.size;
    await this.onRelease();
    this.onChange();
  }
}
