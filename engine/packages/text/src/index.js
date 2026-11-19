// @vrmxg/text — M3 W6 (AB-T-0545). Text inside the canvas: speech bubbles and name tags in the world, drawn with
// troika-three-text, as the text spike decided (AB-T-0536: a seventh to an eleventh of Slug's GPU time, shaping for
// Japanese and Latin, frames bit-identical in Chromium and WKWebView). Our own HarfBuzz + Slug renderer comes later for
// 4K title cards and WebGPU.
//
// A TextLayer is presentation. It reads the world (the voice service's captions, the brains' director flags, the
// characters' heads) and writes nothing to it: its group hangs in the render host's scene, outside the tree, so world
// hashes never see it. The render host updates it as each frame is presented (blended poses), and an offline frame waits
// for its typesetting (settle), so an export never depends on when a glyph atlas finished.
//
// The spike's conditions are kept: static Regular and Bold fonts (a variable font renders only its default instance,
// AB-L-0368), a local unicodeFontsURL (no CDN fallback), and typesetting settled before an offline frame draws.
import { Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3, Quaternion } from 'three';
import { Text, configureTextBuilder } from 'troika-three-text';

let configured = false;
/** Configure troika once: a local fallback-font URL (never a CDN), the SDF size, the worker. */
export function configureText({ unicodeFontsURL = null, sdfGlyphSize = 64, useWorker = true } = {}) {
  if (configured) return;
  configureTextBuilder({ sdfGlyphSize, useWorker, ...(unicodeFontsURL ? { unicodeFontsURL } : {}) });
  configured = true;
}

const DIM = 0x9aa0a6, INK = 0x1d1f24, PAPER = 0xfffdf7;
const _v = new Vector3(), _p = new Vector3(), _q = new Quaternion();

/** A speech bubble: a rounded card with a tail under it, and the line, word by word. */
class Bubble {
  constructor(layer) {
    this.layer = layer;
    this.group = new Group();
    this.text = new Text();
    Object.assign(this.text, { font: layer.font, fontSize: 0.085, maxWidth: 1.3, anchorX: 'center', anchorY: 'bottom', color: INK, lineHeight: 1.3, depthOffset: -1 });
    this.text.material.depthTest = false;
    this.text.renderOrder = 1001;
    this.card = new Mesh(new ShapeGeometry(new Shape()), new MeshBasicMaterial({ color: PAPER, depthTest: false, transparent: true, opacity: 0.97 }));
    this.card.renderOrder = 1000;
    this.group.add(this.card, this.text);
    this.key = null; this.size = null; this.pending = null;
  }

  /** Show a line ({ words, word, spoken }) or thinking (null). Returns whether the text changed (it re-typesets). */
  set(c) {
    const words = c ? c.words : ['…'];
    const text = words.join(' ');
    const said = c ? Math.max(0, Math.min(words.length, c.spoken ?? words.length)) : words.length;
    const key = `${text}|${said}`;
    if (key === this.key) return false;
    this.key = key;
    this.text.text = text;
    // spoken words in ink, the rest dim (character offsets of the words' starts)
    const ranges = { 0: said > 0 ? INK : DIM };
    let at = 0;
    for (let i = 0; i < words.length; i++) { if (i === said) ranges[at] = DIM; at += words[i].length + 1; }
    this.text.colorRanges = ranges;
    this.pending = /** @type {Promise<void>} */ (new Promise((resolve) => this.text.sync(() => { this.fit(); resolve(undefined); })));
    return true;
  }

  /** Size the card to the typeset text (a new shape only when the size changes by more than a centimetre). */
  fit() {
    const b = this.text.textRenderInfo?.blockBounds;
    if (!b) return;
    const pad = 0.045, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
    const key = `${Math.round(w * 100)}x${Math.round(h * 100)}`;
    if (key === this.size) return;
    this.size = key;
    const r = Math.min(0.06, h / 2), x0 = -w / 2, y0 = b[1] - pad, x1 = w / 2, y1 = y0 + h, t = 0.045;
    const s = new Shape();
    s.moveTo(x0 + r, y0); s.lineTo(-t, y0); s.lineTo(0, y0 - t * 1.2); s.lineTo(t, y0); s.lineTo(x1 - r, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    this.card.geometry.dispose();
    this.card.geometry = new ShapeGeometry(s, 6);
  }

  dispose() { this.text.dispose(); this.card.geometry.dispose(); this.card.material.dispose(); }
}

/** A name tag: the character's name, outlined, above the head. */
class NameTag {
  constructor(layer, name) {
    this.text = new Text();
    Object.assign(this.text, { font: layer.bold, fontSize: 0.06, anchorX: 'center', anchorY: 'bottom', color: 0xffffff, outlineWidth: '12%', outlineColor: 0x111318, text: name, depthOffset: -1 });
    this.text.material.depthTest = false;
    this.text.renderOrder = 999;
    this.pending = /** @type {Promise<void>} */ (new Promise((resolve) => this.text.sync(() => resolve(undefined))));
  }
  dispose() { this.text.dispose(); }
}

export class TextLayer {
  /**
   * @param {{ font: string, bold?: string, bubbles?: boolean, nameTags?: boolean, unicodeFontsURL?: string | null,
   *   above?: number, minScale?: number, maxScale?: number }} o font, bold: URLs of static .ttf instances
   */
  constructor({ font, bold = font, bubbles = true, nameTags = false, unicodeFontsURL = null, above = 0.34, minScale = 1, maxScale = 1.5 }) {
    configureText({ unicodeFontsURL });
    this.font = font; this.bold = bold; this.bubbles = bubbles; this.nameTags = nameTags;
    this.above = above; this.minScale = minScale; this.maxScale = maxScale;
    this.group = new Group();
    this.group.name = 'text-layer';
    /** actor → Bubble */ this.shown = new Map();
    /** actor → NameTag */ this.tags = new Map();
    this.host = null;
  }

  /** Hang in a render host: drawn in its scene (never the tree), updated as each frame is presented, settled offline. */
  attach(host) { this.host = host; host.scene.add(this.group); if (!host.overlays.includes(this)) host.overlays.push(this); return this; }
  detach() { if (!this.host) return; this.host.scene.remove(this.group); this.host.overlays = this.host.overlays.filter((o) => o !== this); this.host = null; }

  /**
   * What to show this frame, read from the world: each line being said ({ actor, words, word, spoken }), each character
   * whose director waits on the model (thinking), and every character's name.
   */
  read(tree, alpha) {
    const lines = tree.services.get('voice')?.captions?.(alpha) ?? [];
    const out = new Map();
    for (const c of lines) {
      const tokens = String(c.text ?? '').trim().split(/\s+/);
      out.set(c.actor, { ...c, words: tokens.length === c.words?.length ? tokens : c.words });
    }
    for (const b of tree.services.get('ai')?.brains ?? []) if (b.bb.director?.pending && !out.has(b.node.id)) out.set(b.node.id, null);
    return out;
  }

  /** Bring the layer up to the world now: bubbles made, changed or removed; positions and sizes facing the camera. */
  update(tree, camera, alpha = 1) {
    if (!tree) return;
    const want = this.bubbles ? this.read(tree, alpha) : new Map();
    for (const [actor, b] of this.shown) if (!want.has(actor)) { this.group.remove(b.group); b.dispose(); this.shown.delete(actor); }
    for (const [actor, c] of want) {
      let b = this.shown.get(actor);
      if (!b) { b = new Bubble(this); this.shown.set(actor, b); this.group.add(b.group); }
      b.set(c);
    }
    if (this.nameTags) for (const n of tree.all()) if (n.type === 'Character' && !this.tags.has(n.id)) { const t = new NameTag(this, n.name ?? n.id); this.tags.set(n.id, t); this.group.add(t.text); }
    if (!camera) return;
    camera.getWorldQuaternion(_q);
    const cam = camera.getWorldPosition(new Vector3());
    const place = (obj, id, extra) => {
      const n = /** @type {any} */ (tree.find(id));
      if (!n) { obj.visible = false; return; }
      const head = n.vrm?.humanoid?.getNormalizedBoneNode?.('head');
      if (head) head.getWorldPosition(_v); else n.object3d.getWorldPosition(_v).add(new Vector3(0, 1.6, 0));
      _v.y += extra;
      // a speaker out of view gets no bubble (the caption still says the line): one hanging off the frame reads as noise
      _p.copy(_v).project(camera);
      if (!(_p.z < 1) || Math.abs(_p.x) > 1.02 || _p.y > 0.98 || _p.y < -1) { obj.visible = false; return; }
      obj.position.copy(_v); obj.quaternion.copy(_q);
      const s = Math.min(this.maxScale, Math.max(this.minScale, _v.distanceTo(cam) / 3.5));
      obj.scale.setScalar(s);
      obj.visible = true;
    };
    for (const [actor, b] of this.shown) place(b.group, actor, this.above);
    for (const [id, t] of this.tags) { place(t.text, id, this.above * 0.55); t.text.visible = t.text.visible && !this.shown.has(id); }
  }

  /** Resolves when every text has typeset (an offline frame waits for it). */
  async settle() {
    await Promise.all([...[...this.shown.values()].map((b) => b.pending), ...[...this.tags.values()].map((t) => t.pending)].filter(Boolean));
  }

  /** What is shown, for tests and checks: [{ actor, text, thinking }]. */
  state() { return [...this.shown].map(([actor, b]) => ({ actor, text: b.text.text, thinking: b.key?.startsWith('…|') ?? false })); }

  dispose() { this.detach(); for (const b of this.shown.values()) b.dispose(); for (const t of this.tags.values()) t.dispose(); this.shown.clear(); this.tags.clear(); }
}
